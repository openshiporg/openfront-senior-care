import { canonicalJson, sha256 } from './canonical'
import { auditCreate, casUpdate, lockRow } from './cas'
import { actorAgentId, actorUserId, principalKey, type Actor } from './actor'
import { advisoryLock, type Tx } from './db'
import { DomainError, Codes } from './errors'
import { nextReference } from './sequence'
import { localDate } from './calendar'
import { openClocksForFact, satisfyByEvidence } from './clocks'
import { applyCensusEvent, EMPTY_PROJECTION, foldCensus, projectionHash, type CensusEventInput, type CensusEventKind, type StayProjection } from './censusProjection'
import type { UnitOfWork } from './unitOfWork'

/**
 * Census commands (STATE-MACHINES §4). Each command appends one CensusEvent to the stay's stream,
 * folds the stream into the projection, then reconciles places from the difference between the old
 * and new projections, so bed and apartment status are always a projection of census (SM§2.1).
 * The state change, hash-chained CensusEvent, audit events, outbox messages and compliance clocks
 * commit in one Serializable transaction (the caller's `command(..., { serializable: true })`).
 */

export const MAX_FUTURE_SKEW_MS = 5 * 60_000

type StayRow = {
  id: string; reference: string; status: string; presence: string; version: number; communityId: string | null; residentId: string | null; setting: string
  currentBedId: string | null; currentApartmentId: string | null; heldBedId: string | null; lastEventHash: string | null; projection: unknown; synthetic: boolean
}

export type PlaceRef = { bedId?: string | null; apartmentId?: string | null }

const placeKey = (place: PlaceRef) => (place.bedId ? `bed:${place.bedId}` : place.apartmentId ? `apartment:${place.apartmentId}` : null)

/** Bed certification each payer kind needs (I-P3). Others may use any certified bed. */
const CERTIFICATION_FOR_PAYER: Record<string, string[]> = {
  medicare_a: ['dual', 'medicare'],
  medicare_advantage: ['dual', 'medicare'],
  medicaid_ffs: ['dual', 'medicaid'],
  medicaid_mco: ['dual', 'medicaid'],
}

/** 42 CFR 483.15(c)(4)(ii)(A)-(E): when the 30-day notice may be shorter ("as soon as practicable"). */
export const NOTICE_EXCEPTIONS = ['safety_of_individuals', 'health_of_individuals', 'health_improved', 'urgent_medical_needs', 'resided_less_than_30_days'] as const

function assertEffectiveAt(uow: UnitOfWork, effectiveAt: Date, projection: StayProjection) {
  if (Number.isNaN(effectiveAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'The event time is not a valid time.', { field: 'effectiveAt' })
  if (effectiveAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, 'Census events cannot be dated in the future.', { field: 'effectiveAt' })
  if (projection.lastEffectiveAt && effectiveAt.getTime() < new Date(projection.lastEffectiveAt).getTime()) {
    throw new DomainError(Codes.GUARD_FAILED, 'This is dated before the stay\'s latest census event. Record it as a late entry.', { reason: 'late_entry' })
  }
}

async function lockStay(tx: Tx, stayId: string, expectedVersion?: number | null) {
  const stay = await lockRow<StayRow>(tx, 'Stay', stayId)
  if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== stay.version) {
    throw new DomainError(Codes.STALE_STATE, 'The stay changed since you loaded it. Reload and try again.', { currentStatus: stay.status, currentVersion: stay.version })
  }
  return stay
}

async function communityTimeZone(tx: Tx, communityId: string) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  return community.timeZone
}

/** Stored events in fold order (effective time, then sequence). */
export async function loadCensusEvents(tx: Tx, stayId: string): Promise<(CensusEventInput & { id: string; hash: string })[]> {
  const rows = await tx.censusEvent.findMany({ where: { stayId, voidsEventId: null, kind: { not: 'correction' } }, orderBy: [{ effectiveAt: 'asc' }, { seq: 'asc' }] })
  const voided = new Set((await tx.censusEvent.findMany({ where: { stayId, voidsEventId: { not: null } }, select: { voidsEventId: true } })).map(row => row.voidsEventId))
  return rows.filter(row => !voided.has(row.id)).map(row => ({
    id: row.id, hash: row.hash, seq: row.seq, kind: row.kind as CensusEventKind, effectiveAt: row.effectiveAt,
    toBedId: row.toBedId, toApartmentId: row.toApartmentId, leaveKind: row.leaveKind, holdElected: row.holdElected, holdPaidBy: row.holdPaidBy, dischargeDisposition: row.dischargeDisposition,
  }))
}

/** Folds the stored stream into the projection (events re-sequenced in effective-time order). */
export function foldStored(events: readonly CensusEventInput[], timeZone: string) {
  return foldCensus(events.map((event, index) => ({ ...event, seq: index + 1 })), timeZone)
}

type PlaceRole = 'occupied' | 'held' | 'resident'
function placeClaims(projection: StayProjection): Map<string, PlaceRole> {
  const claims = new Map<string, PlaceRole>()
  if (projection.presence === 'in_house' && projection.currentBedId) claims.set(`bed:${projection.currentBedId}`, 'occupied')
  if (projection.presence === 'on_leave_hold' && projection.heldBedId) claims.set(`bed:${projection.heldBedId}`, 'held')
  if (projection.currentApartmentId && (projection.presence === 'in_house' || projection.presence === 'on_leave_hold')) claims.set(`apartment:${projection.currentApartmentId}`, 'resident')
  return claims
}

type ReconcileOptions = { reservationId?: string | null; companionRelationship?: string | null; eventId: string; effectiveAt: Date }

/**
 * Makes bed and apartment state match the new projection. Places are locked in a stable order
 * (advisory lock per place, then the row FOR UPDATE), so two commands on the same beds serialise
 * and never deadlock. A place someone else holds fails with PLACE_UNAVAILABLE before the GiST
 * exclusion constraint could ever fire.
 */
async function reconcilePlaces(uow: UnitOfWork, actor: Actor, stay: StayRow, before: StayProjection, after: StayProjection, options: ReconcileOptions) {
  const was = placeClaims(before)
  const now = placeClaims(after)
  const keys = [...new Set([...was.keys(), ...now.keys()])].sort()
  for (const key of keys) await advisoryLock(uow.tx, key)
  for (const key of keys) {
    const from = was.get(key) ?? null
    const to = now.get(key) ?? null
    if (from === to) continue
    const [kind, id] = key.split(':') as ['bed' | 'apartment', string]
    if (kind === 'bed') await reconcileBed(uow, actor, stay, id, from, to, options)
    else await reconcileApartment(uow, actor, stay, id, from !== null, to !== null, options)
  }
}

