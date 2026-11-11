import { auditCreate, casUpdate, lockRow } from '../cas'
import { Codes, DomainError } from '../errors'
import { addDays, localDate } from '../calendar'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { communityZone, createTask, invalid, notFound, oneOf, residentFor, ROLE_NAMES, text, userOf, when } from './common'

/* Infection prevention basics (SCHEMA §10). Criteria sets are generic checklists; the surveillance definition used is named on the case (verify: McGeer / Loeb). */

const SYNDROMES = ['uti', 'respiratory', 'skin_soft_tissue', 'gastroenteritis', 'covid19', 'influenza', 'cdiff', 'other'] as const

export async function openInfectionCase(uow: UnitOfWork, actor: Actor, input: { residentId: string; syndrome: string; onsetAt?: string | null; criteria?: Record<string, boolean>; criteriaSet?: string; organism?: string; cultureAt?: string | null; precaution?: 'standard' | 'contact' | 'droplet' | 'airborne' | 'enhanced_barrier' | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const syndrome = oneOf(input.syndrome, SYNDROMES, 'syndrome')
  const criteria = input.criteria ?? {}
  const met = Object.keys(criteria).length > 0 && Object.values(criteria).filter(Boolean).length >= 2
  const row = await uow.tx.infectionCase.create({
    data: {
      residentId: resident.id, communityId: resident.communityId, syndrome, status: 'suspected', onsetAt: when(input.onsetAt, 'onsetAt', uow.now), criteria: criteria as never,
      criteriaMet: met, criteriaSet: input.criteriaSet ?? 'facility checklist (verify the surveillance definition)', organism: input.organism ?? '', cultureAt: input.cultureAt ? when(input.cultureAt, 'cultureAt') : null,
    },
  })
  auditCreate(uow, actor, 'InfectionCase', row.id, 'infection_case.opened', { syndrome, criteriaMet: met, residentId: resident.id })
  if (input.precaution) await startPrecaution(uow, actor, { residentId: resident.id, kind: input.precaution, caseId: row.id, reason: `${syndrome} suspected` })
  await clusterCheck(uow, actor, resident.communityId, syndrome, resident.id)
  return { caseId: row.id, criteriaMet: met }
}

/** Three or more open cases of one syndrome in a unit in 7 days make an inbox task for the Infection Preventionist. Declaring an outbreak stays a person's decision. */
async function clusterCheck(uow: UnitOfWork, actor: Actor, communityId: string, syndrome: string, residentId: string) {
  const since = new Date(uow.now.getTime() - 7 * 86_400_000)
  const cases = await uow.tx.infectionCase.findMany({ where: { communityId, syndrome, status: { in: ['suspected', 'confirmed'] }, onsetAt: { gte: since } }, select: { residentId: true } })
  const people = new Set(cases.map(c => c.residentId))
  if (people.size < 3) return
  const zone = await communityZone(uow.tx, communityId)
  await createTask(uow, actor, { communityId, residentId, kind: 'escalation', title: `Possible cluster: ${people.size} residents with ${syndrome} in 7 days`, ownerRole: ROLE_NAMES.ip, escalationOwnerRole: ROLE_NAMES.don, dueAt: new Date(uow.now.getTime() + 4 * 3_600_000), dedupeKey: `cluster:${communityId}:${syndrome}:${localDate(zone, uow.now)}`, subjectType: 'InfectionCase', subjectId: '' })
}

export async function updateInfectionCase(uow: UnitOfWork, actor: Actor, input: { caseId: string; to: 'confirmed' | 'ruled_out' | 'resolved'; organism?: string }) {
  const row = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'InfectionCase', input.caseId)
  const to = oneOf(input.to, ['confirmed', 'ruled_out', 'resolved'] as const, 'status')
  await casUpdate(uow, { model: 'InfectionCase', id: row.id, version: row.version, from: to === 'resolved' ? ['suspected', 'confirmed'] : ['suspected', 'confirmed'], to, actor, eventType: `infection_case.${to}`, data: input.organism ? { organism: input.organism } : {} })
  if (to === 'ruled_out' || to === 'resolved') {
    await uow.tx.precautionOrder.updateMany({ where: { caseId: row.id, status: 'active' }, data: { status: 'ended', endedAt: uow.now, version: { increment: 1 } } })
  }
  return { caseId: row.id, status: to }
}

export async function startPrecaution(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; caseId?: string | null; reason?: string; reviewDays?: number }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['standard', 'contact', 'droplet', 'airborne', 'enhanced_barrier'] as const, 'precaution')
  const zone = await communityZone(uow.tx, resident.communityId)
  const row = await uow.tx.precautionOrder.create({ data: { residentId: resident.id, communityId: resident.communityId, kind, caseId: input.caseId ?? null, status: 'active', startedAt: uow.now, reviewOn: new Date(`${addDays(localDate(zone, uow.now), input.reviewDays ?? 7)}T00:00:00Z`), reason: input.reason ?? '' } })
  auditCreate(uow, actor, 'PrecautionOrder', row.id, 'precaution.started', { kind, residentId: resident.id })
  return { precautionId: row.id }
}

export async function endPrecaution(uow: UnitOfWork, actor: Actor, input: { precautionId: string; reason: string }) {
  const row = await lockRow<{ id: string; version: number }>(uow.tx, 'PrecautionOrder', input.precautionId)
  await casUpdate(uow, { model: 'PrecautionOrder', id: row.id, version: row.version, from: ['active'], to: 'ended', actor, eventType: 'precaution.ended', reason: text(input.reason, 'Reason', { min: 3 }), data: { endedAt: uow.now } })
  return { precautionId: row.id }
}

