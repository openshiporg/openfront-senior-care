import { addDays, daysBetween } from '../lib/calendar'

/**
 * The MDS calendar (RAI Manual chapter 2), worked out when a screen loads; no job. Each window gives the ARD range, the
 * completion deadline and the state against today and the records already done. Day 1 of a stay is the entry date.
 *
 * OBRA: admission ARD by day 14 (complete by day 14); quarterly ARD within 92 days of the last OBRA ARD; annual ARD within
 * 366 days of the last comprehensive ARD; completion 14 days after the ARD (comprehensive) or 14 days (quarterly).
 * PPS 5-day: ARD days 1-8 of the Part A stay (days 6-8 are grace). IPA: optional, ARD chosen by the facility.
 * Tracking: entry record within 7 days of entry; discharge record (and PPS discharge when Part A ends but the resident
 * stays, A0310H) completed within 14 days of the discharge or the end of Part A.
 * Transmission: within 14 days of the completion date.
 */

export const SCHEDULE_VERIFY_NOTE = 'Windows follow RAI Manual chapter 2 as summarised in STATE-MACHINES §6.1; confirm the grace days and the 92/366-day look-backs against the current RAI Manual.'

export type MdsRecord = { kind: string; ardDate: string; status: string; completedOn?: string | null }
export type WindowState = 'upcoming' | 'open' | 'due_today' | 'overdue' | 'done'
export type MdsWindow = { kind: string; reason: string; ardFrom: string; ardTo: string; completeBy: string; transmitBy: string; state: WindowState; record?: MdsRecord | null }

const DONE = new Set(['completed', 'exported', 'accepted'])
const LIVE = new Set(['in_progress', ...DONE])
const inWindow = (records: readonly MdsRecord[], kind: string | string[], from: string, to: string, statuses: Set<string>) =>
  records.find(r => (Array.isArray(kind) ? kind.includes(r.kind) : r.kind === kind) && statuses.has(r.status) && r.ardDate >= from && r.ardDate <= to) ?? null

/** Tracking records have a fixed ARD (the event date): only the completion deadline matters. */
const FIXED_ARD = new Set(['entry', 'death_in_facility', 'discharge_return_anticipated', 'discharge_return_not_anticipated'])

function state(today: string, w: { kind: string; ardFrom: string; ardTo: string; completeBy: string }, done: MdsRecord | null, started: MdsRecord | null): WindowState {
  if (done) return 'done'
  if (today < w.ardFrom) return 'upcoming'
  if (today > w.completeBy) return 'overdue'
  // Once the ARD is set (a record started in the window, or a tracking record), the work is open until the completion date.
  if (started || FIXED_ARD.has(w.kind)) return today === w.completeBy ? 'due_today' : 'open'
  if (today > w.ardTo) return 'overdue' // the ARD window passed with no record: the assessment is late
  return today === w.ardTo ? 'due_today' : 'open'
}

export type StayFacts = {
  /** Date of the most recent entry (admission or reentry) to the facility. */
  entryDate: string
  /** Part A stretches during this stay; open one has to=null. */
  partA: { from: string; to: string | null }[]
  /** Date of discharge, if the resident has left. */
  dischargeDate?: string | null
  /** Whether a return is anticipated (picks the discharge record kind). */
  returnAnticipated?: boolean
  died?: boolean
}

