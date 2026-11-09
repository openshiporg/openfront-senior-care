import { keystoneContext } from '@/features/keystone/context'

export const dynamic = 'force-dynamic'

/** Liveness: 200 while the database answers. No PHI, ids or error text. */
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  try {
    await (keystoneContext.prisma as unknown as { $queryRaw: (q: TemplateStringsArray) => Promise<unknown> }).$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', database: 'ok', ok: true }, { status: 200, headers })
  } catch {
    return Response.json({ status: 'unavailable', database: 'unavailable', ok: false }, { status: 503, headers })
  }
}
