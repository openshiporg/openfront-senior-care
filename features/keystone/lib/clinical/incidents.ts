import { auditCreate, casUpdate, lockRow } from '../cas'
import { cancelClocks, openClocksForFact, satisfyByEvidence } from '../clocks'
import { registerApplier } from '../approvalAppliers'
import { requestApproval } from '../approval'
import { Codes, DomainError } from '../errors'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { createTask, invalid, notFound, oneOf, residentFor, ref, ROLE_NAMES, text, userOf, when } from './common'
import { INCIDENT_KINDS } from '../../models/safety'

/* Incidents (SCHEMA §9). Clocks are computed from the incident's flags and shown as due/overdue on read; reports are filed outside and confirmed here. */

const SEVERITIES = ['no_injury', 'minor', 'moderate', 'major', 'death'] as const

export type IncidentInput = {
  communityId?: string; residentId?: string | null; kind: string; description: string; location?: string; severity?: string
  occurredAt?: string | Date | null; discoveredAt?: string | Date | null; witnessed?: boolean; headStrike?: boolean
  allegedAbuseOrSbi?: boolean; allegedOther?: boolean; parties?: { role: string; name: string }[]; sourceNoteId?: string | null; source?: 'staff' | 'workflow'
}

/**
 * Report an incident. Abuse or serious-bodily-injury allegations start the 2-hour F609 clock from when it was discovered; other
 * allegations start the 24-hour clock; both start the 5-working-day investigation clock. All clocks come from the loaded rule pack, so a
 * community without the pack (or an assisted-living one) opens none. OPEN ITEM (verify): the Ohio self-report rule and timelines.
 */
export async function createIncident(uow: UnitOfWork, actor: Actor, input: IncidentInput) {
  const resident = input.residentId ? await residentFor(uow.tx, input.residentId) : null
  const communityId = resident?.communityId ?? input.communityId
  if (!communityId) return invalid('Choose a community.', 'communityId')
  const kind = oneOf(input.kind, INCIDENT_KINDS, 'incident type')
  const occurredAt = input.occurredAt ? when(input.occurredAt, 'occurredAt') : uow.now
  const discoveredAt = input.discoveredAt ? when(input.discoveredAt, 'discoveredAt') : occurredAt
  if (occurredAt.getTime() > uow.now.getTime() + 5 * 60_000) invalid('An incident cannot be in the future.', 'occurredAt')
  const alleged = kind === 'alleged_abuse' || kind === 'misappropriation' || kind === 'injury_unknown_source' || Boolean(input.allegedAbuseOrSbi)
  const allegedOther = !alleged && (kind === 'alleged_neglect' || Boolean(input.allegedOther))
  const incident = await uow.tx.incident.create({
    data: {
      communityId, residentId: resident?.id ?? null, reference: await ref(uow, 'INC'), kind, description: text(input.description, 'Description', { min: 5 }), location: input.location ?? '',
      severity: input.severity ? oneOf(input.severity, SEVERITIES, 'severity') : 'no_injury', status: 'reported', occurredAt, discoveredAt, reportedAt: uow.now, reportedById: userOf(actor),
      witnessed: Boolean(input.witnessed), headStrike: Boolean(input.headStrike), allegedAbuseOrSbi: alleged, allegedOther, reportableDecision: alleged || allegedOther ? 'reportable' : 'pending',
      source: input.source ?? 'staff', sourceNoteId: input.sourceNoteId ?? null,
    },
  })
  auditCreate(uow, actor, 'Incident', incident.id, 'incident.reported', { kind, residentId: resident?.id ?? null, alleged, allegedOther, severity: incident.severity })
  for (const p of input.parties ?? []) {
    await uow.tx.incidentParty.create({ data: { communityId, incidentId: incident.id, residentId: resident?.id ?? null, role: oneOf(p.role, ['involved_resident', 'witness', 'staff_involved', 'alleged_perpetrator', 'family_notified', 'physician_notified'] as const, 'party role'), name: text(p.name, 'Name') } })
  }
  const setting = resident?.stay?.setting ?? null
  const clockBase = { communityId, residentId: resident?.id ?? null, subjectType: 'Incident', subjectId: incident.id, startedAt: discoveredAt, setting }
  if (alleged) await openClocksForFact(uow, actor, { ...clockBase, fact: 'incident.alleged_abuse_sbi' })
  if (allegedOther) await openClocksForFact(uow, actor, { ...clockBase, fact: 'incident.alleged_other' })
  if (alleged || allegedOther) await openClocksForFact(uow, actor, { ...clockBase, fact: 'incident.reported' })
  // Every incident gets a nurse-manager task; the investigation owner follows from the DON.
  await createTask(uow, actor, {
    communityId, residentId: resident?.id ?? null, kind: alleged || allegedOther ? 'escalation' : 'general', title: `${alleged ? 'Reportable: ' : ''}Review incident ${incident.reference}`,
    ownerRole: alleged || allegedOther ? ROLE_NAMES.director : ROLE_NAMES.don, escalationOwnerRole: ROLE_NAMES.director, dueAt: new Date(uow.now.getTime() + (alleged ? 1 : 24) * 3_600_000),
    dedupeKey: `incident-review:${incident.id}`, subjectType: 'Incident', subjectId: incident.id,
  })
  return { incidentId: incident.id, reference: incident.reference, reportable: alleged || allegedOther }
}

