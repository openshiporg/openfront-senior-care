import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPbjXml, fiscalQuarter, hoursText, validatePbj, weekStartOf, workedMinutes, type PbjFile } from './pbj'

const at = (s: string) => new Date(s)
const XSD = join(__dirname, 'nhpbj_4_10_0.xsd')

describe('PBJ', () => {
  it('fiscal quarters follow the federal year and are due 45 days after the quarter', () => {
    expect(fiscalQuarter('2026-08-15')).toMatchObject({ fiscalYear: 2026, quarter: 4, start: '2026-07-01', end: '2026-09-30', dueOn: '2026-11-14' })
    expect(fiscalQuarter('2026-10-01')).toMatchObject({ fiscalYear: 2027, quarter: 1, start: '2026-10-01', end: '2026-12-31' })
    expect(fiscalQuarter('2026-02-10')).toMatchObject({ fiscalYear: 2026, quarter: 2, start: '2026-01-01', end: '2026-03-31' })
  })
  it('weeks start on Monday', () => {
    expect(weekStartOf('2026-08-09')).toBe('2026-08-03') // Sunday
    expect(weekStartOf('2026-08-03')).toBe('2026-08-03')
  })
  it('deducts unpaid breaks and splits a night shift at local midnight', () => {
    const day = workedMinutes([
      { kind: 'in', observedAt: at('2026-08-03T11:00:00Z') }, { kind: 'break_start', observedAt: at('2026-08-03T15:00:00Z') },
      { kind: 'break_end', observedAt: at('2026-08-03T15:30:00Z') }, { kind: 'out', observedAt: at('2026-08-03T19:30:00Z') },
    ], 'America/New_York')
    expect(day.issues).toEqual([])
    expect(day.minutes['2026-08-03']).toBe(8 * 60)
    const night = workedMinutes([{ kind: 'in', observedAt: at('2026-08-04T02:00:00Z') }, { kind: 'out', observedAt: at('2026-08-04T10:00:00Z') }], 'America/New_York')
    expect(night.minutes).toEqual({ '2026-08-03': 2 * 60, '2026-08-04': 6 * 60 })
  })
  it('reports a missing clock-out and a stray clock-out', () => {
    expect(workedMinutes([{ kind: 'in', observedAt: at('2026-08-03T11:00:00Z') }], 'UTC').issues[0]).toMatch(/no clock-out/)
    expect(workedMinutes([{ kind: 'out', observedAt: at('2026-08-03T11:00:00Z') }], 'UTC').issues[0]).toMatch(/no clock-in/)
  })
  it('writes hours exactly to two decimals', () => {
    expect([hoursText(90), hoursText(450), hoursText(20), hoursText(1)]).toEqual(['1.50', '7.50', '0.33', '0.02'])
  })
  const file: PbjFile = {
    facilityId: '366427', stateCode: 'OH', fiscalYear: 2026, quarter: 4,
    employees: [{ employeeId: 'E-1001', hireDate: '2021-03-01', terminationDate: null }, { employeeId: 'AG-7', hireDate: null, terminationDate: null }],
    hours: [
      { employeeId: 'E-1001', date: '2026-08-03', minutes: 450, jobTitleCode: '7', payTypeCode: '2' },
      { employeeId: 'E-1001', date: '2026-08-04', minutes: 480, jobTitleCode: '10', payTypeCode: '2' },
      { employeeId: 'AG-7', date: '2026-08-03', minutes: 360, jobTitleCode: '9', payTypeCode: '3' },
    ],
    vendor: { name: 'Openfront', product: 'Senior Care', version: '1.0' },
  }
  it('validates against the CMS XSD 4.10.0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pbj-'))
    const path = join(dir, 'pbj.xml')
    writeFileSync(path, buildPbjXml(file))
    const out = execFileSync('xmllint', ['--noout', '--schema', XSD, path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    expect(out).toBe('')
  })
  it('the XSD rejects a bad file, so passing means something', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pbj-'))
    const path = join(dir, 'bad.xml')
    writeFileSync(path, buildPbjXml({ ...file, hours: [{ ...file.hours[0], minutes: 24 * 60, jobTitleCode: '99' }] }))
    expect(() => execFileSync('xmllint', ['--noout', '--schema', XSD, path], { stdio: 'pipe' })).toThrow()
  })
  it('flags unmapped codes, agency without id, over-long days and unapproved timecards', () => {
    const problems = validatePbj({ ...file, hours: [{ ...file.hours[0], minutes: 23 * 60 }, { ...file.hours[0], minutes: 2 * 60 }] }, { unmappedJobCodes: ['XX'], agencyWithoutId: ['Pat'], unapprovedTimecards: 2 })
    expect(problems.map(p => p.code).sort()).toEqual(['agency_no_id', 'day_hours', 'entry_hours', 'job_code_unmapped', 'timecards_unapproved'])
  })
})