async function reconcileBed(uow: UnitOfWork, actor: Actor, stay: StayRow, bedId: string, from: PlaceRole | null, to: PlaceRole | null, options: ReconcileOptions) {
  const bed = await lockRow<{ id: string; status: string; version: number; currentStayId: string | null; label: string }>(uow.tx, 'Bed', bedId)
  const metadata = { stayId: stay.id, censusEventId: options.eventId }
  if (!from && to) {
    if (bed.status === 'reserved') {
      const reservation = await uow.tx.placeReservation.findFirst({ where: { bedId, status: 'active' } })
      if (!reservation || reservation.id !== options.reservationId) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Bed ${bed.label} is reserved for someone else.`, { currentStatus: bed.status })
      await consumeReservation(uow, actor, reservation.id, reservation.version, stay.id)
    } else if (bed.status !== 'available') {
      throw new DomainError(Codes.PLACE_UNAVAILABLE, `Bed ${bed.label} is ${bed.status.replaceAll('_', ' ')}.`, { currentStatus: bed.status })
    }
    await casUpdate(uow, { model: 'Bed', id: bedId, version: bed.version, from: [bed.status], to: to === 'held' ? 'held' : 'occupied', actor, eventType: 'bed.claimed', data: { currentStayId: stay.id, statusReason: '' }, audit: { currentStayId: stay.id }, metadata })
    const occupancy = await uow.tx.bedOccupancy.create({ data: { bedId, stayId: stay.id, startAt: options.effectiveAt, openedByEventId: options.eventId } })
    auditCreate(uow, actor, 'BedOccupancy', occupancy.id, 'bed_occupancy.opened', { bedId, stayId: stay.id, startAt: options.effectiveAt })
    return
  }
  if (bed.currentStayId !== stay.id) throw new DomainError(Codes.PROJECTION_MISMATCH, `Bed ${bed.label} is not held by this stay.`, { currentStatus: bed.status })
  if (from && to) {
    await casUpdate(uow, { model: 'Bed', id: bedId, version: bed.version, from: [from === 'held' ? 'held' : 'occupied'], to: to === 'held' ? 'held' : 'occupied', actor, eventType: to === 'held' ? 'bed.held' : 'bed.reoccupied', metadata })
    return
  }
  // Released: housekeeping turns it over (cleaning → available is a separate place command).
  await casUpdate(uow, { model: 'Bed', id: bedId, version: bed.version, from: [from === 'held' ? 'held' : 'occupied'], to: 'cleaning', actor, eventType: 'bed.released', data: { currentStayId: null }, audit: { currentStayId: null }, metadata })
  const open = await uow.tx.bedOccupancy.findFirst({ where: { bedId, stayId: stay.id, endAt: null } })
  if (open) {
    const endAt = options.effectiveAt.getTime() < open.startAt.getTime() ? open.startAt : options.effectiveAt
    await uow.tx.bedOccupancy.update({ where: { id: open.id }, data: { endAt, closedByEventId: options.eventId } })
    uow.audit({ eventType: 'bed_occupancy.closed', entityType: 'BedOccupancy', entityId: open.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { endAt } })
  }
  uow.emit({ topic: 'housekeeping.turnover', aggregateType: 'Bed', aggregateId: bedId, payload: { bedId, reason: 'census_release' }, dedupeKey: `housekeeping.turnover:${bedId}:${options.eventId}` })
}

async function reconcileApartment(uow: UnitOfWork, actor: Actor, stay: StayRow, apartmentId: string, had: boolean, has: boolean, options: ReconcileOptions) {
  const apartment = await lockRow<{ id: string; number: string; status: string; version: number; capacity: number; occupantCount: number; allowsUnrelatedCompanion: boolean }>(uow.tx, 'Apartment', apartmentId)
  const metadata = { stayId: stay.id, censusEventId: options.eventId }
  if (!had && has) {
    if (apartment.status === 'out_of_service' || apartment.status === 'turnover') throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is ${apartment.status.replaceAll('_', ' ')}.`, { currentStatus: apartment.status })
    if (apartment.occupantCount >= apartment.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is full.`, { currentStatus: apartment.status })
    if (apartment.occupantCount > 0 && !apartment.allowsUnrelatedCompanion && !options.companionRelationship?.trim()) {
      throw new DomainError(Codes.GUARD_FAILED, 'A second resident in this apartment needs a recorded relationship to the first (spouse, partner, sibling).', { field: 'companionRelationship' })
    }
    if (apartment.status === 'reserved') {
      const reservation = await uow.tx.placeReservation.findFirst({ where: { apartmentId, status: 'active' } })
      if (!reservation || reservation.id !== options.reservationId) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is reserved for someone else.`, { currentStatus: apartment.status })
      await consumeReservation(uow, actor, reservation.id, reservation.version, stay.id)
    }
    await casUpdate(uow, { model: 'Apartment', id: apartmentId, version: apartment.version, from: [apartment.status], to: 'occupied', actor, eventType: 'apartment.occupant_added', data: { occupantCount: apartment.occupantCount + 1 }, metadata: { ...metadata, companionRelationship: options.companionRelationship ?? null } })
    return
  }
  const remaining = Math.max(0, apartment.occupantCount - 1)
  await casUpdate(uow, { model: 'Apartment', id: apartmentId, version: apartment.version, from: ['occupied'], to: remaining === 0 ? 'turnover' : 'occupied', actor, eventType: 'apartment.occupant_removed', data: { occupantCount: remaining }, metadata })
  if (remaining === 0) uow.emit({ topic: 'housekeeping.turnover', aggregateType: 'Apartment', aggregateId: apartmentId, payload: { apartmentId, reason: 'census_release' }, dedupeKey: `housekeeping.turnover:${apartmentId}:${options.eventId}` })
}

async function consumeReservation(uow: UnitOfWork, actor: Actor, reservationId: string, version: number, stayId: string) {
  await casUpdate(uow, { model: 'PlaceReservation', id: reservationId, version, from: ['active'], to: 'consumed', actor, eventType: 'reservation.consumed', data: { consumedByStayId: stayId } })
}

type AppendInput = Omit<CensusEventInput, 'seq'> & {
  observedAt?: Date | null
  fromBedId?: string | null
  fromApartmentId?: string | null
  initiatedBy?: string | null
  coverageId?: string | null
  detail?: Record<string, unknown>
  idempotencyKey: string
  voidsEventId?: string | null
  correctionReason?: string | null
  approvalId?: string | null
}

/**
 * Appends events to a stay's stream, refolds, reconciles places once from the old to the new
 * projection and updates the Stay with a version CAS. Live commands append one event dated at or
 * after the latest; an approved late entry (`late`) may insert a group of events earlier in time,
 * and the whole stream is re-validated in effective-time order.
 */
