import { createHash } from 'node:crypto'
import { auditCreate, casUpdate, lockRow } from '../cas'
import { registerApplier } from '../approvalAppliers'
import { requestApproval } from '../approval'
import { DomainError, Codes } from '../errors'
import { actorAgentId, actorUserId, type Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import type { Tx } from '../db'
import { createTask } from '../clinical/common'
import { LIBRARY, runGraph, validateGraph, type Candidate, type Evidence, type WorkflowGraph } from './blocks'

/*
 * The run engine. It runs ONLY on request: the findings page load, the staff "Run now" button, a re-check, or the mutation that changes
 * source data. No timer, queue or cron. A run is keyed by (workflow version, window); the key is unique in the database, so a second run
 * in the same window inserts nothing and changes nothing. Blocks are reads: a model is only ever called before the transaction, through
 * lib/inference/gateway.ts (extraction.ts, builder.ts), and its answers are stored rows the blocks read.
 */

const WINDOW_MS: Record<string, number> = { page_load: 3_600_000, source_change: 60_000, run_now: 60_000 }
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const HOUR = 3_600_000

export const windowKeyFor = (versionId: string, trigger: 'page_load' | 'run_now' | 'source_change', now: Date, suffix = '') =>
  `${versionId}:${trigger}:${Math.floor(now.getTime() / WINDOW_MS[trigger])}${suffix ? `:${suffix}` : ''}`

export async function seedWorkflowLibrary(uow: UnitOfWork, actor: Actor) {
  let created = 0
  for (const item of LIBRARY) {
    if (await uow.tx.workflowDefinition.findFirst({ where: { code: item.code, communityId: null } })) continue
    const graph = validateGraph(item.graph)
    const def = await uow.tx.workflowDefinition.create({ data: { code: item.code, name: item.name, description: item.description, origin: 'library', status: 'active' } })
    await uow.tx.workflowVersion.create({ data: { definitionId: def.id, versionNumber: 1, graph: graph as never, graphHash: hash(graph), policyVersion: 'v1', policy: item.policy as never, status: 'dry_run_ok', description: item.description } })
    auditCreate(uow, actor, 'WorkflowDefinition', def.id, 'workflow.library_loaded', { code: item.code })
    created += 1
  }
  return { created }
}

/* ── Activation ─────────────────────────────────────────────────────────────────────────────────────────────── */

const DRY_RUN_FRESH_MS = 7 * 24 * HOUR
const isUser = (actor: Actor): actor is Extract<Actor, { kind: 'user' }> => actor.kind === 'user'

/**
 * Activation is never one person. A library version (already dry-run reviewed) needs one approver other than the requester. A
 * staff-described version needs its dry run reviewed by the requester, then the DON (clinical approval), then the administrator: two
 * different approvers, neither of them the proposer, never an agent (separationOfDuties.assertCanDecide; decideApprovalRequest also
 * refuses any MCP session).
 */
export async function requestActivation(uow: UnitOfWork, actor: Actor, input: { versionId: string; communityId: string; reviewNote?: string }) {
  const version = await uow.tx.workflowVersion.findUnique({ where: { id: input.versionId }, include: { definition: true } })
  if (!version) throw new DomainError(Codes.NOT_FOUND, 'Workflow not found.')
  const existing = await uow.tx.workflowActivation.findFirst({ where: { workflowVersionId: version.id, communityId: input.communityId, status: 'active' } })
  if (existing) throw new DomainError(Codes.GUARD_FAILED, 'Already active here.')
  if (version.definition?.origin === 'staff_described') {
    if (version.communityId && version.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, 'Workflow not found.')
    if (version.status !== 'proposed') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a proposed workflow is sent for approval.', { currentStatus: version.status })
    const dry = version.dryRun as { graphHash?: string } | null
    if (!version.dryRunAt || !dry || dry.graphHash !== version.graphHash || uow.now.getTime() - version.dryRunAt.getTime() > DRY_RUN_FRESH_MS) {
      throw new DomainError(Codes.GUARD_FAILED, 'Run the 30-day dry run first (in the last 7 days) and review what it would have found.')
    }
    const note = (input.reviewNote ?? '').trim()
    if (note.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say what you checked in the dry run.', { field: 'reviewNote' })
    await casUpdate(uow, { model: 'WorkflowVersion', id: version.id, version: version.version, from: ['proposed'], to: 'dry_run_reviewed', actor, eventType: 'workflow.dry_run_reviewed', reason: note, data: { reviewedById: actorUserId(actor), reviewedAt: uow.now, reviewNote: note } })
    const payload = { versionId: version.id, communityId: input.communityId, graphHash: version.graphHash, dryRunAt: version.dryRunAt.toISOString(), proposedById: version.proposedById, proposedByAgentId: version.proposedByAgentId }
    const request = await requestApproval(uow, actor, { action: 'workflow.approve_clinical', targetList: 'WorkflowVersion', targetId: version.id, payload, requiredPermission: 'canApproveWorkflows', summary: `Clinical approval: turn on "${version.definition?.name}" (staff-described)`, communityId: input.communityId, expiresInMinutes: 7 * 1440 })
    return { approvalRequestId: request.id, stage: 'clinical' }
  }
  if (version.status !== 'dry_run_ok') throw new DomainError(Codes.GUARD_FAILED, 'Only a version that passed its dry run is activated.')
  const request = await requestApproval(uow, actor, { action: 'workflow.activate', targetList: 'WorkflowVersion', targetId: version.id, payload: { versionId: version.id, communityId: input.communityId, graphHash: version.graphHash }, requiredPermission: 'canApproveWorkflows', summary: `Turn on "${version.definition?.name}"`, communityId: input.communityId })
  return { approvalRequestId: request.id, stage: 'single' }
}

type StagePayload = { versionId: string; communityId: string; graphHash: string; dryRunAt?: string; proposedById?: string | null; proposedByAgentId?: string | null; clinicalApproverId?: string | null }

async function proposerCheck(uow: UnitOfWork, actor: Actor, payload: StagePayload) {
  if (!isUser(actor)) throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'An agent can propose but never approve.')
  if (payload.proposedById && payload.proposedById === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'The person who proposed a workflow cannot approve it.')
  if (payload.proposedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: payload.proposedByAgentId }, select: { ownerId: true } })
    if (agent?.ownerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a workflow your own agent proposed.")
  }
  return actor
}

