import { randomUUID } from 'node:crypto'
import { actorUserId, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { lockRow, casUpdate, auditCreate } from '../lib/cas'
import { consumeApproval, requestApproval } from '../lib/approval'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { adapterFor, cardConfigured, type ChargeResult, type PaymentAdapter } from '../../integrations/payment'

/**
 * Private-pay payments. The rules, each with its own test:
 *  - one card or ACH payment in flight (pending or unknown) per statement, in code and in the database;
 *  - the intent is recorded and committed BEFORE the processor is called, and the answer is recorded after;
 *  - "Check status" only reads the processor, it never creates a charge;
 *  - a decline is final for that key (a retry is a new staff action with a new key);
 *  - an idempotency_error is `unknown`, never `failed`;
 *  - a webhook is recorded once by its provider event id, and a payment settles once (compare-and-set);
 *  - a refund never reopens a paid statement.
 * Card and ACH are Stripe TEST only.
 */

export const CHARGE_METHODS = ['card', 'ach'] as const
export const HAND_METHODS = ['check', 'cash', 'other'] as const
const CURRENCY = 'USD'

let override: PaymentAdapter | null = null
/** Tests swap in the deterministic fake; production uses Stripe test mode. */
export const usePaymentAdapter = (adapter: PaymentAdapter | null) => { override = adapter }
const adapter = () => override ?? adapterFor('stripe')
const processorReady = () => override !== null || cardConfigured()

const positive = (value: bigint, name: string) => {
  if (typeof value !== 'bigint' || value <= 0n) throw new DomainError(Codes.INVALID_INPUT, `The ${name} must be more than zero.`, { field: name })
  return value
}

export const balanceOf = (statement: { totalMinor: bigint | null; paidMinor: bigint | null }) => (statement.totalMinor ?? 0n) - (statement.paidMinor ?? 0n)

/** Applies a settled payment to its statement, once. */
async function settle(uow: UnitOfWork, actor: Actor, paymentId: string, providerRef?: string | null) {
  await lockRow(uow.tx, 'Payment', paymentId)
  const payment = await uow.tx.payment.findUniqueOrThrow({ where: { id: paymentId } })
  if (payment.status === 'succeeded') return { settled: false, paymentId }
  if (!['pending', 'unknown'].includes(payment.status)) throw new DomainError(Codes.GUARD_FAILED, `This payment is ${payment.status} and cannot be marked paid.`)
  await casUpdate(uow, { model: 'Payment', id: payment.id, version: payment.version, from: [payment.status], to: 'succeeded', actor, eventType: 'payment.succeeded', data: { settledAt: uow.now, ...(providerRef ? { providerRef } : {}) } })
  if (payment.statementId) {
    await lockRow(uow.tx, 'Statement', payment.statementId)
    const statement = await uow.tx.statement.findUniqueOrThrow({ where: { id: payment.statementId } })
    const apply = payment.amountMinor < balanceOf(statement) ? payment.amountMinor : balanceOf(statement) > 0n ? balanceOf(statement) : 0n
    if (apply > 0n) {
      await uow.tx.paymentAllocation.create({ data: { communityId: payment.communityId, residentId: payment.residentId, paymentId: payment.id, statementId: statement.id, amountMinor: apply, appliedAt: uow.now } })
      const paid = (statement.paidMinor ?? 0n) + apply
      await uow.tx.statement.update({ where: { id: statement.id }, data: { paidMinor: paid, status: paid >= (statement.totalMinor ?? 0n) ? 'paid' : statement.status, version: { increment: 1 } } })
    }
  }
  return { settled: true, paymentId }
}

async function newPayment(uow: UnitOfWork, actor: Actor, a: { statementId: string; method: string; amountMinor: bigint; tokenId?: string | null; autopay?: boolean; reference?: string; status: 'pending' | 'succeeded' }) {
  const statement = await uow.tx.statement.findUnique({ where: { id: a.statementId } })
  if (!statement) throw new DomainError(Codes.NOT_FOUND, 'Statement not found.')
  await lockRow(uow.tx, 'Statement', statement.id)
  const fresh = await uow.tx.statement.findUniqueOrThrow({ where: { id: statement.id } })
  if (fresh.status === 'void') throw new DomainError(Codes.GUARD_FAILED, 'This statement was voided.')
  const balance = balanceOf(fresh)
  if (balance <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'This statement is already paid.', { reason: 'already_paid' })
  if (a.amountMinor > balance) throw new DomainError(Codes.GUARD_FAILED, 'That is more than the statement balance.', { reason: 'overpayment' })
  // Every payment carries its own key from birth: the column is unique, so a blank default could only ever be used once.
  const id = randomUUID()
  const created = await uow.tx.payment.create({
    data: {
      id, idempotencyKey: `sc-pay-${id}`, communityId: fresh.communityId, residentId: fresh.residentId, statementId: fresh.id, method: a.method, status: 'pending', amountMinor: a.amountMinor, currency: CURRENCY,
      reference: a.reference || (await nextReference(uow.tx, 'PAY', uow.now, 6)), autopay: a.autopay === true, tokenId: a.tokenId ?? null, initiatedById: actorUserId(actor), initiatedAt: uow.now,
    },
  })
  auditCreate(uow, actor, 'Payment', created.id, 'payment.created', { method: a.method, amountMinor: a.amountMinor.toString(), statement: fresh.number })
  return created
}

/** Cash, check or other tender someone received. It is final the moment it is recorded. */
export async function recordHandPayment(uow: UnitOfWork, actor: Actor, input: { statementId: string; method: (typeof HAND_METHODS)[number] | 'deposit'; amountMinor: bigint; reference?: string }) {
  const amount = positive(input.amountMinor, 'amount')
  const payment = await newPayment(uow, actor, { statementId: input.statementId, method: input.method, amountMinor: amount, reference: input.reference, status: 'pending' })
  await settle(uow, actor, payment.id)
  const statement = await uow.tx.statement.findUniqueOrThrow({ where: { id: input.statementId }, select: { status: true, totalMinor: true, paidMinor: true } })
  return { paymentId: payment.id, status: 'succeeded', statementStatus: statement.status, balanceMinor: balanceOf(statement).toString() }
}

/** A held deposit applied to a statement. */
export async function applyDeposit(uow: UnitOfWork, actor: Actor, input: { depositId: string; statementId: string }) {
  await lockRow(uow.tx, 'Deposit', input.depositId)
  const deposit = await uow.tx.deposit.findUnique({ where: { id: input.depositId } })
  if (!deposit) throw new DomainError(Codes.NOT_FOUND, 'Deposit not found.')
  if (deposit.status !== 'held') throw new DomainError(Codes.GUARD_FAILED, `This deposit is ${deposit.status}.`)
  const statement = await uow.tx.statement.findUnique({ where: { id: input.statementId }, select: { residentId: true, totalMinor: true, paidMinor: true } })
  if (!statement || statement.residentId !== deposit.residentId) throw new DomainError(Codes.NOT_FOUND, 'Statement not found for this resident.')
  const amount = deposit.amountMinor < balanceOf(statement) ? deposit.amountMinor : balanceOf(statement)
  if (amount <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'There is nothing to apply the deposit to.')
  const payment = await newPayment(uow, actor, { statementId: input.statementId, method: 'deposit', amountMinor: amount, status: 'pending' })
  await settle(uow, actor, payment.id)
  // The whole deposit is applied or kept: a partial use would leave an unexplained remainder.
  if (amount !== deposit.amountMinor) throw new DomainError(Codes.GUARD_FAILED, 'The deposit is larger than the balance. Refund the difference first or apply it to a larger statement.', { reason: 'deposit_larger_than_balance' })
  await casUpdate(uow, { model: 'Deposit', id: deposit.id, version: deposit.version, from: ['held'], to: 'applied', actor, eventType: 'deposit.applied', data: { appliedPaymentId: payment.id, resolvedAt: uow.now } })
  return { paymentId: payment.id }
}

/** Step 1 of a card or ACH charge: record the intent and commit. One in flight per statement. */
async function recordIntent(db: Db, actor: Actor, input: { statementId: string; method: 'card' | 'ach'; amountMinor: bigint; tokenId: string; autopay: boolean; key: string }) {
  return command(db, { name: 'payment.charge.start', actor, idempotencyKey: input.key, params: { ...input, amountMinor: input.amountMinor.toString() } }, async uow => {
    const open = await uow.tx.payment.findFirst({ where: { statementId: input.statementId, method: { in: ['card', 'ach'] }, status: { in: ['pending', 'unknown'] } }, select: { reference: true } })
    if (open) throw new DomainError(Codes.GUARD_FAILED, `Payment ${open.reference} has no final answer yet. Use "Check status" on it before charging again.`, { reason: 'charge_in_flight' })
    const token = await uow.tx.paymentMethodToken.findUnique({ where: { id: input.tokenId } })
    const statement = await uow.tx.statement.findUnique({ where: { id: input.statementId }, select: { residentId: true } })
    if (!token || token.status !== 'active' || token.residentId !== statement?.residentId) throw new DomainError(Codes.NOT_FOUND, 'That saved payment method is not available for this resident.')
    const payment = await newPayment(uow, actor, { statementId: input.statementId, method: input.method, amountMinor: input.amountMinor, tokenId: token.id, autopay: input.autopay, status: 'pending' })
    // The key is derived from the payment, so a second click can never reach the processor under a new key.
    const idempotencyKey = `sc-pay-${payment.id}`
    await uow.tx.payment.update({ where: { id: payment.id }, data: { idempotencyKey } })
    return { paymentId: payment.id, reference: payment.reference, idempotencyKey, token: token.token }
  })
}

async function recordOutcome(db: Db, actor: Actor, paymentId: string, result: ChargeResult, key: string) {
  const done = await command(db, { name: 'payment.charge.result', actor, idempotencyKey: key, params: { paymentId, outcome: result.outcome, providerRef: result.providerRef } }, async uow => {
    await lockRow(uow.tx, 'Payment', paymentId)
    const payment = await uow.tx.payment.findUniqueOrThrow({ where: { id: paymentId } })
    if (payment.status === 'succeeded') return { paymentId, status: 'succeeded', message: 'Paid.' }
    // A decline is final for that key.
    if (payment.status === 'failed') return { paymentId, status: 'failed', message: payment.failureCode || 'The payment failed.' }
    const ref = result.providerRef ?? ''
    if (result.outcome === 'succeeded') {
      await settle(uow, actor, paymentId, ref || null)
      return { paymentId, status: 'succeeded', message: result.message }
    }
    if (result.outcome === 'failed') {
      await casUpdate(uow, { model: 'Payment', id: payment.id, version: payment.version, from: [payment.status], to: 'failed', actor, eventType: 'payment.failed', data: { failureCode: result.message.slice(0, 200), lastCheckedAt: uow.now, ...(ref ? { providerRef: ref } : {}) } })
      return { paymentId, status: 'failed', message: result.message }
    }
    if (result.outcome === 'unknown') {
      if (payment.status === 'pending') await casUpdate(uow, { model: 'Payment', id: payment.id, version: payment.version, from: ['pending'], to: 'unknown', actor, eventType: 'payment.unknown', data: { lastCheckedAt: uow.now, ...(ref ? { providerRef: ref } : {}) } })
      else await uow.tx.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: uow.now, ...(ref && !payment.providerRef ? { providerRef: ref } : {}) } })
      return { paymentId, status: 'unknown', message: result.message }
    }
    // requires_action or processing: still open. Keep the reference so "Check status" can read it.
    if (payment.status === 'unknown') await casUpdate(uow, { model: 'Payment', id: payment.id, version: payment.version, from: ['unknown'], to: 'pending', actor, eventType: 'payment.pending', data: { lastCheckedAt: uow.now, ...(ref ? { providerRef: ref } : {}) } })
    else if (ref && !payment.providerRef) await uow.tx.payment.update({ where: { id: payment.id }, data: { providerRef: ref, lastCheckedAt: uow.now } })
    return { paymentId, status: 'pending', message: result.message }
  })
  return done.value
}

