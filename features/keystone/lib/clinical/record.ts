import { auditCreate, casUpdate, lockRow } from '../cas'
import { Codes, DomainError } from '../errors'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { invalid, num, oneOf, qty, residentFor, text, userOf, when, notFound, createTask, ROLE_NAMES } from './common'
import { NOTE_KINDS, VITAL_KINDS } from '../../models/clinical'

/* Clinical record (SCHEMA §5). Notes follow the ClinicalDocument contract: draft → signed → amended; never edited once signed. */

export async function createProgressNote(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; body: string; eventAt?: string | null; sign?: boolean }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, NOTE_KINDS, 'note type')
  const body = text(input.body, 'Note', { min: 3 })
  const eventAt = when(input.eventAt, 'eventAt', uow.now)
  if (eventAt.getTime() > uow.now.getTime() + 5 * 60_000) invalid('A note cannot describe a future time.', 'eventAt')
  const late = kind === 'late_entry' || uow.now.getTime() - eventAt.getTime() > 60 * 60_000
  const note = await uow.tx.progressNote.create({
    data: { residentId: resident.id, communityId: resident.communityId, kind, body, status: 'draft', eventAt, lateEntry: late, authorId: userOf(actor) },
  })
  auditCreate(uow, actor, 'ProgressNote', note.id, 'progress_note.created', { kind, lateEntry: late, residentId: resident.id })
  return input.sign ? signProgressNote(uow, actor, { noteId: note.id }) : { noteId: note.id, status: 'draft', lateEntry: late }
}

export async function signProgressNote(uow: UnitOfWork, actor: Actor, input: { noteId: string; expectedVersion?: number | null }) {
  const note = await lockRow<{ id: string; version: number; status: string; authorId: string | null; residentId: string }>(uow.tx, 'ProgressNote', input.noteId)
  if (note.authorId && note.authorId !== userOf(actor)) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only the author signs a note.')
  if (input.expectedVersion != null && input.expectedVersion !== note.version) throw new DomainError(Codes.STALE_STATE, 'The note changed. Reload and try again.', { currentVersion: note.version })
  await casUpdate(uow, { model: 'ProgressNote', id: note.id, version: note.version, from: ['draft'], to: 'signed', actor, eventType: 'progress_note.signed', data: { signedById: userOf(actor), signedAt: uow.now } })
  return { noteId: note.id, status: 'signed' }
}

/** A signed note is corrected by a new note that points back at it; the original becomes "amended" and stays readable. */
export async function amendProgressNote(uow: UnitOfWork, actor: Actor, input: { noteId: string; body: string; reason: string }) {
  const old = await lockRow<{ id: string; version: number; status: string; residentId: string; communityId: string; kind: string; eventAt: Date }>(uow.tx, 'ProgressNote', input.noteId)
  const reason = text(input.reason, 'Reason', { min: 3 })
  const body = text(input.body, 'Amended note', { min: 3 })
  const next = await uow.tx.progressNote.create({
    data: { residentId: old.residentId, communityId: old.communityId, kind: old.kind, body: `${body}\n\n(Amends an earlier note. Reason: ${reason})`, status: 'signed', eventAt: old.eventAt, lateEntry: true, authorId: userOf(actor), signedById: userOf(actor), signedAt: uow.now, amendsId: old.id },
  })
  await casUpdate(uow, { model: 'ProgressNote', id: old.id, version: old.version, from: ['signed', 'amended'], to: 'amended', actor, eventType: 'progress_note.amended', reason, data: { amendedById: next.id } })
  auditCreate(uow, actor, 'ProgressNote', next.id, 'progress_note.created', { amends: old.id, reason })
  return { noteId: next.id, amends: old.id }
}

export async function markNoteInError(uow: UnitOfWork, actor: Actor, input: { noteId: string; reason: string }) {
  const note = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'ProgressNote', input.noteId)
  const reason = text(input.reason, 'Reason', { min: 5 })
  await casUpdate(uow, { model: 'ProgressNote', id: note.id, version: note.version, from: ['draft', 'signed', 'amended'], to: 'entered_in_error', actor, eventType: 'progress_note.entered_in_error', reason, data: { errorReason: reason } })
  return { noteId: note.id, status: 'entered_in_error' }
}

