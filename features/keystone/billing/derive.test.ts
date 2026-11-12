import { describe, expect, it } from 'vitest'
import { deriveCharges, type DayRow, type RateLineIn } from './derive'
import { checkRateShape } from './rates'

const MONTH = '2026-10-01'
const dates = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-10-${String(from + i).padStart(2, '0')}`)
const day = (stayId: string, date: string, rank = 1): DayRow => ({ stayId, residentId: `r_${stayId}`, date, setting: 'assisted_living', presence: 'in_house', apartmentTypeId: 'companion', payerKind: 'private_pay', payerId: null, occupantRank: rank })
const rate = (over: Partial<RateLineIn> & { id: string; kind: string }): RateLineIn => ({ scheduleId: 's', effectiveFrom: '2026-01-01', setting: 'assisted_living', apartmentTypeId: null, careLevelId: null, amountMinor: 0n, per: 'month', proration: 'actual_days_in_month', ...over })
const total = (lines: { amountMinor: bigint }[]) => lines.reduce((sum, line) => sum + line.amountMinor, 0n)

describe('M3: second person', () => {
  it('a companion apartment bills rent to the first occupant and the second-person rate to the second', () => {
    const rates = [rate({ id: 'rent', kind: 'apartment_rent', apartmentTypeId: 'companion', amountMinor: 600_000n }), rate({ id: 'sp', kind: 'second_person', amountMinor: 185_000n })]
    const days = [...dates(1, 31).map(d => day('a', d, 1)), ...dates(1, 31).map(d => day('b', d, 2))]
    const out = deriveCharges({ month: MONTH, days, rates, careAssignments: [], liabilities: [], careNoticeDays: 30 })
    expect(out.problems).toEqual([])
    expect(total(out.lines.filter(l => l.stayId === 'a' && l.kind === 'rent'))).toBe(600_000n)
    expect(total(out.lines.filter(l => l.stayId === 'b' && l.kind === 'second_person'))).toBe(185_000n)
    expect(out.lines.filter(l => l.stayId === 'b' && l.kind === 'rent')).toHaveLength(0)
    expect(total(out.lines)).toBe(785_000n)
  })
})

describe('M4: care-level notice', () => {
  const rates = [rate({ id: 'rent', kind: 'apartment_rent', apartmentTypeId: 'companion', amountMinor: 310_000n }), rate({ id: 'al2', kind: 'care_level', careLevelId: 'al2', amountMinor: 200_000n, proration: 'thirty_day_month' }), rate({ id: 'al3', kind: 'care_level', careLevelId: 'al3', amountMinor: 400_000n, proration: 'thirty_day_month' })]
  const days = dates(1, 31).map(d => day('a', d))
  const old = { stayId: 'a', careLevelId: 'al2', points: 10, effectiveFrom: '2026-01-01', noticeDeliveredOn: null }
  const care = (assignments: Parameters<typeof deriveCharges>[0]['careAssignments']) => deriveCharges({ month: MONTH, days, rates, careAssignments: assignments, liabilities: [], careNoticeDays: 30 }).lines.filter(l => l.kind === 'care_level')

  it('an AL3 increase with no notice keeps billing the old level', () => {
    const lines = care([old, { stayId: 'a', careLevelId: 'al3', points: 20, effectiveFrom: '2026-10-16', noticeDeliveredOn: null }])
    expect(lines.every(l => l.derivation.rateLineId === 'al2')).toBe(true)
    expect(lines).toHaveLength(31)
  })
  it('an increase bills only from the notice date plus the pack notice days', () => {
    const lines = care([old, { stayId: 'a', careLevelId: 'al3', points: 20, effectiveFrom: '2026-10-01', noticeDeliveredOn: '2026-10-01' }])
    expect(lines.filter(l => l.derivation.rateLineId === 'al3').map(l => l.date)).toEqual(['2026-10-31'])
  })
  it('a decrease applies at once', () => {
    const lines = care([{ ...old, careLevelId: 'al3', points: 20 }, { stayId: 'a', careLevelId: 'al2', points: 10, effectiveFrom: '2026-10-16', noticeDeliveredOn: null }])
    expect(lines.filter(l => l.derivation.rateLineId === 'al2').map(l => l.date)).toEqual(dates(16, 31))
  })
  it('r2: a second no-notice AL3 row is compared with the billed AL2, so it never bills', () => {
    const lines = care([old, { stayId: 'a', careLevelId: 'al3', points: 25, effectiveFrom: '2026-10-10', noticeDeliveredOn: null }, { stayId: 'a', careLevelId: 'al3', points: 25, effectiveFrom: '2026-10-20', noticeDeliveredOn: null }])
    expect(lines.every(l => l.derivation.rateLineId === 'al2')).toBe(true)
    expect(lines).toHaveLength(31)
  })
  it('r2: a manual AL3 with points 0 is ranked by the level minPoints, so it is an increase and needs notice', () => {
    const al2 = { ...old, levelMinPoints: 10 }
    const lines = care([al2, { stayId: 'a', careLevelId: 'al3', points: 0, levelMinPoints: 20, effectiveFrom: '2026-10-16', noticeDeliveredOn: null }])
    expect(lines.every(l => l.derivation.rateLineId === 'al2')).toBe(true)
    const noticed = care([al2, { stayId: 'a', careLevelId: 'al3', points: 0, levelMinPoints: 20, effectiveFrom: '2026-10-01', noticeDeliveredOn: '2026-10-01' }])
    expect(noticed.filter(l => l.derivation.rateLineId === 'al3').map(l => l.date)).toEqual(['2026-10-31'])
    // A manual decrease with high points is still a decrease by level.
    const down = care([{ ...old, careLevelId: 'al3', points: 20, levelMinPoints: 20 }, { stayId: 'a', careLevelId: 'al2', points: 99, levelMinPoints: 10, effectiveFrom: '2026-10-16', noticeDeliveredOn: null }])
    expect(down.filter(l => l.derivation.rateLineId === 'al2').map(l => l.date)).toEqual(dates(16, 31))
  })
  it('r2: a noticed AL3 after an un-noticed AL3 bills from its own notice, and a later decrease applies at once', () => {
    const lines = care([old, { stayId: 'a', careLevelId: 'al3', points: 25, effectiveFrom: '2026-10-05', noticeDeliveredOn: null }, { stayId: 'a', careLevelId: 'al3', points: 25, effectiveFrom: '2026-10-06', noticeDeliveredOn: '2026-09-20' }, { stayId: 'a', careLevelId: 'al2', points: 10, effectiveFrom: '2026-10-25', noticeDeliveredOn: null }])
    expect(lines.filter(l => l.derivation.rateLineId === 'al3').map(l => l.date)).toEqual(dates(20, 24))
  })
})

describe('M5: daily method and per', () => {
  const run = (r: RateLineIn) => deriveCharges({ month: MONTH, days: dates(1, 20).map(d => day('a', d)), rates: [r, rate({ id: 'rent', kind: 'apartment_rent', apartmentTypeId: 'companion', amountMinor: 0n })].slice(0, 1).concat([]), careAssignments: [], liabilities: [], careNoticeDays: 30 })
  it('per:day is rate × days (160.00 for 20 days is 3,200.00)', () => {
    const out = run(rate({ id: 'rent', kind: 'apartment_rent', apartmentTypeId: 'companion', amountMinor: 16_000n, per: 'day', proration: 'daily' }))
    expect(total(out.lines)).toBe(320_000n)
  })
  it('the daily method alone is also rate × days', () => {
    const out = run(rate({ id: 'rent', kind: 'apartment_rent', apartmentTypeId: 'companion', amountMinor: 16_000n, proration: 'daily' }))
    expect(total(out.lines)).toBe(320_000n)
  })
  it('rate.add_line refuses shapes that make no sense', () => {
    expect(() => checkRateShape('room_daily', 'month')).toThrow()
    expect(() => checkRateShape('apartment_rent', 'each')).toThrow()
    expect(() => checkRateShape('apartment_rent', 'day', 'thirty_day_month')).toThrow()
    expect(() => checkRateShape('apartment_rent', 'month', 'daily')).toThrow()
    expect(() => checkRateShape('community_fee', 'month')).toThrow()
    expect(() => checkRateShape('mystery', 'month')).toThrow()
    expect(checkRateShape('apartment_rent', 'day')).toEqual({ per: 'day', proration: 'daily' })
    expect(checkRateShape('apartment_rent', 'month')).toEqual({ per: 'month', proration: 'actual_days_in_month' })
  })
})
