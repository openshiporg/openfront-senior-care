import { describe, expect, it } from 'vitest'
import { classify, perDiem, vpdDayNumber, isInterruptedStay, type PdpmInput } from './classify'
import { formatMinor } from '../lib/money'
import { mdsToPdpmInput } from './mapMds'
import { UNADJUSTED_URBAN, ptOtVpd } from './tables'

import { GOLDEN_CASES as CASES, goldenItems } from './goldenCases'

describe('PDPM golden cases (hand-checked)', () => {
  it('has at least twelve distinct invented residents', () => {
    expect(new Set(CASES.map(c => c.name.split(',')[0])).size).toBeGreaterThanOrEqual(12)
  })
  for (const c of CASES) {
    it(c.name, () => {
      const r = classify(c.input, c.indicator ?? 'five_day')
      expect(r.hipps).toBe(c.hipps)
      expect(`${r.groups.pt}/${r.groups.slp}/${r.groups.nursing}/${r.groups.nta}`).toBe(c.groups)
      const pd = perDiem(r, UNADJUSTED_URBAN, c.day, { wageIndex: c.wageIndex })
      expect(formatMinor(pd.totalMinor).replace(/[$,]/g, '')).toBe(c.perDiem)
      expect(Object.values(pd.componentsMinor).reduce((a, b) => a + b, 0n)).toBe(pd.totalMinor)
    })
  }
})

describe('variable per diem and interrupted stays', () => {
  it('PT/OT factor steps down 0.02 per week from day 21 and NTA triples on days 1-3', () => {
    expect([1, 20, 21, 27, 28, 97, 98, 100].map(ptOtVpd)).toEqual(['1.00', '1.00', '0.98', '0.98', '0.96', '0.78', '0.76', '0.76'])
  })
  it('RAI ch. 2 window: discharge day L+1 and the 2 following days; L+4 or later is a new stay (day 1)', () => {
    const seg = (back: string) => [{ from: '2026-03-01', to: '2026-03-10' }, { from: back, to: null }]
    // L = Mar 10. L+2 and L+3 continue the count; L+4 restarts.
    expect(isInterruptedStay('2026-03-10', '2026-03-12')).toBe(true)
    expect(vpdDayNumber(seg('2026-03-12'), '2026-03-12')).toBe(11)
    expect(isInterruptedStay('2026-03-10', '2026-03-13')).toBe(true)
    expect(vpdDayNumber(seg('2026-03-13'), '2026-03-13')).toBe(11)
    expect(isInterruptedStay('2026-03-10', '2026-03-14')).toBe(false)
    expect(vpdDayNumber(seg('2026-03-14'), '2026-03-14')).toBe(1)
    expect(vpdDayNumber(seg('2026-03-15'), '2026-03-15')).toBe(1)
  })
})

describe('MDS items to classifier input', () => {
  it('every golden case, written as MDS items (as the seed loads them), classifies to the same HIPPS', () => {
    for (const c of CASES) expect(classify(mdsToPdpmInput(goldenItems(c.input), { aids: c.input.aids }), c.indicator ?? 'five_day').hipps, c.name).toBe(c.hipps)
  })
  it('reads BIMS, GG, ICD-10 and NTA items', () => {
    const input = mdsToPdpmInput({ I0020B: 'Z96.651', C0500: '10', GG0130A1: '03', GG0170I1: '88', O0110H2: '1', I2900: '1', K0510C1: '1' })
    expect(input).toMatchObject({ clinicalCategory: 'major_joint', cognition: 'mild', cannotWalk: true, mechanicallyAlteredDiet: true })
    expect(input.ntaConditions?.sort()).toEqual(['diabetes', 'iv_medication'])
  })
})