/** Antibiotic time-out is due 48-72 hours after the start (CDC core element; 72h used, verify the facility policy). */
export async function startAntibioticCourse(uow: UnitOfWork, actor: Actor, input: { residentId: string; drugName: string; indication: string; plannedDays?: number | null; orderId?: string | null; caseId?: string | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const row = await uow.tx.antibioticCourse.create({
    data: {
      residentId: resident.id, communityId: resident.communityId, drugName: text(input.drugName, 'Drug'), indication: text(input.indication, 'Indication'), orderId: input.orderId ?? null, caseId: input.caseId ?? null,
      startedAt: uow.now, plannedDays: input.plannedDays ?? null, timeoutDueAt: new Date(uow.now.getTime() + 72 * 3_600_000), status: 'active',
    },
  })
  auditCreate(uow, actor, 'AntibioticCourse', row.id, 'antibiotic.started', { drug: row.drugName, timeoutDueAt: row.timeoutDueAt })
  await createTask(uow, actor, { communityId: resident.communityId, residentId: resident.id, kind: 'general', title: `Antibiotic time-out: ${row.drugName}`, ownerRole: ROLE_NAMES.pharmacist, dueAt: row.timeoutDueAt, dedupeKey: `abx-timeout:${row.id}`, subjectType: 'AntibioticCourse', subjectId: row.id })
  return { courseId: row.id, timeoutDueAt: row.timeoutDueAt }
}

export async function recordAntibioticTimeout(uow: UnitOfWork, actor: Actor, input: { courseId: string; outcome: string }) {
  const row = await lockRow<{ id: string; version: number; status: string; timeoutAt: Date | null }>(uow.tx, 'AntibioticCourse', input.courseId)
  const outcome = oneOf(input.outcome, ['continue', 'narrow', 'stop', 'change'] as const, 'outcome')
  if (row.status !== 'active') throw new DomainError(Codes.INVALID_TRANSITION, 'This course is closed.')
  await uow.tx.antibioticCourse.update({ where: { id: row.id }, data: { timeoutOutcome: outcome, timeoutAt: uow.now, timeoutById: userOf(actor) } })
  if (outcome === 'stop') await casUpdate(uow, { model: 'AntibioticCourse', id: row.id, version: row.version, from: ['active'], to: 'stopped', actor, eventType: 'antibiotic.stopped' })
  else uow.audit({ eventType: 'antibiotic.timeout', entityType: 'AntibioticCourse', entityId: row.id, actorUserId: userOf(actor), after: { outcome } })
  const task = await uow.tx.task.findUnique({ where: { dedupeKey: `abx-timeout:${row.id}` } })
  if (task && (task.status === 'open' || task.status === 'in_progress')) await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: userOf(actor), completedAt: uow.now } })
  return { courseId: row.id, outcome }
}

export async function declareOutbreak(uow: UnitOfWork, actor: Actor, input: { communityId: string; name: string; organism?: string; unitId?: string | null; caseIds?: string[] }) {
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { id: true } })
  if (!community) return notFound('Community')
  const row = await uow.tx.outbreak.create({ data: { communityId: community.id, name: text(input.name, 'Name'), organism: input.organism ?? '', unitId: input.unitId ?? null, status: 'declared', declaredAt: uow.now, declaredById: userOf(actor) } })
  if (input.caseIds?.length) await uow.tx.infectionCase.updateMany({ where: { id: { in: input.caseIds }, communityId: community.id }, data: { outbreakId: row.id } })
  auditCreate(uow, actor, 'Outbreak', row.id, 'outbreak.declared', { name: row.name, cases: input.caseIds?.length ?? 0 })
  await createTask(uow, actor, { communityId: community.id, kind: 'escalation', title: `Outbreak declared: ${row.name}. Notify the health department (done outside this system).`, ownerRole: ROLE_NAMES.director, dedupeKey: `outbreak:${row.id}`, subjectType: 'Outbreak', subjectId: row.id })
  return { outbreakId: row.id }
}

export async function closeOutbreak(uow: UnitOfWork, actor: Actor, input: { outbreakId: string; status: 'contained' | 'closed' }) {
  const row = await lockRow<{ id: string; version: number }>(uow.tx, 'Outbreak', input.outbreakId)
  const to = oneOf(input.status, ['contained', 'closed'] as const, 'status')
  await casUpdate(uow, { model: 'Outbreak', id: row.id, version: row.version, from: to === 'contained' ? ['declared'] : ['declared', 'contained'], to, actor, eventType: `outbreak.${to}`, data: to === 'closed' ? { closedAt: uow.now } : {} })
  return { outbreakId: row.id, status: to }
}

export async function recordImmunisation(uow: UnitOfWork, actor: Actor, input: { residentId: string; vaccine: string; status: string; givenAt?: string | null; lot?: string }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const vaccine = oneOf(input.vaccine, ['influenza', 'covid19', 'pneumococcal', 'rsv', 'tdap', 'hepatitis_b', 'other'] as const, 'vaccine')
  const status = oneOf(input.status, ['offered', 'accepted', 'declined', 'given', 'contraindicated'] as const, 'status')
  if (status === 'given' && !input.givenAt) invalid('Say when it was given.', 'givenAt')
  const row = await uow.tx.immunisation.create({ data: { residentId: resident.id, communityId: resident.communityId, vaccine, status, offeredAt: uow.now, decidedAt: status === 'offered' ? null : uow.now, givenAt: input.givenAt ? when(input.givenAt, 'givenAt') : null, lot: input.lot ?? '', recordedById: userOf(actor) } })
  return { immunisationId: row.id }
}
