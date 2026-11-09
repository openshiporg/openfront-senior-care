import { localDate } from './calendar'
import { actorUserId, type Actor } from './actor'
import { type Tx } from './db'
import { DomainError, Codes } from './errors'
import { closedThrough } from './census'
import { presenceAt, type CensusEventInput, type CensusEventKind } from './censusProjection'
import type { UnitOfWork } from './unitOfWork'

/**
 * The midnight census (STATE-MACHINES §4.4, BUILD-PLAN §2 `/census/midnight`). For a community-local
 * date it folds each stay's events up to 23:59 local and writes one CensusDay per stay that was
 * present (in house or on a held leave), with the place and the primary coverage that day. Running
 * again for an open date supersedes changed rows; a signed-off date is closed and can only change
 * through an approved correction.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (date: string) => new Date(`${date}T00:00:00Z`)

export type CensusTotals = { present: number; inHouse: number; onLeaveHold: number; bySetting: Record<string, number>; byUnit: Record<string, number>; byPayer: Record<string, number> }

async function timeZoneOf(tx: Tx, communityId: string) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  return community.timeZone
}

/** Derives (not writes) the census rows for one date. */
export async function deriveCensusDay(tx: Tx, communityId: string, date: string) {
  if (!DATE.test(date)) throw new DomainError(Codes.INVALID_INPUT, 'Date must be YYYY-MM-DD.', { field: 'date' })
  const timeZone = await timeZoneOf(tx, communityId)
  const dayStart = day(date)
  const stays = await tx.stay.findMany({
    where: { communityId, admittedAt: { not: null }, OR: [{ dischargedAt: null }, { dischargedAt: { gte: new Date(dayStart.getTime() - 86_400_000) } }] },
    select: { id: true, setting: true, residentId: true },
  })
  // Batched: one query each for events, voids, places and coverage (the midnight job runs for every stay).
  const stayIds = stays.map(stay => stay.id)
  const [eventRows, voidRows, coverages] = await Promise.all([
    tx.censusEvent.findMany({ where: { stayId: { in: stayIds }, voidsEventId: null, kind: { not: 'correction' } }, orderBy: [{ effectiveAt: 'asc' }, { seq: 'asc' }] }),
    tx.censusEvent.findMany({ where: { stayId: { in: stayIds }, voidsEventId: { not: null } }, select: { voidsEventId: true } }),
    tx.coveragePeriod.findMany({
      where: { stayId: { in: stayIds }, rank: 'primary', startDate: { lte: dayStart }, OR: [{ endDate: null }, { endDate: { gt: dayStart } }], status: { in: ['active', 'ending', 'ended', 'retro_approved'] } },
      orderBy: { startDate: 'desc' }, select: { id: true, stayId: true, payer: { select: { kind: true } } },
    }),
  ])
  const voided = new Set(voidRows.map(row => row.voidsEventId))
  const eventsByStay = new Map<string, CensusEventInput[]>()
  for (const row of eventRows) {
    if (voided.has(row.id) || !row.stayId) continue
    const list = eventsByStay.get(row.stayId) ?? []
    list.push({ seq: list.length + 1, kind: row.kind as CensusEventKind, effectiveAt: row.effectiveAt, toBedId: row.toBedId, toApartmentId: row.toApartmentId, leaveKind: row.leaveKind, holdElected: row.holdElected, holdPaidBy: row.holdPaidBy, dischargeDisposition: row.dischargeDisposition })
    eventsByStay.set(row.stayId, list)
  }
  const coverageByStay = new Map<string, { id: string; payerKind: string }>()
  for (const row of coverages) if (row.stayId && !coverageByStay.has(row.stayId)) coverageByStay.set(row.stayId, { id: row.id, payerKind: row.payer?.kind ?? 'uncovered' })
  const projected = stays.map(stay => ({ stay, projection: presenceAt(eventsByStay.get(stay.id) ?? [], timeZone, date) })).filter(({ projection }) => projection.presence === 'in_house' || projection.presence === 'on_leave_hold')
  const bedIds = projected.map(({ projection }) => (projection.presence === 'in_house' ? projection.currentBedId : projection.heldBedId)).filter((id): id is string => Boolean(id))
  const apartmentIds = projected.map(({ projection }) => projection.currentApartmentId).filter((id): id is string => Boolean(id))
  const [beds, apartments] = await Promise.all([
    bedIds.length ? tx.bed.findMany({ where: { id: { in: bedIds } }, select: { id: true, room: { select: { unitId: true } } } }) : Promise.resolve([]),
    apartmentIds.length ? tx.apartment.findMany({ where: { id: { in: apartmentIds } }, select: { id: true, unitId: true } }) : Promise.resolve([]),
  ])
  const unitOfBed = new Map(beds.map(bed => [bed.id, bed.room?.unitId ?? null]))
  const unitOfApartment = new Map(apartments.map(apartment => [apartment.id, apartment.unitId]))
  const rows: { stayId: string; setting: string; presence: string; bedId: string | null; apartmentId: string | null; unitId: string | null; coverageId: string | null; payerKind: string }[] = []
  for (const { stay, projection } of projected) {
    const bedId = projection.presence === 'in_house' ? projection.currentBedId : projection.heldBedId
    const apartmentId = projection.currentApartmentId
    const unitId = bedId ? unitOfBed.get(bedId) ?? null : apartmentId ? unitOfApartment.get(apartmentId) ?? null : null
    const coverage = coverageByStay.get(stay.id)
    rows.push({ stayId: stay.id, setting: stay.setting, presence: projection.presence, bedId, apartmentId, unitId, coverageId: coverage?.id ?? null, payerKind: coverage?.payerKind ?? 'uncovered' })
  }
  const totals: CensusTotals = { present: rows.length, inHouse: 0, onLeaveHold: 0, bySetting: {}, byUnit: {}, byPayer: {} }
  for (const row of rows) {
    if (row.presence === 'in_house') totals.inHouse += 1
    else totals.onLeaveHold += 1
    totals.bySetting[row.setting] = (totals.bySetting[row.setting] ?? 0) + 1
    if (row.unitId) totals.byUnit[row.unitId] = (totals.byUnit[row.unitId] ?? 0) + 1
    totals.byPayer[row.payerKind] = (totals.byPayer[row.payerKind] ?? 0) + 1
  }
  return { timeZone, rows, totals }
}

