import { addDays, localDate, zonedInstant } from '../lib/calendar'

/* Payroll-Based Journal (CMS PBJ file spec 4.10.0). Hours are kept as whole minutes and converted to the two-decimal hours of the XSD
   only when the file is written, so no float arithmetic is used on time. */

export const PBJ_SPEC_VERSION = '4.10.0'
export const PBJ_JOB_TITLES: Record<string, string> = {
  '1': 'Administrator', '2': 'Medical Director', '3': 'Other Physician', '4': 'Physician Assistant', '5': 'Registered Nurse Director of Nursing',
  '6': 'Registered Nurse with Administrative Duties', '7': 'Registered Nurse', '8': 'Licensed Practical/Vocational Nurse with Administrative Duties',
  '9': 'Licensed Practical/Vocational Nurse', '10': 'Certified Nurse Aide', '11': 'Nurse Aide in Training', '12': 'Medication Aide/Technician',
  '13': 'Physician Services', '14': 'Clinical Nurse Specialist', '15': 'Pharmacist', '16': 'Dietitian', '17': 'Feeding Assistant',
  '18': 'Occupational Therapist', '19': 'Occupational Therapy Assistant', '20': 'Occupational Therapy Aide', '21': 'Physical Therapist',
  '22': 'Physical Therapy Assistant', '23': 'Physical Therapy Aide', '24': 'Respiratory Therapist', '25': 'Respiratory Therapy Technician',
  '26': 'Speech/Language Pathologist', '27': 'Therapeutic Recreation Specialist', '28': 'Qualified Activities Professional', '29': 'Other Activities Staff',
  '30': 'Qualified Social Worker', '31': 'Other Social Worker', '32': 'Dentist', '33': 'Podiatrist', '34': 'Mental Health Service Worker',
  '35': 'Vocational Service Worker', '36': 'Clinical Laboratory Service Worker', '37': 'Diagnostic X-ray Service Worker', '38': 'Blood Service Worker',
  '39': 'Housekeeping Service Worker', '40': 'Other Service Worker',
}
export const PAY_TYPE_CODE = { exempt: '1', non_exempt: '2', contract: '3' } as const
export const MAX_ENTRY_MINUTES = 22 * 60 + 30 // XSD: hours 0 to 22.5 per entry
export const MAX_DAY_MINUTES = 24 * 60

export type Punch = { kind: 'in' | 'out' | 'break_start' | 'break_end'; observedAt: Date }

/** Federal fiscal year quarters: Q1 Oct-Dec, Q2 Jan-Mar, Q3 Apr-Jun, Q4 Jul-Sep. */
export function fiscalQuarter(date: string) {
  const [y, m] = date.split('-').map(n => Number.parseInt(n, 10))
  const fiscalYear = m >= 10 ? y + 1 : y
  const quarter = m >= 10 ? 1 : m <= 3 ? 2 : m <= 6 ? 3 : 4
  const startMonth = [10, 1, 4, 7][quarter - 1]
  const startYear = quarter === 1 ? fiscalYear - 1 : fiscalYear
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-01`
  const endMonth = startMonth + 2
  const lastDay = new Date(Date.UTC(startYear, endMonth, 0)).getUTCDate()
  const end = `${startYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { fiscalYear, quarter, start, end, dueOn: addDays(end, 45) }
}

/** Monday of the week containing a yyyy-mm-dd date. */
export function weekStartOf(date: string) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 Sunday
  return addDays(date, -((dow + 6) % 7))
}

export type DayResult = { minutes: Record<string, number>; issues: string[] }

/**
 * Worked minutes per community-local day from a person's punches. A shift is in → out; break_start → break_end inside it is unpaid and
 * is deducted. A shift that crosses midnight is split at local midnight so each day's hours belong to the day they were worked.
 */
