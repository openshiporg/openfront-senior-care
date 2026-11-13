import type { Actor } from '../lib/actor'
import { addDays, daysBetween } from '../lib/calendar'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { APPEAL_DAYS, INFO_RESPONSE_DAYS } from './medicaid'

/**
 * Medicaid eligibility applications and the patient liability schedule (SCHEMA §5.6, §5.7; STATE-MACHINES §5.3).
 * Clocks and pending AR are computed on read; nothing runs on a timer.
 */

const day = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const date = (value: unknown, field: string) => {
  const text = String(value ?? '').slice(0, 10)
  if (!DATE.test(text)) throw new DomainError(Codes.INVALID_INPUT, `The ${field} is a date, like 2026-10-01.`, { field })
  return text
}

/* ---- Pure ----------------------------------------------------------------------------------------------------- */

export type ApplicationClock = { name: 'info_response' | 'appeal'; state: 'open' | 'overdue' | 'done'; dueBy: string; daysLeft: number }

/**
 * The county's reply deadline for an information request (the date on the letter, or 10 days) and the 90-day appeal window after a
 * denial. Read from the row and today's date.
 */
export function applicationClocks(row: { status: string; infoRequestedOn: string | null; infoDueOn: string | null; infoRespondedOn: string | null; decisionOn: string | null; appealDueOn: string | null; appealFiledOn: string | null }, today: string): ApplicationClock[] {
  const clocks: ApplicationClock[] = []
  if (row.infoRequestedOn) {
    const dueBy = row.infoDueOn ?? addDays(row.infoRequestedOn, INFO_RESPONSE_DAYS)
    const left = daysBetween(today, dueBy)
    const done = Boolean(row.infoRespondedOn) || row.status !== 'info_requested'
    clocks.push({ name: 'info_response', state: done ? 'done' : left < 0 ? 'overdue' : 'open', dueBy, daysLeft: left })
  }
  if (row.decisionOn && (row.status === 'denied' || row.status === 'appealed' || row.appealFiledOn)) {
    const dueBy = row.appealDueOn ?? addDays(row.decisionOn, APPEAL_DAYS)
    const left = daysBetween(today, dueBy)
    clocks.push({ name: 'appeal', state: row.appealFiledOn ? 'done' : left < 0 ? 'overdue' : 'open', dueBy, daysLeft: left })
  }
  return clocks
}

/** Undecided applications: charges from the requested date on are pending AR until the county decides. */
export const PENDING_STATUSES = ['preparing', 'submitted', 'info_requested', 'appealed'] as const

/** The resident's open balance on statements for months from the requested date on: what Medicaid may yet pay. */
export function pendingAr(statements: readonly { month: string; status: string; totalMinor: bigint; paidMinor: bigint; adjustedMinor: bigint }[], requestedFrom: string | null) {
  if (!requestedFrom) return 0n
  const fromMonth = `${requestedFrom.slice(0, 7)}-01`
  let total = 0n
  for (const s of statements) {
    if (s.status === 'void' || s.month < fromMonth) continue
    const open = s.totalMinor - s.paidMinor - s.adjustedMinor
    if (open > 0n) total += open
  }
  return total
}

export type ScheduleRow = { id: string; residentId: string; stayId: string | null; monthlyAmountMinor: bigint; personalNeedsAllowanceMinor: bigint; effectiveFrom: string; effectiveTo: string | null; status: string }

/**
 * The schedule row that sets a month's patient liability: the one in effect on the 1st, or, when liability starts mid-month, the
 * first one that starts in the month. The derivation prorates it by the days Medicaid covered. Superseded and draft rows never count.
 */
export function scheduleForMonth(rows: readonly ScheduleRow[], month: string, monthEnd: string): ScheduleRow | null {
  const live = rows.filter(row => row.status === 'effective' && row.effectiveFrom <= monthEnd && (!row.effectiveTo || row.effectiveTo >= month))
  if (!live.length) return null
  const onFirst = live.filter(row => row.effectiveFrom <= month).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
  if (onFirst) return onFirst
  return [...live].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0]
}