const VITAL_UNITS: Record<string, { unit: string; min: number; max: number }> = {
  temperature: { unit: 'Cel', min: 30, max: 45 }, pulse: { unit: '/min', min: 10, max: 300 }, respirations: { unit: '/min', min: 2, max: 80 },
  systolic_bp: { unit: 'mm[Hg]', min: 30, max: 350 }, diastolic_bp: { unit: 'mm[Hg]', min: 10, max: 250 }, spo2: { unit: '%', min: 30, max: 100 },
  weight: { unit: 'kg', min: 10, max: 400 }, pain: { unit: '{score}', min: 0, max: 10 }, blood_glucose: { unit: 'mg/dL', min: 10, max: 1500 },
}

export async function recordVitals(uow: UnitOfWork, actor: Actor, input: { residentId: string; takenAt?: string | null; readings: { kind: string; value: string | number }[] }) {
  const resident = await residentFor(uow.tx, input.residentId)
  if (!Array.isArray(input.readings) || !input.readings.length) invalid('Add at least one reading.', 'readings')
  const takenAt = when(input.takenAt, 'takenAt', uow.now)
  const ids: string[] = []
  for (const reading of input.readings) {
    const kind = oneOf(reading.kind, VITAL_KINDS, 'vital sign')
    const spec = VITAL_UNITS[kind]
    const value = num(reading.value, kind, { min: spec.min, max: spec.max })
    const row = await uow.tx.vitalSign.create({ data: { residentId: resident.id, communityId: resident.communityId, kind, value: String(value), unit: spec.unit, takenAt, recordedById: userOf(actor) } })
    ids.push(row.id)
  }
  uow.audit({ eventType: 'vitals.recorded', entityType: 'Resident', entityId: resident.id, actorUserId: userOf(actor), after: { count: ids.length } })
  return { vitalIds: ids }
}

export async function recordIntake(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; amountMl?: string | number | null; percentEaten?: number | null; at?: string | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['fluid', 'meal', 'supplement', 'tube_feed'] as const, 'intake type')
  const data: Record<string, unknown> = { residentId: resident.id, communityId: resident.communityId, kind, at: when(input.at, 'at', uow.now), recordedById: userOf(actor) }
  if (input.amountMl != null && input.amountMl !== '') data.amountMl = String(num(input.amountMl, 'Amount', { min: 0, max: 5000 }))
  if (input.percentEaten != null) data.percentEaten = num(input.percentEaten, 'Percent eaten', { min: 0, max: 100 })
  if (data.amountMl === undefined && data.percentEaten === undefined) invalid('Record an amount or a percentage.')
  const row = await uow.tx.intakeRecord.create({ data: data as never })
  return { intakeId: row.id }
}

