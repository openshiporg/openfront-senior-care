// Time-based states (compliance clocks, expiring holds and offers, the midnight census) settle inside the
// production web process, as Openfront Scheduling does. No worker or cron service. Jobs hold leases, so
// replicas are safe. Set MAINTENANCE_IN_PROCESS=1 to run it under `next dev`, or =0 to switch it off.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production' && process.env.MAINTENANCE_IN_PROCESS !== '1') return
  if (process.env.MAINTENANCE_IN_PROCESS === '0') return
  const state = globalThis as unknown as { seniorCareMaintenance?: AbortController }
  if (state.seniorCareMaintenance) return
  state.seniorCareMaintenance = new AbortController()
  const [{ PrismaClient }, { maintenanceLoop }] = await Promise.all([
    import('@prisma/client'),
    import('./features/keystone/lib/maintenance'),
  ])
  const prisma = new PrismaClient({ datasourceUrl: poolUrl(process.env.DATABASE_URL ?? '') })
  const signal = state.seniorCareMaintenance.signal
  // Let the server start answering before the first tick.
  setTimeout(() => {
    void maintenanceLoop(prisma, signal).finally(() => prisma.$disconnect())
  }, 10_000).unref?.()
}

/** A small pool of its own, so upkeep never starves web requests of connections. */
function poolUrl(url: string) {
  if (!url || /[?&]connection_limit=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=3`
}