export function mdsWindows(facts: StayFacts, records: readonly MdsRecord[], today: string): MdsWindow[] {
  const out: MdsWindow[] = []
  const push = (w: Omit<MdsWindow, 'state' | 'record' | 'transmitBy'>, kinds: string[] = [w.kind]) => {
    const record = inWindow(records, kinds, w.ardFrom, w.ardTo, DONE)
    const started = record ?? inWindow(records, kinds, w.ardFrom, w.ardTo, LIVE)
    out.push({ ...w, transmitBy: addDays(w.completeBy, 14), record: started, state: state(today, w, record, started) })
  }
  const entry = facts.entryDate
  // Entry tracking record: ARD = the entry date, complete within 7 days.
  push({ kind: 'entry', reason: 'Entry tracking record', ardFrom: entry, ardTo: entry, completeBy: addDays(entry, 6) })

  // OBRA admission, then quarterlies and the annual from the last OBRA / comprehensive ARD.
  const obra = ['obra_admission', 'obra_quarterly', 'obra_annual', 'obra_significant_change']
  push({ kind: 'obra_admission', reason: 'OBRA admission (comprehensive)', ardFrom: entry, ardTo: addDays(entry, 13), completeBy: addDays(entry, 13) }, ['obra_admission'])
  const lastObra = [...records].filter(r => obra.includes(r.kind) && DONE.has(r.status)).sort((a, b) => (a.ardDate < b.ardDate ? 1 : -1))[0]
  const lastComprehensive = [...records].filter(r => ['obra_admission', 'obra_annual', 'obra_significant_change'].includes(r.kind) && DONE.has(r.status)).sort((a, b) => (a.ardDate < b.ardDate ? 1 : -1))[0]
  const gone = facts.dischargeDate && facts.dischargeDate <= today
  if (lastObra && !gone) {
    const annualDue = lastComprehensive ? addDays(lastComprehensive.ardDate, 366) : null
    const quarterlyDue = addDays(lastObra.ardDate, 92)
    if (annualDue && annualDue <= quarterlyDue) push({ kind: 'obra_annual', reason: 'OBRA annual (within 366 days of the last comprehensive)', ardFrom: addDays(lastObra.ardDate, 1), ardTo: annualDue, completeBy: addDays(annualDue, 14) })
    else push({ kind: 'obra_quarterly', reason: 'OBRA quarterly (within 92 days of the last OBRA ARD)', ardFrom: addDays(lastObra.ardDate, 1), ardTo: quarterlyDue, completeBy: addDays(quarterlyDue, 14) }, ['obra_quarterly', 'obra_annual', 'obra_significant_change'])
  }

  // PPS: a 5-day per Part A stretch (days 1-8); a PPS discharge when Part A ends but the resident stays.
  for (const stretch of facts.partA) {
    push({ kind: 'pps_5day', reason: 'PPS 5-day (Part A day 1-8, 6-8 grace)', ardFrom: stretch.from, ardTo: addDays(stretch.from, 7), completeBy: addDays(stretch.from, 7 + 14) })
    if (stretch.to && (!facts.dischargeDate || facts.dischargeDate > stretch.to)) {
      push({ kind: 'pps_discharge', reason: 'PPS discharge (Part A ended, resident stays: A0310H=1)', ardFrom: stretch.to, ardTo: addDays(stretch.to, 2), completeBy: addDays(stretch.to, 14) })
    }
  }

  // Discharge or death in facility.
  if (facts.dischargeDate) {
    const kind = facts.died ? 'death_in_facility' : facts.returnAnticipated ? 'discharge_return_anticipated' : 'discharge_return_not_anticipated'
    push({ kind, reason: facts.died ? 'Death in facility tracking record' : 'OBRA discharge', ardFrom: facts.dischargeDate, ardTo: facts.dischargeDate, completeBy: addDays(facts.dischargeDate, 13) })
  }
  return out.sort((a, b) => (a.ardTo < b.ardTo ? -1 : a.ardTo > b.ardTo ? 1 : a.kind < b.kind ? -1 : 1))
}

/** Part A day number of `date` in the stretch that contains it (day 1 = first covered day). */
export const partADay = (from: string, date: string) => daysBetween(from, date) + 1

/** An IPA's ARD must fall inside a Part A stretch and after the 5-day; its HIPPS applies from the ARD (STATE-MACHINES §6.4). */
export function ipaAllowed(facts: StayFacts, records: readonly MdsRecord[], ard: string) {
  const stretch = facts.partA.find(s => s.from <= ard && (!s.to || ard <= s.to))
  if (!stretch) return { ok: false as const, reason: 'The ARD is not in a Part A stay.' }
  const five = records.find(r => r.kind === 'pps_5day' && DONE.has(r.status) && r.ardDate >= stretch.from)
  if (!five) return { ok: false as const, reason: 'Complete the 5-day assessment first.' }
  if (ard <= five.ardDate) return { ok: false as const, reason: 'An IPA ARD must be after the 5-day ARD.' }
  return { ok: true as const }
}
