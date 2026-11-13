import { actorUserId, type Actor } from '../lib/actor'
import { addDays, daysBetween, localDate } from '../lib/calendar'
import { requestApproval, consumeApproval } from '../lib/approval'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { assertBalanced, assertHistoricalMinimumBalances, linesFor, reconcile, reverseLines, TrustLedgerError, type TrustLine } from './ledger'
import { assertAuthorised } from './authorisation'
import { quarterEnd } from './extras'

/**
 * Resident trust (STATE-MACHINES §13). Money is BigInt minor units; every ledger is append-only; a balance is the sum of
 * lines; a correction is a reversing transaction. A withdrawal over the community threshold is prepared by one person and
 * signed by a different one: the preparer is never the signer (checked here, by the approval, and by a database CHECK).
 */

export const CONVEYANCE_DAYS = 30

const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '')
const day = (date: string) => new Date(`${date}T00:00:00Z`)
const asDomain = (error: unknown): never => {
  if (error instanceof TrustLedgerError) throw new DomainError(error.reason === 'overdrawn' ? Codes.GUARD_FAILED : Codes.INVALID_INPUT, error.message, { reason: error.reason })
  throw error
}

export async function linesOfAccount(tx: Tx, accountId: string): Promise<TrustLine[]> {
  const rows = await tx.trustLedgerLine.findMany({ where: { accountId }, select: { ledgerId: true, bucket: true, side: true, amountMinor: true, effectiveOn: true } })
  return rows.map(row => ({ ledgerId: row.ledgerId, bucket: row.bucket as TrustLine['bucket'], side: row.side as TrustLine['side'], amountMinor: row.amountMinor, effectiveOn: iso(row.effectiveOn) }))
}

export async function openLedger(uow: UnitOfWork, actor: Actor, input: { communityId: string; residentId: string; accountId: string; consentOnFile: boolean }) {
  if (!input.consentOnFile) throw new DomainError(Codes.GUARD_FAILED, 'The resident or their representative must have agreed in writing to hold their money here.', { reason: 'consent_required' })
  const existing = await uow.tx.residentTrustLedger.findFirst({ where: { residentId: input.residentId, accountId: input.accountId, status: 'open' }, select: { id: true } })
  if (existing) return { ledgerId: existing.id, created: false }
  const ledger = await uow.tx.residentTrustLedger.create({ data: { communityId: input.communityId, residentId: input.residentId, accountId: input.accountId, reference: await nextReference(uow.tx, 'TRL', uow.now, 5), status: 'open', consentOnFile: true } })
  auditCreate(uow, actor, 'ResidentTrustLedger', ledger.id, 'trust.ledger_opened', { residentId: input.residentId })
  return { ledgerId: ledger.id, created: true }
}

async function loadLedger(uow: UnitOfWork, ledgerId: string) {
  await lockRow(uow.tx, 'ResidentTrustLedger', ledgerId)
  const ledger = await uow.tx.residentTrustLedger.findUnique({ where: { id: ledgerId } })
  if (!ledger?.accountId) throw new DomainError(Codes.NOT_FOUND, 'Trust ledger not found.')
  // Serialise every posting on one bank account so the historical check reads a stable set of lines.
  await lockRow(uow.tx, 'TrustAccount', ledger.accountId)
  return ledger
}

/** The last day already on a frozen quarterly statement for this ledger (the end of its latest statement's quarter), or null. */
export async function statedThrough(tx: Tx, ledgerId: string) {
  const latest = await tx.trustStatement.findFirst({ where: { ledgerId }, orderBy: { quarter: 'desc' }, select: { quarter: true } })
  return latest?.quarter ? quarterEnd(iso(latest.quarter)) : null
}

/** A quarterly statement is frozen, so nothing may be dated into a quarter it already covers: the entry is dated today instead. */
export async function assertNotStated(tx: Tx, ledgerId: string, on: string) {
  const through = await statedThrough(tx, ledgerId)
  if (through && on <= through) throw new DomainError(Codes.GUARD_FAILED, `That quarter's statement is already made (through ${through}); date it today.`, { reason: 'quarter_stated', field: 'effectiveOn' })
}

