import { hostname } from 'node:os'
import { type Db } from './db'
import { runDueJobs } from './jobs'
import { drainOutbox, type DrainResult } from './outbox'
import { outboxHandlers, type HandlerOptions } from './outboxHandlers'

/**
 * The background worker: every tick runs the due scheduled jobs (clock sweep, reservation, offer,
 * tour-hold and break-glass expiry, the midnight census) and drains the outbox. It runs inside the
 * web process (instrumentation.ts) and can also run as its own service (`npm run worker`); leases
 * and SKIP LOCKED claims make any number of copies safe.
 *
 * Each tick records a heartbeat on the `worker` Job row, so /api/health can say whether a worker
 * is alive on this deployment and how far behind the outbox is.
 */

export const TICK_MS = 30_000
/** A worker that has not ticked for this long is reported as stalled. */
export const STALE_AFTER_MS = 3 * TICK_MS

export type TickResult = { at: string; jobs: Record<string, unknown>; outbox: DrainResult; error?: string }

/** Outbox work per tick stops after this long, so the heartbeat stays fresh under a large backlog. */
export const DRAIN_BUDGET_MS = 20_000

async function heartbeat(db: Db, workerId: string, at: Date, error?: string) {
  const data = { intervalSeconds: TICK_MS / 1000, lastRunAt: at, nextRunAt: new Date(at.getTime() + TICK_MS), status: error ? 'failed' : 'idle', leaseKey: workerId, lastError: error ?? '' }
  await db.job.upsert({ where: { kind: 'worker' }, create: { kind: 'worker', ...data }, update: data })
}

export async function workerTick(db: Db, options: HandlerOptions & { workerId: string; now?: Date; drainBudgetMs?: number }): Promise<TickResult> {
  const now = options.now ?? new Date()
  // Heartbeat at the start too, so a long first tick (a big backlog, the midnight census) still shows as alive.
  await db.job.upsert({ where: { kind: 'worker' }, create: { kind: 'worker', intervalSeconds: TICK_MS / 1000, lastRunAt: new Date(), leaseKey: options.workerId }, update: { lastRunAt: new Date(), leaseKey: options.workerId } })
  let jobs: Record<string, unknown> = {}
  let error: string | undefined
  try {
    jobs = await runDueJobs(db, now)
    if (Number(jobs.errors) > 0) error = `${jobs.errors} scheduled job(s) failed; see JobRun`
  } catch (cause) {
    error = cause instanceof Error ? cause.message.slice(0, 300) : 'jobs failed'
  }
  const handlers = outboxHandlers(db, options)
  const outbox: DrainResult = { claimed: 0, delivered: 0, failed: 0, dead: 0, staleAcks: 0 }
  const deadline = Date.now() + (options.drainBudgetMs ?? DRAIN_BUDGET_MS)
  // Small batches until the queue is empty or the budget is spent; the rest waits for the next tick.
  while (Date.now() < deadline) {
    const batch = await drainOutbox(db, { workerId: options.workerId, handlers, maxMessages: 10 })
    for (const key of Object.keys(outbox) as (keyof DrainResult)[]) outbox[key] += batch[key]
    if (batch.claimed < 10) break
  }
  const at = new Date()
  await heartbeat(db, options.workerId, at, error)
  return { at: at.toISOString(), jobs, outbox, ...(error ? { error } : {}) }
}

export const defaultWorkerId = (where: string) => `${where}:${process.env.RAILWAY_REPLICA_ID ?? hostname()}:${process.pid}`

/** Mail settings from the environment; null when SMTP is not configured (deliveries are then recorded as failed). */
export async function mailerFromEnv(): Promise<HandlerOptions['sendMail']> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) return null
  const { createTransport } = await import('nodemailer')
  const transport = createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined })
  return async message => {
    const info = await transport.sendMail({ from: process.env.SMTP_FROM, to: message.to, subject: message.subject, text: message.text })
    return { messageId: String(info.messageId ?? '') }
  }
}

/**
 * Loops until `signal` aborts. One tick at a time; a failed tick is logged and the loop carries on.
 * `handleSignals` (the standalone worker only) stops after the current tick on SIGTERM/SIGINT; the
 * web process leaves signals to Next.js, and an interrupted tick is safe because leases expire.
 */
export async function runWorkerLoop(db: Db, options: { workerId: string; signal?: AbortSignal; intervalMs?: number; log?: (line: string) => void; handleSignals?: boolean }) {
  const log = options.log ?? (line => console.log(line))
  const stop = new AbortController()
  options.signal?.addEventListener('abort', () => stop.abort(), { once: true })
  if (options.handleSignals) for (const event of ['SIGTERM', 'SIGINT'] as const) process.once(event, () => stop.abort())
  const signal = stop.signal
  const handlerOptions: HandlerOptions = { sendMail: await mailerFromEnv(), portalAcceptUrl: process.env.PORTAL_ACCEPT_URL || null }
  while (!signal.aborted) {
    try {
      const result = await workerTick(db, { ...handlerOptions, workerId: options.workerId })
      if (result.outbox.claimed || result.error) log(JSON.stringify({ component: 'senior-care-worker', ...result }))
    } catch (error) {
      log(JSON.stringify({ component: 'senior-care-worker', status: 'failed', error: error instanceof Error ? error.message.slice(0, 300) : String(error) }))
    }
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, options.intervalMs ?? TICK_MS)
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }
}

export type WorkerHealth = { status: 'running' | 'stalled' | 'never_ran'; lastTickAt: string | null; lastError: string | null; outbox: { pending: number; failed: number; dead: number; oldestPendingSeconds: number | null } }

export async function workerHealth(db: Db, now = new Date()): Promise<WorkerHealth> {
  const [job, pending, failed, dead, oldest] = await Promise.all([
    db.job.findUnique({ where: { kind: 'worker' }, select: { lastRunAt: true, lastError: true } }),
    db.outboxEvent.count({ where: { status: { in: ['pending', 'leased'] } } }),
    db.outboxEvent.count({ where: { status: 'failed' } }),
    db.outboxEvent.count({ where: { status: 'dead' } }),
    db.outboxEvent.findFirst({ where: { status: { in: ['pending', 'failed', 'leased'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  const last = job?.lastRunAt ?? null
  const status = !last ? 'never_ran' : now.getTime() - last.getTime() > STALE_AFTER_MS ? 'stalled' : 'running'
  return {
    status,
    lastTickAt: last?.toISOString() ?? null,
    lastError: job?.lastError || null,
    outbox: { pending, failed, dead, oldestPendingSeconds: oldest ? Math.max(0, Math.round((now.getTime() - oldest.createdAt.getTime()) / 1000)) : null },
  }
}
