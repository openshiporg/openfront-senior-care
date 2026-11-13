import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { glExport } from '@/features/keystone/billing/glExport'
import { DomainError } from '@/features/keystone/lib/errors'

export const dynamic = 'force-dynamic'

/** The GL export button: one month's balanced journal as CSV, for the signed-in billing person's community. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const headers = { 'cache-control': 'no-store' }
  const context = await keystoneContext.withRequest({ headers: { cookie: req.headers.get('cookie') || '' }, method: 'GET', url: '/api/billing/gl-export' } as unknown as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in first.', { status: 401, headers })
  try {
    const out = await glExport(context.prisma as never, context.session, { communityId: url.searchParams.get('communityId') ?? '', month: url.searchParams.get('month') ?? '' })
    return new Response(out.csv, { status: 200, headers: { ...headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${out.filename}"` } })
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: error.code === 'NOT_AUTHORIZED' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400, headers })
    throw error
  }
}
