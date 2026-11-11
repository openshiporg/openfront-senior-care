import { createHash } from 'node:crypto'
import { auditCreate, casUpdate, lockRow } from '../cas'
import { registerApplier } from '../approvalAppliers'
import { requestApproval } from '../approval'
import { DomainError, Codes } from '../errors'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { createTask } from '../clinical/common'
import { BLOCKS, LIBRARY, validateGraph, type Candidate } from './blocks'

/*
 * The run engine. It runs ONLY on request: the findings page load, the staff "Run now" button, or the mutation that changes source data.
 * No timer, queue or cron. A run is keyed by (workflow version, window). The key is unique in the database, so a second run in
 * the same window inserts nothing and changes nothing. No model is called in v1; every block is a deterministic read. The
 * InferenceCall list is where a model call would be logged, once an approved provider class is configured (open item).
 */

const WINDOW_MS: Record<string, number> = { page_load: 3_600_000, source_change: 60_000, run_now: 60_000 }
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

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

/** Activation is two people: the DON asks, an administrator approves. The applier makes the activation row in the approving transaction. */
export async function requestActivation(uow: UnitOfWork, actor: Actor, input: { versionId: string; communityId: string }) {
  const version = await uow.tx.workflowVersion.findUnique({ where: { id: input.versionId }, include: { definition: true } })
  if (!version) throw new DomainError(Codes.NOT_FOUND, 'Workflow not found.')
  if (version.status !== 'dry_run_ok') throw new DomainError(Codes.GUARD_FAILED, 'Only a version that passed its dry run is activated.')
  const existing = await uow.tx.workflowActivation.findFirst({ where: { workflowVersionId: version.id, communityId: input.communityId, status: 'active' } })
  if (existing) throw new DomainError(Codes.GUARD_FAILED, 'Already active here.')
  const request = await requestApproval(uow, actor, { action: 'workflow.activate', targetList: 'WorkflowVersion', targetId: version.id, payload: { versionId: version.id, communityId: input.communityId, graphHash: version.graphHash }, requiredPermission: 'canApproveWorkflows', summary: `Turn on "${version.definition?.name}"`, communityId: input.communityId })
  return { approvalRequestId: request.id }
}