/** Charges a saved card or bank account (Stripe test). Call it once per click; the key makes a repeat harmless. */
export async function chargeStatement(db: Db, actor: Actor, input: { statementId: string; method: 'card' | 'ach'; amountMinor: bigint; tokenId: string; autopay?: boolean; idempotencyKey: string }) {
  const amount = positive(input.amountMinor, 'amount')
  if (!processorReady()) throw new DomainError(Codes.GUARD_FAILED, 'Card payments are not set up on this server. Record the payment by hand.', { reason: 'no_processor' })
  const started = await recordIntent(db, actor, { statementId: input.statementId, method: input.method, amountMinor: amount, tokenId: input.tokenId, autopay: input.autopay === true, key: input.idempotencyKey })
  if (started.replay) {
    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.value.paymentId }, select: { id: true, status: true } })
    return { replay: true, paymentId: payment.id, status: payment.status, message: '' }
  }
  const result = await adapter().charge({
    amountMinor: amount, currencyCode: CURRENCY, idempotencyKey: started.value.idempotencyKey, description: `Statement payment ${started.value.reference}`,
    metadata: { payment: started.value.paymentId }, paymentMethod: started.value.token,
  })
  return { replay: false, ...(await recordOutcome(db, actor, started.value.paymentId, result, `${input.idempotencyKey}:result`)) }
}

