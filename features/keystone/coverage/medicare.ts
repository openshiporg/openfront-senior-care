import { addDays } from '../lib/calendar'

/**
 * Medicare Part A SNF coverage arithmetic (STATE-MACHINES §5.1/5.2). Pure: dates are YYYY-MM-DD strings, nothing reads the clock.
 * Computed on read from covered census days plus external prior-days evidence. Never stored as an edit.
 */
export const FULL_DAYS = 20
export const BENEFIT_DAYS = 100
export const SPELL_GAP_DAYS = 60
export const MEDICARE_VERIFY_NOTE = 'Day 1-20 full, 21-100 coinsurance, 101+ not covered; a spell ends after 60 consecutive days outside inpatient/SNF care; the 3-day qualifying stay and the 30-day admission window are carried from RESEARCH §8.2 (verify). The 2026 coinsurance is a ReferenceRate row marked verify.'

export type DayBucket = 'full' | 'coinsurance' | 'exhausted'
export type CountedDay = { date: string; n: number; bucket: DayBucket; spell: number }

const diff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * Numbers covered Part A days 1..n within a benefit period. `careDates` (any inpatient/SNF day, covered or not) keeps a spell
 * alive; 60 consecutive days outside care start a new spell with a fresh 100. `priorDaysUsed` is evidence for days already used
 * in the spell that the first covered day falls in (HETS, CWF, hospital record).
 */
export function countCoveredDays(coveredDates: readonly string[], options: { careDates?: readonly string[]; priorDaysUsed?: number } = {}): CountedDay[] {
  const covered = [...new Set(coveredDates)].sort()
  const care = [...new Set([...(options.careDates ?? []), ...covered])].sort()
  const spellOf = new Map<string, number>()
  let spell = 1
  care.forEach((d, i) => {
    if (i > 0 && diff(care[i - 1], d) - 1 >= SPELL_GAP_DAYS) spell += 1
    spellOf.set(d, spell)
  })
  const used = new Map<number, number>()
  const out: CountedDay[] = []
  covered.forEach(date => {
    const s = spellOf.get(date)!
    const base = used.get(s) ?? (s === 1 ? Math.max(0, options.priorDaysUsed ?? 0) : 0)
    const n = base + 1
    used.set(s, n)
    out.push({ date, n, spell: s, bucket: n <= FULL_DAYS ? 'full' : n <= BENEFIT_DAYS ? 'coinsurance' : 'exhausted' })
  })
  return out
}

export function counterSummary(days: readonly CountedDay[]) {
  const last = days[days.length - 1]
  const spellDays = last ? days.filter(d => d.spell === last.spell) : []
  return {
    spell: last?.spell ?? 0,
    spellStart: spellDays[0]?.date ?? null,
    spellEnd: last?.date ?? null,
    fullDaysUsed: spellDays.filter(d => d.bucket === 'full').length,
    coinsuranceDaysUsed: spellDays.filter(d => d.bucket === 'coinsurance').length,
    exhaustedDays: spellDays.filter(d => d.bucket === 'exhausted').length,
    lastCountedDay: last?.n ?? 0,
  }
}

/** Qualifying stay: 3 consecutive inpatient days (the day of discharge does not count), admitted to the SNF within 30 days of that discharge. */
export function qualifyingStay(input: { inpatientFrom?: string | null; inpatientTo?: string | null; snfAdmission: string; hasEvidence: boolean }) {
  const problems: string[] = []
  const { inpatientFrom: from, inpatientTo: to } = input
  if (!from || !to) problems.push('Record the hospital inpatient dates.')
  else {
    if (diff(from, to) < 3) problems.push('The hospital stay must be at least 3 inpatient days (discharge day does not count).')
    const gap = diff(to, input.snfAdmission)
    if (gap < 0) problems.push('The SNF admission is before the hospital discharge.')
    if (gap > 30) problems.push('Admission was more than 30 days after the hospital discharge.')
  }
  if (!input.hasEvidence) problems.push('Attach the hospital record as evidence.')
  return { ok: problems.length === 0, problems }
}

/** NOMNC / SNFABN clock (computed on read). Delivery must be at least 2 calendar days before the last covered day. */
export const NOTICE_LEAD_DAYS = 2
export function noticeDueBy(lastCoveredDay: string) { return addDays(lastCoveredDay, -NOTICE_LEAD_DAYS) }
export type NoticeState = { dueBy: string; status: 'delivered_in_time' | 'delivered_late' | 'due' | 'overdue'; daysLeft: number | null }
export function noticeState(lastCoveredDay: string, deliveredOn: string | null, today: string): NoticeState {
  const dueBy = noticeDueBy(lastCoveredDay)
  if (deliveredOn) return { dueBy, status: deliveredOn <= dueBy ? 'delivered_in_time' : 'delivered_late', daysLeft: null }
  return today > dueBy ? { dueBy, status: 'overdue', daysLeft: diff(today, dueBy) } : { dueBy, status: 'due', daysLeft: diff(today, dueBy) }
}

/** Concurrent review: the next review is due `intervalDays` after the last review, or sooner when the authorised days run out first. */
export function nextReviewDue(input: { authFrom: string; authTo: string; lastReviewOn?: string | null; intervalDays: number }) {
  const next = addDays(input.lastReviewOn ?? input.authFrom, input.intervalDays)
  return next > input.authTo ? input.authTo : next
}

/** Hospice election: the SNF bills the resident (or Medicaid) the room and board pass-through; the hospice agency pays the SNF. */
export function hospiceRoomBoardDays(election: { from: string; to?: string | null }, dates: readonly string[]) {
  return dates.filter(d => d >= election.from && (!election.to || d <= election.to))
}
