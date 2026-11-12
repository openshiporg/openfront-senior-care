import { z } from 'zod'
import type { Db } from '../db'
import { actorAgentId, actorUserId, type Actor } from '../actor'
import { DomainError, Codes } from '../errors'
import type { UnitOfWork } from '../unitOfWork'
import { auditCreate, casUpdate, lockRow } from '../cas'
import { infer } from '../inference/gateway'
import { catalogue, validateGraph } from './blocks'
import { dryRunGraph, hash } from './engine'
import { extractForCommunity } from './extraction'

/**
 * The staff-described workflow builder (INTEGRATIONS §2.3, I-AI2). "Describe the job" → one workflow_build call through the gateway →
 * a graph drawn ONLY from the block catalogue → validation → a proposed version. Then a real 30-day dry run over history (writes only its
 * summary) → the proposer reviews the diff and asks → DON approves → administrator approves → active. Model calls happen in `prepare*`,
 * before any transaction; the `*InTx` halves only store what was prepared.
 */

export const BuiltWorkflow = z.object({
  name: z.string().min(3).max(120),
  description: z.string().max(600).default(''),
  graph: z.object({ nodes: z.array(z.object({ block: z.string().max(80), params: z.record(z.string(), z.unknown()).default({}) })).min(1).max(8) }),
})

const SYSTEM = [
  'You turn a nursing leader’s description of a monitoring job into a workflow graph.',
  'Use ONLY blocks from the catalogue given as data, in order: source, then extract, then rule, then coordinate; a detector stands alone.',
  'If the job cannot be built from the catalogue, return a single node with block "freeform.unknown". Never invent a block.',
  'Return {"name": string, "description": string, "graph": {"nodes": [{"block": string, "params": object}]}}.',
].join('\n')

export type PreparedBuild = { request: string; callId: string; built: z.infer<typeof BuiltWorkflow> | null; problem: string | null }

export async function prepareBuild(db: Db, actor: Actor, input: { communityId: string; request: unknown }): Promise<PreparedBuild> {
  const request = typeof input.request === 'string' ? input.request.trim() : ''
  if (request.length < 10 || request.length > 2000) throw new DomainError(Codes.INVALID_INPUT, 'Describe the job in a sentence or two (10 to 2000 characters).', { field: 'request' })
  const community = await db.community.findUnique({ where: { id: input.communityId }, select: { synthetic: true } })
  // Staff free text may name a resident: it is treated as protected data (fail closed).
  const result = await infer(db, {
    purpose: 'workflow_build', task: 'workflow.build@1', system: SYSTEM, carriesPhi: true, dataCategories: ['clinical_notes'],
    data: [{ label: 'catalogue', text: JSON.stringify(catalogue()) }, { label: 'request', text: request }], output: BuiltWorkflow,
    context: { communityId: input.communityId, actor, synthetic: Boolean(community?.synthetic) },
  })
  if (!result.ok) throw new DomainError(result.code as never, result.reason, { inferenceCallId: result.callId })
  try {
    validateGraph(result.value.graph)
    return { request, callId: result.callId, built: result.value, problem: null }
  } catch (error) {
    return { request, callId: result.callId, built: null, problem: error instanceof Error ? error.message : 'The graph is not valid.' }
  }
}

export async function proposeBuiltInTx(uow: UnitOfWork, actor: Actor, input: { communityId: string; prepared: PreparedBuild }) {
  const { prepared } = input
  if (!prepared.built) {
    uow.audit({ eventType: 'workflow.build_refused', entityType: 'InferenceCall', entityId: prepared.callId, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), reason: prepared.problem })
    throw new DomainError(Codes.INVALID_INPUT, `That job cannot be built from the block catalogue: ${prepared.problem}`, { inferenceCallId: prepared.callId })
  }
  const graph = validateGraph(prepared.built.graph)
  const code = `staff_${hash({ c: input.communityId, r: prepared.request, at: uow.now.toISOString() }).slice(0, 10)}`
  const def = await uow.tx.workflowDefinition.create({ data: { communityId: input.communityId, code, name: prepared.built.name, description: prepared.built.description, origin: 'staff_described', status: 'active' } })
  const version = await uow.tx.workflowVersion.create({
    data: {
      communityId: input.communityId, definitionId: def.id, versionNumber: 1, graph: graph as never, graphHash: hash(graph), policyVersion: 'v1', policy: {} as never,
      status: 'proposed', description: prepared.built.description, request: prepared.request, createdByInferenceId: prepared.callId,
      proposedById: actorUserId(actor), proposedByAgentId: actorAgentId(actor),
    },
  })
  auditCreate(uow, actor, 'WorkflowVersion', version.id, 'workflow.proposed', { code, origin: 'staff_described', graphHash: version.graphHash, inferenceCallId: prepared.callId })
  return { versionId: version.id, definitionId: def.id, code, name: def.name, graph }
}

/** Before a dry run: extract over the 30 days the replay reads (cached per note, outside any transaction). */
export async function prepareDryRun(db: Db, actor: Actor, input: { versionId: string }) {
  const version = await db.workflowVersion.findUnique({ where: { id: input.versionId }, select: { graph: true, communityId: true } })
  if (!version?.communityId) return null
  return extractForCommunity(db, actor, { communityId: version.communityId, graphs: [version.graph], days: 37 })
}

export async function dryRunInTx(uow: UnitOfWork, actor: Actor, input: { versionId: string; communityId: string }) {
  const v = await lockRow<{ id: string; version: number; status: string; graph: unknown; graphHash: string; definitionId: string; communityId: string | null }>(uow.tx, 'WorkflowVersion', input.versionId)
  if (v.communityId && v.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, 'Workflow not found.')
  if (!['proposed', 'dry_run_reviewed', 'dry_run_ok'].includes(v.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Only a proposed or reviewed version is dry-run.', { currentStatus: v.status })
  const def = await uow.tx.workflowDefinition.findUniqueOrThrow({ where: { id: v.definitionId }, select: { code: true } })
  const graph = validateGraph(v.graph)
  const summary = { ...(await dryRunGraph(uow.tx, { communityId: input.communityId, graph, code: def.code, now: uow.now })), graphHash: v.graphHash, ranAt: uow.now.toISOString() }
  await uow.tx.workflowVersion.update({ where: { id: v.id }, data: { dryRun: summary as never, dryRunAt: uow.now, version: { increment: 1 } } })
  auditCreate(uow, actor, 'WorkflowVersion', v.id, 'workflow.dry_run', { wouldOpen: summary.wouldOpen, added: summary.diff.added, removed: summary.diff.removed })
  return { versionId: v.id, ...summary }
}

/** The proposer (or anyone with workflow rights) withdraws a proposed version. */
export async function retireProposed(uow: UnitOfWork, actor: Actor, input: { versionId: string; reason: string }) {
  const v = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'WorkflowVersion', input.versionId)
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why.', { field: 'reason' })
  await casUpdate(uow, { model: 'WorkflowVersion', id: v.id, version: v.version, from: ['draft', 'proposed', 'dry_run_reviewed'], to: 'retired', actor, eventType: 'workflow.retired', reason })
  return { versionId: v.id, status: 'retired' }
}