async function post(uow: UnitOfWork, actor: Actor, tx: { id: string; communityId: string | null; residentId: string | null; ledgerId: string; accountId: string }, lines: TrustLine[]) {
  assertBalanced(lines)
  for (const line of lines) if (line.ledgerId) await assertNotStated(uow.tx, line.ledgerId, line.effectiveOn)
  try {
    assertHistoricalMinimumBalances(await linesOfAccount(uow.tx, tx.accountId), lines)
  } catch (error) {
    asDomain(error)
  }
  await uow.tx.trustLedgerLine.createMany({
    data: lines.map(line => ({ communityId: tx.communityId, residentId: tx.residentId, transactionId: tx.id, ledgerId: line.ledgerId, accountId: tx.accountId, bucket: line.bucket, side: line.side, amountMinor: line.amountMinor, effectiveOn: day(line.effectiveOn) })),
  })
  auditCreate(uow, actor, 'TrustTransaction', tx.id, 'trust.lines_posted', { lines: lines.length })
}

function checkAmount(amountMinor: bigint) {
  if (typeof amountMinor !== 'bigint' || amountMinor <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The amount must be more than zero.', { field: 'amount' })
}

async function effective(uow: UnitOfWork, communityId: string | null, date?: string | null) {
  const community = communityId ? await uow.tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } }) : null
  const today = localDate(community?.timeZone ?? 'America/New_York', uow.now)
  const on = date || today
  if (on > today) throw new DomainError(Codes.INVALID_INPUT, 'A trust entry cannot be dated in the future.', { field: 'effectiveOn' })
  return on
}

export async function recordDeposit(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; amountMinor: bigint; purpose?: string; effectiveOn?: string | null; kind?: 'deposit' | 'interest' }) {
  checkAmount(input.amountMinor)
  const ledger = await loadLedger(uow, input.ledgerId)
  if (ledger.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, 'This trust ledger is closed.')
  const on = await effective(uow, ledger.communityId, input.effectiveOn)
  const kind = input.kind ?? 'deposit'
  const tx = await uow.tx.trustTransaction.create({
    data: { communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, accountId: ledger.accountId, reference: await nextReference(uow.tx, 'TRX', uow.now, 6), kind, amountMinor: input.amountMinor, purpose: input.purpose ?? '', status: 'posted', preparedById: actorUserId(actor), effectiveOn: day(on), postedAt: uow.now },
  })
  await post(uow, actor, { id: tx.id, communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, accountId: ledger.accountId! }, linesOf(kind, ledger.id, input.amountMinor, on))
  return { transactionId: tx.id, status: 'posted' }
}

const linesOf = (kind: 'deposit' | 'interest' | 'withdrawal' | 'bank_fee' | 'conveyance', ledgerId: string, amountMinor: bigint, effectiveOn: string) =>
  linesFor(kind === 'bank_fee' || kind === 'conveyance' ? 'withdrawal' : kind, { ledgerId, amountMinor, effectiveOn })

/**
 * A withdrawal. At or under the threshold the preparer posts it. Over the threshold it is held as pending_signature with
 * an approval request, and a different person with canApproveTrust signs it (posting happens then).
 */
export async function prepareWithdrawal(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; amountMinor: bigint; purpose: string; effectiveOn?: string | null; conveyance?: boolean }) {
  checkAmount(input.amountMinor)
  if (!input.purpose.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say what the withdrawal is for.', { field: 'purpose' })
  const ledger = await loadLedger(uow, input.ledgerId)
  if (ledger.status !== (input.conveyance ? 'closed' : 'open')) throw new DomainError(Codes.GUARD_FAILED, input.conveyance ? 'Close the ledger first.' : 'This trust ledger is closed.')
  const on = await effective(uow, ledger.communityId, input.effectiveOn)
  await assertNotStated(uow.tx, ledger.id, on)
  // A withdrawal relies on the resident's written authorisation (SM §13.2). Paying out a closed ledger is a legal duty and does not.
  if (!input.conveyance) await assertAuthorised(uow.tx, ledger.id, input.amountMinor)
  // Fail early on a short balance, before anyone is asked to sign.
  try {
    assertHistoricalMinimumBalances(await linesOfAccount(uow.tx, ledger.accountId!), linesOf('withdrawal', ledger.id, input.amountMinor, on))
  } catch (error) {
    asDomain(error)
  }
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { trustApprovalThresholdMinor: true } })
  const threshold = settings?.trustApprovalThresholdMinor ?? 0n
  const needsSecond = input.amountMinor > threshold
  const tx = await uow.tx.trustTransaction.create({
    data: {
      communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, accountId: ledger.accountId, reference: await nextReference(uow.tx, 'TRX', uow.now, 6), kind: input.conveyance ? 'conveyance' : 'withdrawal',
      amountMinor: input.amountMinor, purpose: input.purpose.trim(), status: needsSecond ? 'pending_signature' : 'posted', preparedById: actorUserId(actor), effectiveOn: day(on), postedAt: needsSecond ? null : uow.now,
    },
  })
  if (!needsSecond) {
    await post(uow, actor, { id: tx.id, communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, accountId: ledger.accountId! }, linesOf('withdrawal', ledger.id, input.amountMinor, on))
    if (input.conveyance) await markConveyed(uow, actor, ledger.id, on)
    return { transactionId: tx.id, status: 'posted', approvalRequestId: null }
  }
  const approval = await requestApproval(uow, actor, {
    action: 'trust.withdraw', targetList: 'TrustTransaction', targetId: tx.id, payload: { transactionId: tx.id, ledgerId: ledger.id, amountMinor: input.amountMinor.toString(), effectiveOn: on },
    requiredPermission: 'canApproveTrust', summary: `Trust withdrawal ${input.amountMinor.toString()} minor units: ${input.purpose.trim().slice(0, 80)}`, communityId: ledger.communityId,
  })
  await uow.tx.trustTransaction.update({ where: { id: tx.id }, data: { approvalId: approval.id } })
  auditCreate(uow, actor, 'TrustTransaction', tx.id, 'trust.withdrawal_prepared', { amountMinor: input.amountMinor.toString(), approvalId: approval.id })
  return { transactionId: tx.id, status: 'pending_signature', approvalRequestId: approval.id }
}

