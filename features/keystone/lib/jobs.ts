import { randomUUID } from 'node:crypto'
import { systemActor } from './actor'
import { localDate, addDays } from './calendar'
import { type Db } from './db'
import { acquireLease, assertFence, releaseLease } from './lease'
import { runInTransaction, type UnitOfWork } from './unitOfWork'
import { sweepClocks } from './clocks'
import { expireReservations } from './places'
import { expireBreakGlass } from './privacy'
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

/**
 * The periodic sweep: overdue clocks, expired reservations and break-glass grants, and the
 * midnight census for each active community whose previous local day has no snapshot yet.
 */
export async function runDueJobs(db: Db, now = new Date()) {
  const actor = systemActor('scheduler')
  const results: Record<string, unknown> = {}
  results.clocks = await runLeasedJob(db, 'clock_sweep', 'all', uow => sweepClocks(uow, actor), now)
  results.reservations = await runLeasedJob(db, 'reservation_expiry', 'all', uow => expireReservations(uow, actor), now)
  results.breakGlass = await runLeasedJob(db, 'break_glass_expiry', 'all', uow => expireBreakGlass(uow, actor), now)
  const communities = await db.community.findMany({ where: { status: 'active' }, select: { id: true, timeZone: true } })
  const census: Record<string, unknown> = {}
  for (const community of communities) {
    const yesterday = addDays(localDate(community.timeZone, now), -1)
    const done = await db.jobRun.count({ where: { kind: 'midnight_census', scopeKey: `${community.id}:${yesterday}`, status: 'succeeded' } })
    if (done) continue
    const signed = await db.censusSignoff.count({ where: { communityId: community.id, unitId: null, date: { gte: new Date(`${yesterday}T00:00:00Z`) } } })
    if (signed) continue
    census[community.id] = await runLeasedJob(db, 'midnight_census', `${community.id}:${yesterday}`, (uow, runId) => snapshotCensusDay(uow, actor, { communityId: community.id, date: yesterday, runId }), now)
  }
  results.census = census
  return results
}
