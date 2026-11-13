import { addDays } from '../lib/calendar'

/* NHSN LTC Weekly Respiratory Pathogens and Vaccination Summary, resident component: the group/facility CSV import layout of
   March 2026 (NHSN release 14.1). Staff download the file and upload it in NHSN; the confirmation they enter is the receipt. */

export const NHSN_TEMPLATE_NOTE = 'Built to the March 2026 (NHSN release 14.1) LTC resident RPV CSV layout. Check the current template on the NHSN site before each upload; NHSN revises it each season.'
export const RPV_SEASON = '2025-2026'

export const RPV_COLUMNS = [
  'orgid', 'survweekstart', 'survweekend', 'rpvSeason', 'numres', 'totResUpToDate', 'numResFluVacc', 'numResRsvVacc',
  'numResC19PosTest', 'numResC19PosUTD', 'numResFluPosTest', 'numResFLUPosVacc', 'numResRsvPosTest', 'numResRSVPosVacc',
  'numResC19HospPos', 'numResC19HospUTD', 'numResFluHospPos', 'numResFluHospVacc', 'numResRSVHospPos', 'numResRSVHospVacc',
  'resNonThera', 'numResC19Thera', 'numResC19TheraNirm', 'numResC19TheraRem', 'numResC19TheraMol',
  'numResFluThera', 'numResFluTheraOse', 'numResFluTheraZan', 'numResFluTheraPer', 'numResFluTheraBal',
  'numResRSVThera', 'numResRSVTheraRib', 'numResRSVTheraPal', 'numResRSVTheraNir', 'numResRSVTheraCle',
] as const

export type RpvCounts = Record<(typeof RPV_COLUMNS)[number], string | number>
export type RpvInput = {
  orgId: string
  weekStart: string // Monday
  numRes: number
  upToDateCovid: number
  fluVaccinated: number
  rsvVaccinated: number
  covidPositive: number
  covidPositiveUtd: number
  fluPositive: number
  fluPositiveVaccinated: number
  rsvPositive: number
  rsvPositiveVaccinated: number
  today: string
}
export type RpvProblem = { code: string; message: string }

const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(2, 4)}`
export const weekEnd = (weekStart: string) => addDays(weekStart, 6)
export const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1

export function validateRpv(i: RpvInput): RpvProblem[] {
  const p: RpvProblem[] = []
  const add = (code: string, message: string) => p.push({ code, message })
  if (!isMonday(i.weekStart)) add('week_start', 'The surveillance week must start on a Monday.')
  if (weekEnd(i.weekStart) > i.today) add('week_future', 'The week has not ended yet; NHSN does not accept a week that ends after today.')
  if (!/^\d{1,10}$/.test(i.orgId)) add('org_id', 'The community NHSN facility id is not set (OperatorSettings or the community identifiers: nhsnOrgId).')
  const whole = (n: number) => Number.isInteger(n) && n >= 0
  for (const [k, v] of Object.entries(i)) if (typeof v === 'number' && !whole(v)) add('whole_number', `${k} must be a whole number.`)
  if (i.numRes > 3000) add('numres_max', 'numres is limited to 3,000.')
  const le = (a: number, b: number, name: string, of: string) => { if (a > b) add('count_exceeds', `${name} (${a}) cannot be more than ${of} (${b}).`) }
  for (const [name, v] of [['upToDateCovid', i.upToDateCovid], ['fluVaccinated', i.fluVaccinated], ['rsvVaccinated', i.rsvVaccinated], ['covidPositive', i.covidPositive], ['fluPositive', i.fluPositive], ['rsvPositive', i.rsvPositive]] as const) le(v, i.numRes, name, 'numres')
  le(i.covidPositiveUtd, i.covidPositive, 'covidPositiveUtd', 'covidPositive'); le(i.covidPositiveUtd, i.upToDateCovid, 'covidPositiveUtd', 'upToDateCovid')
  le(i.fluPositiveVaccinated, i.fluPositive, 'fluPositiveVaccinated', 'fluPositive'); le(i.fluPositiveVaccinated, i.fluVaccinated, 'fluPositiveVaccinated', 'fluVaccinated')
  le(i.rsvPositiveVaccinated, i.rsvPositive, 'rsvPositiveVaccinated', 'rsvPositive'); le(i.rsvPositiveVaccinated, i.rsvVaccinated, 'rsvPositiveVaccinated', 'rsvVaccinated')
  return p
}

/** Therapeutics, hospitalisations and the not-collected switch are not recorded in this system yet: they are written as 0 / "Y" (no therapeutics reported) and said so. */
export function rpvRow(i: RpvInput): RpvCounts {
  return {
    orgid: i.orgId, survweekstart: mdy(i.weekStart), survweekend: mdy(weekEnd(i.weekStart)), rpvSeason: RPV_SEASON,
    numres: i.numRes, totResUpToDate: i.upToDateCovid, numResFluVacc: i.fluVaccinated, numResRsvVacc: i.rsvVaccinated,
    numResC19PosTest: i.covidPositive, numResC19PosUTD: i.covidPositive > 0 ? i.covidPositiveUtd : '',
    numResFluPosTest: i.fluPositive, numResFLUPosVacc: i.fluPositive > 0 ? i.fluPositiveVaccinated : '',
    numResRsvPosTest: i.rsvPositive, numResRSVPosVacc: i.rsvPositive > 0 ? i.rsvPositiveVaccinated : '',
    numResC19HospPos: 0, numResC19HospUTD: '', numResFluHospPos: 0, numResFluHospVacc: '', numResRSVHospPos: 0, numResRSVHospVacc: '',
    resNonThera: 'Y', numResC19Thera: '', numResC19TheraNirm: '', numResC19TheraRem: '', numResC19TheraMol: '',
    numResFluThera: '', numResFluTheraOse: '', numResFluTheraZan: '', numResFluTheraPer: '', numResFluTheraBal: '',
    numResRSVThera: '', numResRSVTheraRib: '', numResRSVTheraPal: '', numResRSVTheraNir: '', numResRSVTheraCle: '',
  }
}

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const rpvCsv = (row: RpvCounts) => `${RPV_COLUMNS.join(',')}\r\n${RPV_COLUMNS.map(c => cell(row[c])).join(',')}\r\n`

export type VaccineFact = { residentId: string; vaccine: string; status: string; givenAt: Date | null; decidedAt: Date | null; offeredAt: Date | null }

/** Season start: the flu vaccine counts from 1 July (the NHSN season is 2025-2026). */
export function seasonStart(weekStart: string) {
  const y = Number.parseInt(weekStart.slice(0, 4), 10)
  return `${weekStart.slice(5, 7) >= '07' ? y : y - 1}-07-01`
}

/** Residents who received the vaccine (this season for flu; ever for RSV and COVID-19 up to date within the season). */
export function vaccinatedSet(facts: VaccineFact[], vaccine: string, weekEnd: string, since: string | null): Set<string> {
  const out = new Set<string>()
  for (const f of facts) {
    if (f.vaccine !== vaccine || f.status !== 'given' || !f.givenAt) continue
    const d = f.givenAt.toISOString().slice(0, 10)
    if (d <= weekEnd && (!since || d >= since)) out.add(f.residentId)
  }
  return out
}