export async function appendCensusEvents(uow: UnitOfWork, actor: Actor, stay: StayRow, inputs: AppendInput[], options: { reservationId?: string | null; companionRelationship?: string | null; late?: boolean } = {}) {
  if (!inputs.length) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to record.')
  const timeZone = await communityTimeZone(uow.tx, stay.communityId!)
  const stored = await loadCensusEvents(uow.tx, stay.id)
  const before = foldStored(stored, timeZone)
  const closed = await closedThrough(uow.tx, stay.communityId!)
  for (const input of inputs) {
    if (Number.isNaN(input.effectiveAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'The event time is not a valid time.', { field: 'effectiveAt' })
    if (input.effectiveAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, 'Census events cannot be dated in the future.', { field: 'effectiveAt' })
    if (!options.late) assertEffectiveAt(uow, input.effectiveAt, before)
    // A signed-off day is closed: changing it needs a maker-checker approval (SM§4.3).
    if (closed && localDate(timeZone, input.effectiveAt) <= closed && !input.approvalId) {
      throw new DomainError(Codes.APPROVAL_REQUIRED, `The census through ${closed} is signed off. Ask for a closed-period correction; a second person approves it.`, { reason: 'closed_period' })
    }
  }
  const last = await uow.tx.censusEvent.findFirst({ where: { stayId: stay.id }, orderBy: { seq: 'desc' }, select: { seq: true, hash: true } })
  let seq = last?.seq ?? 0
  const candidates = inputs.map(input => ({ input, event: { seq: ++seq, kind: input.kind, effectiveAt: input.effectiveAt, toBedId: input.toBedId ?? null, toApartmentId: input.toApartmentId ?? null, leaveKind: input.leaveKind ?? null, holdElected: Boolean(input.holdElected), holdPaidBy: input.holdPaidBy ?? null, dischargeDisposition: input.dischargeDisposition ?? null } as CensusEventInput }))
  // Validate the whole stream in effective-time order (ties keep recording order).
  const voided = new Set(inputs.map(input => input.voidsEventId).filter(Boolean) as string[])
  for (const id of voided) if (!stored.some(event => event.id === id)) throw new DomainError(Codes.INVALID_INPUT, 'The event to void is not an active event of this stay.', { field: 'voidsEventId' })
  const ordered = [...stored.filter(event => !voided.has(event.id)), ...candidates.filter(c => c.event.kind !== 'correction').map(c => c.event)].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.seq - b.seq)
  const after = foldStored(ordered, timeZone)
  if (options.late && after.status !== before.status) throw new DomainError(Codes.GUARD_FAILED, 'A late entry cannot admit or end the stay; use the admission or discharge command.', { reason: 'late_entry_status' })

  let prevHash = last?.hash || stay.lastEventHash || '0'.repeat(64)
  const events: { id: string; seq: number; kind: string }[] = []
  for (const { input, event: candidate } of candidates) {
    const body = { stayId: stay.id, seq: candidate.seq, kind: input.kind, effectiveAt: input.effectiveAt.toISOString(), toBedId: candidate.toBedId, toApartmentId: candidate.toApartmentId, leaveKind: candidate.leaveKind, holdElected: Boolean(candidate.holdElected), holdPaidBy: candidate.holdPaidBy, dischargeDisposition: candidate.dischargeDisposition, initiatedBy: input.initiatedBy ?? null, voidsEventId: input.voidsEventId ?? null }
    const hash = sha256(`${prevHash}\n${canonicalJson(body)}`)
    const row = await uow.tx.censusEvent.create({
      data: {
        stayId: stay.id, seq: candidate.seq, kind: input.kind, effectiveAt: input.effectiveAt, observedAt: input.observedAt ?? null, recordedAt: uow.now,
        fromBedId: input.fromBedId ?? null, toBedId: candidate.toBedId, fromApartmentId: input.fromApartmentId ?? null, toApartmentId: candidate.toApartmentId,
        leaveKind: candidate.leaveKind, holdElected: Boolean(candidate.holdElected), holdPaidBy: candidate.holdPaidBy, dischargeDisposition: candidate.dischargeDisposition,
        initiatedBy: input.initiatedBy ?? null, coverageId: input.coverageId ?? null, voidsEventId: input.voidsEventId ?? null, correctionReason: input.correctionReason ?? '', approvalId: input.approvalId ?? null,
        detail: (input.detail ?? {}) as never, actorId: actorUserId(actor), actorAgentId: actorAgentId(actor),
        idempotencyKey: sha256(`${principalKey(actor)}:${input.idempotencyKey}:${input.kind}:${candidate.seq}`), prevHash, hash,
      },
    })
    prevHash = hash
    events.push({ id: row.id, seq: row.seq, kind: row.kind })
    uow.emit({ topic: `census.${input.kind}`, aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id, eventId: row.id, communityId: stay.communityId, effectiveAt: input.effectiveAt, late: Boolean(options.late) }, dedupeKey: `census:${row.id}` })
  }
  const lastInput = inputs[inputs.length - 1]
  await reconcilePlaces(uow, actor, stay, before, after, { reservationId: options.reservationId, companionRelationship: options.companionRelationship, eventId: events[events.length - 1].id, effectiveAt: options.late ? uow.now : lastInput.effectiveAt })
  const year = localDate(timeZone, uow.now).slice(0, 4)
  const updated = await uow.tx.stay.updateMany({
    where: { id: stay.id, version: stay.version },
    data: {
      status: after.status, presence: after.presence, currentBedId: after.currentBedId, currentApartmentId: after.currentApartmentId, heldBedId: after.heldBedId,
      admittedAt: after.admittedAt ? new Date(after.admittedAt) : null, dischargedAt: after.endedAt ? new Date(after.endedAt) : null, dischargeDisposition: after.dischargeDisposition,
      leaveDaysUsedThisYear: after.medicaidHoldDaysByYear[year] ?? 0, projection: after as never, projectionHash: projectionHash(after), projectionVersion: { increment: 1 }, lastEventHash: prevHash, version: { increment: 1 },
    },
  })
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'The stay changed while this was being recorded. Try again.', { currentVersion: stay.version })
  uow.audit({
    eventType: options.late ? 'census.late_entry' : `census.${lastInput.kind}`, entityType: 'Stay', entityId: stay.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), reason: lastInput.correctionReason ?? null,
    before: { status: before.status, presence: before.presence, bed: before.currentBedId, apartment: before.currentApartmentId },
    after: { status: after.status, presence: after.presence, bed: after.currentBedId, apartment: after.currentApartmentId, events: events.map(e => ({ id: e.id, seq: e.seq, kind: e.kind })) },
    metadata: lastInput.approvalId ? { approvalId: lastInput.approvalId } : undefined,
  })
  return { event: events[events.length - 1], events, before, after, version: stay.version + 1, timeZone }
}

