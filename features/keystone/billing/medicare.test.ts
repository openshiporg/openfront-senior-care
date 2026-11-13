import { describe, expect, it } from 'vitest'
import { addDays } from '../lib/calendar'
import { deriveCharges, type DayRow } from './derive'
import { hospiceRoomBoard, type MedicareRatesIn } from './medicare'
import { noticeState } from '../coverage/medicare'
import { UNADJUSTED_URBAN } from '../pdpm/tables'

/**
 * Exit gate: a Medicare A stay through day 101 (coinsurance from day 21, day 101 not covered, the NOMNC clock), an interrupted
 * stay, and a hospice election billing pass-through room and board. Fictional resident "Mara Ellison".
 */
const rates: MedicareRatesIn = { rates: { pt: UNADJUSTED_URBAN.pt, ot: UNADJUSTED_URBAN.ot, slp: UNADJUSTED_URBAN.slp, nursing: UNADJUSTED_URBAN.nursing, nta: UNADJUSTED_URBAN.nta, nonCaseMix: UNADJUSTED_URBAN.nonCaseMix }, laborShare: '0.702', wageIndex: '1', coinsuranceMinor: 21_700n, version: 'FY2026' }
// The Ada Quill golden case (TC/SA/PBC1/NF): 728.29 on day 1, 587.90 on day 25.
const ada = { id: 'cls1', effectiveFrom: '2026-01-05', hipps: 'CAXF1', cmi: { pt: '1.78', ot: '1.60', slp: '0.64', nursing: '1.07', nta: '0.68' }, aids: false }
const row = (date: string, payerKind = 'medicare_a', coverageId = 'covA', presence: DayRow['presence'] = 'in_house'): DayRow => ({ stayId: 's1', residentId: 'r1', date, setting: 'nursing_facility', presence, apartmentTypeId: null, payerKind, payerId: 'seed_payer_medicare_a', occupantRank: 1, coverageId })
const monthDates = (month: string) => { const out: string[] = []; for (let d = month; d.slice(0, 7) === month.slice(0, 7); d = addDays(d, 1)) out.push(d); return out }
const sum = (lines: { amountMinor: bigint }[]) => lines.reduce((a, l) => a + l.amountMinor, 0n)

function run(month: string, stretches = [{ from: '2026-01-05', to: null as string | null }], over: { days?: DayRow[]; classifications?: typeof ada[]; cov?: { qualifyingStayOk: boolean; skilledCertOk: boolean } } = {}) {
  const days = over.days ?? monthDates(month).filter(d => d >= '2026-01-05').map(d => row(d))
  return deriveCharges({
    month, days, rates: [], careAssignments: [], liabilities: [], careNoticeDays: 30,
    medicare: { stays: [{ stayId: 's1', stretches, priorDaysUsed: 0, classifications: over.classifications ?? [ada], qualifyingStayOk: true, skilledCertOk: true }], rates, coverages: { covA: over.cov ?? { qualifyingStayOk: true, skilledCertOk: true } } },
  })
}

