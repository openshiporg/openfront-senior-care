import { createHash } from 'node:crypto'
import { auditCreate, casUpdate, lockRow } from './cas'
import { principalKey, type Actor } from './actor'
import { advisoryLock, type Tx } from './db'
import { DomainError, Codes } from './errors'
import { nextReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'

/**
 * Place commands outside census (STATE-MACHINES §2-3): reservations, housekeeping turnover and
 * out-of-service. Occupied and held come only from census (lib/census.ts). Every command takes the
 * same `bed:<id>` / `apartment:<id>` advisory lock as census, then the row lock, so a reservation
 * and an admission on one place serialise.
 */

type PlaceRow = { id: string; status: string; version: number; label?: string; number?: string; occupantCount?: number }
export type PlaceTarget = { bedId?: string | null; apartmentId?: string | null }

const MAX_RESERVATION_HOURS = 24 * 30

async function lockPlace(tx: Tx, target: PlaceTarget) {
  if (!target.bedId === !target.apartmentId) throw new DomainError(Codes.INVALID_INPUT, 'Choose one bed or one apartment.', { field: 'bedId' })
  const model = target.bedId ? 'Bed' : 'Apartment'
  const id = (target.bedId ?? target.apartmentId)!
  await advisoryLock(tx, `${target.bedId ? 'bed' : 'apartment'}:${id}`)
  const row = await lockRow<PlaceRow>(tx, model, id)
  return { model, id, row, name: target.bedId ? `Bed ${row.label}` : `Apartment ${row.number}` }
}

async function placeCommunity(tx: Tx, target: PlaceTarget) {
  if (target.bedId) {
    const bed = await tx.bed.findUnique({ where: { id: target.bedId }, select: { room: { select: { unit: { select: { communityId: true } } } } } })
    return bed?.room?.unit?.communityId ?? null
  }
  const apartment = await tx.apartment.findUnique({ where: { id: target.apartmentId! }, select: { unit: { select: { communityId: true } } } })
  return apartment?.unit?.communityId ?? null
}

export type ReserveInput = PlaceTarget & {
  hours: number
  purpose: 'referral' | 'waitlist_offer' | 'move_in' | 'internal_transfer'
  prospectId?: string | null
  referralId?: string | null
  waitlistEntryId?: string | null
  idempotencyKey: string
}

/** available → reserved. One active reservation per place (partial unique index backs this). */
export async function reservePlace(uow: UnitOfWork, actor: Actor, input: ReserveInput) {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > MAX_RESERVATION_HOURS) throw new DomainError(Codes.INVALID_INPUT, `A reservation lasts 1 to ${MAX_RESERVATION_HOURS} hours.`, { field: 'hours' })
  const place = await lockPlace(uow.tx, input)
  const communityId = await placeCommunity(uow.tx, input)
  if (!communityId) throw new DomainError(Codes.NOT_FOUND, 'Place not found.')
  // An apartment with room for a companion can be reserved while partly occupied.
  const reservable = place.model === 'Bed' ? place.row.status === 'available' : place.row.status === 'available' || (place.row.status === 'occupied' && (place.row.occupantCount ?? 0) < Number((place.row as Record<string, unknown>).capacity ?? 1))
  if (!reservable) throw new DomainError(Codes.PLACE_UNAVAILABLE, `${place.name} is ${place.row.status.replaceAll('_', ' ')}.`, { currentStatus: place.row.status })
  const active = await uow.tx.placeReservation.findFirst({ where: { status: 'active', ...(input.bedId ? { bedId: input.bedId } : { apartmentId: input.apartmentId }) }, select: { id: true } })
  if (active) throw new DomainError(Codes.PLACE_UNAVAILABLE, `${place.name} already has an active reservation.`, { currentStatus: 'reserved' })
  const reservation = await uow.tx.placeReservation.create({
    data: {
      reference: await nextReference(uow.tx, 'RSV', uow.now), communityId, bedId: input.bedId ?? null, apartmentId: input.apartmentId ?? null,
      prospectId: input.prospectId ?? null, referralId: input.referralId ?? null, waitlistEntryId: input.waitlistEntryId ?? null, purpose: input.purpose,
      status: 'active', expiresAt: new Date(uow.now.getTime() + input.hours * 3_600_000),
      operationKeyHash: createHash('sha256').update(`${principalKey(actor)}:${input.idempotencyKey}`).digest('hex'),
    },
  })
  auditCreate(uow, actor, 'PlaceReservation', reservation.id, 'reservation.created', { reference: reservation.reference, bedId: input.bedId ?? null, apartmentId: input.apartmentId ?? null, expiresAt: reservation.expiresAt, purpose: input.purpose })
  if (place.row.status === 'available') await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ['available'], to: 'reserved', actor, eventType: `${place.model.toLowerCase()}.reserved`, metadata: { reservationId: reservation.id } })
  return { reservationId: reservation.id, reference: reservation.reference, expiresAt: reservation.expiresAt }
}

