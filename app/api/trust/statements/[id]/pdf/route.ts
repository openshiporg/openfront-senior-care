import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { quarterEnd, quarterLabel } from '@/features/keystone/trust/extras'
import { trustStatementPdf } from '@/features/keystone/trust/statementPdf'

export const dynamic = 'force-dynamic'

/**
 * A quarterly trust statement as a PDF, made when asked from the frozen row. The session's list access decides what can be read
 * (canReadTrust, the fin tier and the community assignment), so anyone else gets the same 404 as a statement that does not exist.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'cache-control': 'no-store' }
  const context = await keystoneContext.withRequest({ headers: { cookie: req.headers.get('cookie') || '' }, method: 'GET', url: `/api/trust/statements/${id}/pdf` } as unknown as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in first.', { status: 401, headers })
  type Row = { quarter: string; openingMinor: string | null; inMinor: string | null; outMinor: string | null; closingMinor: string | null; lines: any[] | null; resident: { firstName: string; lastName: string } | null; community: { name: string } | null }
  const row = (await context.query.TrustStatement.findOne({ where: { id }, query: 'quarter openingMinor inMinor outMinor closingMinor lines resident { firstName lastName } community { name }' }).catch(() => null)) as Row | null
  if (!row || row.closingMinor === null || row.closingMinor === undefined) return new Response('Not found.', { status: 404, headers })
  const start = String(row.quarter).slice(0, 10)
  const pdf = trustStatementPdf({
    community: row.community?.name ?? '', resident: row.resident ? `${row.resident.firstName} ${row.resident.lastName}` : '', quarter: quarterLabel(start), start, end: quarterEnd(start),
    openingMinor: String(row.openingMinor), inMinor: String(row.inMinor), outMinor: String(row.outMinor), closingMinor: String(row.closingMinor), lines: row.lines ?? [],
  })
  return new Response(new Uint8Array(pdf), { status: 200, headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `inline; filename="trust-statement-${start}.pdf"` } })
}