// Stage 1 (staff-described): the DON's clinical approval. It opens stage 2, requested by the DON, so the DON cannot decide it too.
registerApplier('workflow.approve_clinical', async (uow, actor, request) => {
  const payload = request.payload as StagePayload
  const person = await proposerCheck(uow, actor, payload)
  if (!person.permissions.has('canManageCarePlans')) throw new DomainError(Codes.NOT_AUTHORIZED, 'The clinical approval is the Director of Nursing’s.')
  const version = await lockRow<{ id: string; version: number; status: string; graphHash: string; definitionId: string }>(uow.tx, 'WorkflowVersion', payload.versionId)
  if (version.graphHash !== payload.graphHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The workflow changed after it was sent for approval.')
  await casUpdate(uow, { model: 'WorkflowVersion', id: version.id, version: version.version, from: ['dry_run_reviewed'], to: 'pending_activation', actor, eventType: 'workflow.clinically_approved', approverId: person.userId })
  const def = await uow.tx.workflowDefinition.findUnique({ where: { id: version.definitionId }, select: { name: true } })
  const next = await requestApproval(uow, actor, { action: 'workflow.activate', targetList: 'WorkflowVersion', targetId: version.id, payload: { ...payload, clinicalApproverId: person.userId }, requiredPermission: 'canApproveWorkflows', summary: `Administrator approval: turn on "${def?.name ?? 'workflow'}" (DON approved)`, communityId: payload.communityId, expiresInMinutes: 7 * 1440 })
  return { nextApprovalRequestId: next.id }
}, { applyOnApprove: true })

registerApplier('workflow.activate', async (uow, actor, request) => {
  const payload = request.payload as StagePayload
  const person = await proposerCheck(uow, actor, payload)
  const version = await lockRow<{ id: string; version: number; status: string; graphHash: string }>(uow.tx, 'WorkflowVersion', payload.versionId)
  if (version.graphHash !== payload.graphHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The workflow changed after it was approved.')
  const staffDescribed = 'clinicalApproverId' in payload
  if (staffDescribed) {
    if (payload.clinicalApproverId === person.userId) throw new DomainError(Codes.SELF_APPROVAL, 'The second approval must come from a different person.')
    if (!person.permissions.has('canApproveCompliance')) throw new DomainError(Codes.NOT_AUTHORIZED, 'The second approval is the administrator’s.')
  }
  const approvals = staffDescribed ? { clinical: payload.clinicalApproverId, administrator: person.userId } : { approverId: person.userId }
  const row = await uow.tx.workflowActivation.create({ data: { communityId: payload.communityId, workflowVersionId: version.id, status: 'active', approvals: approvals as never, activatedAt: uow.now, activatedById: person.userId } })
  if (version.status !== 'active') await casUpdate(uow, { model: 'WorkflowVersion', id: version.id, version: version.version, from: ['dry_run_ok', 'pending_activation'], to: 'active', actor, eventType: 'workflow.activated', approverId: person.userId })
  auditCreate(uow, actor, 'WorkflowActivation', row.id, 'workflow.activation_created', { communityId: payload.communityId, approvals })
  return { activationId: row.id }
}, { applyOnApprove: true })

export async function pauseActivation(uow: UnitOfWork, actor: Actor, input: { activationId: string; reason: string }) {
  const a = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'WorkflowActivation', input.activationId)
  const reason = (input.reason ?? '').trim()
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are pausing it.', { field: 'reason' })
  await casUpdate(uow, { model: 'WorkflowActivation', id: a.id, version: a.version, from: ['active'], to: 'paused', actor, eventType: 'workflow.paused', reason })
  return { activationId: a.id, status: 'paused' }
}

/* ── Runs ───────────────────────────────────────────────────────────────────────────────────────────────────── */

export type RunResult = { runs: number; skipped: number; opened: number; resolved: number; pendingExtraction: number }

const evidenceRow = (communityId: string, findingId: string, e: Evidence) => ({ communityId, findingId, recordType: e.recordType, recordId: e.recordId, quote: (e.quote ?? '').slice(0, 600), spanStart: e.spanStart ?? null, spanEnd: e.spanEnd ?? null, role: e.role ?? 'cause' })

async function openFinding(uow: UnitOfWork, actor: Actor, input: { communityId: string; versionId: string; runId: string; code: string; c: Candidate }) {
  const { c, code, communityId } = input
  const dedupeKey = `${code}:${c.residentId}:${c.key}`
  const made = await uow.tx.finding.createMany({ data: [{ communityId, residentId: c.residentId, workflowVersionId: input.versionId, runId: input.runId, workflowCode: code, dedupeKey, title: c.title, detail: c.detail, severity: c.severity, status: 'open' }], skipDuplicates: true })
  if (made.count === 0) return false
  const finding = await uow.tx.finding.findUniqueOrThrow({ where: { dedupeKey } })
  for (const e of c.evidence) await uow.tx.evidenceRef.create({ data: evidenceRow(communityId, finding.id, e) })
  const dueAt = c.dueAt ?? new Date(uow.now.getTime() + (c.severity === 'urgent' ? 4 : 24) * HOUR)
  const { task } = await createTask(uow, actor, { communityId, residentId: c.residentId, kind: c.taskKind ?? 'finding', title: c.title, detail: c.detail, ownerRole: c.ownerRole, dedupeKey: `finding:${dedupeKey}`, subjectType: 'Finding', subjectId: finding.id, createdByWorkflow: code, dueAt })
  await uow.tx.finding.update({ where: { id: finding.id }, data: { taskId: task.id } })
  uow.audit({ eventType: 'finding.opened', entityType: 'Finding', entityId: finding.id, actorUserId: null, after: { workflow: code, title: c.title, evidenceCount: c.evidence.length, taskKind: task.kind } })
  return true
}

/** Close a finding because the evidence that satisfies it exists. The evidence is stored with the finding (role = resolution). */
async function resolveByEvidence(uow: UnitOfWork, actor: Actor, finding: { id: string; version: number; communityId: string | null; taskId: string | null }, note: string, evidence: Evidence[]) {
  const updated = await uow.tx.finding.updateMany({ where: { id: finding.id, version: finding.version, status: 'open' }, data: { status: 'resolved_by_evidence', resolvedAt: uow.now, resolutionNote: note.slice(0, 500), version: { increment: 1 } } })
  if (!updated.count) return false
  for (const e of evidence) await uow.tx.evidenceRef.create({ data: evidenceRow(finding.communityId ?? '', finding.id, { ...e, role: 'resolution' }) })
  uow.audit({ eventType: 'finding.resolved_by_evidence', entityType: 'Finding', entityId: finding.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { note, evidence: evidence.map(e => `${e.recordType}:${e.recordId}`) } })
  return true
}

/**
 * Run every active workflow for a community, once per window. Safe to call on every page load: inside a window the unique windowKey makes
 * it a no-op, and findings are deduped by (workflow, resident, key). Extraction must already have run (lib/workflows/extraction.ts).
 */
export async function runWorkflows(uow: UnitOfWork, actor: Actor, input: { communityId: string; trigger: 'page_load' | 'run_now' | 'source_change'; suffix?: string }): Promise<RunResult> {
  const activations = await uow.tx.workflowActivation.findMany({ where: { communityId: input.communityId, status: 'active' }, include: { workflowVersion: { include: { definition: true } } } })
  const result: RunResult = { runs: 0, skipped: 0, opened: 0, resolved: 0, pendingExtraction: 0 }
  for (const activation of activations) {
    const version = activation.workflowVersion
    if (!version || version.status !== 'active') continue
    const windowKey = windowKeyFor(version.id, input.trigger, uow.now, `${input.communityId}${input.suffix ? `:${input.suffix}` : ''}`)
    const claimed = await uow.tx.workflowRun.createMany({ data: [{ communityId: input.communityId, workflowVersionId: version.id, windowKey, trigger: input.trigger, status: 'running', startedAt: uow.now }], skipDuplicates: true })
    if (claimed.count === 0) { result.skipped += 1; continue }
    const run = await uow.tx.workflowRun.findUniqueOrThrow({ where: { windowKey } })
    const code = version.definition?.code ?? 'workflow'
    let flow
    try {
      flow = await runGraph({ tx: uow.tx, communityId: input.communityId, now: uow.now, workflowCode: code }, validateGraph(version.graph))
    } catch (error) {
      await uow.tx.workflowRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: uow.now, summary: { error: error instanceof Error ? error.message.slice(0, 300) : 'failed' } as never, version: { increment: 1 } } })
      continue
    }
    let opened = 0
    let resolved = 0
    const seen = new Set<string>()
    for (const c of flow.candidates) {
      seen.add(`${code}:${c.residentId}:${c.key}`)
      if (await openFinding(uow, actor, { communityId: input.communityId, versionId: version.id, runId: run.id, code, c })) opened += 1
    }
    for (const r of flow.resolutions) {
      const dedupeKey = `${code}:${r.residentId}:${r.key}`
      seen.add(dedupeKey)
      const f = await uow.tx.finding.findUnique({ where: { dedupeKey }, select: { id: true, version: true, status: true, communityId: true, taskId: true } })
      if (f?.status === 'open' && (await resolveByEvidence(uow, actor, f, r.note, r.evidence))) resolved += 1
    }
    // A finding whose condition no longer holds resolves itself, with a note saying so. Not while extraction is still pending: the
    // condition may simply not have been read yet.
    if (!flow.pending) {
      const stale = await uow.tx.finding.findMany({ where: { communityId: input.communityId, workflowCode: code, status: 'open', dedupeKey: { notIn: [...seen] } }, select: { id: true, version: true } })
      for (const f of stale) {
        const r = await uow.tx.finding.updateMany({ where: { id: f.id, version: f.version, status: 'open' }, data: { status: 'resolved', resolvedAt: uow.now, resolutionNote: 'The condition no longer holds.', version: { increment: 1 } } })
        resolved += r.count
      }
    }
    await uow.tx.workflowRun.update({ where: { id: run.id }, data: { status: 'succeeded', finishedAt: uow.now, findingsOpened: opened, findingsResolved: resolved, summary: { pendingExtraction: flow.pending } as never, version: { increment: 1 } } })
    result.runs += 1
    result.opened += opened
    result.resolved += resolved
    result.pendingExtraction += flow.pending
  }
  return result
}