export const appendCensusEvent = (uow: UnitOfWork, actor: Actor, stay: StayRow, input: AppendInput, options: { reservationId?: string | null; companionRelationship?: string | null } = {}) => appendCensusEvents(uow, actor, stay, [input], options)

/** The latest community-wide signed-off census date, or null. */
export async function closedThrough(tx: Tx, communityId: string) {
  const row = await tx.censusSignoff.findFirst({ where: { communityId, unitId: null }, orderBy: { date: 'desc' }, select: { date: true } })
  return row?.date ? row.date.toISOString().slice(0, 10) : null
}

/* ---------------------------------------------------------------- admission */

export type AdmitInput = {
  communityId: string
  residentId?: string | null
  prospectId?: string | null
  resident?: { firstName: string; lastName: string; middleName?: string | null; preferredName?: string | null; dateOfBirth?: string | null; sex?: string | null; primaryLanguage?: string | null }
  representatives?: { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null; roles: string[]; contactPriority?: number }[]
  selfRepresented?: boolean
  bedId?: string | null
  apartmentId?: string | null
  reservationId?: string | null
  payerId: string
  memberReference?: string | null
  qualifyingStayFrom?: string | null
  qualifyingStayTo?: string | null
  admissionSource: string
  effectiveAt: Date
  observedAt?: Date | null
  pasrrLevel1?: { completedAt: string; result: string } | null
  placementReason?: string | null
  companionRelationship?: string | null
  notices?: NoticeInput[]
  idempotencyKey: string
  synthetic?: boolean
}

const REPRESENTATIVE_ROLES = new Set(['self', 'healthcare_poa', 'financial_responsible', 'guardian', 'family', 'emergency_contact', 'hospice_contact', 'personal_representative_hipaa'])