registerApplier('workflow.activate', async (uow, actor, request) => {
  const payload = request.payload as { versionId: string; communityId: string; graphHash: string }
  const approverId = actor.kind === 'user' ? actor.userId : null
  const version = await lockRow<{ id: string; version: number; status: string; graphHash: string }>(uow.tx, 'WorkflowVersion', payload.versionId)
  if (version.graphHash !== payload.graphHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The workflow changed after it was approved.')
  const row = await uow.tx.workflowActivation.create({ data: { communityId: payload.communityId, workflowVersionId: version.id, status: 'active', approvals: { approverId } as never, activatedAt: uow.now, activatedById: approverId } })
  if (version.status !== 'active') await casUpdate(uow, { model: 'WorkflowVersion', id: version.id, version: version.version, from: ['dry_run_ok', 'pending_activation'], to: 'active', actor, eventType: 'workflow.activated', approverId })
  auditCreate(uow, actor, 'WorkflowActivation', row.id, 'workflow.activation_created', { communityId: payload.communityId })
}, { applyOnApprove: true })

export type RunResult = { runs: number; skipped: number; opened: number; resolved: number }

/**
 * Run every active workflow for a community, once per window. The caller passes its trigger. Safe to call on every page load:
 * inside a window the unique windowKey makes it a no-op, and findings are deduped by (workflow, resident, key).
 */
export async function runWorkflows(uow: UnitOfWork, actor: Actor, input: { communityId: string; trigger: 'page_load' | 'run_now' | 'source_change'; suffix?: string }): Promise<RunResult> {
  const activations = await uow.tx.workflowActivation.findMany({ where: { communityId: input.communityId, status: 'active' }, include: { workflowVersion: { include: { definition: true } } } })
  const result: RunResult = { runs: 0, skipped: 0, opened: 0, resolved: 0 }
  for (const activation of activations) {
    const version = activation.workflowVersion
    if (!version || version.status !== 'active') continue
    const windowKey = windowKeyFor(version.id, input.trigger, uow.now, `${input.communityId}${input.suffix ? `:${input.suffix}` : ''}`)
    const claimed = await uow.tx.workflowRun.createMany({ data: [{ communityId: input.communityId, workflowVersionId: version.id, windowKey, trigger: input.trigger, status: 'running', startedAt: uow.now }], skipDuplicates: true })
    if (claimed.count === 0) { result.skipped += 1; continue }
    const run = await uow.tx.workflowRun.findUniqueOrThrow({ where: { windowKey } })
    const code = version.definition?.code ?? 'workflow'
    const candidates: Candidate[] = []
    try {
      const graph = validateGraph(version.graph)
      for (const node of graph.nodes) candidates.push(...(await BLOCKS[node.block].run({ tx: uow.tx, communityId: input.communityId, now: uow.now, params: node.params })))
    } catch (error) {
      await uow.tx.workflowRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: uow.now, summary: { error: error instanceof Error ? error.message.slice(0, 300) : 'failed' } as never, version: { increment: 1 } } })
      continue
    }
    let opened = 0
    const seen = new Set<string>()
    for (const c of candidates) {
      const dedupeKey = `${code}:${c.residentId}:${c.key}`
      seen.add(dedupeKey)
      const made = await uow.tx.finding.createMany({ data: [{ communityId: input.communityId, residentId: c.residentId, workflowVersionId: version.id, runId: run.id, workflowCode: code, dedupeKey, title: c.title, detail: c.detail, severity: c.severity, status: 'open' }], skipDuplicates: true })
      if (made.count === 0) continue
      opened += 1
      const finding = await uow.tx.finding.findUniqueOrThrow({ where: { dedupeKey } })
      for (const e of c.evidence) await uow.tx.evidenceRef.create({ data: { communityId: input.communityId, findingId: finding.id, recordType: e.recordType, recordId: e.recordId, quote: e.quote } })
      const { task } = await createTask(uow, actor, { communityId: input.communityId, residentId: c.residentId, kind: 'finding', title: c.title, detail: c.detail, ownerRole: c.ownerRole, dedupeKey: `finding:${dedupeKey}`, subjectType: 'Finding', subjectId: finding.id, createdByWorkflow: code, dueAt: new Date(uow.now.getTime() + (c.severity === 'urgent' ? 4 : 24) * 3_600_000) })
      await uow.tx.finding.update({ where: { id: finding.id }, data: { taskId: task.id } })
      uow.audit({ eventType: 'finding.opened', entityType: 'Finding', entityId: finding.id, actorUserId: null, after: { workflow: code, title: c.title, evidenceCount: c.evidence.length } })
    }
    // A finding whose condition no longer holds resolves itself, with a note saying so.
    const stale = await uow.tx.finding.findMany({ where: { communityId: input.communityId, workflowCode: code, status: 'open', dedupeKey: { notIn: [...seen] } }, select: { id: true, version: true } })
    let resolved = 0
    for (const f of stale) {
      const r = await uow.tx.finding.updateMany({ where: { id: f.id, version: f.version, status: 'open' }, data: { status: 'resolved', resolvedAt: uow.now, resolutionNote: 'The condition no longer holds.', version: { increment: 1 } } })
      resolved += r.count
    }
    await uow.tx.workflowRun.update({ where: { id: run.id }, data: { status: 'succeeded', finishedAt: uow.now, findingsOpened: opened, findingsResolved: resolved, version: { increment: 1 } } })
    result.runs += 1
    result.opened += opened
    result.resolved += resolved
  }
  return result
}

export async function dismissFinding(uow: UnitOfWork, actor: Actor, input: { findingId: string; note: string }) {
  const f = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Finding', input.findingId)
  const note = (input.note ?? '').trim()
  if (note.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are dismissing it.', { field: 'note' })
  await casUpdate(uow, { model: 'Finding', id: f.id, version: f.version, from: ['open'], to: 'dismissed', actor, eventType: 'finding.dismissed', reason: note, data: { resolvedAt: uow.now, resolutionNote: note, dismissedById: actor.kind === 'user' ? actor.userId : null } })
  return { findingId: f.id }
}
