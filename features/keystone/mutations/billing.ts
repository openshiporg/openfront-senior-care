import type { Permission } from '../access'
import type { Actor } from '../lib/actor'
import { delegateOf, type Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { adjustClosedPeriod, closePeriod, runDerivation } from '../billing/period'
import * as pay from '../billing/payments'
import * as rates from '../billing/rates'
import * as medicaid from '../billing/medicaid'
import * as trust from '../trust/service'
import { minorOf } from '../lib/money'
import { actorFor } from './actorFor'
import { assertCommunityAccess, assertHuman, authorize, runDomain } from './run'
import { requireKey } from './op'

/**
 * The Phase 3 command surface: private pay, deposits, statements, resident trust and Medicaid liability. Every entry checks
 * its permission and the actor's community assignment before it runs. Money arrives as text and is parsed to BigInt here.
 * Month-end close, derivation and autopay are staff buttons: nothing here runs on a timer.
 */

type Input = Record<string, any>
type Handler = {
  permissions: Permission[]
  community: (tx: Tx, input: Input) => Promise<string | null>
  run: (uow: UnitOfWork, actor: Actor, input: Input) => Promise<unknown>
  serializable?: boolean
  /** Network work that cannot sit inside the database transaction (a processor call): it commits its own steps. */
  external?: (db: any, actor: Actor, input: Input) => Promise<unknown>
}

const money = (value: unknown, field: string) => {
  try {
    return minorOf(value)
  } catch {
    throw new DomainError(Codes.INVALID_INPUT, `The ${field} must be a whole number of cents.`, { field })
  }
}
const byCommunity = async (_tx: Tx, i: Input) => (i.communityId ? String(i.communityId) : null)
const byRecord = (model: string, field: string) => async (tx: Tx, i: Input) => {
  const id = i[field]
  if (typeof id !== 'string' || !id) return null
  const row = (await delegateOf(tx, model).findUnique({ where: { id }, select: { communityId: true } })) as { communityId: string | null } | null
  return row?.communityId ?? null
}
const byLedger = byRecord('ResidentTrustLedger', 'ledgerId')
const byStatement = byRecord('Statement', 'statementId')

const BILLING: Permission[] = ['canManageBilling']
const RATES: Permission[] = ['canManageRates']
const PAYMENTS: Permission[] = ['canPostPayments', 'canManagePayments']
const TRUST_OP: Permission[] = ['canOperateTrust']
const TRUST_SIGN: Permission[] = ['canApproveTrust']

export const HANDLERS: Record<string, Handler> = {
  // Billing periods
  'billing.derive': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => runDerivation(u, a, { communityId: i.communityId, month: i.month }) },
  'billing.close': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => closePeriod(u, a, { communityId: i.communityId, month: i.month }) },
  'billing.adjust_closed': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => adjustClosedPeriod(u, a, { communityId: i.communityId, month: i.month }) },

  // Rates
  'rate.create': { permissions: RATES, community: byCommunity, run: (u, a, i) => rates.createSchedule(u, a, i as never) },
  'rate.add_line': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.addRateLine(u, a, { scheduleId: i.scheduleId, kind: i.kind, per: i.per, proration: i.proration, apartmentTypeId: i.apartmentTypeId, careLevelId: i.careLevelId, amountMinor: money(i.amountMinor, 'rate') }) },
  'rate.request_publish': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.requestPublish(u, a, { scheduleId: i.scheduleId }) },
  'rate.notice_delivered': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.recordRateNoticeDelivery(u, a, { scheduleId: i.scheduleId, residentId: i.residentId, method: i.method, deliveredAt: new Date(i.deliveredAt) }) },

  // Payments recorded by hand, deposits and refunds
  'payment.record': { permissions: PAYMENTS, community: byStatement, serializable: true, run: (u, a, i) => pay.recordHandPayment(u, a, { statementId: i.statementId, method: i.method, amountMinor: money(i.amountMinor, 'amount'), reference: i.reference }) },
  'deposit.receive': {
    permissions: PAYMENTS, community: byCommunity,
    run: async (u, a, i) => {
      const amount = money(i.amountMinor, 'amount')
      if (amount <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The deposit must be more than zero.', { field: 'amount' })
      const created = await u.tx.deposit.create({ data: { communityId: i.communityId, residentId: i.residentId, kind: i.kind, amountMinor: amount, method: i.method, status: 'held', receivedOn: new Date(`${String(i.receivedOn).slice(0, 10)}T00:00:00Z`), note: i.note ?? '' } })
      u.audit({ eventType: 'deposit.received', entityType: 'Deposit', entityId: created.id, after: { kind: i.kind, amountMinor: amount.toString() } })
      return { depositId: created.id }
    },
  },
  'deposit.apply': { permissions: PAYMENTS, community: byRecord('Deposit', 'depositId'), serializable: true, run: (u, a, i) => pay.applyDeposit(u, a, { depositId: i.depositId, statementId: i.statementId }) },
  'refund.request': { permissions: ['canIssueRefunds', 'canManagePayments'], community: async (tx, i) => (i.paymentId ? byRecord('Payment', 'paymentId')(tx, i) : byRecord('Deposit', 'depositId')(tx, i)), serializable: true, run: (u, a, i) => pay.requestRefund(u, a, { paymentId: i.paymentId, depositId: i.depositId, amountMinor: money(i.amountMinor, 'amount'), reason: String(i.reason ?? '') }) },

  // Card and ACH (Stripe test), each running its own committed steps
  'payment.charge': {
    permissions: ['canManagePayments'], community: byStatement, run: async () => ({}),
    external: (db, a, i) => pay.chargeStatement(db, a, { statementId: i.statementId, method: i.method === 'ach' ? 'ach' : 'card', amountMinor: money(i.amountMinor, 'amount'), tokenId: i.tokenId, idempotencyKey: String(i.__key) }),
  },
  'payment.check_status': { permissions: ['canManagePayments'], community: byRecord('Payment', 'paymentId'), run: async () => ({}), external: (db, a, i) => pay.checkPaymentStatus(db, a, i.paymentId) },
  'refund.issue': { permissions: ['canIssueRefunds'], community: byRecord('Refund', 'refundId'), run: async () => ({}), external: (db, a, i) => pay.issueRefund(db, a, i.refundId) },
  'billing.autopay': { permissions: ['canManagePayments'], community: byRecord('BillingPeriod', 'periodId'), run: async () => ({}), external: (db, a, i) => pay.chargeAutopayForPeriod(db, a, { periodId: i.periodId }) },

  // Medicaid liability
  'medicaid.record': { permissions: BILLING, community: byRecord('Stay', 'stayId'), run: (u, a, i) => medicaid.recordLiability(u, a, { stayId: i.stayId, month: i.month, liabilityMinor: money(i.liabilityMinor, 'liability'), noticeReceivedOn: i.noticeReceivedOn, note: i.note }) },
  'medicaid.info_request': { permissions: BILLING, community: byRecord('MedicaidLiability', 'liabilityId'), run: (u, a, i) => medicaid.recordInfoRequest(u, a, { liabilityId: i.liabilityId, kind: i.kind, on: i.on }) },
  'medicaid.appeal': { permissions: BILLING, community: byRecord('MedicaidLiability', 'liabilityId'), run: (u, a, i) => medicaid.fileAppeal(u, a, { liabilityId: i.liabilityId, filedOn: i.filedOn }) },

  // Resident trust
  'trust.open_ledger': { permissions: TRUST_OP, community: byCommunity, run: (u, a, i) => trust.openLedger(u, a, { communityId: i.communityId, residentId: i.residentId, accountId: i.accountId, consentOnFile: i.consentOnFile === true }) },
  'trust.deposit': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.recordDeposit(u, a, { ledgerId: i.ledgerId, amountMinor: money(i.amountMinor, 'amount'), purpose: i.purpose, effectiveOn: i.effectiveOn }) },
  'trust.withdraw': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.prepareWithdrawal(u, a, { ledgerId: i.ledgerId, amountMinor: money(i.amountMinor, 'amount'), purpose: String(i.purpose ?? ''), effectiveOn: i.effectiveOn }) },
  'trust.sign': { permissions: TRUST_SIGN, community: byRecord('TrustTransaction', 'transactionId'), serializable: true, run: (u, a, i) => trust.signWithdrawal(u, a, { transactionId: i.transactionId }) },
  'trust.reject': { permissions: TRUST_SIGN, community: byRecord('TrustTransaction', 'transactionId'), run: (u, a, i) => trust.rejectWithdrawal(u, a, { transactionId: i.transactionId, reason: String(i.reason ?? '') }) },
  'trust.reverse': { permissions: TRUST_OP, community: byRecord('TrustTransaction', 'transactionId'), serializable: true, run: (u, a, i) => trust.reverseTransaction(u, a, { transactionId: i.transactionId, reason: String(i.reason ?? '') }) },
  'trust.close_ledger': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.closeLedger(u, a, { ledgerId: i.ledgerId, reason: i.reason, closedOn: i.closedOn }) },
  'trust.convey': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.conveyBalance(u, a, { ledgerId: i.ledgerId, conveyedTo: String(i.conveyedTo ?? ''), effectiveOn: i.effectiveOn }) },
  'trust.reconcile': { permissions: TRUST_OP, community: byRecord('TrustAccount', 'accountId'), serializable: true, run: (u, a, i) => trust.prepareReconciliation(u, a, { accountId: i.accountId, month: i.month, bankBalanceMinor: money(i.bankBalanceMinor, 'bank balance') }) },
  'trust.sign_reconciliation': { permissions: TRUST_SIGN, community: byRecord('TrustReconciliation', 'reconciliationId'), run: (u, a, i) => trust.signReconciliation(u, a, { reconciliationId: i.reconciliationId }) },
}

/** All Phase 3 commands are for a signed-in person at the dashboard: an agent never moves money. */
export async function billingCommand(_root: unknown, args: { op: string; input?: Input | null; idempotencyKey: string }, context: { session: unknown; prisma: any }) {
  const handler = HANDLERS[args.op]
  if (!handler) throw new DomainError(Codes.INVALID_INPUT, 'Unknown action.')
  const input = (args.input && typeof args.input === 'object' ? { ...args.input } : {}) as Input
  if (handler.external) {
    const actor = await actorFor(context)
    assertHuman(context, actor, true)
    authorize(actor, { permissions: handler.permissions })
    await assertCommunityAccess(context.prisma, actor, await handler.community(context.prisma, input))
    return { replay: false, ...((await handler.external(context.prisma, actor, { ...input, __key: requireKey(args.idempotencyKey) })) as object) }
  }
  return runDomain(context, { idempotencyKey: args.idempotencyKey, op: args.op, input }, { name: `billing.${args.op}`, permissions: handler.permissions, humanOnly: true, serializable: handler.serializable, community: tx => handler.community(tx, input) }, (uow, actor) => handler.run(uow, actor, input) as Promise<object>)
}
