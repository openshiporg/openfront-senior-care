import { type Db } from './db'
import { runDueJobs } from './jobs'

/**
 * In-process upkeep, as Openfront Scheduling does: every tick settles the time-based states (overdue
 * compliance clocks; expired reservations, waitlist offers, tour holds and break-glass grants; the
 * midnight census). It runs inside the web process (instrumentation.ts); there is no separate
 * worker service. Each job runs under a lease, so replicas never repeat each other's work.
 */
export const TICK_MS = 30_000

export async function maintenanceLoop(db: Db, signal: AbortSignal, log: (line: string) => void = line => console.log(line)) {
  while (!signal.aborted) {
    try {
      const result = await runDueJobs(db)
      if (Number(result.errors) > 0) log(JSON.stringify({ component: 'senior-care-maintenance', errors: result.errors }))
    } catch (error) {
      log(JSON.stringify({ component: 'senior-care-maintenance', status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : String(error) }))
    }
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, TICK_MS)
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }
}
