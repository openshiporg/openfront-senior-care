import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays } from '../lib/calendar'
import { assertBalanced, assertHistoricalMinimumBalances, bankControlBalance, linesFor, residentBalance, reconcile, reverseLines, TrustLedgerError, type TrustLine } from './ledger'
import { conveyanceClock } from './service'

/** Exit gate 3: trust lines always balance; no resident ledger is ever negative at any historical point; the reconciliation ties. */

const START = '2026-01-01'
const LEDGERS = ['L1', 'L2', 'L3']
const money = fc.bigInt({ min: 1n, max: 10_000_000_000_000n })
const op = fc.record({ ledger: fc.constantFrom(...LEDGERS), kind: fc.constantFrom('deposit', 'withdrawal', 'interest', 'reverse'), amount: money, day: fc.integer({ min: 0, max: 60 }), pick: fc.nat() })

type Tx = { id: number; lines: TrustLine[]; reversed: boolean; reversal: boolean }

/** Applies a random sequence of operations the way the service does: a rejected one changes nothing. */
function run(ops: { ledger: string; kind: string; amount: bigint; day: number; pick: number }[]) {
  const txs: Tx[] = []
  const all = () => txs.flatMap(tx => tx.lines)
  let rejected = 0
  for (const o of ops) {
    const on = addDays(START, o.day)
    let lines: TrustLine[]
    let reversalOf: Tx | null = null
    if (o.kind === 'reverse') {
      const candidates = txs.filter(tx => !tx.reversed && !tx.reversal)
      if (!candidates.length) continue
      reversalOf = candidates[o.pick % candidates.length]
      lines = reverseLines(reversalOf.lines, addDays(START, Math.max(o.day, 0)))
    } else {
      lines = linesFor(o.kind as 'deposit' | 'withdrawal' | 'interest', { ledgerId: o.ledger, amountMinor: o.amount, effectiveOn: on })
    }
    try {
      assertBalanced(lines)
      assertHistoricalMinimumBalances(all(), lines)
    } catch (error) {
      if (!(error instanceof TrustLedgerError)) throw error
      rejected += 1
      continue
    }
    if (reversalOf) reversalOf.reversed = true
    txs.push({ id: txs.length, lines, reversed: false, reversal: reversalOf !== null })
  }
  return { txs, all: all(), rejected }
}

const balancesByDay = (lines: TrustLine[], ledger: string) => {
  const days = [...new Set(lines.map(l => l.effectiveOn))].sort()
  return days.map(d => residentBalance(lines, ledger, d))
}

describe('trust ledger properties', () => {
  it('every accepted transaction balances: debits equal credits', () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 60 }), ops => {
      for (const tx of run(ops).txs) {
        const debit = tx.lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amountMinor, 0n)
        const credit = tx.lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amountMinor, 0n)
        expect(debit).toBe(credit)
      }
    }), { numRuns: 300 })
  })

  it('no resident ledger is negative at any historical point, even with back-dated entries and reversals', () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 80 }), ops => {
      const { all } = run(ops)
      for (const ledger of LEDGERS) for (const balance of balancesByDay(all, ledger)) expect(balance >= 0n).toBe(true)
    }), { numRuns: 400 })
  })

  it('the reconciliation ties: bank = bank-control book = the sum of every resident ledger, at every date', () => {
    fc.assert(fc.property(fc.array(op, { maxLength: 80 }), ops => {
      const { all } = run(ops)
      const dates = [...new Set(all.map(l => l.effectiveOn))].sort()
      for (const asOf of [...dates, undefined]) {
        const book = bankControlBalance(all, asOf)
        // The bank statement says exactly what the book says: it ties and the three figures agree.
        const result = reconcile(all, book, asOf)
        expect(result.tied).toBe(true)
        expect(result.bookBalanceMinor).toBe(result.residentTotalMinor)
        expect(result.residentTotalMinor).toBe(LEDGERS.reduce((s, l) => s + residentBalance(all, l, asOf), 0n))
        // A bank figure that differs by even one cent does not tie.
        expect(reconcile(all, book + 1n, asOf).tied).toBe(false)
      }
    }), { numRuns: 300 })
  })

  it('a reversal restores the balance and leaves the original lines untouched', () => {
    fc.assert(fc.property(money, fc.integer({ min: 0, max: 20 }), (amount, d) => {
      const deposit = linesFor('deposit', { ledgerId: 'L1', amountMinor: amount, effectiveOn: addDays(START, d) })
      const back = reverseLines(deposit, addDays(START, d + 1))
      expect(residentBalance([...deposit, ...back], 'L1')).toBe(0n)
      expect(deposit[0].side).toBe('debit')
    }))
  })

  it('refuses a back-dated withdrawal that would have overdrawn a day that already passed', () => {
    const deposit = linesFor('deposit', { ledgerId: 'L1', amountMinor: 1_000n, effectiveOn: '2026-02-10' })
    const early = linesFor('withdrawal', { ledgerId: 'L1', amountMinor: 1n, effectiveOn: '2026-02-01' })
    expect(() => assertHistoricalMinimumBalances(deposit, early)).toThrow(/short on 2026-02-01/)
    const fine = linesFor('withdrawal', { ledgerId: 'L1', amountMinor: 1_000n, effectiveOn: '2026-02-10' })
    expect(() => assertHistoricalMinimumBalances(deposit, fine)).not.toThrow()
  })

  it('handles amounts beyond 32 bits exactly', () => {
    const big = 9_007_199_254_740_993n
    const lines = linesFor('deposit', { ledgerId: 'L1', amountMinor: big, effectiveOn: START })
    expect(residentBalance(lines, 'L1')).toBe(big)
    expect(bankControlBalance(lines)).toBe(big)
  })

  it('rejects unbalanced, zero, or misattributed lines', () => {
    const ok = linesFor('deposit', { ledgerId: 'L1', amountMinor: 5n, effectiveOn: START })
    expect(() => assertBalanced([ok[0], { ...ok[1], amountMinor: 4n }])).toThrow(/debits must equal credits/)
    expect(() => assertBalanced([ok[0], { ...ok[1], amountMinor: 0n }])).toThrow(/positive/)
    expect(() => assertBalanced([ok[0], { ...ok[1], ledgerId: null }])).toThrow(/resident ledger/)
  })
})

describe('conveyance clock is computed on read', () => {
  it('is due for 30 days after the ledger closed with money held, then overdue, and done once conveyed', () => {
    const closed = { status: 'closed', closedOn: '2026-10-01', balanceMinor: 5_000n }
    expect(conveyanceClock({ ...closed, today: '2026-10-31' })).toMatchObject({ state: 'due', dueBy: '2026-10-31', daysLeft: 0 })
    expect(conveyanceClock({ ...closed, today: '2026-11-01' })).toMatchObject({ state: 'overdue', daysLeft: -1 })
    expect(conveyanceClock({ ...closed, status: 'conveyed', today: '2026-11-05' }).state).toBe('done')
    expect(conveyanceClock({ ...closed, balanceMinor: 0n, today: '2026-11-05' }).state).toBe('done')
    expect(conveyanceClock({ status: 'open', closedOn: null, balanceMinor: 5n, today: '2026-11-05' }).state).toBe('not_due')
  })
})
