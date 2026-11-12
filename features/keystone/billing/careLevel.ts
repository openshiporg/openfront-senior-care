import { type Actor } from '../lib/actor'
import { auditCreate, lockRow } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'

/**
 * Care-level assignment (SM §12.4). Either from assessment points (the level whose range holds the points) or manual, with a
 * reason. A new row supersedes the stay's current one; rows are never edited. Whether it bills, and from when, is decided by the
 * derivation: an increase bills only from noticeDeliveredOn + the pack's notice days, a decrease applies at once.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (date: string) => new Date(`${date}T00:00:00Z`)

export async function assignCareLevel(uow: UnitOfWork, actor: Actor, input: { stayId: string; points?: number | null; careLevelId?: string | null; effectiveFrom: string; noticeDeliveredOn?: string | null; reason?: string | null }) {
  if (!DATE.test(String(input.effectiveFrom))) throw new DomainError(Codes.INVALID_INPUT, 'Give the date the level starts, like 2026-10-01.', { field: 'effectiveFrom' })
  if (input.noticeDeliveredOn && !DATE.test(input.noticeDeliveredOn)) throw new DomainError(Codes.INVALID_INPUT, 'The notice date is a date.', { field: 'noticeDeliveredOn' })
  await lockRow(uow.tx, 'Stay', input.stayId)
  const stay = await uow.tx.stay.findUniqueOrThrow({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true, setting: true } })
  if (stay.setting !== 'assisted_living' && stay.setting !== 'memory_care') throw new DomainError(Codes.GUARD_FAILED, 'Care levels apply to assisted living and memory care.')

  const manual = Boolean(input.careLevelId)
  let level: { id: string; minPoints: number; maxPoints: number } | null
  let points: number
  if (manual) {
    if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the level is set by hand.', { field: 'reason' })
    level = await uow.tx.careLevel.findFirst({ where: { id: input.careLevelId!, communityId: stay.communityId, setting: stay.setting, status: 'active' }, select: { id: true, minPoints: true, maxPoints: true } })
    points = input.points ?? level?.minPoints ?? 0
  } else {
    if (typeof input.points !== 'number' || !Number.isInteger(input.points) || input.points < 0) throw new DomainError(Codes.INVALID_INPUT, 'Enter the assessment points.', { field: 'points' })
    points = input.points
    level = await uow.tx.careLevel.findFirst({ where: { communityId: stay.communityId, setting: stay.setting, status: 'active', minPoints: { lte: points }, maxPoints: { gte: points } }, select: { id: true, minPoints: true, maxPoints: true } })
  }
  if (!level) throw new DomainError(Codes.GUARD_FAILED, manual ? 'That care level is not available for this stay.' : 'No care level covers those points.', { reason: 'no_care_level' })

  const current = await uow.tx.careLevelAssignment.findFirst({ where: { stayId: stay.id, status: 'active' }, orderBy: { effectiveFrom: 'desc' } })
  if (current && current.careLevelId === level.id && current.effectiveFrom?.toISOString().slice(0, 10) === input.effectiveFrom && (current.noticeDeliveredOn?.toISOString().slice(0, 10) ?? null) === (input.noticeDeliveredOn ?? null)) return { assignmentId: current.id, unchanged: true }
  if (current?.effectiveFrom && current.effectiveFrom.toISOString().slice(0, 10) > input.effectiveFrom) throw new DomainError(Codes.GUARD_FAILED, 'A later assignment already exists.', { reason: 'later_assignment' })
  if (current) await uow.tx.careLevelAssignment.update({ where: { id: current.id }, data: { status: 'superseded', version: { increment: 1 } } })
  const created = await uow.tx.careLevelAssignment.create({
    data: { communityId: stay.communityId, residentId: stay.residentId, stayId: stay.id, careLevelId: level.id, points, effectiveFrom: day(input.effectiveFrom), noticeDeliveredOn: input.noticeDeliveredOn ? day(input.noticeDeliveredOn) : null, source: manual ? 'manual' : 'points', reason: input.reason?.trim() ?? '', status: 'active' },
  })
  auditCreate(uow, actor, 'CareLevelAssignment', created.id, 'care_level.assigned', { careLevelId: level.id, points, source: manual ? 'manual' : 'points', supersedes: current?.id ?? null }, { reason: input.reason?.trim() ?? null })
  return { assignmentId: created.id, careLevelId: level.id, supersedes: current?.id ?? null, unchanged: false }
}
