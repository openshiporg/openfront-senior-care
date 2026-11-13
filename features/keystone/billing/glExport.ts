import { actorFromSession } from '../lib/actor'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { runInTransaction } from '../lib/unitOfWork'
import { assertCommunityAccess } from '../mutations/run'
import { glCsv, glJournal } from './ar'
import { monthEnd, nextMonth } from './derive'

/**
 * The GL export (an Export button, SCHEMA §10.13): one month's charges, settled payments, posted adjustments, deposits received
 * and forfeited, overpayment credits and issued refunds as a balanced journal in CSV. Needs canReadBilling and the fin tier (canManageBilling or canManagePayments) and the community assignment.
 * Read only; the export is audited.
 */
export async function glExport(db: Db, session: unknown, input: { communityId: string; month: string }) {
  if (!/^\d{4}-\d{2}-01$/.test(input.month)) throw new DomainError(Codes.INVALID_INPUT, 'The month is the first day of the month, like 2026-10-01.')
  const actor = actorFromSession(session as never)
  if (actor.kind !== 'user' || !actor.permissions.has('canReadBilling') || !(actor.permissions.has('canManageBilling') || actor.permissions.has('canManagePayments'))) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs billing access.')
  if ((session as { data?: { kind?: string } })?.data?.kind === 'portal') throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs billing access.')
  await assertCommunityAccess(db, actor, input.communityId)
  const from = new Date(`${input.month}T00:00:00Z`)
  const to = new Date(`${nextMonth(input.month)}T00:00:00Z`)
  const [charges, payments, adjustments, received, forfeited, credits, refunds, community] = await Promise.all([
    db.charge.findMany({ where: { communityId: input.communityId, period: { month: from }, status: 'posted' }, select: { kind: true, responsibility: true, amountMinor: true } }),
    db.paymentAllocation.findMany({ where: { communityId: input.communityId, appliedAt: { gte: from, lt: to } }, select: { amountMinor: true, appliedAt: true, payment: { select: { method: true } } } }),
    db.balanceAdjustment.findMany({ where: { communityId: input.communityId, status: 'posted', postedAt: { gte: from, lt: to } }, select: { kind: true, amountMinor: true, postedAt: true } }),
    db.deposit.findMany({ where: { communityId: input.communityId, receivedOn: { gte: from, lt: to } }, select: { amountMinor: true, receivedOn: true } }),
    db.deposit.findMany({ where: { communityId: input.communityId, status: 'forfeited', resolvedAt: { gte: from, lt: to } }, select: { amountMinor: true, resolvedAt: true } }),
    db.residentCredit.findMany({ where: { communityId: input.communityId, createdAt: { gte: from, lt: to } }, select: { amountMinor: true, createdAt: true, payment: { select: { method: true } } } }),
    db.refund.findMany({ where: { communityId: input.communityId, status: 'issued', issuedAt: { gte: from, lt: to } }, select: { amountMinor: true, issuedAt: true, depositId: true, creditId: true } }),
    db.community.findUnique({ where: { id: input.communityId }, select: { reference: true } }),
  ])
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : monthEnd(input.month))
  const lines = glJournal({
    monthEnd: monthEnd(input.month),
    charges: charges.map(c => ({ kind: c.kind ?? 'ancillary', responsibility: c.responsibility ?? 'resident', amountMinor: c.amountMinor ?? 0n })),
    payments: payments.map(p => ({ method: p.payment?.method ?? 'other', amountMinor: p.amountMinor ?? 0n, settledOn: iso(p.appliedAt) })),
    adjustments: adjustments.map(a => ({ kind: a.kind ?? 'adjustment', amountMinor: a.amountMinor ?? 0n, postedOn: iso(a.postedAt) })),
    deposits: [
      ...received.map(d => ({ event: 'received' as const, amountMinor: d.amountMinor, on: iso(d.receivedOn) })),
      ...forfeited.map(d => ({ event: 'forfeited' as const, amountMinor: d.amountMinor, on: iso(d.resolvedAt) })),
    ],
    credits: credits.map(c => ({ method: c.payment?.method ?? 'other', amountMinor: c.amountMinor, createdOn: iso(c.createdAt) })),
    refunds: refunds.map(r => ({ source: r.depositId ? ('deposit' as const) : r.creditId ? ('credit' as const) : ('payment' as const), amountMinor: r.amountMinor, issuedOn: iso(r.issuedAt) })),
  })
  const reference = `${community?.reference ?? 'GL'}-${input.month.slice(0, 7)}`
  // The export itself is on the audit chain: who took the month's journal, and when.
  await runInTransaction(db, async uow => {
    uow.audit({ eventType: 'billing.gl_exported', entityType: 'Community', entityId: input.communityId, actorUserId: actor.userId, after: { month: input.month, lines: lines.length } })
  })
  return { csv: glCsv(lines, reference), filename: `gl-${reference}.csv`, lines: lines.length, actorUserId: actor.userId }
}