/** "Check status": asks the processor what happened. It only reads; it never creates a charge. */
export async function checkPaymentStatus(db: Db, actor: Actor, paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
  if (!['pending', 'unknown'].includes(payment.status) || !['card', 'ach'].includes(payment.method)) return { paymentId, status: payment.status, message: 'Nothing to check.' }
  const result = await adapter().resolve({ amountMinor: payment.amountMinor, currencyCode: payment.currency || CURRENCY, idempotencyKey: payment.idempotencyKey, description: `Statement payment ${payment.reference}`, metadata: { payment: payment.id }, providerRef: payment.providerRef || null })
  return recordOutcome(db, actor, payment.id, result, `resolve:${payment.id}:${result.outcome}:${result.providerRef ?? ''}`)
}

/** A processor event. Recorded once by its own id; a replay changes nothing. */
export async function applyPaymentEvent(db: Db, actor: Actor, event: { id: string; type: string; objectRef: string; outcome: string }) {
  const done = await command(db, { name: 'payment.webhook', actor, idempotencyKey: `webhook:${event.id}`, params: event }, async uow => {
    const seen = await uow.tx.paymentEvent.findFirst({ where: { providerEventId: event.id }, select: { id: true } })
    if (seen) return { duplicate: true }
    const payment = event.objectRef ? await uow.tx.payment.findFirst({ where: { providerRef: event.objectRef }, select: { id: true, status: true } }) : null
    await uow.tx.paymentEvent.create({ data: { communityId: null, providerEventId: event.id, type: event.type, paymentId: payment?.id ?? null, outcome: event.outcome, receivedAt: uow.now } })
    if (payment && event.outcome === 'succeeded' && ['pending', 'unknown'].includes(payment.status)) await settle(uow, actor, payment.id, event.objectRef)
    else if (payment && event.outcome === 'failed' && ['pending', 'unknown'].includes(payment.status)) {
      const row = await uow.tx.payment.findUniqueOrThrow({ where: { id: payment.id } })
      await casUpdate(uow, { model: 'Payment', id: row.id, version: row.version, from: [row.status], to: 'failed', actor, eventType: 'payment.failed', data: { failureCode: 'The processor reported a failure.', lastCheckedAt: uow.now } })
    }
    return { duplicate: false }
  })
  return { duplicate: done.replay || (done.value as { duplicate: boolean }).duplicate === true }
}