describe('Medicare Part A through day 101', () => {
  it('January: days 1-20 full, 21-27 coinsurance; day 1 is the golden per diem', () => {
    const out = run('2026-01-01')
    expect(out.problems).toEqual([])
    const claim = out.lines.filter(l => l.kind === 'per_diem_claim')
    expect(claim).toHaveLength(27)
    expect(claim[0].amountMinor).toBe(72_829n)
    expect(claim[0].derivation).toMatchObject({ hipps: 'CAXF1', benefitDay: 1, vpdDay: 1 })
    const coins = out.lines.filter(l => l.kind === 'coinsurance')
    expect(coins.map(l => l.date)).toEqual(monthDates('2026-01-01').filter(d => d >= '2026-01-25'))
    expect(coins.every(l => l.amountMinor === 21_700n && l.responsibility === 'resident')).toBe(true)
    // Day 25 (2026-01-29): per diem 587.90, the claim is 587.90 - 217.00.
    expect(claim.find(l => l.date === '2026-01-29')!.amountMinor).toBe(58_790n - 21_700n)
  })
  it('April: day 100 is 2026-04-14 (coinsurance); day 101 on is not covered and blocks the close', () => {
    const out = run('2026-04-01')
    const coins = out.lines.filter(l => l.kind === 'coinsurance')
    expect(coins.at(-1)!.date).toBe('2026-04-14')
    expect(coins.at(-1)!.derivation).toMatchObject({ benefitDay: 100 })
    expect(out.lines.filter(l => l.date > '2026-04-14')).toHaveLength(0)
    expect(out.problems).toEqual([{ code: 'benefit_exhausted', stayId: 's1', residentId: 'r1', count: 16 }])
  })
  it('the NOMNC for a last covered day of 2026-04-14 is due 2026-04-12; delivered on the 13th is late', () => {
    expect(noticeState('2026-04-14', null, '2026-04-11')).toMatchObject({ dueBy: '2026-04-12', status: 'due', daysLeft: 1 })
    expect(noticeState('2026-04-14', null, '2026-04-13')).toMatchObject({ status: 'overdue' })
    expect(noticeState('2026-04-14', '2026-04-13', '2026-04-13')).toMatchObject({ status: 'delivered_late' })
    expect(noticeState('2026-04-14', '2026-04-10', '2026-04-13')).toMatchObject({ status: 'delivered_in_time' })
  })
  it('no qualifying stay or skilled certification: nothing bills to Medicare and the close is blocked', () => {
    const out = run('2026-01-01', undefined, { cov: { qualifyingStayOk: false, skilledCertOk: true } })
    expect(out.lines).toHaveLength(0)
    expect(out.problems[0]).toMatchObject({ code: 'medicare_unqualified', count: 27 })
  })
  it('no completed 5-day: the days wait for the assessment', () => {
    const out = run('2026-01-01', undefined, { classifications: [] })
    expect(out.problems[0]).toMatchObject({ code: 'missing_assessment', count: 27 })
  })
  it('an IPA changes the rate from its ARD', () => {
    const ipa = { ...ada, id: 'cls2', effectiveFrom: '2026-01-20', hipps: 'DAYF0', cmi: { pt: '1.81', ot: '1.45', slp: '0.64', nursing: '0.62', nta: '0.68' } }
    const out = run('2026-01-01', undefined, { classifications: [ada, ipa] })
    const claim = out.lines.filter(l => l.kind === 'per_diem_claim')
    expect(claim.find(l => l.date === '2026-01-19')!.derivation).toMatchObject({ hipps: 'CAXF1' })
    expect(claim.find(l => l.date === '2026-01-20')!.derivation).toMatchObject({ hipps: 'DAYF0' })
  })
})

describe('interrupted stay', () => {
  it('back within 3 days: the VPD day count continues; later than that it restarts', () => {
    // Part A 1-10 Jan, hospital 11-13 Jan, back 14 Jan (gap of 3 days): day 14 Jan is VPD day 11, benefit day 11.
    const days = monthDates('2026-01-01').filter(d => d <= '2026-01-10' || d >= '2026-01-14').map(d => row(d))
    const out = run('2026-01-01', [{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-14', to: null }], { days, classifications: [{ ...ada, effectiveFrom: '2026-01-01' }] })
    const back = out.lines.find(l => l.kind === 'per_diem_claim' && l.date === '2026-01-14')!
    expect(back.derivation).toMatchObject({ vpdDay: 11, benefitDay: 11 })
    // NTA ×3 does not come back: day 11 per diem = day 4-20 rate: 134.80+112.78+18.10+141.24+67.72+118.21 = 592.85
    expect(back.amountMinor).toBe(59_285n)
    // Back after 4 days: a new stay for the VPD (day 1 again, NTA ×3), the benefit count still continues.
    const days2 = monthDates('2026-01-01').filter(d => d <= '2026-01-10' || d >= '2026-01-15').map(d => row(d))
    const out2 = run('2026-01-01', [{ from: '2026-01-01', to: '2026-01-10' }, { from: '2026-01-15', to: null }], { days: days2, classifications: [{ ...ada, effectiveFrom: '2026-01-01' }] })
    expect(out2.lines.find(l => l.kind === 'per_diem_claim' && l.date === '2026-01-15')!.derivation).toMatchObject({ vpdDay: 1, benefitDay: 11 })
  })
})

describe('hospice election (pass-through room and board)', () => {
  it('bills the hospice its share of the nursing-facility daily rate', () => {
    expect(hospiceRoomBoard(25_000n, 9_500)).toBe(23_750n)
    expect(hospiceRoomBoard(25_001n, 9_500)).toBe(23_751n) // 237.5095 → 237.51
    const days = monthDates('2026-03-01').map(d => ({ ...row(d, 'hospice_agency', 'covH'), payerId: 'hospice_payer' }))
    const out = deriveCharges({
      month: '2026-03-01', days, careAssignments: [], liabilities: [], careNoticeDays: 30, hospice: { covH: { roomBoardBps: 9_500 } },
      rates: [{ id: 'nf', scheduleId: 's', effectiveFrom: '2026-01-01', setting: 'nursing_facility', apartmentTypeId: null, careLevelId: null, kind: 'room_daily', amountMinor: 25_000n, per: 'day', proration: 'daily' } as never],
    })
    expect(out.problems).toEqual([])
    expect(out.lines).toHaveLength(31)
    expect(out.lines.every(l => l.kind === 'room_board' && l.payerKey === 'hospice_payer' && l.amountMinor === 23_750n)).toBe(true)
    expect(sum(out.lines)).toBe(31n * 23_750n)
  })
})
