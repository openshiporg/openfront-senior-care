import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { mdsSubmissionDownload } from '@/features/keystone/mds/download'
import { DomainError } from '@/features/keystone/lib/errors'

export const dynamic = 'force-dynamic'

/** The MDS export button: the iQIES submission ZIP for a staff upload. Nothing is transmitted from here. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const headers = { 'cache-control': 'no-store' }
  const context = await keystoneContext.withRequest({ headers: { cookie: req.headers.get('cookie') || '' }, method: 'GET', url: '/api/mds/submission' } as unknown as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in first.', { status: 401, headers })
  try {
    const out = await mdsSubmissionDownload(context.prisma as never, context.session, url.searchParams.get('id') ?? '')
    return new Response(new Uint8Array(out.zip), { status: 200, headers: { ...headers, 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${out.fileName}"` } })
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: error.code === 'NOT_AUTHORIZED' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400, headers })
    throw error
  }
}