/* ---- Refunds -------------------------------------------------------------------------------------------------- */

/** A refund of a settled payment or a held deposit. Over the threshold it waits for a second person. */
export async function requestRefund(uow: UnitOfWork, actor: Actor, input: { paymentId?: string | null; depositId?: string | null; amountMinor: bigint; reason: string }) {
  const amount = positive(input.amountMinor, 'amount')
  if (!input.reason.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the refund is needed.', { field: 'reason' })
  if (Boolean(input.paymentId) === Boolean(input.depositId)) throw new DomainError(Codes.INVALID_INPUT, 'Refund either a payment or a deposit.')
  let residentId: string | null
  let communityId: string | null
  if (input.paymentId) {
    await lockRow(uow.tx, 'Payment', input.paymentId)
    const payment = await uow.tx.payment.findUnique({ where: { id: input.paymentId } })
    if (!payment || payment.status !== 'succeeded') throw new DomainError(Codes.GUARD_FAILED, 'Only a settled payment can be refunded.')
    const refunded = await uow.tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ['requested', 'pending_approval', 'issued'] } }, _sum: { amountMinor: true } })
    if (amount + (refunded._sum.amountMinor ?? 0n) > payment.amountMinor) throw new DomainError(Codes.GUARD_FAILED, 'That is more than was paid, counting earlier refunds.', { reason: 'over_refund' })
    residentId = payment.residentId
    communityId = payment.communityId
  } else {
    await lockRow(uow.tx, 'Deposit', input.depositId!)
    const deposit = await uow.tx.deposit.findUnique({ where: { id: input.depositId! } })
    if (!deposit || deposit.status !== 'held') throw new DomainError(Codes.GUARD_FAILED, 'Only a held deposit can be refunded.')
    if (amount !== deposit.amountMinor) throw new DomainError(Codes.GUARD_FAILED, 'A deposit is refunded in full.', { reason: 'partial_deposit_refund' })
    const open = await uow.tx.refund.findFirst({ where: { depositId: deposit.id, status: { in: ['requested', 'pending_approval', 'issued'] } }, select: { id: true } })
    if (open) throw new DomainError(Codes.GUARD_FAILED, 'This deposit already has a refund.', { reason: 'over_refund' })
    residentId = deposit.residentId
    communityId = deposit.communityId
  }
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { refundApprovalThresholdMinor: true } })
  const threshold = settings?.refundApprovalThresholdMinor ?? null
  const needsApproval = threshold !== null && amount >= threshold
  const refund = await uow.tx.refund.create({
    data: { communityId, residentId, paymentId: input.paymentId ?? null, depositId: input.depositId ?? null, amountMinor: amount, reason: input.reason.trim(), status: needsApproval ? 'pending_approval' : 'requested', requestedById: actorUserId(actor) },
  })
  auditCreate(uow, actor, 'Refund', refund.id, 'refund.requested', { amountMinor: amount.toString(), needsApproval })
  if (!needsApproval) return { refundId: refund.id, status: refund.status, approvalRequestId: null }
  const approval = await requestApproval(uow, actor, { action: 'refund.issue', targetList: 'Refund', targetId: refund.id, payload: { refundId: refund.id, amountMinor: amount.toString() }, requiredPermission: 'canIssueRefunds', summary: `Refund ${amount.toString()} minor units: ${input.reason.trim().slice(0, 80)}`, communityId })
  await uow.tx.refund.update({ where: { id: refund.id }, data: { approvalId: approval.id } })
  return { refundId: refund.id, status: 'pending_approval', approvalRequestId: approval.id }
}

