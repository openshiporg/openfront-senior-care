import { describe, expect, it } from 'vitest'
import { addDays, addWorkingDays, daysBetween, isWorkingDay, localDate, startOfLocalDay, US_FED, workingDaysBetween, zonedInstant } from './calendar'

describe('community calendar', () => {
  it('knows federal holidays and observed dates', () => {
    expect(isWorkingDay(US_FED, '2026-11-26')).toBe(false) // Thanksgiving
    expect(isWorkingDay(US_FED, '2026-07-03')).toBe(false) // Independence Day observed (Friday)
    expect(isWorkingDay(US_FED, '2027-12-31')).toBe(false) // New Year 2028 observed in 2027
    expect(isWorkingDay(US_FED, '2026-11-27')).toBe(true)
    expect(isWorkingDay(US_FED, '2026-11-07')).toBe(false) // Saturday
  })

  it('counts F609-style working days across a holiday and a weekend', () => {
    // Discovered Wednesday 2026-11-25: Thu holiday, weekend → 5 working days lands on Thu 2026-12-03.
    expect(addWorkingDays(US_FED, '2026-11-25', 5)).toBe('2026-12-03')
    expect(workingDaysBetween(US_FED, '2026-11-25', '2026-12-03')).toBe(5)
  })

  it('fails closed past coverage', () => {
    expect(() => isWorkingDay(US_FED, '2029-01-02')).toThrow(/no verified schedule/)
  })

  it('local dates follow the community zone, not UTC, across DST', () => {
    expect(localDate('America/New_York', new Date('2026-11-08T03:30:00Z'))).toBe('2026-11-07')
    expect(startOfLocalDay('America/New_York', '2026-11-01').toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(startOfLocalDay('America/New_York', '2026-11-02').toISOString()).toBe('2026-11-02T05:00:00.000Z')
    expect(zonedInstant('America/Chicago', '2026-03-08', '12:00').toISOString()).toBe('2026-03-08T17:00:00.000Z')
  })

  it('day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364)
  })
})