export async function recordAdl(uow: UnitOfWork, actor: Actor, input: { residentId: string; activity: string; level: string; at?: string | null; slotId?: string | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const activity = oneOf(input.activity, ['bed_mobility', 'transfer', 'walking', 'dressing', 'eating', 'toileting', 'bathing', 'hygiene', 'continence'] as const, 'activity')
  const level = oneOf(input.level, ['independent', 'supervision', 'limited_assist', 'extensive_assist', 'total_dependence', 'did_not_occur'] as const, 'level')
  const at = when(input.at, 'at', uow.now)
  const row = await uow.tx.adlRecord.create({ data: { residentId: resident.id, communityId: resident.communityId, activity, level, at, recordedById: userOf(actor), pocTaskSlotId: input.slotId ?? null } })
  if (input.slotId) {
    const slot = await lockRow<{ id: string; version: number; status: string; residentId: string }>(uow.tx, 'PocTaskSlot', input.slotId)
    if (slot.residentId !== resident.id) notFound('Task')
    await casUpdate(uow, { model: 'PocTaskSlot', id: slot.id, version: slot.version, from: ['pending'], to: level === 'did_not_occur' ? 'not_done' : 'done', actor, eventType: 'poc_task.completed', data: { doneAt: at, doneById: userOf(actor) } })
  }
  return { adlId: row.id }
}

export async function openWound(uow: UnitOfWork, actor: Actor, input: { residentId: string; site: string; kind: string; stage?: string | null; lengthCm?: string | number | null; widthCm?: string | number | null; depthCm?: string | number | null; description?: string; photoDocumentIds?: string[]; intervalDays?: number | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['pressure_injury', 'skin_tear', 'venous', 'arterial', 'diabetic', 'surgical', 'other'] as const, 'wound type')
  const wound = await uow.tx.wound.create({
    data: { residentId: resident.id, communityId: resident.communityId, site: text(input.site, 'Site'), kind, status: 'open', firstNotedAt: uow.now, assessmentIntervalDays: input.intervalDays ?? 7 },
  })
  auditCreate(uow, actor, 'Wound', wound.id, 'wound.opened', { kind, residentId: resident.id })
  await assessWoundRow(uow, actor, wound.id, resident.id, resident.communityId, input)
  return { woundId: wound.id }
}

async function assessWoundRow(uow: UnitOfWork, actor: Actor, woundId: string, residentId: string, communityId: string, input: { stage?: string | null; lengthCm?: any; widthCm?: any; depthCm?: any; description?: string; photoDocumentIds?: string[] }) {
  const stage = input.stage ? oneOf(input.stage, ['1', '2', '3', '4', 'unstageable', 'deep_tissue', 'not_applicable'] as const, 'stage') : null
  const dim = (v: unknown, f: string) => (v == null || v === '' ? null : String(qty(v, f)))
  await uow.tx.woundAssessment.create({
    data: {
      residentId, communityId, woundId, stage, lengthCm: dim(input.lengthCm, 'Length'), widthCm: dim(input.widthCm, 'Width'), depthCm: dim(input.depthCm, 'Depth'),
      description: input.description ?? '', photos: (input.photoDocumentIds ?? []) as never, assessedAt: uow.now, assessedById: userOf(actor),
    },
  })
  await uow.tx.wound.update({ where: { id: woundId }, data: { lastAssessedAt: uow.now, currentStage: stage ?? '', version: { increment: 1 } } })
}

export async function assessWound(uow: UnitOfWork, actor: Actor, input: { woundId: string; stage?: string | null; lengthCm?: any; widthCm?: any; depthCm?: any; description?: string; photoDocumentIds?: string[] }) {
  const wound = await lockRow<{ id: string; residentId: string; communityId: string; status: string }>(uow.tx, 'Wound', input.woundId)
  if (wound.status === 'healed' || wound.status === 'entered_in_error') throw new DomainError(Codes.INVALID_TRANSITION, 'This wound is closed.')
  await assessWoundRow(uow, actor, wound.id, wound.residentId, wound.communityId, input)
  return { woundId: wound.id }
}

export async function recordBehaviour(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; severity?: string; antecedent?: string; intervention?: string; outcome?: string; startedAt?: string | null; durationMinutes?: number | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['wandering', 'verbal', 'physical', 'resistance_to_care', 'sundowning', 'self_injury', 'other'] as const, 'behaviour')
  const row = await uow.tx.behaviourEpisode.create({
    data: {
      residentId: resident.id, communityId: resident.communityId, kind, severity: input.severity ? oneOf(input.severity, ['mild', 'moderate', 'severe'] as const, 'severity') : 'mild',
      antecedent: input.antecedent ?? '', intervention: input.intervention ?? '', outcome: input.outcome ?? '', startedAt: when(input.startedAt, 'startedAt', uow.now),
      durationMinutes: input.durationMinutes ?? null, recordedById: userOf(actor),
    },
  })
  return { episodeId: row.id }
}

/** Physician visits satisfy the 30/60-day schedule; the next due date is computed on read (clinical/clocks.ts). */
export async function recordPhysicianVisit(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; physicianName: string; visitedAt: string; summary?: string }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['physician', 'nurse_practitioner', 'physician_assistant', 'telehealth'] as const, 'visit type')
  const visitedAt = when(input.visitedAt, 'visitedAt')
  if (visitedAt.getTime() > uow.now.getTime() + 5 * 60_000) invalid('A visit cannot be in the future.', 'visitedAt')
  const row = await uow.tx.physicianVisit.create({
    data: { residentId: resident.id, communityId: resident.communityId, kind, physicianName: text(input.physicianName, 'Physician'), visitedAt, summary: input.summary ?? '', recordedById: userOf(actor) },
  })
  auditCreate(uow, actor, 'PhysicianVisit', row.id, 'physician_visit.recorded', { residentId: resident.id, visitedAt })
  return { visitId: row.id }
}

export { createTask, ROLE_NAMES }