/**
 * Pays a refund out. A card payment goes back through the processor (idempotent by refund id); the statement's paid total is
 * NOT reduced: a refund never reopens a paid statement.
 */
export async function issueRefund(db: Db, actor: Actor, refundId: string) {
  const refund = await db.refund.findUnique({ where: { id: refundId }, include: { payment: true } })
  if (!refund) throw new DomainError(Codes.NOT_FOUND, 'Refund not found.')
  if (refund.status === 'issued') return { refundId, status: 'issued', refundRef: refund.refundRef }
  let ref = `manual-${refund.id.slice(-10)}`
  if (refund.payment && ['card', 'ach'].includes(refund.payment.method)) {
    const result = await adapter().refund({ providerRef: refund.payment.providerRef, amountMinor: refund.amountMinor, idempotencyKey: `sc-refund-${refund.id}`, reason: refund.reason })
    if (result.outcome === 'unknown') throw new DomainError(Codes.GUARD_FAILED, 'The processor did not confirm the refund. Try again; it will not be sent twice.', { reason: 'refund_unknown' })
    if (result.outcome === 'failed') throw new DomainError(Codes.GUARD_FAILED, result.message, { reason: 'refund_failed' })
    ref = result.providerRef ?? ref
  }
  const done = await command(db, { name: 'refund.issue', actor, idempotencyKey: `refund-issue:${refund.id}`, params: { refundId } }, async uow => {
    await lockRow(uow.tx, 'Refund', refundId)
    const row = await uow.tx.refund.findUniqueOrThrow({ where: { id: refundId } })
    if (row.status === 'issued') return { refundId, status: 'issued', refundRef: row.refundRef }
    if (row.status === 'pending_approval') {
      if (!row.approvalId) throw new DomainError(Codes.APPROVAL_REQUIRED, 'This refund needs a second person to approve it.')
      await consumeApproval(uow, { requestId: row.approvalId, action: 'refund.issue', targetList: 'Refund', targetId: row.id, payload: { refundId: row.id, amountMinor: row.amountMinor.toString() } })
    }
    await casUpdate(uow, { model: 'Refund', id: row.id, version: row.version, from: [row.status], to: 'issued', actor, eventType: 'refund.issued', data: { refundRef: ref, issuedAt: uow.now } })
    if (row.depositId) {
      const deposit = await uow.tx.deposit.findUniqueOrThrow({ where: { id: row.depositId } })
      await casUpdate(uow, { model: 'Deposit', id: deposit.id, version: deposit.version, from: ['held'], to: 'refunded', actor, eventType: 'deposit.refunded', data: { resolvedAt: uow.now } })
    }
    return { refundId, status: 'issued', refundRef: ref }
  })
  return done.value
}