export async function admitResident(uow: UnitOfWork, actor: Actor, input: AdmitInput) {
  if (!input.bedId === !input.apartmentId) throw new DomainError(Codes.INVALID_INPUT, 'Choose one bed or one apartment.', { field: 'bedId' })
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { id: true, status: true, synthetic: true } })
  if (!community || community.status === 'closed') throw new DomainError(Codes.NOT_FOUND, 'Community not found or closed.')
  const payer = await uow.tx.payer.findUnique({ where: { id: input.payerId } })
  if (!payer) throw new DomainError(Codes.INVALID_INPUT, 'Choose the initial payer.', { field: 'payerId' })

  // The place decides the setting.
  let setting: string
  let medicaidCertified = false
  if (input.bedId) {
    const bed = await uow.tx.bed.findUnique({ where: { id: input.bedId }, include: { room: { include: { unit: true } } } })
    if (!bed?.room?.unit || bed.room.unit.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, 'That bed is not in this community.')
    setting = bed.room.unit.setting
    const needed = CERTIFICATION_FOR_PAYER[payer.kind]
    if (needed && !needed.includes(bed.certification)) throw new DomainError(Codes.GUARD_FAILED, `This bed is certified ${bed.certification.replaceAll('_', ' ')}; a ${payer.kind.replaceAll('_', ' ')} admission needs a ${needed.join(' or ')} bed.`, { reason: 'certification' })
    medicaidCertified = bed.certification === 'dual' || bed.certification === 'medicaid'
    if (bed.room.genderPolicy !== 'any' && input.resident?.sex && input.resident.sex !== bed.room.genderPolicy) throw new DomainError(Codes.GUARD_FAILED, `Room ${bed.room.number} is ${bed.room.genderPolicy} only.`, { reason: 'gender_policy' })
    if (bed.room.unit.secured && !input.placementReason?.trim()) throw new DomainError(Codes.GUARD_FAILED, 'A secured unit placement needs a documented reason.', { field: 'placementReason' })
  } else {
    const apartment = await uow.tx.apartment.findUnique({ where: { id: input.apartmentId! }, include: { unit: true } })
    if (!apartment?.unit || apartment.unit.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, 'That apartment is not in this community.')
    setting = apartment.unit.setting
    if (apartment.unit.secured && !input.placementReason?.trim()) throw new DomainError(Codes.GUARD_FAILED, 'A memory-care (secured unit) placement needs a documented reason.', { field: 'placementReason' })
  }
  if (setting === 'nursing_facility' && medicaidCertified && !input.pasrrLevel1 && !input.residentId) {
    throw new DomainError(Codes.GUARD_FAILED, 'A Level I PASRR screen must be completed before admission to a Medicaid-certified nursing facility bed.', { field: 'pasrrLevel1' })
  }
  if (!input.selfRepresented && !input.representatives?.length && !input.residentId) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one representative, or record that the resident represents themself.', { field: 'representatives' })
  for (const rep of input.representatives ?? []) {
    if (!rep.firstName?.trim() || !rep.roles?.length || rep.roles.some(role => !REPRESENTATIVE_ROLES.has(role))) throw new DomainError(Codes.INVALID_INPUT, 'Each representative needs a name and known roles.', { field: 'representatives' })
  }

  // The resident: existing (readmission or prospect conversion) or new.
  let residentId = input.residentId ?? null
  const synthetic = Boolean(input.synthetic ?? community.synthetic)
  if (residentId) {
    const resident = await lockRow<{ id: string; status: string; currentStayId: string | null; version: number }>(uow.tx, 'Resident', residentId)
    if (resident.status === 'deceased') throw new DomainError(Codes.GUARD_FAILED, 'This resident is recorded as deceased.')
    const open = await uow.tx.stay.findFirst({ where: { residentId, status: { in: ['pre_admit', 'admitted'] } }, select: { id: true } })
    if (open) throw new DomainError(Codes.GUARD_FAILED, 'This resident already has an open stay.', { reason: 'open_stay' })
    const reps = await uow.tx.representative.count({ where: { residentId, status: 'active' } })
    if (!reps && !input.selfRepresented && !input.representatives?.length) throw new DomainError(Codes.GUARD_FAILED, 'Add at least one representative.', { field: 'representatives' })
  } else {
    const data = input.resident
    if (!data?.firstName?.trim() || !data.lastName?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'The resident needs a first and last name.', { field: 'resident' })
    if (data.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) throw new DomainError(Codes.INVALID_INPUT, 'Date of birth must be YYYY-MM-DD.', { field: 'dateOfBirth' })
    const created = await uow.tx.resident.create({
      data: {
        reference: await nextReference(uow.tx, 'RES', uow.now), communityId: input.communityId, firstName: data.firstName.trim(), lastName: data.lastName.trim(),
        middleName: data.middleName ?? '', preferredName: data.preferredName ?? '', dateOfBirth: data.dateOfBirth ? new Date(`${data.dateOfBirth}T00:00:00Z`) : null,
        sex: data.sex ?? 'unknown', primaryLanguage: data.primaryLanguage ?? 'English', status: 'prospective', synthetic,
      },
    })
    residentId = created.id
    auditCreate(uow, actor, 'Resident', created.id, 'resident.created', { reference: created.reference })
  }
  if (input.prospectId) {
    const prospect = await uow.tx.prospect.findUnique({ where: { id: input.prospectId }, select: { id: true, convertedResidentId: true } })
    if (!prospect) throw new DomainError(Codes.NOT_FOUND, 'Prospect not found.')
    if (prospect.convertedResidentId && prospect.convertedResidentId !== residentId) throw new DomainError(Codes.GUARD_FAILED, 'This prospect was already converted.')
    await uow.tx.prospect.update({ where: { id: prospect.id }, data: { convertedResidentId: residentId } })
  }
  for (const rep of input.representatives ?? []) await addRepresentative(uow, actor, residentId, input.communityId, rep, synthetic)
  if (input.selfRepresented) {
    const self = await uow.tx.representative.findFirst({ where: { residentId, self: true, status: 'active' } })
    if (!self) {
      const row = await uow.tx.representative.create({ data: { reference: await nextReference(uow.tx, 'REP', uow.now), residentId, self: true, roles: ['self'], status: 'active', contactPriority: 1 } })
      auditCreate(uow, actor, 'Representative', row.id, 'representative.added', { self: true })
    }
  }
  if (input.pasrrLevel1) {
    const screen = await uow.tx.preAdmissionScreen.create({ data: { residentId, prospectId: input.prospectId ?? null, kind: 'pasrr_level1', result: input.pasrrLevel1.result, completedAt: new Date(input.pasrrLevel1.completedAt) } })
    auditCreate(uow, actor, 'PreAdmissionScreen', screen.id, 'pre_admission_screen.recorded', { kind: 'pasrr_level1' })
  }

  const stay = await uow.tx.stay.create({
    data: { reference: await nextReference(uow.tx, 'STY', uow.now), residentId, communityId: input.communityId, setting, status: 'pre_admit', presence: 'not_admitted', admissionSource: input.admissionSource, placementReason: input.placementReason ?? '', initialPayerKind: payer.kind, projection: EMPTY_PROJECTION as never, synthetic },
  })
  auditCreate(uow, actor, 'Stay', stay.id, 'stay.created', { reference: stay.reference, setting })
  const effectiveDate = localDate(await communityTimeZone(uow.tx, input.communityId), input.effectiveAt)
  const coverage = await uow.tx.coveragePeriod.create({
    data: { stayId: stay.id, payerId: payer.id, rank: 'primary', startDate: new Date(`${effectiveDate}T00:00:00Z`), status: 'active', memberReference: input.memberReference ?? '', qualifyingStayFrom: input.qualifyingStayFrom ? new Date(`${input.qualifyingStayFrom}T00:00:00Z`) : null, qualifyingStayTo: input.qualifyingStayTo ? new Date(`${input.qualifyingStayTo}T00:00:00Z`) : null },
  })
  auditCreate(uow, actor, 'CoveragePeriod', coverage.id, 'coverage.opened', { payerKind: payer.kind, startDate: effectiveDate })

  const { event, after } = await appendCensusEvent(uow, actor, stay as unknown as StayRow, {
    kind: input.residentId ? 'readmission' : 'admission', effectiveAt: input.effectiveAt, observedAt: input.observedAt, toBedId: input.bedId ?? null, toApartmentId: input.apartmentId ?? null,
    coverageId: coverage.id, idempotencyKey: input.idempotencyKey, detail: { admissionSource: input.admissionSource },
  }, { reservationId: input.reservationId, companionRelationship: input.companionRelationship })

  const resident = await uow.tx.resident.findUniqueOrThrow({ where: { id: residentId }, select: { version: true, status: true } })
  await casUpdate(uow, { model: 'Resident', id: residentId, version: resident.version, from: [resident.status], to: 'current', actor, eventType: 'resident.admitted', data: { currentStayId: stay.id, communityId: input.communityId } })

  await openClocksForFact(uow, actor, { fact: 'census.admission', communityId: input.communityId, residentId, subjectType: 'Stay', subjectId: stay.id, startedAt: input.effectiveAt, setting, payerKind: payer.kind, evidence: { type: 'census_event:admission', id: event.id } })
  for (const notice of input.notices ?? []) await recordNotice(uow, actor, { ...notice, stayId: stay.id })
  uow.emit({ topic: 'portal.invite_representatives', aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `portal.invite:${stay.id}` })
  return { stayId: stay.id, residentId, eventId: event.id, status: after.status, presence: after.presence }
}

export async function addRepresentative(uow: UnitOfWork, actor: Actor, residentId: string, communityId: string, rep: NonNullable<AdmitInput['representatives']>[number], synthetic: boolean) {
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, 'CON', uow.now), communityId, firstName: rep.firstName.trim(), lastName: rep.lastName?.trim() ?? '', email: rep.email?.trim().toLowerCase() ?? '', phone: rep.phone?.trim() ?? '', consentToContact: true, synthetic } })
  const representative = await uow.tx.representative.create({ data: { reference: await nextReference(uow.tx, 'REP', uow.now), residentId, contactId: contact.id, roles: rep.roles, contactPriority: rep.contactPriority ?? 1, status: 'active' } })
  auditCreate(uow, actor, 'Representative', representative.id, 'representative.added', { roles: rep.roles, contactReference: contact.reference })
  return representative
}

/* --------------------------------------------------------------- room change */

async function primaryPayerKind(tx: Tx, stayId: string) {
  const coverage = await tx.coveragePeriod.findFirst({ where: { stayId, rank: 'primary', status: { in: ['active', 'ending', 'retro_approved'] } }, orderBy: { startDate: 'desc' }, include: { payer: { select: { kind: true } } } })
  return coverage?.payer?.kind ?? null
}