export async function startInvestigation(uow: UnitOfWork, actor: Actor, input: { incidentId: string }) {
  const incident = await lockRow<{ id: string; version: number; status: string; communityId: string; residentId: string | null }>(uow.tx, 'Incident', input.incidentId)
  if (incident.status === 'closed' || incident.status === 'entered_in_error') throw new DomainError(Codes.INVALID_TRANSITION, 'This incident is closed.')
  const open = await uow.tx.incidentInvestigation.findFirst({ where: { incidentId: incident.id, status: 'open' } })
  if (open) return { investigationId: open.id, reused: true }
  const row = await uow.tx.incidentInvestigation.create({ data: { communityId: incident.communityId, residentId: incident.residentId, incidentId: incident.id, status: 'open', investigatorId: userOf(actor), startedAt: uow.now } })
  if (incident.status === 'reported') await casUpdate(uow, { model: 'Incident', id: incident.id, version: incident.version, from: ['reported'], to: 'under_investigation', actor, eventType: 'incident.investigation_started' })
  return { investigationId: row.id, reused: false }
}

export async function completeInvestigation(uow: UnitOfWork, actor: Actor, input: { investigationId: string; findings: string; rootCause: string; interventions: string }) {
  const inv = await lockRow<{ id: string; version: number; status: string; incidentId: string }>(uow.tx, 'IncidentInvestigation', input.investigationId)
  await casUpdate(uow, {
    model: 'IncidentInvestigation', id: inv.id, version: inv.version, from: ['open'], to: 'completed', actor, eventType: 'incident.investigation_completed',
    data: { findings: text(input.findings, 'Findings', { min: 5 }), rootCause: text(input.rootCause, 'Root cause', { min: 3 }), interventions: text(input.interventions, 'Interventions', { min: 3 }), completedAt: uow.now },
  })
  return { investigationId: inv.id }
}

/** Draft a regulatory report. The body is assembled from the incident; staff file it with the state/CMS and record the confirmation. */
export async function draftRegulatoryReport(uow: UnitOfWork, actor: Actor, input: { incidentId: string; kind: string }) {
  const incident = await uow.tx.incident.findUnique({ where: { id: input.incidentId } })
  if (!incident) return notFound('Incident')
  const kind = oneOf(input.kind, ['f609_initial', 'f609_followup', 'state_self_report'] as const, 'report type')
  const existing = await uow.tx.regulatoryReport.findFirst({ where: { incidentId: incident.id, kind, status: 'draft' } })
  if (existing) return { reportId: existing.id, reused: true }
  const row = await uow.tx.regulatoryReport.create({
    data: {
      communityId: incident.communityId, residentId: incident.residentId, incidentId: incident.id, kind, status: 'draft',
      body: { reference: incident.reference, kind: incident.kind, occurredAt: incident.occurredAt, discoveredAt: incident.discoveredAt, severity: incident.severity, description: incident.description } as never,
      ruleNote: kind === 'state_self_report' ? 'OPEN ITEM (verify): Ohio self-report rule and timelines.' : '42 CFR 483.12(c)',
    },
  })
  return { reportId: row.id, reused: false }
}