export function workedMinutes(punches: Punch[], timeZone: string): DayResult {
  const sorted = [...punches].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
  const minutes: Record<string, number> = {}
  const issues: string[] = []
  let shiftStart: Date | null = null
  let breakStart: Date | null = null
  const add = (from: Date, to: Date, sign: 1 | -1) => {
    let cursor = from.getTime()
    const end = to.getTime()
    while (cursor < end) {
      const date = localDate(timeZone, cursor)
      const boundary = zonedInstant(timeZone, addDays(date, 1), '00:00').getTime()
      const stop = Math.min(end, boundary)
      minutes[date] = (minutes[date] ?? 0) + sign * Math.round((stop - cursor) / 60_000)
      cursor = stop
    }
  }
  for (const p of sorted) {
    if (p.kind === 'in') {
      if (shiftStart) issues.push(`Two clock-ins in a row at ${p.observedAt.toISOString()}.`)
      shiftStart = p.observedAt
      breakStart = null
    } else if (p.kind === 'out') {
      if (!shiftStart) { issues.push(`Clock-out at ${p.observedAt.toISOString()} has no clock-in.`); continue }
      if (breakStart) { add(breakStart, p.observedAt, -1); issues.push(`Shift ending ${p.observedAt.toISOString()} ended during an unpaid break.`); breakStart = null }
      add(shiftStart, p.observedAt, 1)
      shiftStart = null
    } else if (p.kind === 'break_start') {
      if (!shiftStart) issues.push(`Break start at ${p.observedAt.toISOString()} is outside a shift.`)
      else breakStart = p.observedAt
    } else if (p.kind === 'break_end') {
      if (!breakStart) issues.push(`Break end at ${p.observedAt.toISOString()} has no break start.`)
      else { add(breakStart, p.observedAt, -1); breakStart = null }
    }
  }
  if (shiftStart) issues.push(`Clock-in at ${shiftStart.toISOString()} has no clock-out.`)
  for (const [d, m] of Object.entries(minutes)) {
    if (m < 0) { issues.push(`${d}: break time exceeds the shift.`); minutes[d] = 0 }
    if (m > MAX_DAY_MINUTES) issues.push(`${d}: more than 24 hours worked.`)
  }
  return { minutes, issues }
}