export async function changeRoom(uow: UnitOfWork, actor: Actor, input: { stayId: string; toBedId?: string | null; toApartmentId?: string | null; effectiveAt: Date; observedAt?: Date | null; reason?: string | null; companionRelationship?: string | null; expectedVersion?: number | null; reservationId?: string | null; idempotencyKey: string }) {
  if (!input.toBedId === !input.toApartmentId) throw new DomainError(Codes.INVALID_INPUT, 'Choose one target bed or apartment.', { field: 'toBedId' })
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  if (input.toBedId) {
    const bed = await uow.tx.bed.findUnique({ where: { id: input.toBedId }, include: { room: { include: { unit: true } } } })
    if (!bed?.room?.unit || bed.room.unit.communityId !== stay.communityId) throw new DomainError(Codes.NOT_FOUND, 'That bed is not in this community.')
    const payerKind = await primaryPayerKind(uow.tx, stay.id)
    const needed = payerKind ? CERTIFICATION_FOR_PAYER[payerKind] : undefined
    if (needed && !needed.includes(bed.certification)) throw new DomainError(Codes.GUARD_FAILED, `Bed ${bed.label} is certified ${bed.certification.replaceAll('_', ' ')}, which the resident's coverage cannot use.`, { reason: 'certification' })
    const resident = stay.residentId ? await uow.tx.resident.findUnique({ where: { id: stay.residentId }, select: { sex: true } }) : null
    if (bed.room.genderPolicy !== 'any' && resident?.sex && resident.sex !== bed.room.genderPolicy) throw new DomainError(Codes.GUARD_FAILED, `Room ${bed.room.number} is ${bed.room.genderPolicy} only.`, { reason: 'gender_policy' })
    if (bed.room.unit.secured && !input.reason?.trim()) throw new DomainError(Codes.GUARD_FAILED, 'A move into a secured unit needs a documented reason.', { field: 'reason' })
  } else {
    const apartment = await uow.tx.apartment.findUnique({ where: { id: input.toApartmentId! }, include: { unit: true } })
    if (!apartment?.unit || apartment.unit.communityId !== stay.communityId) throw new DomainError(Codes.NOT_FOUND, 'That apartment is not in this community.')
    if (apartment.unit.secured && !input.reason?.trim()) throw new DomainError(Codes.GUARD_FAILED, 'A move into memory care needs a documented reason.', { field: 'reason' })
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: 'room_change', effectiveAt: input.effectiveAt, observedAt: input.observedAt, toBedId: input.toBedId ?? null, toApartmentId: input.toApartmentId ?? null,
    fromBedId: stay.currentBedId, fromApartmentId: stay.currentApartmentId, idempotencyKey: input.idempotencyKey, detail: { reason: input.reason ?? null },
  }, { companionRelationship: input.companionRelationship, reservationId: input.reservationId })
  // F559: residents get notice before a room change (verify the operator's notice policy).
  uow.emit({ topic: 'task.room_change_notice', aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id, eventId: result.event.id }, dedupeKey: `task.room_change_notice:${result.event.id}` })
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version }
}

/* --------------------------------------------------------------------- leave */

export type StartLeaveInput = {
  stayId: string
  leaveKind: 'hospital' | 'therapeutic' | 'other'
  holdElected: boolean
  holdPaidBy?: 'medicaid' | 'private' | 'none' | null
  facilityInitiated: boolean
  effectiveAt: Date
  observedAt?: Date | null
  destination?: string | null
  noticeAtTransfer?: Omit<NoticeInput, 'kind' | 'stayId' | 'censusEventId'> | null
  expectedVersion?: number | null
  idempotencyKey: string
}

export async function startLeave(uow: UnitOfWork, actor: Actor, input: StartLeaveInput) {
  if (!['hospital', 'therapeutic', 'other'].includes(input.leaveKind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown leave kind.', { field: 'leaveKind' })
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  const nursing = stay.setting === 'nursing_facility'
  let holdPaidBy = input.holdElected ? input.holdPaidBy ?? 'private' : 'none'
  if (nursing && stay.currentBedId) {
    // 42 CFR 483.15(d)(1): the bed-hold policy must be on file before a transfer.
    const policyNotice = await uow.tx.noticeDelivery.findFirst({ where: { residentId: stay.residentId, kind: 'bed_hold_policy', deliveredAt: { not: null } }, select: { id: true } })
    if (!policyNotice) throw new DomainError(Codes.GUARD_FAILED, 'Record that the bed-hold policy was given to the resident or representative before the transfer (42 CFR 483.15(d)(1)).', { reason: 'bed_hold_policy_missing' })
    if (input.holdElected && holdPaidBy === 'medicaid') {
      const payerKind = await primaryPayerKind(uow.tx, stay.id)
      if (payerKind !== 'medicaid_ffs' && payerKind !== 'medicaid_mco') throw new DomainError(Codes.GUARD_FAILED, 'Medicaid pays for a bed hold only when Medicaid is the resident\'s primary payer.', { field: 'holdPaidBy' })
      const policy = await bedHoldPolicyFor(uow.tx, stay.communityId!)
      const cap = policy?.medicaidHoldDaysPerYear ?? 0
      const projection = (stay.projection ?? EMPTY_PROJECTION) as StayProjection
      const year = localDate(await communityTimeZone(uow.tx, stay.communityId!), input.effectiveAt).slice(0, 4)
      const used = projection.medicaidHoldDaysByYear?.[year] ?? 0
      if (!policy?.medicaidHoldPaid || used >= cap) throw new DomainError(Codes.GUARD_FAILED, `The resident has used ${used} of ${cap} paid Medicaid bed-hold days this year. Offer a private-pay hold instead.`, { reason: 'medicaid_hold_cap' })
    }
  } else {
    holdPaidBy = input.holdElected ? holdPaidBy : 'none'
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: 'leave_start', effectiveAt: input.effectiveAt, observedAt: input.observedAt, leaveKind: input.leaveKind, holdElected: input.holdElected, holdPaidBy,
    fromBedId: stay.currentBedId, fromApartmentId: stay.currentApartmentId, initiatedBy: input.facilityInitiated ? 'facility' : 'resident', idempotencyKey: input.idempotencyKey,
    detail: { destination: input.destination ?? null },
  })
  const payerKind = await primaryPayerKind(uow.tx, stay.id)
  const subject = { communityId: stay.communityId!, residentId: stay.residentId, subjectType: 'Stay', subjectId: stay.id, occurrenceKey: result.event.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind }
  await openClocksForFact(uow, actor, { ...subject, fact: 'census.leave_start', evidence: { type: 'census_event:leave_start', id: result.event.id } })
  if (input.facilityInitiated) await openClocksForFact(uow, actor, { ...subject, fact: 'census.facility_initiated_transfer' })
  if (input.noticeAtTransfer) await recordNotice(uow, actor, { ...input.noticeAtTransfer, kind: 'bed_hold_at_transfer', stayId: stay.id, censusEventId: result.event.id })
  if (input.leaveKind === 'hospital') uow.emit({ topic: 'task.transfer_packet', aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id, eventId: result.event.id }, dedupeKey: `task.transfer_packet:${result.event.id}` })
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version }
}