/**
 * The second person signs a withdrawal that has already been approved. The signer must not be the preparer, and the
 * approval is consumed against exactly this payload.
 */
export async function signWithdrawal(uow: UnitOfWork, actor: Actor, input: { transactionId: string }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'An agent can propose but never sign.')
  await lockRow(uow.tx, 'TrustTransaction', input.transactionId)
  const tx = await uow.tx.trustTransaction.findUnique({ where: { id: input.transactionId } })
  if (!tx?.ledgerId) throw new DomainError(Codes.NOT_FOUND, 'Trust transaction not found.')
  if (tx.status !== 'pending_signature') throw new DomainError(Codes.INVALID_TRANSITION, `This withdrawal is ${tx.status.replace('_', ' ')}.`)
  if (tx.preparedById === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'The person who prepared a withdrawal cannot sign it.', { reason: 'preparer_is_signer' })
  if (!tx.approvalId) throw new DomainError(Codes.APPROVAL_REQUIRED, 'This withdrawal has no approval request.')
  const ledger = await loadLedger(uow, tx.ledgerId)
  const on = iso(tx.effectiveOn)
  const approved = await consumeApproval(uow, { requestId: tx.approvalId, action: 'trust.withdraw', targetList: 'TrustTransaction', targetId: tx.id, payload: { transactionId: tx.id, ledgerId: ledger.id, amountMinor: tx.amountMinor.toString(), effectiveOn: on } })
  if (approved.approverId && approved.approverId === tx.preparedById) throw new DomainError(Codes.SELF_APPROVAL, 'The person who prepared a withdrawal cannot approve it.', { reason: 'preparer_is_signer' })
  await casUpdate(uow, { model: 'TrustTransaction', id: tx.id, version: tx.version, from: ['pending_signature'], to: 'posted', actor, eventType: 'trust.withdrawal_signed', approverId: approved.approverId, data: { signedById: actor.userId, postedAt: uow.now } })
  await post(uow, actor, { id: tx.id, communityId: tx.communityId, residentId: tx.residentId, ledgerId: ledger.id, accountId: ledger.accountId! }, linesOf('withdrawal', ledger.id, tx.amountMinor, on))
  if (tx.kind === 'conveyance') await markConveyed(uow, actor, ledger.id, on)
  return { transactionId: tx.id, status: 'posted' }
}

async function markConveyed(uow: UnitOfWork, actor: Actor, ledgerId: string, on: string) {
  const ledger = await uow.tx.residentTrustLedger.findUniqueOrThrow({ where: { id: ledgerId } })
  await casUpdate(uow, { model: 'ResidentTrustLedger', id: ledgerId, version: ledger.version, from: ['closed'], to: 'conveyed', actor, eventType: 'trust.ledger_conveyed', data: { conveyedOn: day(on) } })
}

export async function rejectWithdrawal(uow: UnitOfWork, actor: Actor, input: { transactionId: string; reason: string }) {
  await lockRow(uow.tx, 'TrustTransaction', input.transactionId)
  const tx = await uow.tx.trustTransaction.findUnique({ where: { id: input.transactionId } })
  if (!tx) throw new DomainError(Codes.NOT_FOUND, 'Trust transaction not found.')
  await casUpdate(uow, { model: 'TrustTransaction', id: tx.id, version: tx.version, from: ['pending_signature'], to: 'rejected', actor, eventType: 'trust.withdrawal_rejected', reason: input.reason })
  return { transactionId: tx.id, status: 'rejected' }
}

