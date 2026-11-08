// The background worker runs inside the production web process, so a deploy with only the web service
// still sweeps compliance clocks, expires holds and offers, takes the midnight census and delivers the
// outbox. Leases and SKIP LOCKED claims make it safe beside `npm run worker` or other replicas.
// Set WORKER_IN_PROCESS=0 when a separate worker service runs instead. /api/health reports its heartbeat.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production' && process.env.WORKER_IN_PROCESS !== '1') return
  if (process.env.WORKER_IN_PROCESS === '0') return
  const state = globalThis as unknown as { seniorCareWorker?: AbortController }
  if (state.seniorCareWorker) return
  state.seniorCareWorker = new AbortController()
  const [{ PrismaClient }, { runWorkerLoop, defaultWorkerId }] = await Promise.all([
    import('@prisma/client'),
    import('./features/keystone/lib/worker'),
  ])
  const prisma = new PrismaClient({ datasourceUrl: workerDatabaseUrl(process.env.DATABASE_URL ?? '') })
  const signal = state.seniorCareWorker.signal
  // Let the server start answering before the first tick.
  setTimeout(() => {
    void runWorkerLoop(prisma, { workerId: defaultWorkerId('web'), signal }).finally(() => prisma.$disconnect())
  }, 10_000).unref?.()
}

/** A small pool of its own, so the worker never starves web requests of connections. */
function workerDatabaseUrl(url: string) {
  if (!url || /[?&]connection_limit=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=3`
}