export async function bedHoldPolicyFor(tx: Tx, communityId: string) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { bedHoldPolicyId: true } })
  return community?.bedHoldPolicyId ? tx.bedHoldPolicy.findUnique({ where: { id: community.bedHoldPolicyId } }) : null
}

export async function releaseBedHold(uow: UnitOfWork, actor: Actor, input: { stayId: string; effectiveAt: Date; reason: string; expectedVersion?: number | null; idempotencyKey: string }) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the hold ends (e.g. the resident will not return, or the paid days ran out).', { field: 'reason' })
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  const result = await appendCensusEvent(uow, actor, stay, { kind: 'hold_release', effectiveAt: input.effectiveAt, fromBedId: stay.heldBedId, idempotencyKey: input.idempotencyKey, detail: { reason: input.reason.trim() } })
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version }
}

export async function endLeave(uow: UnitOfWork, actor: Actor, input: { stayId: string; effectiveAt: Date; observedAt?: Date | null; toBedId?: string | null; toApartmentId?: string | null; reservationId?: string | null; expectedVersion?: number | null; idempotencyKey: string }) {
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  const projection = (stay.projection ?? EMPTY_PROJECTION) as StayProjection
  const result = await appendCensusEvent(uow, actor, stay, { kind: 'leave_end', effectiveAt: input.effectiveAt, observedAt: input.observedAt, toBedId: input.toBedId ?? null, toApartmentId: input.toApartmentId ?? null, idempotencyKey: input.idempotencyKey, detail: { leaveStartedAt: projection.openLeave?.startedAt ?? null } }, { reservationId: input.reservationId })
  // Medicare interrupted stay: a return within 3 days to the same SNF continues the PPS stay (recorded, applied in phase 4).
  const startedAt = projection.openLeave?.startedAt ? new Date(projection.openLeave.startedAt) : null
  const interrupted = Boolean(startedAt && input.effectiveAt.getTime() - startedAt.getTime() <= 3 * 86_400_000)
  if (interrupted) uow.audit({ eventType: 'census.interrupted_stay_window', entityType: 'Stay', entityId: stay.id, actorUserId: actorUserId(actor), after: { eventId: result.event.id, interruptedStay: true } })
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, interruptedStay: interrupted, version: result.version }
}

/* ------------------------------------------------------------ discharge/death */

export type DischargeInput = {
  stayId: string
  disposition: string
  initiatedBy: 'resident' | 'facility'
  effectiveAt: Date
  observedAt?: Date | null
  noticeException?: (typeof NOTICE_EXCEPTIONS)[number] | null
  expectedVersion?: number | null
  idempotencyKey: string
}

export async function dischargeResident(uow: UnitOfWork, actor: Actor, input: DischargeInput) {
  if (input.disposition === 'deceased') throw new DomainError(Codes.INVALID_INPUT, 'Record a death with the death command.', { field: 'disposition' })
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  if (input.initiatedBy === 'facility' && stay.setting === 'nursing_facility') {
    // 42 CFR 483.15(c)(3)-(4): written notice 30 days ahead (or an allowed exception), with a copy to the Ombudsman.
    if (input.noticeException && !(NOTICE_EXCEPTIONS as readonly string[]).includes(input.noticeException)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown notice exception.', { field: 'noticeException' })
    const notice = await uow.tx.noticeDelivery.findFirst({ where: { subjectType: 'Stay', subjectId: stay.id, kind: 'transfer_discharge', deliveredAt: { not: null } }, orderBy: { deliveredAt: 'asc' } })
    if (!notice) throw new DomainError(Codes.GUARD_FAILED, 'A facility-initiated discharge needs a written transfer/discharge notice on file (42 CFR 483.15(c)(3)).', { reason: 'notice_missing' })
    if (!notice.copyToOmbudsmanAt) throw new DomainError(Codes.GUARD_FAILED, 'Record the copy of the notice sent to the Long-Term Care Ombudsman.', { reason: 'ombudsman_copy_missing' })
    const days = (input.effectiveAt.getTime() - notice.deliveredAt!.getTime()) / 86_400_000
    if (days < 30 && !input.noticeException) throw new DomainError(Codes.GUARD_FAILED, `The notice was given ${Math.floor(days)} days ago; 30 days are required unless an exception in 42 CFR 483.15(c)(4)(ii) applies.`, { reason: 'notice_period' })
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: 'discharge', effectiveAt: input.effectiveAt, observedAt: input.observedAt, dischargeDisposition: input.disposition, initiatedBy: input.initiatedBy,
    fromBedId: stay.currentBedId ?? stay.heldBedId, fromApartmentId: stay.currentApartmentId, idempotencyKey: input.idempotencyKey, detail: { noticeException: input.noticeException ?? null },
  })
  await endStay(uow, actor, stay, input.effectiveAt, 'discharge', 'former')
  if (input.initiatedBy === 'facility') {
    const subject = { communityId: stay.communityId!, residentId: stay.residentId, subjectType: 'Stay', subjectId: stay.id, occurrenceKey: result.event.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind: await primaryPayerKind(uow.tx, stay.id) }
    await openClocksForFact(uow, actor, { ...subject, fact: 'census.facility_initiated_transfer' })
    const notice = await uow.tx.noticeDelivery.findFirst({ where: { subjectType: 'Stay', subjectId: stay.id, kind: 'transfer_discharge', copyToOmbudsmanAt: { not: null } } })
    if (notice) await satisfyByEvidence(uow, actor, { subjectType: 'Stay', subjectId: stay.id, occurrenceKey: result.event.id }, { type: 'ombudsman_copy', id: notice.id, at: notice.copyToOmbudsmanAt! })
  }
  uow.emit({ topic: 'portal.stay_ended', aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `portal.stay_ended:${stay.id}` })
  return { stayId: stay.id, eventId: result.event.id, status: result.after.status }
}

export async function recordDeath(uow: UnitOfWork, actor: Actor, input: { stayId: string; effectiveAt: Date; pronouncedBy: string; observedAt?: Date | null; expectedVersion?: number | null; idempotencyKey: string }) {
  if (!input.pronouncedBy?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Record who pronounced the death.', { field: 'pronouncedBy' })
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion)
  const result = await appendCensusEvent(uow, actor, stay, { kind: 'death', effectiveAt: input.effectiveAt, observedAt: input.observedAt, fromBedId: stay.currentBedId ?? stay.heldBedId, fromApartmentId: stay.currentApartmentId, idempotencyKey: input.idempotencyKey, detail: { pronouncedBy: input.pronouncedBy.trim() } })
  await endStay(uow, actor, stay, input.effectiveAt, 'death', 'deceased')
  await openClocksForFact(uow, actor, { fact: 'census.death', communityId: stay.communityId!, residentId: stay.residentId, subjectType: 'Stay', subjectId: stay.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind: await primaryPayerKind(uow.tx, stay.id) })
  uow.emit({ topic: 'task.family_notification', aggregateType: 'Stay', aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `task.family_notification:${stay.id}` })
  return { stayId: stay.id, eventId: result.event.id, status: result.after.status }
}

