import { keystoneContext } from '@/features/keystone/context'
import { workerHealth } from '@/features/keystone/lib/worker'

export const dynamic = 'force-dynamic'

/**
 * Liveness plus the background worker's heartbeat and outbox backlog. No PHI, ids or error text:
 * only counts, the last tick time and a status. 200 while the database answers; a stalled or
 * missing worker shows as `ok: false` and `worker.status` without failing the platform health check.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  try {
    const prisma = keystoneContext.prisma as never
    const worker = await workerHealth(prisma)
    const { lastError, ...rest } = worker
    return Response.json({ status: 'ok', database: 'ok', ok: worker.status === 'running' && !lastError, worker: { ...rest, failing: Boolean(lastError) } }, { status: 200, headers })
  } catch {
    return Response.json({ status: 'unavailable', database: 'unavailable', ok: false }, { status: 503, headers })
  }
}
