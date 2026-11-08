import { describe, expect, it, vi, afterEach } from 'vitest'
import { label, when } from './format'

afterEach(() => vi.useRealTimers())

describe('when', () => {
  it('reads a calendar date as that day, without the year in the current year', () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T15:00:00Z') })
    expect(when('2026-11-10')).toBe('Tue, Nov 10')
  })
  it('adds the year outside the current year', () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T15:00:00Z') })
    expect(when('2027-01-05')).toBe('Tue, Jan 5, 2027')
  })
  it('shows the weekday, date, time and zone for a timestamp, never ISO', () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T15:00:00Z') })
    const text = when('2026-11-10T19:30:00Z', 'America/New_York')
    expect(text).toMatch(/^Tue, Nov 10, 2:30\s?PM EST$/)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
  it('uses the community time zone for the day', () => {
    vi.useFakeTimers({ now: new Date('2026-11-08T15:00:00Z') })
    expect(when('2026-11-11T03:00:00Z', 'America/New_York', 'day')).toBe('Tue, Nov 10')
  })
})

describe('label', () => {
  it('never shows a raw enum', () => {
    expect(label('out_of_service')).toBe('Out of service')
    expect(label('medicare_a')).toBe('Medicare Part A')
    expect(label('healthcare_poa')).toBe('Healthcare POA')
    expect(label('warn')).toBe('Warning')
    expect(label('csr')).toBe('Customer service')
    expect(label('census.admitted')).toBe('Census · Admitted')
    expect(label('pasrr_level1')).toBe('PASRR Level I')
    expect(label('ReferralSource')).toBe('Referral source')
    expect(label('nf_unit')).toBe('NF unit')
  })
})
