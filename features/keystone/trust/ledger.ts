/**
 * Resident trust ledger arithmetic (SCHEMA §11, STATE-MACHINES §13). Pure: no database, BigInt minor units only.
 * Widened from the law-firm donor (`assertTrustLedgerHistoricalMinimumBalances`): amounts are BigInt, not 32-bit integers.
 *
 * Every transaction is a set of lines whose debits equal its credits. A resident's balance is the sum of their
 * client_liability lines (credit − debit); the bank-control balance is its debit − credit. A correction is a reversing
 * transaction, never an edit.
 */

export type TrustBucket = 'bank_control' | 'client_liability' | 'bank_fee' | 'suspense'
export type TrustSide = 'debit' | 'credit'
export type TrustKind = 'deposit' | 'withdrawal' | 'interest' | 'bank_fee' | 'reversal' | 'conveyance'

export type TrustLine = { ledgerId: string | null; bucket: TrustBucket; side: TrustSide; amountMinor: bigint; effectiveOn: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const BUCKETS: ReadonlySet<string> = new Set(['bank_control', 'client_liability', 'bank_fee', 'suspense'])

export class TrustLedgerError extends Error {
  constructor(message: string, readonly reason: 'unbalanced' | 'overdrawn' | 'invalid') {
    super(message)
  }
}

/** Debits must equal credits, every amount is positive, and a client line names its ledger (and only a client line does). */
export function assertBalanced(lines: readonly TrustLine[]) {
  if (lines.length < 2) throw new TrustLedgerError('A trust transaction needs at least two lines.', 'invalid')
  let debit = 0n
  let credit = 0n
  for (const line of lines) {
    if (typeof line.amountMinor !== 'bigint' || line.amountMinor <= 0n) throw new TrustLedgerError('Every trust line needs a positive amount.', 'invalid')
    if (!BUCKETS.has(line.bucket)) throw new TrustLedgerError('Unknown trust bucket.', 'invalid')
    if (!DATE.test(line.effectiveOn)) throw new TrustLedgerError('Every trust line needs a date.', 'invalid')
    if ((line.bucket === 'client_liability') !== Boolean(line.ledgerId)) throw new TrustLedgerError('Only resident lines name a resident ledger, and each one must.', 'invalid')
    if (line.side === 'debit') debit += line.amountMinor
    else if (line.side === 'credit') credit += line.amountMinor
    else throw new TrustLedgerError('A trust line is a debit or a credit.', 'invalid')
  }
  if (debit !== credit) throw new TrustLedgerError('Trust debits must equal credits.', 'unbalanced')
}

/** The lines of one business event. Money in raises the resident's liability and the bank balance; money out lowers both. */
export function linesFor(kind: Exclude<TrustKind, 'reversal'>, input: { ledgerId: string; amountMinor: bigint; effectiveOn: string }): TrustLine[] {
  const { ledgerId, amountMinor, effectiveOn } = input
  const inbound = kind === 'deposit' || kind === 'interest'
  return [
    { ledgerId: null, bucket: 'bank_control', side: inbound ? 'debit' : 'credit', amountMinor, effectiveOn },
    { ledgerId, bucket: 'client_liability', side: inbound ? 'credit' : 'debit', amountMinor, effectiveOn },
  ]
}

/** A reversal mirrors the original lines with the sides swapped, on the date given. */
export const reverseLines = (lines: readonly TrustLine[], effectiveOn: string): TrustLine[] =>
  lines.map(line => ({ ...line, side: line.side === 'debit' ? 'credit' : 'debit', effectiveOn }))

/** A resident's balance: credits less debits on their client lines, as of a date (inclusive) or all time. */
export function residentBalance(lines: readonly TrustLine[], ledgerId: string, asOf?: string) {
  let balance = 0n
  for (const line of lines) {
    if (line.bucket !== 'client_liability' || line.ledgerId !== ledgerId) continue
    if (asOf && line.effectiveOn > asOf) continue
    balance += line.side === 'credit' ? line.amountMinor : -line.amountMinor
  }
  return balance
}

export function bankControlBalance(lines: readonly TrustLine[], asOf?: string) {
  let balance = 0n
  for (const line of lines) {
    if (line.bucket !== 'bank_control') continue
    if (asOf && line.effectiveOn > asOf) continue
    balance += line.side === 'debit' ? line.amountMinor : -line.amountMinor
  }
  return balance
}

/**
 * No resident ledger may be negative at ANY historical date once the proposed lines are in (a back-dated withdrawal can
 * overdraw a day that already passed). Within one date, money in counts before money out.
 */
export function assertHistoricalMinimumBalances(existing: readonly TrustLine[], proposed: readonly TrustLine[]) {
  const byLedger = new Map<string, Map<string, { in: bigint; out: bigint }>>()
  for (const line of [...existing, ...proposed]) {
    if (line.bucket !== 'client_liability' || !line.ledgerId) continue
    const days = byLedger.get(line.ledgerId) ?? new Map<string, { in: bigint; out: bigint }>()
    const day = days.get(line.effectiveOn) ?? { in: 0n, out: 0n }
    if (line.side === 'credit') day.in += line.amountMinor
    else day.out += line.amountMinor
    days.set(line.effectiveOn, day)
    byLedger.set(line.ledgerId, days)
  }
  for (const days of byLedger.values()) {
    let balance = 0n
    for (const date of [...days.keys()].sort()) {
      const day = days.get(date)!
      balance += day.in
      balance -= day.out
      if (balance < 0n) throw new TrustLedgerError(`This would leave the resident's trust ledger short on ${date}.`, 'overdrawn')
    }
  }
}

export type Reconciliation = { bankBalanceMinor: bigint; bookBalanceMinor: bigint; residentTotalMinor: bigint; differenceMinor: bigint; tied: boolean }

/** The three-way tie: the bank statement, the bank-control book balance and the sum of every resident's ledger. */
export function reconcile(lines: readonly TrustLine[], bankBalanceMinor: bigint, asOf?: string): Reconciliation {
  const bookBalanceMinor = bankControlBalance(lines, asOf)
  let residentTotalMinor = 0n
  for (const line of lines) {
    if (line.bucket !== 'client_liability') continue
    if (asOf && line.effectiveOn > asOf) continue
    residentTotalMinor += line.side === 'credit' ? line.amountMinor : -line.amountMinor
  }
  const differenceMinor = bankBalanceMinor - bookBalanceMinor
  return { bankBalanceMinor, bookBalanceMinor, residentTotalMinor, differenceMinor, tied: differenceMinor === 0n && bookBalanceMinor === residentTotalMinor }
}