/* ---- Commands ------------------------------------------------------------------------------------------------- */

export async function startApplication(uow: UnitOfWork, actor: Actor, input: { stayId: string; requestedFrom: string; state?: string; caseworker?: string; note?: string }) {
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const requestedFrom = date(input.requestedFrom, 'requested from date')
  const open = await uow.tx.medicaidApplication.findFirst({ where: { stayId: stay.id, status: { in: [...PENDING_STATUSES] } }, select: { reference: true } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, `Application ${open.reference} is still open for this stay.`, { reason: 'application_open' })
  const created = await uow.tx.medicaidApplication.create({
    data: {
      communityId: stay.communityId, residentId: stay.residentId, stayId: stay.id, reference: await nextReference(uow.tx, 'MCD', uow.now, 5), status: 'preparing',
      requestedFrom: day(requestedFrom), state: input.state ?? '', caseworker: input.caseworker ?? '', note: input.note ?? '',
    },
  })
  auditCreate(uow, actor, 'MedicaidApplication', created.id, 'medicaid_application.started', { requestedFrom })
  return { applicationId: created.id, reference: created.reference }
}

type Step = 'submit' | 'info_request' | 'info_response' | 'approve' | 'deny' | 'appeal' | 'appeal_approved' | 'appeal_denied'
const FROM: Record<Step, string[]> = {
  submit: ['preparing'], info_request: ['submitted', 'appealed'], info_response: ['info_requested'], approve: ['submitted'], deny: ['submitted'],
  appeal: ['denied'], appeal_approved: ['appealed'], appeal_denied: ['appealed'],
}

/** One step through the application's life (STATE-MACHINES §5.3). Each is a staff button that records the date it happened. */
export async function advanceApplication(uow: UnitOfWork, actor: Actor, input: { applicationId: string; step: Step; on: string; dueOn?: string | null; effectiveOn?: string | null; note?: string }) {
  const step = input.step
  if (!FROM[step]) throw new DomainError(Codes.INVALID_INPUT, 'Unknown step.')
  const on = date(input.on, 'date')
  const row = await lockRow<any>(uow.tx, 'MedicaidApplication', input.applicationId)
  if (!FROM[step].includes(row.status)) throw new DomainError(Codes.GUARD_FAILED, `This application is ${row.status.replace(/_/g, ' ')}; it cannot ${step.replace(/_/g, ' ')} now.`)
  if (row.submittedOn && on < iso(row.submittedOn)!) throw new DomainError(Codes.INVALID_INPUT, 'That date is before the application was submitted.')
  let to = row.status
  const data: Record<string, unknown> = {}
  switch (step) {
    case 'submit': to = 'submitted'; data.submittedOn = day(on); break
    case 'info_request': {
      to = 'info_requested'
      const due = input.dueOn ? date(input.dueOn, 'reply due date') : addDays(on, INFO_RESPONSE_DAYS)
      if (due < on) throw new DomainError(Codes.INVALID_INPUT, 'The reply is due on or after the request date.')
      Object.assign(data, { infoRequestedOn: day(on), infoDueOn: day(due), infoRespondedOn: null })
      break
    }
    // An information request during an appeal returns to the appeal.
    case 'info_response': to = row.appealFiledOn ? 'appealed' : 'submitted'; data.infoRespondedOn = day(on); break
    case 'approve': case 'appeal_approved':
      to = 'approved'
      Object.assign(data, { decisionOn: day(on), effectiveOn: day(input.effectiveOn ? date(input.effectiveOn, 'effective date') : iso(row.requestedFrom)!) })
      break
    case 'deny': to = 'denied'; Object.assign(data, { decisionOn: day(on), appealDueOn: day(addDays(on, APPEAL_DAYS)) }); break
    case 'appeal': {
      const due = iso(row.appealDueOn) ?? addDays(iso(row.decisionOn)!, APPEAL_DAYS)
      if (on > due) throw new DomainError(Codes.GUARD_FAILED, `The appeal window closed on ${due}.`, { reason: 'appeal_window_closed' })
      to = 'appealed'; data.appealFiledOn = day(on); break
    }
    case 'appeal_denied': to = 'denied'; data.decisionOn = day(on); break
  }
  if (input.note) data.note = input.note
  await casUpdate(uow, { model: 'MedicaidApplication', id: row.id, version: row.version, from: [row.status], to, actor, eventType: `medicaid_application.${step}`, data })
  return { applicationId: row.id, status: to }
}

/**
 * Records a patient liability determination as a schedule row from a date. The earlier open row ends the day before and the row
 * it replaced entirely becomes superseded; nothing is edited in place. Re-derive (or adjust a closed month) to bill it.
 */
export async function recordSchedule(uow: UnitOfWork, actor: Actor, input: { residentId: string; stayId?: string | null; applicationId?: string | null; monthlyAmountMinor: bigint; personalNeedsAllowanceMinor: bigint; effectiveFrom: string; note?: string }) {
  if (input.monthlyAmountMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, 'The liability cannot be negative.', { field: 'monthlyAmountMinor' })
  if (input.personalNeedsAllowanceMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, 'The personal needs allowance cannot be negative.', { field: 'personalNeedsAllowanceMinor' })
  const from = date(input.effectiveFrom, 'effective date')
  const resident = await uow.tx.resident.findUnique({ where: { id: input.residentId }, select: { id: true, communityId: true } })
  if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
  await lockRow(uow.tx, 'Resident', resident.id)
  if (input.stayId) {
    const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { residentId: true } })
    if (stay?.residentId !== resident.id) throw new DomainError(Codes.INVALID_INPUT, 'That stay is not this resident\'s.')
  }
  const live = await uow.tx.patientLiabilitySchedule.findMany({ where: { residentId: resident.id, status: 'effective' }, orderBy: { effectiveFrom: 'asc' } })
  for (const row of live) {
    const rowFrom = iso(row.effectiveFrom)!
    if (rowFrom >= from) {
      // Replaced from its first day: superseded, kept as history.
      await uow.tx.patientLiabilitySchedule.update({ where: { id: row.id }, data: { status: 'superseded', version: { increment: 1 } } })
    } else if (!row.effectiveTo || iso(row.effectiveTo)! >= from) {
      await uow.tx.patientLiabilitySchedule.update({ where: { id: row.id }, data: { effectiveTo: day(addDays(from, -1)), version: { increment: 1 } } })
    }
  }
  const created = await uow.tx.patientLiabilitySchedule.create({
    data: {
      communityId: resident.communityId, residentId: resident.id, stayId: input.stayId ?? null, applicationId: input.applicationId ?? null, monthlyAmountMinor: input.monthlyAmountMinor,
      personalNeedsAllowanceMinor: input.personalNeedsAllowanceMinor, effectiveFrom: day(from), status: 'effective', note: input.note ?? '',
    },
  })
  auditCreate(uow, actor, 'PatientLiabilitySchedule', created.id, 'patient_liability.scheduled', { effectiveFrom: from, monthlyAmountMinor: input.monthlyAmountMinor.toString(), personalNeedsAllowanceMinor: input.personalNeedsAllowanceMinor.toString() })
  return { scheduleId: created.id, effectiveFrom: from }
}

/**
 * Personal needs allowance tracking, read from the schedule and the resident's trust ledger: what the allowance is this month, and
 * how much went into the trust account as allowance this month (deposits whose purpose is the PNA).
 */
export function pnaStatus(input: { allowanceMinor: bigint | null; creditedThisMonthMinor: bigint }) {
  if (input.allowanceMinor === null) return { state: 'no_schedule' as const, shortMinor: 0n }
  const short = input.allowanceMinor - input.creditedThisMonthMinor
  return { state: short > 0n ? ('short' as const) : ('credited' as const), shortMinor: short > 0n ? short : 0n }
}

