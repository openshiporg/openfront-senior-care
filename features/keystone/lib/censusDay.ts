import { localDate } from './calendar'
import { actorUserId, type Actor } from './actor'
import { type Tx } from './db'
import { DomainError, Codes } from './errors'
import { loadCensusEvents, closedThrough } from './census'
import { presenceAt } from './censusProjection'
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
  const rows: { stayId: string; setting: string; presence: string; bedId: string | null; apartmentId: string | null; unitId: string | null; coverageId: string | null; payerKind: string }[] = []
  for (const stay of stays) {
    const events = await loadCensusEvents(tx, stay.id)
    const projection = presenceAt(events.map((event, index) => ({ ...event, seq: index + 1 })), timeZone, date)
    if (projection.presence !== 'in_house' && projection.presence !== 'on_leave_hold') continue
    const bedId = projection.presence === 'in_house' ? projection.currentBedId : projection.heldBedId
    const apartmentId = projection.currentApartmentId
    let unitId: string | null = null
    if (bedId) unitId = (await tx.bed.findUnique({ where: { id: bedId }, select: { room: { select: { unitId: true } } } }))?.room?.unitId ?? null
    else if (apartmentId) unitId = (await tx.apartment.findUnique({ where: { id: apartmentId }, select: { unitId: true } }))?.unitId ?? null
    const coverage = await tx.coveragePeriod.findFirst({
      where: { stayId: stay.id, rank: 'primary', startDate: { lte: dayStart }, OR: [{ endDate: null }, { endDate: { gt: dayStart } }], status: { in: ['active', 'ending', 'ended', 'retro_approved'] } },
      orderBy: { startDate: 'desc' }, include: { payer: { select: { kind: true } } },
    })
    rows.push({ stayId: stay.id, setting: stay.setting, presence: projection.presence, bedId, apartmentId, unitId, coverageId: coverage?.id ?? null, payerKind: coverage?.payer?.kind ?? 'uncovered' })
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
  for (const row of derived.rows) {
    const prior = byStay.get(row.stayId)
    byStay.delete(row.stayId)
    const same = prior && prior.presence === row.presence && prior.bedId === row.bedId && prior.apartmentId === row.apartmentId && prior.unitId === row.unitId && prior.primaryCoverageId === row.coverageId
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
  uow.emit({ topic: 'census.signed_off', aggregateType: 'Community', aggregateId: input.communityId, payload: { date: input.date }, dedupeKey: `census.signed_off:${input.communityId}:${input.date}` })
  return { signoffId: signoff.id, date: input.date, totals: snapshot.totals }
}