async function endStay(uow: UnitOfWork, actor: Actor, stay: StayRow, at: Date, reason: 'discharge' | 'death', residentStatus: 'former' | 'deceased') {
  const timeZone = await communityTimeZone(uow.tx, stay.communityId!)
  const endDate = new Date(`${localDate(timeZone, at)}T00:00:00Z`)
  const coverages = await uow.tx.coveragePeriod.findMany({ where: { stayId: stay.id, status: { in: ['pending', 'active', 'ending', 'retro_approved'] } } })
  for (const coverage of coverages) {
    await casUpdate(uow, { model: 'CoveragePeriod', id: coverage.id, version: coverage.version, from: [coverage.status], to: 'ended', actor, eventType: 'coverage.ended', data: { endDate, endReason: reason } })
  }
  if (stay.residentId) {
    const resident = await uow.tx.resident.findUniqueOrThrow({ where: { id: stay.residentId }, select: { version: true, status: true } })
    await casUpdate(uow, { model: 'Resident', id: stay.residentId, version: resident.version, from: [resident.status], to: residentStatus, actor, eventType: `resident.${reason}`, data: { currentStayId: null } })
  }
}

/* ------------------------------------------------------------------- notices */

export type NoticeInput = {
  kind: 'bed_hold_policy' | 'bed_hold_at_transfer' | 'transfer_discharge' | 'room_change' | 'privacy_practices' | 'other'
  stayId: string
  censusEventId?: string | null
  method: 'in_person' | 'mail' | 'email' | 'portal' | 'phone_then_mail'
  deliveredAt: string | Date
  recipientRepresentativeId?: string | null
  acknowledgement?: 'signed' | 'refused_witnessed' | 'not_required'
  copyToOmbudsmanAt?: string | Date | null
  note?: string | null
}

/** Records that a notice reached the resident or representative, and satisfies the clocks it evidences. */
export async function recordNotice(uow: UnitOfWork, actor: Actor, input: NoticeInput) {
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const deliveredAt = new Date(input.deliveredAt)
  if (Number.isNaN(deliveredAt.getTime()) || deliveredAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, 'Delivery time must be a real time, not in the future.', { field: 'deliveredAt' })
  if (input.recipientRepresentativeId) {
    const rep = await uow.tx.representative.findUnique({ where: { id: input.recipientRepresentativeId }, select: { residentId: true } })
    if (rep?.residentId !== stay.residentId) throw new DomainError(Codes.INVALID_INPUT, 'That representative does not represent this resident.', { field: 'recipientRepresentativeId' })
  }
  if (input.censusEventId) {
    const event = await uow.tx.censusEvent.findUnique({ where: { id: input.censusEventId }, select: { stayId: true } })
    if (event?.stayId !== stay.id) throw new DomainError(Codes.INVALID_INPUT, 'That census event belongs to another stay.', { field: 'censusEventId' })
  }
  const copy = input.copyToOmbudsmanAt ? new Date(input.copyToOmbudsmanAt) : null
  const notice = await uow.tx.noticeDelivery.create({
    data: {
      kind: input.kind, subjectType: 'Stay', subjectId: stay.id, residentId: stay.residentId, censusEventId: input.censusEventId ?? null, recipientRepresentativeId: input.recipientRepresentativeId ?? null,
      method: input.method, deliveredAt, deliveredById: actorUserId(actor), acknowledgement: input.acknowledgement ?? 'not_required', copyToOmbudsmanAt: copy, note: input.note ?? '',
    },
  })
  auditCreate(uow, actor, 'NoticeDelivery', notice.id, 'notice.delivered', { kind: input.kind, method: input.method, deliveredAt, censusEventId: input.censusEventId ?? null, copyToOmbudsmanAt: copy })
  const subject = { subjectType: 'Stay', subjectId: stay.id, ...(input.censusEventId ? { occurrenceKey: input.censusEventId } : {}) }
  const satisfied = await satisfyByEvidence(uow, actor, subject, { type: `notice_delivery:${input.kind}`, id: notice.id, at: deliveredAt })
  if (copy) satisfied.push(...(await satisfyByEvidence(uow, actor, subject, { type: 'ombudsman_copy', id: notice.id, at: copy })))
  return { noticeId: notice.id, satisfiedClocks: satisfied }
}

/* --------------------------------------------------------------- rebuild/check */

/** Refolds the stored events and compares with the stored projection (exit gate 1). */
export async function verifyCensusProjection(tx: Tx, stayId: string) {
  const stay = await tx.stay.findUnique({ where: { id: stayId }, select: { id: true, communityId: true, projectionHash: true, currentBedId: true, heldBedId: true, currentApartmentId: true, presence: true, status: true } })
  if (!stay?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const timeZone = await communityTimeZone(tx, stay.communityId)
  const rebuilt = foldStored(await loadCensusEvents(tx, stayId), timeZone)
  const hash = projectionHash(rebuilt)
  const columnsMatch = rebuilt.status === stay.status && rebuilt.presence === stay.presence && rebuilt.currentBedId === stay.currentBedId && rebuilt.heldBedId === stay.heldBedId && rebuilt.currentApartmentId === stay.currentApartmentId
  return { stayId, matches: hash === stay.projectionHash && columnsMatch, storedHash: stay.projectionHash, rebuiltHash: hash }
}

/** Verifies the per-stay CensusEvent hash chain. */
export async function verifyCensusChain(tx: Tx, stayId: string) {
  const rows = await tx.censusEvent.findMany({ where: { stayId }, orderBy: { seq: 'asc' } })
  let prev = '0'.repeat(64)
  for (const row of rows) {
    const body = { stayId, seq: row.seq, kind: row.kind, effectiveAt: row.effectiveAt.toISOString(), toBedId: row.toBedId, toApartmentId: row.toApartmentId, leaveKind: row.leaveKind, holdElected: row.holdElected, holdPaidBy: row.holdPaidBy, dischargeDisposition: row.dischargeDisposition, initiatedBy: row.initiatedBy, voidsEventId: row.voidsEventId }
    if (row.prevHash !== prev || row.hash !== sha256(`${prev}\n${canonicalJson(body)}`)) return { ok: false, brokenAtSeq: row.seq }
    prev = row.hash
  }
  return { ok: true, count: rows.length }
}
