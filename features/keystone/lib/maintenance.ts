import { type Db } from './db'
import { runDueJobs } from './jobs'

/**
 * Time-based states: overdue compliance clocks; expired reservations, waitlist offers, tour holds and
 * break-glass grants; the midnight census. There is no timer, worker or cron. Every job is idempotent
 * and runs under a lease, and is run on the request that touches these records (every dashboard
 * read, every domain command, the public storefront read) and by the staff "Refresh" button.
 * Running it twice, or on several replicas at once, is safe.
 */
const MIN_GAP_MS = 5_000
const state = globalThis as unknown as { seniorCareAdvance?: { at: number; running: Promise<unknown> | null } }

/**
 * Advance the time-based states for the request in hand. Calls within five seconds of the last pass
 * share its result (no repeat queries on a busy page); `force` is the staff Refresh button. A failed
 * pass is logged and never fails the request that triggered it.
 */
export async function advanceTimedStates(db: Db, options: { force?: boolean } = {}) {
  const s = (state.seniorCareAdvance ??= { at: 0, running: null })
  if (s.running) {
    await s.running.catch(() => undefined)
    if (!options.force) return null
  }
  if (!options.force && Date.now() - s.at < MIN_GAP_MS) return null
  const run = runDueJobs(db)
  s.running = run
  try {
    const result = await run
    s.at = Date.now()
    if (Number(result.errors) > 0) console.error(JSON.stringify({ component: 'timed-states', errors: result.errors }))
    return result
  } catch (error) {
    console.error(JSON.stringify({ component: 'timed-states', status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown error' }))
    return null
  } finally {
    s.running = null
  }
}
