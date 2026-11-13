import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { allocateInterest, bondStatus, dailyBalanceSums, quarterEnd, quarterLabel, quarterStart, quarterStatement, resourceAlert, trustRules, type StatementTx } from './extras'
import type { TrustLine } from './ledger'

const credit = (ledgerId: string, amountMinor: bigint, effectiveOn: string): TrustLine => ({ ledgerId, bucket: 'client_liability', side: 'credit', amountMinor, effectiveOn })
const debit = (ledgerId: string, amountMinor: bigint, effectiveOn: string): TrustLine => ({ ledgerId, bucket: 'client_liability', side: 'debit', amountMinor, effectiveOn })

describe('interest allocation', () => {
  it('weights by daily balance over the month', () => {
    const lines = [credit('a', 100_00n, '2026-09-20'), credit('b', 100_00n, '2026-10-16'), debit('a', 50_00n, '2026-10-11'), credit('c', 10_00n, '2026-11-01')]
    const sums = dailyBalanceSums(lines, ['a', 'b', 'c'], '2026-10-01')
    // a: 10 days at $100 then 21 days at $50; b: 16 days at $100; c: nothing until November.
    expect(sums.get('a')).toBe(10n * 100_00n + 21n * 50_00n)
    expect(sums.get('b')).toBe(16n * 100_00n)
    expect(sums.get('c')).toBe(0n)
  })

  it('always shares the interest exactly, never to an empty ledger', () => {
    fc.assert(fc.property(fc.bigInt({ min: 1n, max: 10_000_000n }), fc.array(fc.bigInt({ min: 0n, max: 10_000_000_000n }), { minLength: 1, maxLength: 40 }), (interest, weights) => {
      const map = new Map(weights.map((weight, index) => [`l${String(index).padStart(3, '0')}`, weight]))
      if (![...map.values()].some(weight => weight > 0n)) {
        expect(() => allocateInterest(interest, map)).toThrow()
        return
      }
      const shares = allocateInterest(interest, map)
      expect(shares.reduce((sum, share) => sum + share.amountMinor, 0n)).toBe(interest)
      expect(shares.every(share => share.amountMinor > 0n && (map.get(share.ledgerId) ?? 0n) > 0n)).toBe(true)
    }))
  })

  it('breaks a tie toward the earlier ledger and refuses no interest', () => {
    expect(allocateInterest(1n, new Map([['b', 5n], ['a', 5n]]))).toEqual([{ ledgerId: 'a', weightMinorDays: 5n, amountMinor: 1n }])
    expect(() => allocateInterest(0n, new Map([['a', 1n]]))).toThrow()
  })
})

describe('quarterly statements', () => {
  it('finds the quarter', () => {
    expect(quarterStart('2026-11-12')).toBe('2026-10-01')
    expect(quarterEnd('2026-10-01')).toBe('2026-12-31')
    expect(quarterEnd('2028-01-01')).toBe('2028-03-31')
    expect(quarterLabel('2026-07-01')).toBe('Q3 2026')
  })

  it('opens at the earlier balance and closes at opening + in − out', () => {
    const tx = (reference: string, kind: string, effectiveOn: string, lines: TrustLine[]): StatementTx => ({ reference, kind, purpose: '', effectiveOn, ledgerId: 'a', lines })
    const txs = [
      tx('TR-1', 'deposit', '2026-09-30', [credit('a', 300_00n, '2026-09-30')]),
      tx('TR-3', 'withdrawal', '2026-11-02', [debit('a', 40_00n, '2026-11-02')]),
      tx('TR-2', 'deposit', '2026-10-05', [credit('a', 60_00n, '2026-10-05'), credit('other', 9_99n, '2026-10-05')]),
      tx('TR-4', 'deposit', '2027-01-01', [credit('a', 1_00n, '2027-01-01')]),
    ]
    const out = quarterStatement('a', txs, '2026-10-01')
    expect(out.openingMinor).toBe(300_00n)
    expect(out.inMinor).toBe(60_00n)
    expect(out.outMinor).toBe(40_00n)
    expect(out.closingMinor).toBe(320_00n)
    expect(out.lines.map(line => [line.reference, line.balanceMinor])).toEqual([['TR-2', '36000'], ['TR-3', '32000']])
  })
})

describe('resource alert and bond', () => {
  const rule = { limitMinor: 200_000n, marginMinor: 20_000n }
  it('alerts Medicaid residents near and over the pack limit only', () => {
    expect(resourceAlert(179_999n, true, rule).state).toBe('none')
    expect(resourceAlert(180_000n, true, rule).state).toBe('near_limit')
    expect(resourceAlert(200_000n, true, rule).state).toBe('near_limit')
    expect(resourceAlert(200_001n, true, rule)).toMatchObject({ state: 'over_limit', headroomMinor: -1n })
    expect(resourceAlert(900_000n, false, rule).state).toBe('not_medicaid')
  })

  it('reads the pack rules, with Ohio defaults', () => {
    expect(trustRules({ trustResourceThreshold: { value: { limitMinor: '300000', marginMinor: '1000' } }, trustAuthorisationApproval: { value: { overMinor: '50000' } } })).toEqual({ resource: { limitMinor: 300_000n, marginMinor: 1_000n }, authorisationOverMinor: 50_000n })
    expect(trustRules(null)).toEqual({ resource: { limitMinor: 200_000n, marginMinor: 20_000n }, authorisationOverMinor: 0n })
  })

  it('reads bond coverage', () => {
    expect(bondStatus(null, 5n, '2026-11-12')).toMatchObject({ state: 'missing', shortMinor: 5n })
    expect(bondStatus({ amountMinor: 100n, expiresOn: '2026-11-11' }, 5n, '2026-11-12').state).toBe('expired')
    expect(bondStatus({ amountMinor: 100n, expiresOn: '2027-11-11' }, 500n, '2026-11-12')).toMatchObject({ state: 'under_covered', shortMinor: 400n })
    expect(bondStatus({ amountMinor: 100n, expiresOn: '2026-12-01' }, 5n, '2026-11-12').state).toBe('renewal_due')
    expect(bondStatus({ amountMinor: 100n, expiresOn: null }, 5n, '2026-11-12').state).toBe('ok')
  })
})
