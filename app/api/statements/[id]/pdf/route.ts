import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { statementPdf } from '@/features/keystone/billing/statementPdf'

export const dynamic = 'force-dynamic'

/**
 * A statement as a PDF, made when asked. The signed-in session's list access decides what can be read, so a person without
 * billing access, or from another community, gets the same 404 as a statement that does not exist.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = { 'cache-control': 'no-store' }
  const context = await keystoneContext.withRequest({ headers: { cookie: req.headers.get('cookie') || '' }, method: 'GET', url: `/api/statements/${id}/pdf` } as unknown as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in first.', { status: 401, headers })
  type Row = { number: string; status: string; totalMinor: string; paidMinor: string; issuedAt: string | null; dueOn: string | null; lines: { description: string; days: number; amountMinor: string }[]; resident: { firstName: string; lastName: string } | null; period: { month: string } | null; community: { name: string } | null }
  const row = (await context.query.Statement.findOne({
    where: { id },
    query: 'number status totalMinor paidMinor issuedAt dueOn lines resident { firstName lastName } period { month } community { name }',
  }).catch(() => null)) as Row | null
  if (!row) return new Response('Not found.', { status: 404, headers })
  const month = row.period?.month ? new Date(row.period.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  const day = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '')
  const pdf = statementPdf({
    number: row.number, community: row.community?.name ?? '', resident: row.resident ? `${row.resident.firstName} ${row.resident.lastName}` : '', month,
    issuedOn: day(row.issuedAt), dueOn: day(row.dueOn), status: row.status, totalMinor: String(row.totalMinor), paidMinor: String(row.paidMinor),
    lines: (row.lines ?? []).map(line => ({ description: line.description, days: line.days, amountMinor: String(line.amountMinor) })),
  })
  return new Response(new Uint8Array(pdf), { status: 200, headers: { ...headers, 'content-type': 'application/pdf', 'content-disposition': `inline; filename="statement-${row.number}.pdf"` } })
}