/** Staff filed the report outside the system and record the confirmation number; that satisfies the clock. */
export async function recordReportSubmission(uow: UnitOfWork, actor: Actor, input: { reportId: string; channel: string; confirmation: string; submittedAt?: string | null }) {
  const report = await lockRow<{ id: string; version: number; status: string; kind: string; incidentId: string }>(uow.tx, 'RegulatoryReport', input.reportId)
  const channel = oneOf(input.channel, ['state_portal', 'phone', 'fax', 'other'] as const, 'channel')
  const confirmation = text(input.confirmation, 'Confirmation', { min: 2 })
  const at = when(input.submittedAt, 'submittedAt', uow.now)
  if (at.getTime() > uow.now.getTime() + 5 * 60_000) invalid('A submission cannot be in the future.', 'submittedAt')
  await casUpdate(uow, { model: 'RegulatoryReport', id: report.id, version: report.version, from: ['draft'], to: 'submitted', actor, eventType: 'regulatory_report.submitted', data: { channel, confirmation, submittedAt: at, submittedById: userOf(actor) } })
  const evidence = report.kind === 'f609_followup' ? 'submission:state_incident_followup' : 'submission:state_incident'
  const satisfied = await satisfyByEvidence(uow, actor, { subjectType: 'Incident', subjectId: report.incidentId }, { type: evidence, id: report.id, at })
  return { reportId: report.id, satisfied }
}

/**
 * Closing needs a completed investigation when the incident is reportable, and no draft reports. A reportable incident can only be
 * downgraded through a separate approval (requestDowngrade).
 */
export async function closeIncident(uow: UnitOfWork, actor: Actor, input: { incidentId: string; note?: string }) {
  const incident = await lockRow<{ id: string; version: number; status: string; reportableDecision: string }>(uow.tx, 'Incident', input.incidentId)
  if (incident.reportableDecision === 'reportable') {
    const done = await uow.tx.incidentInvestigation.count({ where: { incidentId: incident.id, status: 'completed' } })
    if (!done) throw new DomainError(Codes.GUARD_FAILED, 'Complete the investigation before closing a reportable incident.')
    const pending = await uow.tx.complianceClock.count({ where: { subjectType: 'Incident', subjectId: incident.id, current: true, status: { in: ['open', 'overdue'] } } })
    if (pending) throw new DomainError(Codes.GUARD_FAILED, 'A required report is still outstanding.')
  }
  await casUpdate(uow, { model: 'Incident', id: incident.id, version: incident.version, from: ['reported', 'under_investigation'], to: 'closed', actor, eventType: 'incident.closed', reason: input.note ?? null, data: { closedAt: uow.now } })
  const task = await uow.tx.task.findUnique({ where: { dedupeKey: `incident-review:${incident.id}` } })
  if (task && (task.status === 'open' || task.status === 'in_progress')) await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: userOf(actor), completedAt: uow.now } })
  return { incidentId: incident.id }
}

/** Downgrading "reportable" to "not reportable" cancels the clocks, so it is a maker-checker request decided by someone else. */
export async function requestDowngrade(uow: UnitOfWork, actor: Actor, input: { incidentId: string; reason: string }) {
  const incident = await uow.tx.incident.findUnique({ where: { id: input.incidentId } })
  if (!incident) return notFound('Incident')
  if (incident.reportableDecision !== 'reportable') throw new DomainError(Codes.GUARD_FAILED, 'This incident is not marked reportable.')
  const reason = text(input.reason, 'Reason', { min: 10 })
  const request = await requestApproval(uow, actor, { action: 'incident.downgrade', targetList: 'Incident', targetId: incident.id, payload: { incidentId: incident.id, reason }, requiredPermission: 'canApproveIncidentDowngrade', summary: `Downgrade ${incident.reference} to not reportable`, communityId: incident.communityId })
  return { approvalRequestId: request.id }
}

registerApplier('incident.downgrade', async (uow, actor, request) => {
  const payload = request.payload as { incidentId: string; reason: string }
  // The decider (this actor) already consumed the approval in the same transaction.
  const approverId = userOf(actor)
  const incident = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Incident', payload.incidentId)
  await uow.tx.incident.update({ where: { id: incident.id }, data: { reportableDecision: 'not_reportable', downgradedById: approverId, downgradeReason: payload.reason, version: { increment: 1 } } })
  await cancelClocks(uow, actor, { subjectType: 'Incident', subjectId: incident.id }, `Downgraded: ${payload.reason}`)
  uow.audit({ eventType: 'incident.downgraded', entityType: 'Incident', entityId: incident.id, actorUserId: userOf(actor), approverId, reason: payload.reason })
}, { applyOnApprove: true })