/** active → released (explicit) or expired (job). The place goes back to available if nothing else claims it. */
export async function endReservation(uow: UnitOfWork, actor: Actor, input: { reservationId: string; to: 'released' | 'expired'; reason?: string | null; expectedVersion?: number | null }) {
  const reservation = await lockRow<{ id: string; status: string; version: number; bedId: string | null; apartmentId: string | null; expiresAt: Date | null }>(uow.tx, 'PlaceReservation', input.reservationId)
  if (input.expectedVersion != null && input.expectedVersion !== reservation.version) throw new DomainError(Codes.STALE_STATE, 'The reservation changed since you loaded it.', { currentStatus: reservation.status, currentVersion: reservation.version })
  if (input.to === 'expired' && reservation.expiresAt && reservation.expiresAt.getTime() > uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, 'The reservation has not expired yet.')
  const place = await lockPlace(uow.tx, { bedId: reservation.bedId, apartmentId: reservation.apartmentId })
  await casUpdate(uow, { model: 'PlaceReservation', id: reservation.id, version: reservation.version, from: ['active'], to: input.to, actor, eventType: `reservation.${input.to}`, reason: input.reason ?? null })
  if (place.row.status === 'reserved') await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ['reserved'], to: 'available', actor, eventType: `${place.model.toLowerCase()}.reservation_ended`, metadata: { reservationId: reservation.id } })
  uow.emit({ topic: 'availability.changed', aggregateType: place.model, aggregateId: place.id, payload: { [place.model === 'Bed' ? 'bedId' : 'apartmentId']: place.id }, dedupeKey: `availability:${reservation.id}:${input.to}` })
  return { reservationId: reservation.id, status: input.to }
}

/** The reservation expiry job: expires up to 200 overdue reservations, each in its own lock order. */
export async function expireReservations(uow: UnitOfWork, actor: Actor) {
  const due = await uow.tx.placeReservation.findMany({ where: { status: 'active', expiresAt: { lt: uow.now } }, select: { id: true }, take: 200, orderBy: { expiresAt: 'asc' } })
  for (const row of due) await endReservation(uow, actor, { reservationId: row.id, to: 'expired', reason: 'expired' })
  return { expired: due.length }
}