/**
 * Re-check one finding now (I§7.2 resolve_finding_with_evidence): run its workflow's graph for that resident only and close the finding
 * if, and only if, the evidence that satisfies it exists. It never closes a finding on anyone's say-so.
 */
export async function recheckFinding(uow: UnitOfWork, actor: Actor, input: { findingId: string }) {
  const f = await lockRow<{ id: string; version: number; status: string; communityId: string; residentId: string; dedupeKey: string; workflowCode: string; workflowVersionId: string; taskId: string | null }>(uow.tx, 'Finding', input.findingId)
  if (f.status !== 'open') return { findingId: f.id, status: f.status, changed: false }
  const version = await uow.tx.workflowVersion.findUniqueOrThrow({ where: { id: f.workflowVersionId }, select: { graph: true } })
  const flow = await runGraph({ tx: uow.tx, communityId: f.communityId, now: uow.now, workflowCode: f.workflowCode, residentId: f.residentId }, validateGraph(version.graph))
  const res = flow.resolutions.find(r => `${f.workflowCode}:${r.residentId}:${r.key}` === f.dedupeKey)
  if (res) {
    await resolveByEvidence(uow, actor, f, res.note, res.evidence)
    return { findingId: f.id, status: 'resolved_by_evidence', changed: true, note: res.note }
  }
  const still = flow.candidates.some(c => `${f.workflowCode}:${c.residentId}:${c.key}` === f.dedupeKey)
  uow.audit({ eventType: 'finding.rechecked', entityType: 'Finding', entityId: f.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { stillOpen: true, conditionSeen: still, pendingExtraction: flow.pending } })
  return { findingId: f.id, status: 'open', changed: false, note: still ? 'The follow-up is not done yet.' : 'No evidence closes it yet.' }
}