/** A correction: a new transaction that mirrors the original's lines. The original stays exactly as posted. */
export async function reverseTransaction(uow: UnitOfWork, actor: Actor, input: { transactionId: string; reason: string }) {
  if (!input.reason.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why this is being reversed.', { field: 'reason' })
  await lockRow(uow.tx, 'TrustTransaction', input.transactionId)
  const original = await uow.tx.trustTransaction.findUnique({ where: { id: input.transactionId }, include: { lines: true } })
  if (!original?.ledgerId || original.status !== 'posted') throw new DomainError(Codes.GUARD_FAILED, 'Only a posted transaction can be reversed.')
  if (original.kind === 'reversal') throw new DomainError(Codes.GUARD_FAILED, 'A reversal cannot be reversed; post the entry again instead.')
  const already = await uow.tx.trustTransaction.findFirst({ where: { reversesId: original.id }, select: { id: true } })
  if (already) throw new DomainError(Codes.GUARD_FAILED, 'This transaction was already reversed.')
  const ledger = await loadLedger(uow, original.ledgerId)
  const on = await effective(uow, original.communityId, null)
  const reversal = await uow.tx.trustTransaction.create({
    data: { communityId: original.communityId, residentId: original.residentId, ledgerId: original.ledgerId, accountId: original.accountId, reference: await nextReference(uow.tx, 'TRX', uow.now, 6), kind: 'reversal', amountMinor: original.amountMinor, purpose: input.reason.trim(), status: 'posted', preparedById: actorUserId(actor), reversesId: original.id, effectiveOn: day(on), postedAt: uow.now },
  })
  const mirrored = original.lines.map(line => ({ ledgerId: line.ledgerId, bucket: line.bucket as TrustLine['bucket'], side: line.side as TrustLine['side'], amountMinor: line.amountMinor, effectiveOn: iso(line.effectiveOn) }))
  await post(uow, actor, { id: reversal.id, communityId: original.communityId, residentId: original.residentId, ledgerId: ledger.id, accountId: ledger.accountId! }, reverseLines(mirrored, on))
  return { transactionId: reversal.id, reverses: original.id }
}

export async function balanceOfLedger(tx: Tx, ledgerId: string, asOf?: string) {
  const ledger = await tx.residentTrustLedger.findUnique({ where: { id: ledgerId }, select: { accountId: true } })
  if (!ledger?.accountId) throw new DomainError(Codes.NOT_FOUND, 'Trust ledger not found.')
  const lines = (await linesOfAccount(tx, ledger.accountId)).filter(line => line.ledgerId === ledgerId)
  let balance = 0n
  for (const line of lines) if (!asOf || line.effectiveOn <= asOf) balance += line.side === 'credit' ? line.amountMinor : -line.amountMinor
  return balance
}

/** Month-end three-way reconciliation. The bank balance comes from the statement the preparer types in. */
export async function prepareReconciliation(uow: UnitOfWork, actor: Actor, input: { accountId: string; month: string; bankBalanceMinor: bigint }) {
  await lockRow(uow.tx, 'TrustAccount', input.accountId)
  const account = await uow.tx.trustAccount.findUnique({ where: { id: input.accountId } })
  if (!account) throw new DomainError(Codes.NOT_FOUND, 'Trust account not found.')
  const asOf = addDays(input.month, daysInMonth(input.month) - 1)
  const result = reconcile(await linesOfAccount(uow.tx, account.id), input.bankBalanceMinor, asOf)
  const prior = await uow.tx.trustReconciliation.findFirst({ where: { accountId: account.id, month: day(input.month) } })
  if (prior?.status === 'signed') throw new DomainError(Codes.GUARD_FAILED, 'This month is already signed off.')
  const data = {
    communityId: account.communityId, accountId: account.id, month: day(input.month), bankBalanceMinor: result.bankBalanceMinor, bookBalanceMinor: result.bookBalanceMinor, residentTotalMinor: result.residentTotalMinor,
    differenceMinor: result.differenceMinor, status: result.tied ? 'tied' : 'untied', detail: { asOf } as never, preparedById: actorUserId(actor),
  }
  const row = prior
    ? await uow.tx.trustReconciliation.update({ where: { id: prior.id }, data: { ...data, version: { increment: 1 } } })
    : await uow.tx.trustReconciliation.create({ data })
  auditCreate(uow, actor, 'TrustReconciliation', row.id, 'trust.reconciliation_prepared', { tied: result.tied, differenceMinor: result.differenceMinor.toString() })
  return { reconciliationId: row.id, tied: result.tied, ...stringify(result) }
}

export async function signReconciliation(uow: UnitOfWork, actor: Actor, input: { reconciliationId: string }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_CANNOT_APPROVE, 'An agent can propose but never sign.')
  await lockRow(uow.tx, 'TrustReconciliation', input.reconciliationId)
  const row = await uow.tx.trustReconciliation.findUnique({ where: { id: input.reconciliationId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Reconciliation not found.')
  if (row.preparedById === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'The person who prepared a reconciliation cannot sign it.', { reason: 'preparer_is_signer' })
  if (row.status !== 'tied') throw new DomainError(Codes.GUARD_FAILED, 'Only a reconciliation that ties can be signed.', { reason: 'untied' })
  await casUpdate(uow, { model: 'TrustReconciliation', id: row.id, version: row.version, from: ['tied'], to: 'signed', actor, eventType: 'trust.reconciliation_signed', data: { signedById: actor.userId, signedAt: uow.now } })
  return { reconciliationId: row.id, status: 'signed' }
}

const stringify = (r: ReturnType<typeof reconcile>) => ({ bankBalanceMinor: r.bankBalanceMinor.toString(), bookBalanceMinor: r.bookBalanceMinor.toString(), residentTotalMinor: r.residentTotalMinor.toString(), differenceMinor: r.differenceMinor.toString() })
const daysInMonth = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }

/** Closes a ledger when the resident leaves. The balance is then owed to them or their estate, within 30 days. */
export async function closeLedger(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; reason: 'discharge' | 'death' | 'transfer'; closedOn?: string | null }) {
  const ledger = await loadLedger(uow, input.ledgerId)
  const on = await effective(uow, ledger.communityId, input.closedOn)
  await casUpdate(uow, { model: 'ResidentTrustLedger', id: ledger.id, version: ledger.version, from: ['open'], to: 'closed', actor, eventType: 'trust.ledger_closed', data: { closedOn: day(on), closedReason: input.reason } })
  return { ledgerId: ledger.id, closedOn: on, dueBy: addDays(on, CONVEYANCE_DAYS) }
}

/** Pays the remaining balance to the resident or estate. Needs a second signer like any withdrawal. */
export async function conveyBalance(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; conveyedTo: string; effectiveOn?: string | null }) {
  const ledger = await uow.tx.residentTrustLedger.findUnique({ where: { id: input.ledgerId } })
  if (!ledger || ledger.status !== 'closed') throw new DomainError(Codes.GUARD_FAILED, 'Close the ledger first.')
  if (!input.conveyedTo.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Name who the money was paid to.', { field: 'conveyedTo' })
  const balance = await balanceOfLedger(uow.tx, ledger.id)
  if (balance <= 0n) {
    await casUpdate(uow, { model: 'ResidentTrustLedger', id: ledger.id, version: ledger.version, from: ['closed'], to: 'conveyed', actor, eventType: 'trust.ledger_conveyed', data: { conveyedOn: day(await effective(uow, ledger.communityId, input.effectiveOn)), conveyedTo: input.conveyedTo.trim() } })
    return { ledgerId: ledger.id, status: 'conveyed', transactionId: null }
  }
  // Moves through the same maker-checker as any withdrawal; the ledger is marked conveyed when that withdrawal posts.
  await uow.tx.residentTrustLedger.update({ where: { id: ledger.id }, data: { conveyedTo: input.conveyedTo.trim() } })
  const out = await prepareWithdrawal(uow, actor, { ledgerId: ledger.id, amountMinor: balance, purpose: `Conveyed to ${input.conveyedTo.trim()}`, effectiveOn: input.effectiveOn, conveyance: true })
  return { ledgerId: ledger.id, ...out }
}

export type ConveyanceClock = { state: 'not_due' | 'due' | 'overdue' | 'done'; dueBy: string | null; daysLeft: number | null }

/** Computed on read: no timer. Due 30 days after the ledger closed with a balance still held. */
export function conveyanceClock(input: { status: string; closedOn: string | null; balanceMinor: bigint; today: string }): ConveyanceClock {
  if (input.status === 'conveyed' || (input.status === 'closed' && input.balanceMinor <= 0n)) return { state: 'done', dueBy: null, daysLeft: null }
  if (input.status !== 'closed' || !input.closedOn) return { state: 'not_due', dueBy: null, daysLeft: null }
  const dueBy = addDays(input.closedOn, CONVEYANCE_DAYS)
  const left = daysBetween(input.today, dueBy)
  return { state: left < 0 ? 'overdue' : 'due', dueBy, daysLeft: left }
}