/* ---- Autopay (a staff button in the close, never a runner) ---------------------------------------------------- */

/** Charges the stored autopay token of every unpaid statement in a period. One command per statement; safe to press twice. */
export async function chargeAutopayForPeriod(db: Db, actor: Actor, input: { periodId: string }) {
  const statements = await db.statement.findMany({ where: { periodId: input.periodId, status: 'issued' }, select: { id: true, residentId: true, totalMinor: true, paidMinor: true }, orderBy: { number: 'asc' } })
  const results: { statementId: string; status: string }[] = []
  for (const statement of statements) {
    const balance = balanceOf(statement)
    if (balance <= 0n || !statement.residentId) continue
    const token = await db.paymentMethodToken.findFirst({ where: { residentId: statement.residentId, autopay: true, status: 'active' }, orderBy: { createdAt: 'asc' } })
    if (!token) continue
    const open = await db.payment.findFirst({ where: { statementId: statement.id, method: { in: ['card', 'ach'] }, status: { in: ['pending', 'unknown'] } }, select: { id: true } })
    if (open) { results.push({ statementId: statement.id, status: 'in_flight' }); continue }
    const prior = await db.payment.count({ where: { statementId: statement.id, autopay: true, status: 'failed' } })
    // A decline is final: autopay does not retry it. Staff retry by hand.
    if (prior > 0) { results.push({ statementId: statement.id, status: 'declined_earlier' }); continue }
    const out = await chargeStatement(db, actor, { statementId: statement.id, method: token.provider === 'ach' ? 'ach' : 'card', amountMinor: balance, tokenId: token.id, autopay: true, idempotencyKey: `autopay:${input.periodId}:${statement.id}` })
    results.push({ statementId: statement.id, status: out.status })
  }
  return { charged: results.length, results }
}