/** 90 minutes -> "1.50" (exact: minutes * 100 / 60, rounded half-up to two decimals, integers only). */
export function hoursText(totalMinutes: number): string {
  const hundredths = Math.floor((totalMinutes * 100 + 30) / 60)
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`
}

export type PbjEmployee = { employeeId: string; hireDate: string | null; terminationDate: string | null }
export type PbjHourRow = { employeeId: string; date: string; minutes: number; jobTitleCode: string; payTypeCode: string }
export type PbjFile = { facilityId: string; stateCode: string; fiscalYear: number; quarter: number; employees: PbjEmployee[]; hours: PbjHourRow[]; vendor?: { name: string; product: string; version: string } }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function buildPbjXml(file: PbjFile): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<nursingHomeData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="nhpbj_4_10_0.xsd">']
  out.push(`  <header fileSpecVersion="${PBJ_SPEC_VERSION}">`)
  out.push(`    <facilityId>${esc(file.facilityId)}</facilityId>`, `    <stateCode>${esc(file.stateCode)}</stateCode>`)
  out.push(`    <reportQuarter>${file.quarter}</reportQuarter>`, `    <federalFiscalYear>${file.fiscalYear}</federalFiscalYear>`)
  if (file.vendor) out.push(`    <softwareVendorName>${esc(file.vendor.name)}</softwareVendorName>`, `    <softwareProductName>${esc(file.vendor.product)}</softwareProductName>`, `    <softwareProductVersion>${esc(file.vendor.version)}</softwareProductVersion>`)
  out.push('  </header>', '  <employees>')
  for (const e of [...file.employees].sort((a, b) => a.employeeId.localeCompare(b.employeeId))) {
    out.push('    <employee>', `      <employeeId>${esc(e.employeeId)}</employeeId>`)
    if (e.hireDate) out.push(`      <hireDate>${e.hireDate}</hireDate>`)
    if (e.terminationDate) out.push(`      <terminationDate>${e.terminationDate}</terminationDate>`)
    out.push('    </employee>')
  }
  out.push('  </employees>', '  <staffingHours processType="replace">')
  const byEmployee = new Map<string, Map<string, PbjHourRow[]>>()
  for (const row of file.hours) {
    const days = byEmployee.get(row.employeeId) ?? new Map<string, PbjHourRow[]>()
    days.set(row.date, [...(days.get(row.date) ?? []), row])
    byEmployee.set(row.employeeId, days)
  }
  for (const id of [...byEmployee.keys()].sort()) {
    out.push('    <staffHours>', `      <employeeId>${esc(id)}</employeeId>`, '      <workDays>')
    const days = byEmployee.get(id)!
    for (const date of [...days.keys()].sort()) {
      out.push('        <workDay>', `          <date>${date}</date>`, '          <hourEntries>')
      for (const row of days.get(date)!) {
        out.push('            <hourEntry>', `              <hours>${hoursText(row.minutes)}</hours>`, `              <jobTitleCode>${row.jobTitleCode}</jobTitleCode>`, `              <payTypeCode>${row.payTypeCode}</payTypeCode>`, '            </hourEntry>')
      }
      out.push('          </hourEntries>', '        </workDay>')
    }
    out.push('      </workDays>', '    </staffHours>')
  }
  out.push('  </staffingHours>', '</nursingHomeData>')
  return out.join('\n') + '\n'
}

export type PbjProblem = { code: string; message: string; employeeId?: string; date?: string }

/** Runtime checks that mirror the XSD and the STATE-MACHINES §12.9 validating step. The test suite also validates the file against the CMS XSD. */
export function validatePbj(file: PbjFile, ctx: { unmappedJobCodes: string[]; agencyWithoutId: string[]; censusDates?: string[]; hoursDates?: string[]; unapprovedTimecards: number }): PbjProblem[] {
  const problems: PbjProblem[] = []
  if (!/^[A-Za-z0-9]{1,16}$/.test(file.facilityId)) problems.push({ code: 'facility_id', message: 'The CMS Certification Number is missing or not 1-16 letters and digits.' })
  if (!/^[A-Z]{2}$/.test(file.stateCode)) problems.push({ code: 'state_code', message: 'The state code is missing.' })
  for (const code of ctx.unmappedJobCodes) problems.push({ code: 'job_code_unmapped', message: `Job code ${code} is not mapped to a CMS job title (1-40).` })
  for (const name of ctx.agencyWithoutId) problems.push({ code: 'agency_no_id', message: `Agency staff ${name} has no employee id; PBJ requires one for contract hours.` })
  if (ctx.unapprovedTimecards > 0) problems.push({ code: 'timecards_unapproved', message: `${ctx.unapprovedTimecards} timecard(s) in the quarter are not approved yet.` })
  const ids = new Set<string>()
  for (const e of file.employees) {
    if (!/^[a-zA-Z0-9_,.\-\\ ]{1,30}$/.test(e.employeeId)) problems.push({ code: 'employee_id', message: `Employee id "${e.employeeId}" is not allowed (1-30 letters, digits and _ , . - \\ space).`, employeeId: e.employeeId })
    ids.add(e.employeeId)
  }
  const perDay = new Map<string, number>()
  for (const row of file.hours) {
    if (!ids.has(row.employeeId)) problems.push({ code: 'hours_no_employee', message: `Hours for ${row.employeeId} but the person is not in the employee list.`, employeeId: row.employeeId })
    if (!PBJ_JOB_TITLES[row.jobTitleCode]) problems.push({ code: 'job_title', message: `Job title code ${row.jobTitleCode} is not a CMS code.`, employeeId: row.employeeId, date: row.date })
    if (row.minutes > MAX_ENTRY_MINUTES) problems.push({ code: 'entry_hours', message: 'One entry is over 22.5 hours; split it or check the punches.', employeeId: row.employeeId, date: row.date })
    const key = `${row.employeeId}|${row.date}`
    perDay.set(key, (perDay.get(key) ?? 0) + row.minutes)
  }
  for (const [key, minutes] of perDay) if (minutes > MAX_DAY_MINUTES) { const [employeeId, date] = key.split('|'); problems.push({ code: 'day_hours', message: 'More than 24 hours for one person in a day.', employeeId, date }) }
  if (ctx.censusDates && ctx.hoursDates) {
    const hours = new Set(ctx.hoursDates)
    const missing = ctx.censusDates.filter(d => !hours.has(d))
    if (missing.length) problems.push({ code: 'census_mismatch', message: `${missing.length} day(s) have residents in the census but no staff hours (first: ${missing[0]}).`, date: missing[0] })
  }
  return problems
}
