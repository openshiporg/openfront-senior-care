import { actorUserId, type Actor } from '../lib/actor'
import { addDays, daysBetween } from '../lib/calendar'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'

/**
 * Medicaid patient liability (SCHEMA §10, STATE-MACHINES §12.6). One row per stay per month; a new determination supersedes
 * the old one and never edits it. The county's information-request and appeal clocks are COMPUTED ON READ: nothing runs on
 * a timer, a page that shows the row works out whether it is due or overdue.
 */

/** Days the facility has to answer a county information request, and to file an appeal after a notice. */
export const INFO_RESPONSE_DAYS = 10
export const APPEAL_DAYS = 90

const day = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null)

export type LiabilityClock = { name: 'info_response' | 'appeal'; state: 'open' | 'overdue' | 'done'; dueBy: string; daysLeft: number }

export function liabilityClocks(row: { infoRequestedOn: string | null; infoRespondedOn: string | null; noticeReceivedOn: string | null; appealFiledOn: string | null; status: string }, today: string): LiabilityClock[] {
  const clocks: LiabilityClock[] = []
  if (row.infoRequestedOn) {
    const dueBy = addDays(row.infoRequestedOn, INFO_RESPONSE_DAYS)
    const left = daysBetween(today, dueBy)
    clocks.push({ name: 'info_response', state: row.infoRespondedOn ? 'done' : left < 0 ? 'overdue' : 'open', dueBy, daysLeft: left })
  }
  if (row.noticeReceivedOn && row.status !== 'superseded') {
    const dueBy = addDays(row.noticeReceivedOn, APPEAL_DAYS)
    const left = daysBetween(today, dueBy)
    clocks.push({ name: 'appeal', state: row.appealFiledOn ? 'done' : left < 0 ? 'overdue' : 'open', dueBy, daysLeft: left })
  }
  return clocks
}

const assertMonth = (month: string) => {
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new DomainError(Codes.INVALID_INPUT, 'The month is the first day of the month, like 2026-10-01.', { field: 'month' })
}

/** Records the county's determination for a stay and month. A later one supersedes the earlier; the earlier row stays. */
export async function recordLiability(uow: UnitOfWork, actor: Actor, input: { stayId: string; month: string; liabilityMinor: bigint; noticeReceivedOn?: string | null; note?: string }) {
  assertMonth(input.month)
  if (typeof input.liabilityMinor !== 'bigint' || input.liabilityMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, 'The liability cannot be negative.', { field: 'liabilityMinor' })
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  await lockRow(uow.tx, 'Stay', stay.id)
  const current = await uow.tx.medicaidLiability.findFirst({ where: { stayId: stay.id, month: day(input.month), status: { not: 'superseded' } } })
  if (current && current.liabilityMinor === input.liabilityMinor && iso(current.noticeReceivedOn) === (input.noticeReceivedOn ?? null)) return { liabilityId: current.id, unchanged: true }
  const created = await uow.tx.medicaidLiability.create({
    data: {
      communityId: stay.communityId, residentId: stay.residentId, stayId: stay.id, month: day(input.month), liabilityMinor: input.liabilityMinor,
      status: 'determined', noticeReceivedOn: input.noticeReceivedOn ? day(input.noticeReceivedOn) : null, note: input.note ?? '',
    },
  })
  if (current) {
    await uow.tx.medicaidLiability.update({ where: { id: current.id }, data: { status: 'superseded', supersededById: created.id, version: { increment: 1 } } })
  }
  auditCreate(uow, actor, 'MedicaidLiability', created.id, 'medicaid_liability.recorded', { month: input.month, liabilityMinor: input.liabilityMinor.toString(), supersedes: current?.id ?? null })
  return { liabilityId: created.id, unchanged: false, supersedes: current?.id ?? null }
}

/** An expected liability before the determination arrives (so the close is not blocked by a missing row, but can see it). */
export async function recordExpectedLiability(uow: UnitOfWork, actor: Actor, input: { stayId: string; month: string; liabilityMinor: bigint }) {
  assertMonth(input.month)
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const existing = await uow.tx.medicaidLiability.findFirst({ where: { stayId: stay.id, month: day(input.month), status: { not: 'superseded' } } })
  if (existing) throw new DomainError(Codes.GUARD_FAILED, 'This month already has a liability.')
  const created = await uow.tx.medicaidLiability.create({ data: { communityId: stay.communityId, residentId: stay.residentId, stayId: stay.id, month: day(input.month), liabilityMinor: input.liabilityMinor, status: 'expected' } })
  auditCreate(uow, actor, 'MedicaidLiability', created.id, 'medicaid_liability.expected', { month: input.month })
  return { liabilityId: created.id }
}

export async function recordInfoRequest(uow: UnitOfWork, actor: Actor, input: { liabilityId: string; kind: 'requested' | 'responded'; on: string }) {
  await lockRow(uow.tx, 'MedicaidLiability', input.liabilityId)
  const row = await uow.tx.medicaidLiability.findUnique({ where: { id: input.liabilityId } })
  if (!row || row.status === 'superseded') throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (input.kind === 'responded' && !row.infoRequestedOn) throw new DomainError(Codes.GUARD_FAILED, 'No information request is open.')
  const data = input.kind === 'requested' ? { infoRequestedOn: day(input.on), infoRespondedOn: null } : { infoRespondedOn: day(input.on) }
  await uow.tx.medicaidLiability.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } })
  uow.audit({ eventType: `medicaid_liability.info_${input.kind}`, entityType: 'MedicaidLiability', entityId: row.id, actorUserId: actorUserId(actor), after: { on: input.on } })
  return { liabilityId: row.id }
}

export async function fileAppeal(uow: UnitOfWork, actor: Actor, input: { liabilityId: string; filedOn: string }) {
  await lockRow(uow.tx, 'MedicaidLiability', input.liabilityId)
  const row = await uow.tx.medicaidLiability.findUnique({ where: { id: input.liabilityId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  await casUpdate(uow, { model: 'MedicaidLiability', id: row.id, version: row.version, from: ['determined', 'expected'], to: 'appealed', actor, eventType: 'medicaid_liability.appealed', data: { appealFiledOn: day(input.filedOn) } })
  return { liabilityId: row.id, status: 'appealed' }
}
