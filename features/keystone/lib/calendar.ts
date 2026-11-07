/**
 * Community-local days and working days (SCHEMA §12.2, STATE-MACHINES §17). Dates are "YYYY-MM-DD"
 * strings in the calendar's own time zone; a date never implies a time. A calendar answers only
 * inside its coverage, so a working-day clock never lands on a guess (it fails closed).
 *
 * The US-FED table is the OPM federal holiday schedule 2026-2028 with in-lieu-of (observed) dates,
 * fetched 2026-11-07 from opm.gov. It seeds the HolidayCalendar rows; the database copy is the
 * source of truth and an operator may add state or community closures.
 */

export type CalendarSpec = {
  code: string
  timeZone: string
  weekendDays: number[]
  holidays: ReadonlySet<string>
  coverageThrough: string
}

const US_FEDERAL: [string, string][] = [
  ['2026-01-01', "New Year's Day"], ['2026-01-19', 'Birthday of Martin Luther King, Jr.'], ['2026-02-16', "Washington's Birthday"],
  ['2026-05-25', 'Memorial Day'], ['2026-06-19', 'Juneteenth National Independence Day'], ['2026-07-03', 'Independence Day (observed)'],
  ['2026-09-07', 'Labor Day'], ['2026-10-12', 'Columbus Day'], ['2026-11-11', 'Veterans Day'], ['2026-11-26', 'Thanksgiving Day'], ['2026-12-25', 'Christmas Day'],
  ['2027-01-01', "New Year's Day"], ['2027-01-18', 'Birthday of Martin Luther King, Jr.'], ['2027-02-15', "Washington's Birthday"],
  ['2027-05-31', 'Memorial Day'], ['2027-06-18', 'Juneteenth National Independence Day (observed)'], ['2027-07-05', 'Independence Day (observed)'],
  ['2027-09-06', 'Labor Day'], ['2027-10-11', 'Columbus Day'], ['2027-11-11', 'Veterans Day'], ['2027-11-25', 'Thanksgiving Day'],
  ['2027-12-24', 'Christmas Day (observed)'], ['2027-12-31', "New Year's Day 2028 (observed)"],
  ['2028-01-17', 'Birthday of Martin Luther King, Jr.'], ['2028-02-21', "Washington's Birthday"], ['2028-05-29', 'Memorial Day'],
  ['2028-06-19', 'Juneteenth National Independence Day'], ['2028-07-04', 'Independence Day'], ['2028-09-04', 'Labor Day'],
  ['2028-10-09', 'Columbus Day'], ['2028-11-10', 'Veterans Day (observed)'], ['2028-11-23', 'Thanksgiving Day'], ['2028-12-25', 'Christmas Day'],
]

export const US_FED_HOLIDAYS = US_FEDERAL
export const US_FED_SOURCE = 'OPM federal holiday schedule 2026-2028, observed dates (opm.gov, fetched 2026-11-07)'

export const US_FED: CalendarSpec = {
  code: 'US-FED',
  timeZone: 'America/New_York',
  weekendDays: [0, 6],
  holidays: new Set(US_FEDERAL.map(([date]) => date)),
  coverageThrough: '2028-12-31',
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export function assertDate(date: string) {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`Invalid date ${date}`)
}

export function addDays(date: string, days: number) {
  assertDate(date)
  const t = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (to − from). */
export function daysBetween(from: string, to: string) {
  assertDate(from)
  assertDate(to)
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

function covered(calendar: CalendarSpec, date: string) {
  if (date > calendar.coverageThrough) throw new Error(`${calendar.code} has no verified schedule for ${date}`)
}

export function isWorkingDay(calendar: CalendarSpec, date: string) {
  assertDate(date)
  covered(calendar, date)
  return !calendar.weekendDays.includes(weekday(date)) && !calendar.holidays.has(date)
}

export function nextWorkingDay(calendar: CalendarSpec, date: string) {
  let d = addDays(date, 1)
  while (!isWorkingDay(calendar, d)) d = addDays(d, 1)
  return d
}

export function previousWorkingDay(calendar: CalendarSpec, date: string) {
  let d = addDays(date, -1)
  while (!isWorkingDay(calendar, d)) d = addDays(d, -1)
  return d
}

/** date + n working days (F609 "5 working days" = addWorkingDays(cal, discoveryDate, 5)). */
export function addWorkingDays(calendar: CalendarSpec, date: string, n: number) {
  let d = date
  for (let i = 0; i < Math.abs(n); i += 1) d = n > 0 ? nextWorkingDay(calendar, d) : previousWorkingDay(calendar, d)
  return d
}

/** Working days in (from, to]. */
export function workingDaysBetween(calendar: CalendarSpec, from: string, to: string) {
  let count = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isWorkingDay(calendar, d)) count += 1
  return count
}

const zoneParts = (timeZone: string, at: number) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]))

/** The community-local date of an instant (the census day, never the server's midnight). */
export function localDate(timeZone: string, at: Date | number) {
  const p = zoneParts(timeZone, typeof at === 'number' ? at : at.getTime())
  return `${p.year}-${p.month}-${p.day}`
}

/** The UTC instant of a local wall-clock time on a date in a zone (DST-safe). */
export function zonedInstant(timeZone: string, date: string, hhmm: string) {
  assertDate(date)
  const [h, m] = hhmm.split(':').map(x => Number.parseInt(x, 10))
  let guess = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  for (let i = 0; i < 3; i += 1) {
    const p = zoneParts(timeZone, guess)
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second))
    const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m)
    const diff = target - local
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}

/** Local midnight that starts a community-local date. */
export const startOfLocalDay = (timeZone: string, date: string) => zonedInstant(timeZone, date, '00:00')
