import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMonths, ageing, bucketOf, glCsv, glJournal, instalmentState, planInstalments } from './ar'
import { applicationClocks, pendingAr, scheduleForMonth, pnaStatus, type ScheduleRow } from './medicaidApplication'

describe('payment plan instalments', () => {
  it('always add up to the balance exactly and differ by at most a cent', () => {
    fc.assert(fc.property(fc.bigInt({ min: 24n, max: 10_000_000_000n }), fc.integer({ min: 2, max: 24 }), (total, count) => {
      const rows = planInstalments(total, count, '2026-01-31')
      expect(rows.reduce((sum, row) => sum + row.amountMinor, 0n)).toBe(total)
      const amounts = rows.map(row => row.amountMinor)
      const max = amounts.reduce((a, b) => (a > b ? a : b))
      const min = amounts.reduce((a, b) => (a < b ? a : b))
      expect(max - min <= 1n).toBe(true)
      // The earlier instalments carry the extra cents.
      expect([...amounts].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0))).toEqual(amounts)
    }))
  })

  it('falls due monthly, clamped to the month end', () => {
    expect(planInstalments(100_00n, 3, '2026-01-31').map(row => row.dueOn)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(addMonths('2027-12-15', 2)).toBe('2028-02-15')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
  })

  it('refuses a plan that is not a plan', () => {
    expect(() => planInstalments(0n, 3, '2026-01-01')).toThrow()
    expect(() => planInstalments(100n, 1, '2026-01-01')).toThrow()
    expect(() => planInstalments(100n, 25, '2026-01-01')).toThrow()
    expect(() => planInstalments(2n, 3, '2026-01-01')).toThrow()
  })

  it('reads a declined instalment as declined until someone retries it, never as due again', () => {
    expect(instalmentState({ dueOn: '2026-01-01', paymentStatus: 'failed' }, '2026-03-01')).toBe('declined')
    expect(instalmentState({ dueOn: '2026-01-01', paymentStatus: 'unknown' }, '2026-03-01')).toBe('in_flight')
    expect(instalmentState({ dueOn: '2026-01-01', paymentStatus: 'succeeded' }, '2026-03-01')).toBe('paid')
    expect(instalmentState({ dueOn: '2026-01-01', paymentStatus: null }, '2026-01-02')).toBe('overdue')
    expect(instalmentState({ dueOn: '2026-01-05', paymentStatus: null }, '2026-01-01')).toBe('due')
    expect(instalmentState({ dueOn: '2026-02-05', paymentStatus: null }, '2026-01-01')).toBe('upcoming')
  })
})

describe('collections ageing (computed on read)', () => {
  it('buckets by days past due', () => {
    expect(bucketOf('2026-10-31', '2026-10-31')).toBe('current')
    expect(bucketOf('2026-10-01', '2026-10-31')).toBe('days_1_30')
    expect(bucketOf('2026-09-01', '2026-10-31')).toBe('days_31_60')
    expect(bucketOf('2026-08-02', '2026-10-31')).toBe('days_61_90')
    expect(bucketOf('2026-08-01', '2026-10-31')).toBe('days_over_90')
    expect(bucketOf(null, '2026-10-31')).toBe('current')
  })

  it('totals equal the sum of open balances, after payments and adjustments; paid, void and credit statements drop out', () => {
    const rows = [
      { residentId: 'a', name: 'A', dueOn: '2026-08-01', status: 'issued', totalMinor: 500_000n, paidMinor: 100_000n, adjustedMinor: 50_000n },
      { residentId: 'a', name: 'A', dueOn: '2026-10-15', status: 'issued', totalMinor: 400_000n, paidMinor: 0n, adjustedMinor: 0n, onPlan: true },
      { residentId: 'b', name: 'B', dueOn: '2026-10-15', status: 'paid', totalMinor: 400_000n, paidMinor: 400_000n, adjustedMinor: 0n },
      { residentId: 'c', name: 'C', dueOn: '2026-10-15', status: 'void', totalMinor: 400_000n, paidMinor: 0n, adjustedMinor: 0n },
    ]
    const out = ageing(rows, '2026-10-31')
    expect(out.totalMinor).toBe(750_000n)
    expect(out.totals.days_over_90).toBe(350_000n)
    expect(out.totals.days_1_30).toBe(400_000n)
    expect(out.rows).toHaveLength(1)
    expect(out.rows[0]).toMatchObject({ residentId: 'a', onPlan: true, oldestDueOn: '2026-08-01', totalMinor: 750_000n })
  })
})

