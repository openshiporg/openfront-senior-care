import { describe, expect, it } from 'vitest'
import { RPV_COLUMNS, rpvCsv, rpvRow, validateRpv, vaccinatedSet, weekEnd, type RpvInput } from './rpv'

const base: RpvInput = { orgId: '48271', weekStart: '2026-11-02', numRes: 80, upToDateCovid: 50, fluVaccinated: 60, rsvVaccinated: 30, covidPositive: 2, covidPositiveUtd: 1, fluPositive: 0, fluPositiveVaccinated: 0, rsvPositive: 0, rsvPositiveVaccinated: 0, today: '2026-11-13' }

describe('NHSN weekly respiratory export', () => {
  it('writes the March 2026 header and a Monday-to-Sunday row', () => {
    const csv = rpvCsv(rpvRow(base)).split('\r\n')
    expect(csv[0]).toBe(RPV_COLUMNS.join(','))
    expect(csv[1].startsWith('48271,11/02/26,11/08/26,2025-2026,80,50,60,30,2,1,0,,0,,')).toBe(true)
    expect(csv[1].split(',').length).toBe(RPV_COLUMNS.length)
    expect(weekEnd('2026-11-02')).toBe('2026-11-08')
  })
  it('refuses a non-Monday, a future week, and counts above numres or their parent', () => {
    expect(validateRpv(base)).toEqual([])
    expect(validateRpv({ ...base, weekStart: '2026-11-03' }).map(p => p.code)).toContain('week_start')
    expect(validateRpv({ ...base, weekStart: '2026-11-09' }).map(p => p.code)).toContain('week_future')
    expect(validateRpv({ ...base, fluVaccinated: 81 }).map(p => p.code)).toContain('count_exceeds')
    expect(validateRpv({ ...base, covidPositiveUtd: 3 }).map(p => p.code)).toContain('count_exceeds')
    expect(validateRpv({ ...base, covidPositiveUtd: 2, covidPositive: 2, upToDateCovid: 1 }).map(p => p.code)).toContain('count_exceeds')
    expect(validateRpv({ ...base, orgId: '' }).map(p => p.code)).toContain('org_id')
    expect(validateRpv({ ...base, numRes: 3001 }).map(p => p.code)).toContain('numres_max')
  })
  it('counts a vaccine once per resident and only inside the window', () => {
    const f = (residentId: string, vaccine: string, d: string, status = 'given') => ({ residentId, vaccine, status, givenAt: new Date(`${d}T12:00:00Z`), decidedAt: null, offeredAt: null })
    const set = vaccinatedSet([f('a', 'influenza', '2026-10-01'), f('a', 'influenza', '2026-10-20'), f('b', 'influenza', '2026-05-01'), f('c', 'influenza', '2026-10-02', 'declined'), f('d', 'influenza', '2026-11-10')], 'influenza', '2026-11-08', '2026-07-01')
    expect([...set]).toEqual(['a'])
  })
})
