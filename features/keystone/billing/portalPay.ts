import type { Actor } from '../lib/actor'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { auditPortalRead, requirePortalScope, type PortalPrincipal } from '../lib/portalReads'
import { balanceOf, chargeStatement } from './payments'
import { chargeInstalment } from './plans'

/**
 * Portal payments (STATE-MACHINES §14; scope `payments`, which needs two-step sign-in). A family member pays an issued statement
 * with a payment method already saved for the resident. It goes through the same card/ACH path as staff: the intent is committed
 * before the processor is called, one card payment in flight per statement, and a decline is final. A statement on a payment plan
 * is paid one instalment at a time, and a declined instalment is never retried from the portal: Retry is a staff action.
 */
export async function portalPay(db: Db, principal: PortalPrincipal, input: { residentId: string; statementId: string; tokenId: string; amountMinor?: bigint | null; idempotencyKey: string }) {
  await db.$transaction(async (tx: any) => {
    await requirePortalScope(tx, principal, input.residentId, 'payments')
    await auditPortalRead(tx, principal, 'portalPay', input.residentId, ['Statement.balance', 'PaymentMethodToken.last4'], 1)
  })
  const statement = await db.statement.findUnique({ where: { id: input.statementId }, select: { id: true, residentId: true, status: true, totalMinor: true, paidMinor: true, adjustedMinor: true } })
  // Another resident's statement looks the same as no statement.
  if (!statement || statement.residentId !== input.residentId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (statement.status !== 'issued') throw new DomainError(Codes.GUARD_FAILED, 'This statement has nothing to pay.')
  const token = await db.paymentMethodToken.findUnique({ where: { id: input.tokenId }, select: { id: true, residentId: true, status: true, provider: true } })
  if (!token || token.residentId !== input.residentId || token.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'That saved payment method is not available.')
  const actor: Actor = { kind: 'user', userId: principal.userId, name: 'Family portal', permissions: new Set() }
  const plan = await db.paymentPlan.findFirst({ where: { statementId: statement.id, status: 'active' }, select: { instalments: { orderBy: { number: 'asc' }, select: { id: true, payment: { select: { status: true } } } } } })
  if (plan) {
    const next = plan.instalments.find(row => row.payment?.status !== 'succeeded')
    if (!next) throw new DomainError(Codes.GUARD_FAILED, 'Every instalment is paid.')
    if (next.payment?.status === 'failed') throw new DomainError(Codes.GUARD_FAILED, 'The last payment for this instalment was declined. Please call the business office.', { reason: 'declined' })
    return chargeInstalment(db, actor, { instalmentId: next.id, tokenId: token.id, retry: false, idempotencyKey: `portal:${principal.userId}:${input.idempotencyKey}` })
  }
  const balance = balanceOf(statement)
  const amount = input.amountMinor ?? balance
  if (amount <= 0n || amount > balance) throw new DomainError(Codes.INVALID_INPUT, 'Pay an amount up to the balance.', { field: 'amountMinor' })
  return chargeStatement(db, actor, { statementId: statement.id, method: token.provider === 'ach' ? 'ach' : 'card', amountMinor: amount, tokenId: token.id, idempotencyKey: `portal:${principal.userId}:${input.idempotencyKey}` })
}