/** Housekeeping done: cleaning → available (bed) or turnover → available (apartment). */
export async function markPlaceReady(uow: UnitOfWork, actor: Actor, input: PlaceTarget & { expectedVersion?: number | null; note?: string | null }) {
  const place = await lockPlace(uow.tx, input)
  if (input.expectedVersion != null && input.expectedVersion !== place.row.version) throw new DomainError(Codes.STALE_STATE, `${place.name} changed since you loaded it.`, { currentStatus: place.row.status, currentVersion: place.row.version })
  const from = place.model === 'Bed' ? 'cleaning' : 'turnover'
  if (place.model === 'Apartment' && (place.row.occupantCount ?? 0) > 0) throw new DomainError(Codes.GUARD_FAILED, `${place.name} still has a resident.`)
  await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: [from], to: 'available', actor, eventType: `${place.model.toLowerCase()}.ready`, reason: input.note ?? null, data: { statusReason: '' } })
  uow.emit({ topic: 'availability.changed', aggregateType: place.model, aggregateId: place.id, payload: { placeId: place.id }, dedupeKey: `availability:${place.id}:ready:${place.row.version}` })
  return { id: place.id, status: 'available', version: place.row.version + 1 }
}

/** * → out_of_service (not occupied or held), and back to available. */
export async function setPlaceService(uow: UnitOfWork, actor: Actor, input: PlaceTarget & { inService: boolean; reason: string; expectedVersion?: number | null }) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why.', { field: 'reason' })
  const place = await lockPlace(uow.tx, input)
  if (input.expectedVersion != null && input.expectedVersion !== place.row.version) throw new DomainError(Codes.STALE_STATE, `${place.name} changed since you loaded it.`, { currentStatus: place.row.status, currentVersion: place.row.version })
  if (!input.inService) {
    const from = place.model === 'Bed' ? ['available', 'cleaning'] : ['available', 'turnover']
    if (!from.includes(place.row.status)) throw new DomainError(Codes.INVALID_TRANSITION, `${place.name} is ${place.row.status.replaceAll('_', ' ')}; only an empty, unreserved place can go out of service.`, { currentStatus: place.row.status })
    await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from, to: 'out_of_service', actor, eventType: `${place.model.toLowerCase()}.out_of_service`, reason: input.reason.trim(), data: { statusReason: input.reason.trim() } })
    return { id: place.id, status: 'out_of_service' }
  }
  await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ['out_of_service'], to: 'available', actor, eventType: `${place.model.toLowerCase()}.in_service`, reason: input.reason.trim(), data: { statusReason: '' } })
  uow.emit({ topic: 'availability.changed', aggregateType: place.model, aggregateId: place.id, payload: { placeId: place.id }, dedupeKey: `availability:${place.id}:in_service:${place.row.version}` })
  return { id: place.id, status: 'available' }
}

/**
 * Recomputes the public availability counts for a community (SCHEMA §3.12): counts only, never a
 * resident, per apartment type and per nursing setting.
 */
export async function recomputeAvailability(uow: UnitOfWork, communityId: string) {
  const types = await uow.tx.apartmentType.findMany({ where: { communityId }, select: { id: true, setting: true } })
  const results: { snapshotKey: string; availableCount: number }[] = []
  for (const type of types) {
    const availableCount = await uow.tx.apartment.count({ where: { apartmentTypeId: type.id, status: 'available' } })
    const snapshotKey = `${communityId}:type:${type.id}`
    await uow.tx.availabilitySnapshot.upsert({ where: { snapshotKey }, create: { snapshotKey, communityId, apartmentTypeId: type.id, setting: type.setting, availableCount, computedAt: uow.now }, update: { availableCount, computedAt: uow.now } })
    results.push({ snapshotKey, availableCount })
  }
  const beds = await uow.tx.bed.count({ where: { status: 'available', licensed: true, room: { unit: { communityId, setting: 'nursing_facility' } } } })
  const snapshotKey = `${communityId}:setting:nursing_facility`
  await uow.tx.availabilitySnapshot.upsert({ where: { snapshotKey }, create: { snapshotKey, communityId, setting: 'nursing_facility', availableCount: beds, computedAt: uow.now }, update: { availableCount: beds, computedAt: uow.now } })
  results.push({ snapshotKey, availableCount: beds })
  uow.audit({ eventType: 'availability.recomputed', entityType: 'Community', entityId: communityId, actorUserId: null, after: { snapshots: results.length } })
  return results
}