export async function dismissFinding(uow: UnitOfWork, actor: Actor, input: { findingId: string; note: string }) {
  const f = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Finding', input.findingId)
  const note = (input.note ?? '').trim()
  if (note.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are dismissing it.', { field: 'note' })
  await casUpdate(uow, { model: 'Finding', id: f.id, version: f.version, from: ['open'], to: 'dismissed', actor, eventType: 'finding.dismissed', reason: note, data: { resolvedAt: uow.now, resolutionNote: note, dismissedById: actor.kind === 'user' ? actor.userId : null } })
  return { findingId: f.id }
}

/* ── Dry run ────────────────────────────────────────────────────────────────────────────────────────────────── */

export const DRY_RUN_DAYS = 30

/**
 * Replay a graph over the last 30 days of real records, one evaluation per day at that day's end, writing nothing but the summary on
 * the version. The diff compares what it would have opened with what is open now for the same definition (an earlier version), so a
 * reviewer sees what turning it on adds and removes. Samples carry record ids, never the text.
 */
export async function dryRunGraph(tx: Tx, input: { communityId: string; graph: WorkflowGraph; code: string; now: Date }) {
  const perDay: { date: string; candidates: number }[] = []
  const would = new Map<string, Candidate>()
  let pending = 0
  for (let d = DRY_RUN_DAYS - 1; d >= 0; d -= 1) {
    const at = new Date(input.now.getTime() - d * 24 * HOUR)
    const flow = await runGraph({ tx, communityId: input.communityId, now: at, workflowCode: input.code }, input.graph)
    perDay.push({ date: at.toISOString().slice(0, 10), candidates: flow.candidates.length })
    pending = Math.max(pending, flow.pending)
    for (const c of flow.candidates) would.set(`${input.code}:${c.residentId}:${c.key}`, c)
  }
  const open = await tx.finding.findMany({ where: { communityId: input.communityId, workflowCode: input.code, status: 'open' }, select: { dedupeKey: true, title: true, residentId: true } })
  const openKeys = new Set(open.map(o => o.dedupeKey))
  const sample = (c: Candidate) => ({ residentId: c.residentId, title: c.title, severity: c.severity, ownerRole: c.ownerRole ?? '', taskKind: c.taskKind ?? 'finding', evidence: c.evidence.map(e => ({ recordType: e.recordType, recordId: e.recordId, spanStart: e.spanStart ?? null, spanEnd: e.spanEnd ?? null })) })
  const added = [...would].filter(([k]) => !openKeys.has(k)).map(([, c]) => c)
  const removed = open.filter(o => !would.has(o.dedupeKey))
  return {
    days: DRY_RUN_DAYS, from: perDay[0]?.date, to: perDay[perDay.length - 1]?.date, perDay, wouldOpen: would.size, pendingExtraction: pending,
    diff: { added: added.length, removed: removed.length, unchanged: would.size - added.length, addedSamples: added.slice(0, 10).map(sample), removedSamples: removed.slice(0, 10).map(r => ({ residentId: r.residentId, title: r.title })) },
    tasksByOwner: Object.entries(added.reduce<Record<string, number>>((m, c) => ({ ...m, [c.ownerRole ?? '']: (m[c.ownerRole ?? ''] ?? 0) + 1 }), {})).map(([ownerRole, count]) => ({ ownerRole, count })),
  }
}
