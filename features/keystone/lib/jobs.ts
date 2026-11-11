import { randomUUID } from 'node:crypto'
import { systemActor } from './actor'
import { localDate, addDays } from './calendar'
import { type Db } from './db'
import { acquireLease, assertFence, releaseLease } from './lease'
import { runInTransaction, type UnitOfWork } from './unitOfWork'
import { sweepClocks } from './clocks'
import { expireReservations } from './places'
import { expireBreakGlass } from './privacy'
import { expireTourHolds, expireWaitlistOffers } from './sales'
import { snapshotCensusDay } from './censusDay'

/**
 * Scheduled work (SCHEMA §1.8 Job/JobRun). Each job runs under a named lease with a fencing token,
 * so two app instances never run the same job for the same scope at once, and a paused worker
 * cannot write after its lease was taken over. One JobRun row per run, with the summary.
 */

const LEASE_MS = 5 * 60_000

export async function runLeasedJob<T>(db: Db, kind: string, scopeKey: string, work: (uow: UnitOfWork, runId: string) => Promise<T>, now = new Date()) {
  const owner = `${process.env.RAILWAY_REPLICA_ID ?? 'local'}:${randomUUID()}`
  const grant = await acquireLease(db, `job:${kind}:${scopeKey}`, owner, LEASE_MS, now)
  if (!grant) return { skipped: true as const }
  const run = await db.jobRun.create({ data: { kind, scopeKey, status: 'running', startedAt: now, fencingToken: grant.fencingToken } })
  try {
    const summary = await runInTransaction(db, async uow => {
      await assertFence(uow.tx, grant, uow.now)
      return work(uow, run.id)
    }, { now })
    await db.jobRun.update({ where: { id: run.id }, data: { status: 'succeeded', finishedAt: new Date(), summary: summary as never } })
    return { skipped: false as const, runId: run.id, summary }
  } catch (error) {
    await db.jobRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), summary: { error: error instanceof Error ? error.message.slice(0, 500) : 'failed' } } })
    throw error
  } finally {
    await releaseLease(db, grant).catch(() => undefined)
  }
}

/** One job's failure is recorded on its JobRun and reported; it never stops the jobs after it. */
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    return { skipped: false as const, error: error instanceof Error ? error.message.slice(0, 300) : 'failed' }
  }
}

/**
 * The periodic sweep: overdue clocks; expired reservations, waitlist offers, tour holds and
 * break-glass grants; and the midnight census for each active community whose previous local day
 * has no snapshot yet. Returns `errors` > 0 when any job failed, so the worker can surface it.
 */
export async function runDueJobs(db: Db, now = new Date()) {
  const actor = systemActor('scheduler')
  const results: Record<string, unknown> = {}
  // One cheap read per job first: the leased job (lease, JobRun row, transaction) only runs when
  // something is actually due, so a page read that finds nothing due costs a handful of counts.
  const [clocks, reservations, offers, holds, grants, communities] = await Promise.all([
    db.complianceClock.count({ where: { current: true, status: 'open', dueAt: { lt: now } } }),
    db.placeReservation.count({ where: { status: 'active', expiresAt: { lt: now } } }),
    db.waitlistEntry.count({ where: { status: 'offered', offerExpiresAt: { lt: now } } }),
    db.tour.count({ where: { status: 'requested', holdExpiresAt: { lt: now } } }),
    db.breakGlassGrant.count({ where: { status: 'active', expiresAt: { lte: now } } }),
    db.community.findMany({ where: { status: 'active' }, select: { id: true, timeZone: true } }),
  ])
  if (clocks) results.clocks = await guarded(() => runLeasedJob(db, 'clock_sweep', 'all', uow => sweepClocks(uow, actor), now))
  if (reservations) results.reservations = await guarded(() => runLeasedJob(db, 'reservation_expiry', 'all', uow => expireReservations(uow, actor), now))
  if (offers) results.waitlistOffers = await guarded(() => runLeasedJob(db, 'waitlist_offer_expiry', 'all', uow => expireWaitlistOffers(uow, actor), now))
  if (holds) results.tourHolds = await guarded(() => runLeasedJob(db, 'tour_hold_expiry', 'all', uow => expireTourHolds(uow, actor), now))
  if (grants) results.breakGlass = await guarded(() => runLeasedJob(db, 'break_glass_expiry', 'all', uow => expireBreakGlass(uow, actor), now))
  const census: Record<string, unknown> = {}
  for (const community of communities) {
    const yesterday = addDays(localDate(community.timeZone, now), -1)
    const done = await db.jobRun.count({ where: { kind: 'midnight_census', scopeKey: `${community.id}:${yesterday}`, status: 'succeeded' } })
    if (done) continue
    const signed = await db.censusSignoff.count({ where: { communityId: community.id, unitId: null, date: { gte: new Date(`${yesterday}T00:00:00Z`) } } })
    if (signed) continue
    census[community.id] = await guarded(() => runLeasedJob(db, 'midnight_census', `${community.id}:${yesterday}`, (uow, runId) => snapshotCensusDay(uow, actor, { communityId: community.id, date: yesterday, runId }), now))
  }
  results.census = census
  const all = [...Object.values(results).filter(value => value !== census), ...Object.values(census)]
  results.errors = all.filter(value => value && typeof value === 'object' && 'error' in value).length
  return results
}