describe('GL export', () => {
  it('always balances, whatever the month held', () => {
    const kinds = ['rent', 'care_level', 'patient_liability', 'adjustment', 'mystery']
    fc.assert(fc.property(
      fc.array(fc.record({ kind: fc.constantFrom(...kinds), responsibility: fc.constantFrom('resident', 'payer'), amountMinor: fc.bigInt({ min: -1_000_000n, max: 10_000_000n }) }), { maxLength: 30 }),
      fc.array(fc.record({ method: fc.constantFrom('card', 'check', 'deposit', 'credit'), amountMinor: fc.bigInt({ min: 1n, max: 10_000_000n }), settledOn: fc.constantFrom('2026-10-03', '2026-10-20') }), { maxLength: 20 }),
      fc.array(fc.record({ kind: fc.constantFrom('adjustment', 'write_off'), amountMinor: fc.bigInt({ min: -100_000n, max: 1_000_000n }), postedOn: fc.constant('2026-10-25') }), { maxLength: 5 }),
      (charges, payments, adjustments) => {
        const lines = glJournal({ monthEnd: '2026-10-31', charges, payments, adjustments })
        const debit = lines.reduce((s, l) => s + l.debitMinor, 0n)
        const credit = lines.reduce((s, l) => s + l.creditMinor, 0n)
        expect(debit).toBe(credit)
        expect(lines.every(l => l.debitMinor >= 0n && l.creditMinor >= 0n && (l.debitMinor === 0n) !== (l.creditMinor === 0n))).toBe(true)
      },
    ))
  })

  it('r1 M1: cash = payments + deposits received + overpayments - refunds, and deposits held never go negative', () => {
    const net = (lines: ReturnType<typeof glJournal>, account: string) => lines.filter(l => l.account === account).reduce((s, l) => s + l.debitMinor - l.creditMinor, 0n)
    // The reviewer's P2 month: card 1,000, check 500, deposit 400 received then applied, adjustment 100, write-off 300, card refund 200.
    const p2 = glJournal({
      monthEnd: '2026-11-30', charges: [],
      payments: [{ method: 'card', amountMinor: 100_000n, settledOn: '2026-11-13' }, { method: 'check', amountMinor: 50_000n, settledOn: '2026-11-13' }, { method: 'deposit', amountMinor: 40_000n, settledOn: '2026-11-13' }],
      adjustments: [{ kind: 'adjustment', amountMinor: 10_000n, postedOn: '2026-11-13' }, { kind: 'write_off', amountMinor: 30_000n, postedOn: '2026-11-13' }],
      deposits: [{ event: 'received', amountMinor: 40_000n, on: '2026-11-13' }],
      refunds: [{ source: 'payment', amountMinor: 20_000n, issuedOn: '2026-11-13' }],
    })
    expect(net(p2, '1010')).toBe(170_000n)
    expect(net(p2, '2300')).toBe(0n)
    expect(net(p2, '1200')).toBe(-230_000n)
    expect(p2.some(l => l.account === '4910' && l.debitMinor === 20_000n)).toBe(true)
    // Any month: each deposit is received, then applied, refunded or forfeited (or still held); a refund of a payment or credit is cash out.
    fc.assert(fc.property(
      fc.array(fc.record({ amountMinor: fc.bigInt({ min: 1n, max: 1_000_000n }), fate: fc.constantFrom('held', 'applied', 'refunded', 'forfeited') }), { maxLength: 8 }),
      fc.array(fc.record({ method: fc.constantFrom('card', 'check', 'ach'), amountMinor: fc.bigInt({ min: 1n, max: 1_000_000n }) }), { maxLength: 8 }),
      fc.array(fc.bigInt({ min: 1n, max: 100_000n }), { maxLength: 4 }),
      fc.array(fc.bigInt({ min: 1n, max: 100_000n }), { maxLength: 4 }),
      (deposits, paid, overpaid, refunded) => {
        const on = '2026-11-13'
        const lines = glJournal({
          monthEnd: '2026-11-30', charges: [], adjustments: [],
          payments: [...paid.map(p => ({ ...p, settledOn: on })), ...deposits.filter(d => d.fate === 'applied').map(d => ({ method: 'deposit', amountMinor: d.amountMinor, settledOn: on }))],
          deposits: [...deposits.map(d => ({ event: 'received' as const, amountMinor: d.amountMinor, on })), ...deposits.filter(d => d.fate === 'forfeited').map(d => ({ event: 'forfeited' as const, amountMinor: d.amountMinor, on }))],
          credits: overpaid.map(amountMinor => ({ method: 'card', amountMinor, createdOn: on })),
          refunds: [...deposits.filter(d => d.fate === 'refunded').map(d => ({ source: 'deposit' as const, amountMinor: d.amountMinor, issuedOn: on })), ...refunded.map(amountMinor => ({ source: 'payment' as const, amountMinor, issuedOn: on }))],
        })
        const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n)
        expect(sum(lines.map(l => l.debitMinor))).toBe(sum(lines.map(l => l.creditMinor)))
        const depositsIn = sum(deposits.map(d => d.amountMinor))
        const depositsRefunded = sum(deposits.filter(d => d.fate === 'refunded').map(d => d.amountMinor))
        expect(net(lines, '1010')).toBe(sum(paid.map(p => p.amountMinor)) + depositsIn + sum(overpaid) - depositsRefunded - sum(refunded))
        // 2300 is a liability: its credit balance is exactly what is still held, never a debit balance.
        expect(-net(lines, '2300')).toBe(sum(deposits.filter(d => d.fate === 'held').map(d => d.amountMinor)))
        expect(-net(lines, '2310')).toBe(sum(overpaid))
      },
    ))
  })

  it('writes exact decimal text and neutralises spreadsheet formulas', () => {
    const csv = glCsv([{ date: '2026-10-31', account: '1200', accountName: 'AR', debitMinor: 123_456_789n, creditMinor: 0n, memo: '=HYPERLINK("x")' }], 'MRSL-2026-10')
    expect(csv).toContain('1234567.89')
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(glCsv([{ date: '2026-10-31', account: '1200', accountName: 'AR', debitMinor: 5n, creditMinor: 0n, memo: 'x' }], 'r')).toContain(',0.05,')
  })
})

