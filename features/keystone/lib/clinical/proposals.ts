import { z } from 'zod'
import type { Db } from '../db'
import { actorAgentId, actorUserId, type Actor } from '../actor'
import { DomainError, Codes } from '../errors'
import type { UnitOfWork } from '../unitOfWork'
import { auditCreate, casUpdate, lockRow } from '../cas'
import { payloadHash } from '../canonical'
import { infer } from '../inference/gateway'
import { createCarePlan } from './plans'
import { text } from './common'

/**
 * Proposal writers (INTEGRATIONS §2.4, Gate 4). An AI-drafted care-plan update is a Proposal row, never a care plan. A person with
 * canManageCarePlans accepts it, which drafts a care plan linked to the proposal; signing that plan (carePlan.sign, human-only) marks the
 * proposal signed with the plan as its result. Rejecting needs a reason. Agents may draft; they can never accept, reject or sign.
 */

export const CarePlanDraft = z.object({
  summary: z.string().min(3).max(600),
  items: z.array(z.object({
    kind: z.enum(['focus', 'goal', 'intervention']), text: z.string().min(3).max(400),
    frequency: z.enum(['once', 'every_shift', 'daily', 'twice_daily', 'weekly', 'as_needed']).optional(), parentIndex: z.number().int().min(0).max(20).nullable().optional(),
  })).min(1).max(12),
})
export type CarePlanDraft = z.infer<typeof CarePlanDraft>

const SYSTEM = [
  'You draft an update to a resident’s care plan from one workflow finding and its evidence, for a nurse to review and sign.',
  'Write short, concrete items: a focus, a measurable goal and interventions with a frequency. Do not diagnose or prescribe.',
  'Return {"summary": string, "items": [{"kind": "focus"|"goal"|"intervention", "text": string, "frequency"?: string, "parentIndex"?: number}]}.',
].join('\n')

export type PreparedDraft = { residentId: string; communityId: string; findingId: string; callId: string; draft: CarePlanDraft }

/** Outside any transaction: read the finding and its evidence, and ask the gateway for a draft. */
export async function prepareCarePlanDraft(db: Db, actor: Actor, input: { findingId: unknown }): Promise<PreparedDraft> {
  const findingId = typeof input.findingId === 'string' ? input.findingId : ''
  const finding = await db.finding.findUnique({ where: { id: findingId }, select: { id: true, communityId: true, residentId: true, title: true, detail: true, evidence: { select: { recordType: true, quote: true, role: true } }, resident: { select: { synthetic: true } }, community: { select: { synthetic: true } } } })
  if (!finding?.residentId || !finding.communityId) throw new DomainError(Codes.NOT_FOUND, 'Finding not found.')
  const result = await infer(db, {
    purpose: 'draft_note', task: 'draft.care_plan_update@1', system: SYSTEM, carriesPhi: true, dataCategories: ['clinical_notes', 'care_plans'], output: CarePlanDraft,
    data: [{ label: 'finding', text: `${finding.title}\n${finding.detail}` }, { label: 'evidence', text: finding.evidence.filter(e => e.role !== 'resolution').map(e => `${e.recordType}: ${e.quote}`).join('\n') }],
    context: { communityId: finding.communityId, actor, synthetic: Boolean(finding.resident?.synthetic && finding.community?.synthetic) },
  })
  if (!result.ok) throw new DomainError(result.code as never, result.reason, { inferenceCallId: result.callId })
  return { residentId: finding.residentId, communityId: finding.communityId, findingId: finding.id, callId: result.callId, draft: result.value }
}

export async function proposeCarePlanUpdateInTx(uow: UnitOfWork, actor: Actor, prepared: PreparedDraft) {
  const payload = { kind: 'care_plan_update', planKind: 'comprehensive', summary: prepared.draft.summary, items: prepared.draft.items }
  const proposal = await uow.tx.proposal.create({
    data: {
      kind: 'care_plan_update', payload: payload as never, payloadHash: payloadHash(payload), communityId: prepared.communityId, residentId: prepared.residentId,
      status: 'proposed', sourceFindingId: prepared.findingId, inferenceCallId: prepared.callId, proposedByUserId: actorUserId(actor), proposedByAgentId: actorAgentId(actor),
      expiresAt: new Date(uow.now.getTime() + 14 * 86_400_000),
    },
  })
  await uow.tx.finding.updateMany({ where: { id: prepared.findingId, proposalId: null }, data: { proposalId: proposal.id } })
  auditCreate(uow, actor, 'Proposal', proposal.id, 'proposal.created', { kind: 'care_plan_update', findingId: prepared.findingId, items: prepared.draft.items.length, inferenceCallId: prepared.callId })
  return { proposalId: proposal.id, status: 'proposed', summary: prepared.draft.summary, items: prepared.draft.items.length }
}

/** A person accepts the draft: a draft care plan is created from it, linked back. It is not in force until that plan is signed. */
export async function acceptProposal(uow: UnitOfWork, actor: Actor, input: { proposalId: string; expectedVersion?: number | null }) {
  const p = await lockRow<{ id: string; version: number; status: string; kind: string; payload: any; payloadHash: string; residentId: string; expiresAt: Date | null; proposedByUserId: string | null }>(uow.tx, 'Proposal', input.proposalId)
  if (input.expectedVersion != null && input.expectedVersion !== p.version) throw new DomainError(Codes.STALE_STATE, 'The proposal changed. Reload and try again.', { currentVersion: p.version })
  if (p.kind !== 'care_plan_update') throw new DomainError(Codes.INVALID_INPUT, 'Only a care-plan update is accepted here.')
  if (p.expiresAt && p.expiresAt.getTime() < uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, 'This proposal has expired.')
  if (payloadHash(p.payload) !== p.payloadHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The proposal changed after it was drafted.')
  const parsed = CarePlanDraft.safeParse(p.payload)
  if (!parsed.success) throw new DomainError(Codes.INVALID_INPUT, 'The proposal is not a valid care-plan update.')
  const plan = await createCarePlan(uow, actor, { residentId: p.residentId, kind: String(p.payload.planKind ?? 'comprehensive'), items: parsed.data.items.map(i => ({ ...i, frequency: i.frequency ?? (i.kind === 'intervention' ? 'as_needed' : undefined) })), proposalId: p.id })
  await casUpdate(uow, { model: 'Proposal', id: p.id, version: p.version, from: ['proposed'], to: 'accepted', actor, eventType: 'proposal.accepted', data: { acceptedById: actorUserId(actor), resultRecordType: 'CarePlan', resultRecordId: plan.carePlanId } })
  return { proposalId: p.id, status: 'accepted', carePlanId: plan.carePlanId, reference: plan.reference }
}

export async function rejectProposal(uow: UnitOfWork, actor: Actor, input: { proposalId: string; reason: string }) {
  const p = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Proposal', input.proposalId)
  const reason = text(input.reason, 'Reason', { min: 3 })
  await casUpdate(uow, { model: 'Proposal', id: p.id, version: p.version, from: ['proposed', 'accepted'], to: 'rejected', actor, eventType: 'proposal.rejected', reason, data: { rejectedReason: reason } })
  return { proposalId: p.id, status: 'rejected' }
}
