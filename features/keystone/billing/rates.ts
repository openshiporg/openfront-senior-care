import { actorUserId, type Actor } from '../lib/actor'
import { addDays, localDate } from '../lib/calendar'
import { registerApplier } from '../lib/approvalAppliers'
import { requestApproval } from '../lib/approval'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'

/**
 * Rate schedules: draft, then published through a maker-checker approval (rate.publish), then retired. Lines freeze at
 * publication. A rate change affecting residents needs notice first; the notice is a printable page with a recorded delivery
 * date (NoticeDelivery), never something this app sends.
 */

const day = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '')

export async function createSchedule(uow: UnitOfWork, actor: Actor, input: { communityId: string; name: string; setting: string; effectiveFrom: string; noticeDays?: number }) {
  if (!input.name.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Name the schedule.', { field: 'name' })
  const schedule = await uow.tx.rateSchedule.create({ data: { communityId: input.communityId, name: input.name.trim(), setting: input.setting, effectiveFrom: day(input.effectiveFrom), noticeDays: input.noticeDays ?? 30, status: 'draft' } })
  auditCreate(uow, actor, 'RateSchedule', schedule.id, 'rate_schedule.created', { setting: input.setting })
  return { scheduleId: schedule.id }
}

/**
 * Which `per` and proration make sense for a kind. Monthly kinds are per month (prorated by the days in the month or a 30-day
 * month) or per day (rate × days, proration 'daily'); daily kinds are per day; one-off kinds are per each. Anything else is refused.
 */
export function checkRateShape(kind: string, per: string, proration?: string) {
  const bad = (message: string): never => { throw new DomainError(Codes.INVALID_INPUT, message, { field: 'per' }) }
  const monthlyKinds = ['apartment_rent', 'care_level', 'second_person', 'med_management']
  const dailyKinds = ['room_daily', 'bed_hold_daily']
  const eachKinds = ['community_fee', 'ancillary']
  if (!['month', 'day', 'each'].includes(per)) bad('A rate is per month, per day or per each.')
  if (proration !== undefined && !['actual_days_in_month', 'thirty_day_month', 'daily'].includes(proration)) bad('Unknown proration method.')
  if (dailyKinds.includes(kind)) {
    if (per !== 'day') bad('A daily rate is charged per day.')
    if (proration && proration !== 'daily') bad('A daily rate has no proration; use the daily method.')
    return { per: 'day', proration: 'daily' }
  }
  if (eachKinds.includes(kind)) {
    if (per !== 'each') bad('A fee is charged once, per each.')
    return { per: 'each', proration: proration ?? 'actual_days_in_month' }
  }
  if (!monthlyKinds.includes(kind)) bad('Unknown rate kind.')
  if (per === 'each') bad('A monthly charge cannot be per each.')
  if (per === 'day') {
    if (proration && proration !== 'daily') bad('A per-day rate is rate × days; use the daily method.')
    return { per: 'day', proration: 'daily' }
  }
  if (proration === 'daily') bad('The daily method needs a per-day rate.')
  return { per: 'month', proration: proration ?? 'actual_days_in_month' }
}

export async function addRateLine(uow: UnitOfWork, actor: Actor, input: { scheduleId: string; kind: string; amountMinor: bigint; per: 'month' | 'day' | 'each'; proration?: string; apartmentTypeId?: string | null; careLevelId?: string | null }) {
  await lockRow(uow.tx, 'RateSchedule', input.scheduleId)
  const schedule = await uow.tx.rateSchedule.findUnique({ where: { id: input.scheduleId } })
  if (!schedule) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (schedule.status !== 'draft') throw new DomainError(Codes.GUARD_FAILED, 'A published schedule is frozen. Make a new one for the next change.', { reason: 'frozen' })
  if (typeof input.amountMinor !== 'bigint' || input.amountMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, 'The rate cannot be negative.', { field: 'amountMinor' })
  const { per, proration } = checkRateShape(input.kind, input.per, input.proration)
  const line = await uow.tx.rateLine.create({ data: { scheduleId: schedule.id, kind: input.kind, amountMinor: input.amountMinor, per, proration, apartmentTypeId: input.apartmentTypeId ?? null, careLevelId: input.careLevelId ?? null } })
  auditCreate(uow, actor, 'RateLine', line.id, 'rate_line.added', { kind: input.kind, amountMinor: input.amountMinor.toString() })
  return { lineId: line.id }
}

/** Opens the maker-checker request to publish. Nothing is live until a different person with canApproveRates approves. */
export async function requestPublish(uow: UnitOfWork, actor: Actor, input: { scheduleId: string }) {
  await lockRow(uow.tx, 'RateSchedule', input.scheduleId)
  const schedule = await uow.tx.rateSchedule.findUnique({ where: { id: input.scheduleId }, include: { lines: { select: { id: true } } } })
  if (!schedule) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (schedule.status !== 'draft') throw new DomainError(Codes.GUARD_FAILED, 'Only a draft can be published.')
  if (!schedule.lines.length) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one rate before publishing.')
  const approval = await requestApproval(uow, actor, { action: 'rate.publish', targetList: 'RateSchedule', targetId: schedule.id, payload: { scheduleId: schedule.id, lines: schedule.lines.map(line => line.id).sort() }, requiredPermission: 'canApproveRates', summary: `Publish ${schedule.name}`, communityId: schedule.communityId })
  await uow.tx.rateSchedule.update({ where: { id: schedule.id }, data: { approvalId: approval.id } })
  return { approvalRequestId: approval.id }
}

registerApplier('rate.publish', async (uow, actor, request) => {
  await lockRow(uow.tx, 'RateSchedule', request.targetId)
  const schedule = await uow.tx.rateSchedule.findUnique({ where: { id: request.targetId }, include: { lines: { select: { id: true } } } })
  if (!schedule || schedule.status !== 'draft') throw new DomainError(Codes.GUARD_FAILED, 'This schedule is no longer a draft.')
  const approved = (request.payload as { lines: string[] }).lines
  const now = schedule.lines.map(line => line.id).sort()
  if (JSON.stringify(approved) !== JSON.stringify(now)) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The rates changed after they were approved. Request approval again.')
  await casUpdate(uow, { model: 'RateSchedule', id: schedule.id, version: schedule.version, from: ['draft'], to: 'published', actor, eventType: 'rate_schedule.published', data: { publishedAt: uow.now } })
  return { published: schedule.id }
})

/**
 * The residents a published schedule affects and the date by which each must have been given notice. Read only: the notice
 * is printed and its delivery recorded; nothing is sent.
 */
export async function rateChangeNotices(tx: UnitOfWork['tx'], scheduleId: string) {
  const schedule = await tx.rateSchedule.findUnique({ where: { id: scheduleId } })
  if (!schedule?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const community = await tx.community.findUniqueOrThrow({ where: { id: schedule.communityId }, select: { timeZone: true } })
  const effective = iso(schedule.effectiveFrom)
  const noticeBy = addDays(effective, -(schedule.noticeDays ?? 30))
  const stays = await tx.stay.findMany({ where: { communityId: schedule.communityId, status: 'admitted', setting: schedule.setting }, select: { id: true, residentId: true, resident: { select: { firstName: true, lastName: true } } } })
  const delivered = await tx.noticeDelivery.findMany({ where: { kind: 'rate_change', subjectType: 'RateSchedule', subjectId: scheduleId }, select: { residentId: true, deliveredAt: true } })
  const byResident = new Map(delivered.map(row => [row.residentId, row.deliveredAt]))
  const today = localDate(community.timeZone, new Date())
  return {
    effectiveFrom: effective, noticeBy,
    notices: stays.map(stay => {
      const at = stay.residentId ? byResident.get(stay.residentId) ?? null : null
      const on = at ? localDate(community.timeZone, at) : null
      const state = on ? (on <= noticeBy ? 'delivered' : 'delivered_late') : today > noticeBy ? 'overdue' : 'due'
      return { residentId: stay.residentId, name: `${stay.resident?.firstName ?? ''} ${stay.resident?.lastName ?? ''}`.trim(), deliveredOn: on, state }
    }),
  }
}

/** Records that the printed rate-change notice was handed to the resident or representative, and when. */
export async function recordRateNoticeDelivery(uow: UnitOfWork, actor: Actor, input: { scheduleId: string; residentId: string; method: string; deliveredAt: Date }) {
  const schedule = await uow.tx.rateSchedule.findUnique({ where: { id: input.scheduleId }, select: { id: true, status: true } })
  if (!schedule || schedule.status !== 'published') throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const existing = await uow.tx.noticeDelivery.findFirst({ where: { kind: 'rate_change', subjectType: 'RateSchedule', subjectId: schedule.id, residentId: input.residentId }, select: { id: true } })
  if (existing) return { noticeId: existing.id, unchanged: true }
  const created = await uow.tx.noticeDelivery.create({ data: { kind: 'rate_change', subjectType: 'RateSchedule', subjectId: schedule.id, residentId: input.residentId, method: input.method, deliveredAt: input.deliveredAt, deliveredById: actorUserId(actor), acknowledgement: 'not_required' } })
  auditCreate(uow, actor, 'NoticeDelivery', created.id, 'notice.rate_change_delivered', { residentId: input.residentId })
  return { noticeId: created.id, unchanged: false }
}