describe('Medicaid application clocks and pending AR (computed on read)', () => {
  const base = { status: 'submitted', infoRequestedOn: null, infoDueOn: null, infoRespondedOn: null, decisionOn: null, appealDueOn: null, appealFiledOn: null }
  it('runs the reply clock from the letter, and the appeal clock from a denial', () => {
    expect(applicationClocks({ ...base, status: 'info_requested', infoRequestedOn: '2026-10-01', infoDueOn: '2026-10-15' }, '2026-10-16')).toEqual([{ name: 'info_response', state: 'overdue', dueBy: '2026-10-15', daysLeft: -1 }])
    expect(applicationClocks({ ...base, status: 'info_requested', infoRequestedOn: '2026-10-01' }, '2026-10-05')[0]).toMatchObject({ dueBy: '2026-10-11', state: 'open' })
    expect(applicationClocks({ ...base, status: 'submitted', infoRequestedOn: '2026-10-01', infoRespondedOn: '2026-10-04' }, '2026-12-01')[0].state).toBe('done')
    expect(applicationClocks({ ...base, status: 'denied', decisionOn: '2026-10-01', appealDueOn: '2026-12-30' }, '2026-12-31')).toEqual([{ name: 'appeal', state: 'overdue', dueBy: '2026-12-30', daysLeft: -1 }])
    expect(applicationClocks({ ...base, status: 'appealed', decisionOn: '2026-10-01', appealDueOn: '2026-12-30', appealFiledOn: '2026-11-01' }, '2027-02-01')[0].state).toBe('done')
    expect(applicationClocks({ ...base, status: 'approved', decisionOn: '2026-10-01' }, '2027-02-01')).toEqual([])
  })

  it('pending AR is the open balance from the requested month on', () => {
    const statements = [
      { month: '2026-08-01', status: 'issued', totalMinor: 900_000n, paidMinor: 0n, adjustedMinor: 0n },
      { month: '2026-09-01', status: 'issued', totalMinor: 900_000n, paidMinor: 200_000n, adjustedMinor: 100_000n },
      { month: '2026-10-01', status: 'void', totalMinor: 900_000n, paidMinor: 0n, adjustedMinor: 0n },
      { month: '2026-10-01', status: 'paid', totalMinor: 900_000n, paidMinor: 900_000n, adjustedMinor: 0n },
    ]
    expect(pendingAr(statements, '2026-09-14')).toBe(600_000n)
    expect(pendingAr(statements, null)).toBe(0n)
  })
})

describe('patient liability schedule', () => {
  const row = (id: string, from: string, to: string | null, amount: bigint, status = 'effective'): ScheduleRow => ({ id, residentId: 'r', stayId: null, monthlyAmountMinor: amount, personalNeedsAllowanceMinor: 5_000n, effectiveFrom: from, effectiveTo: to, status })
  it('uses the row in effect on the 1st, else the first that starts in the month; never a superseded or draft row', () => {
    const rows = [row('a', '2026-06-01', '2026-09-30', 120_000n), row('b', '2026-10-01', null, 135_000n), row('x', '2026-10-01', null, 1n, 'superseded'), row('d', '2026-09-01', null, 7n, 'draft')]
    expect(scheduleForMonth(rows, '2026-09-01', '2026-09-30')?.id).toBe('a')
    expect(scheduleForMonth(rows, '2026-10-01', '2026-10-31')?.id).toBe('b')
    expect(scheduleForMonth(rows, '2026-05-01', '2026-05-31')).toBeNull()
    expect(scheduleForMonth([row('m', '2026-10-14', null, 99n)], '2026-10-01', '2026-10-31')?.id).toBe('m')
  })

  it('tracks the personal needs allowance against what reached the trust account', () => {
    expect(pnaStatus({ allowanceMinor: 5_000n, creditedThisMonthMinor: 2_000n })).toEqual({ state: 'short', shortMinor: 3_000n })
    expect(pnaStatus({ allowanceMinor: 5_000n, creditedThisMonthMinor: 5_000n }).state).toBe('credited')
    expect(pnaStatus({ allowanceMinor: null, creditedThisMonthMinor: 0n }).state).toBe('no_schedule')
  })
})