/** Writes CensusDay rows for an open date. Unchanged rows stay; changed ones are superseded. */
export async function snapshotCensusDay(uow: UnitOfWork, actor: Actor, input: { communityId: string; date: string; runId?: string | null }) {
  const closed = await closedThrough(uow.tx, input.communityId)
  if (closed && input.date <= closed) throw new DomainError(Codes.GUARD_FAILED, `The census through ${closed} is signed off.`, { reason: 'closed_period' })
  const timeZone = await timeZoneOf(uow.tx, input.communityId)
  if (input.date > localDate(timeZone, uow.now)) throw new DomainError(Codes.INVALID_INPUT, 'The census day has not happened yet.', { field: 'date' })
  const derived = await deriveCensusDay(uow.tx, input.communityId, input.date)
  const existing = await uow.tx.censusDay.findMany({ where: { communityId: input.communityId, date: day(input.date), supersededById: null } })
  const byStay = new Map(existing.map(row => [row.stayId, row]))
  let written = 0
  let superseded = 0
  const rowData = (row: (typeof derived.rows)[number]) => ({ communityId: input.communityId, stayId: row.stayId, date: day(input.date), setting: row.setting, bedId: row.bedId, apartmentId: row.apartmentId, unitId: row.unitId, presence: row.presence, primaryCoverageId: row.coverageId, payerKind: row.payerKind, billableForPayer: row.payerKind !== 'uncovered', snapshotRunId: input.runId ?? null })
  // First snapshot of a day: one insert for every row.
  const fresh = derived.rows.filter(row => !byStay.has(row.stayId))
  if (fresh.length) {
    await uow.tx.censusDay.createMany({ data: fresh.map(rowData) })
    written += fresh.length
  }
  for (const row of derived.rows) {
    const prior = byStay.get(row.stayId)
    if (!prior) continue
    byStay.delete(row.stayId)
    const same = prior.presence === row.presence && prior.bedId === row.bedId && prior.apartmentId === row.apartmentId && prior.unitId === row.unitId && prior.primaryCoverageId === row.coverageId
    if (same) continue
    const created = await uow.tx.censusDay.create({ data: { communityId: input.communityId, stayId: row.stayId, date: day(input.date), setting: row.setting, bedId: row.bedId, apartmentId: row.apartmentId, unitId: row.unitId, presence: row.presence, primaryCoverageId: row.coverageId, payerKind: row.payerKind, billableForPayer: row.payerKind !== 'uncovered', snapshotRunId: input.runId ?? null } })
    written += 1
    if (prior) {
      await uow.tx.censusDay.update({ where: { id: prior.id }, data: { supersededById: created.id } })
      superseded += 1
    }
  }
  // Rows for stays no longer present that day are superseded by nothing: mark them with a tombstone row.
  for (const stale of byStay.values()) {
    const tombstone = await uow.tx.censusDay.create({ data: { communityId: input.communityId, stayId: stale.stayId, date: day(input.date), setting: stale.setting, presence: 'absent', payerKind: stale.payerKind, billableForPayer: false, snapshotRunId: input.runId ?? null } })
    await uow.tx.censusDay.update({ where: { id: stale.id }, data: { supersededById: tombstone.id } })
    superseded += 1
  }
  uow.audit({ eventType: 'census.day_snapshot', entityType: 'Community', entityId: input.communityId, actorUserId: actorUserId(actor), after: { date: input.date, present: derived.totals.present, written, superseded } })
  return { date: input.date, totals: derived.totals, written, superseded }
}

/**
 * Signs off a community-local census date (the daily review). The snapshot is refreshed in the same
 * transaction, then the date and every earlier date are closed for live edits.
 */
export async function signOffCensusDay(uow: UnitOfWork, actor: Actor, input: { communityId: string; date: string; note?: string | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Only a person can sign off the census.')
  const timeZone = await timeZoneOf(uow.tx, input.communityId)
  if (input.date >= localDate(timeZone, uow.now)) throw new DomainError(Codes.GUARD_FAILED, 'A census day can be signed off once it has ended.', { reason: 'day_not_ended' })
  const closed = await closedThrough(uow.tx, input.communityId)
  if (closed && input.date <= closed) throw new DomainError(Codes.GUARD_FAILED, `The census through ${closed} is already signed off.`, { reason: 'closed_period' })
  const snapshot = await snapshotCensusDay(uow, actor, { communityId: input.communityId, date: input.date })
  const signoff = await uow.tx.censusSignoff.create({ data: { communityId: input.communityId, date: day(input.date), totals: snapshot.totals as never, signedById: actor.userId, signedAt: uow.now, note: input.note?.trim() ?? '' } })
  uow.audit({ eventType: 'census.signed_off', entityType: 'CensusSignoff', entityId: signoff.id, actorUserId: actor.userId, after: { communityId: input.communityId, date: input.date, totals: snapshot.totals } })
  return { signoffId: signoff.id, date: input.date, totals: snapshot.totals }
}
