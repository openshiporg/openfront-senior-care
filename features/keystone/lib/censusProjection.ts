import { canonicalJson, sha256 } from './canonical'
import { addDays, localDate, zonedInstant } from './calendar'
import { DomainError, Codes } from './errors'

/**
 * The census grammar and projection (STATE-MACHINES §4.3), as one pure fold. Commands call
 * `applyCensusEvent` to validate the next event against the current projection; the rebuild folds
 * every stored event from scratch and must produce the same projection hash. No I/O here.
 *
 *   admission ( room_change | leave_start [hold_release] leave_end | coverage_change )* (discharge | death)
 *
 * Census-day convention: a resident counts on community-local day D when present (in house or on a
 * held leave) at 23:59 on D, so the admission day counts and the discharge day does not
 * (count_admit_not_discharge; Ohio Adm. Code 5160-3-16.4(C)(1) counts the admission/readmission day).
 */

export type CensusEventKind = 'admission' | 'readmission' | 'room_change' | 'leave_start' | 'hold_release' | 'leave_end' | 'coverage_change' | 'discharge' | 'death' | 'correction'

export type CensusEventInput = {
  seq: number
  kind: CensusEventKind
  effectiveAt: Date
  toBedId?: string | null
  toApartmentId?: string | null
  leaveKind?: string | null
  holdElected?: boolean | null
  holdPaidBy?: string | null
  dischargeDisposition?: string | null
}

export type OpenLeave = { startedAt: string; kind: string; holdElected: boolean; holdPaidBy: string; holdEndedAt: string | null; bedId: string | null; apartmentId: string | null }

export type StayProjection = {
  status: 'pre_admit' | 'admitted' | 'discharged' | 'deceased'
  presence: 'not_admitted' | 'in_house' | 'on_leave_hold' | 'on_leave_no_hold' | 'gone'
  currentBedId: string | null
  currentApartmentId: string | null
  heldBedId: string | null
  admittedAt: string | null
  endedAt: string | null
  dischargeDisposition: string | null
  openLeave: OpenLeave | null
  /** Paid Medicaid bed-hold days per calendar year (Ohio Adm. Code 5160-3-16.4(D)(1) cap is pack data). */
  medicaidHoldDaysByYear: Record<string, number>
  leaveCount: number
  lastSeq: number
  lastEffectiveAt: string | null
}

export const EMPTY_PROJECTION: StayProjection = {
  status: 'pre_admit', presence: 'not_admitted', currentBedId: null, currentApartmentId: null, heldBedId: null,
  admittedAt: null, endedAt: null, dischargeDisposition: null, openLeave: null, medicaidHoldDaysByYear: {}, leaveCount: 0, lastSeq: 0, lastEffectiveAt: null,
}

const fail = (message: string, details: Record<string, unknown> = {}) => {
  throw new DomainError(Codes.INVALID_TRANSITION, message, details)
}

/** Community-local census days (by year) on which the resident was away at 23:59, between two instants. */
export function leaveDaysByYear(timeZone: string, from: Date, to: Date): Record<string, number> {
  const out: Record<string, number> = {}
  if (to.getTime() <= from.getTime()) return out
  let day = localDate(timeZone, from)
  const last = localDate(timeZone, to)
  for (let i = 0; i < 800 && day <= last; i += 1) {
    const midnight = zonedInstant(timeZone, day, '23:59').getTime()
    if (midnight >= from.getTime() && midnight < to.getTime()) out[day.slice(0, 4)] = (out[day.slice(0, 4)] ?? 0) + 1
    day = addDays(day, 1)
  }
  return out
}

function addDaysByYear(into: Record<string, number>, add: Record<string, number>) {
  const out = { ...into }
  for (const [year, days] of Object.entries(add)) out[year] = (out[year] ?? 0) + days
  return out
}

/** Paid Medicaid hold days the open leave has used so far (up to `asOf`). */
export function openLeaveMedicaidDays(timeZone: string, leave: OpenLeave | null, asOf: Date) {
  if (!leave || !leave.holdElected || leave.holdPaidBy !== 'medicaid') return {}
  const end = leave.holdEndedAt ? new Date(leave.holdEndedAt) : asOf
  return leaveDaysByYear(timeZone, new Date(leave.startedAt), end)
}

export function applyCensusEvent(state: StayProjection, event: CensusEventInput, timeZone: string): StayProjection {
  if (event.seq !== state.lastSeq + 1) fail('Census events must be applied in order.', { reason: 'sequence' })
  const at = event.effectiveAt.toISOString()
  if (state.lastEffectiveAt && event.effectiveAt.getTime() < new Date(state.lastEffectiveAt).getTime()) {
    fail('This event is dated before the stay\'s latest census event. Record it as a correction.', { reason: 'out_of_order' })
  }
  const next: StayProjection = { ...state, lastSeq: event.seq, lastEffectiveAt: at }
  const terminal = state.status === 'discharged' || state.status === 'deceased'
  switch (event.kind) {
    case 'admission':
    case 'readmission': {
      if (state.status !== 'pre_admit') fail('The stay is already admitted.', { currentStatus: state.status })
      if (!event.toBedId === !event.toApartmentId) fail('An admission needs exactly one bed or apartment.')
      return { ...next, status: 'admitted', presence: 'in_house', currentBedId: event.toBedId ?? null, currentApartmentId: event.toApartmentId ?? null, admittedAt: at }
    }
    case 'room_change': {
      if (state.status !== 'admitted' || state.presence !== 'in_house') fail('A room change needs the resident in house.', { currentStatus: state.presence })
      if (!event.toBedId === !event.toApartmentId) fail('A room change needs exactly one target bed or apartment.')
      if ((event.toBedId && event.toBedId === state.currentBedId) || (event.toApartmentId && event.toApartmentId === state.currentApartmentId)) fail('The resident is already there.')
      return { ...next, currentBedId: event.toBedId ?? null, currentApartmentId: event.toApartmentId ?? null }
    }
    case 'leave_start': {
      if (state.status !== 'admitted' || state.presence !== 'in_house') fail('A leave can start only while the resident is in house.', { currentStatus: state.presence })
      const holdElected = Boolean(event.holdElected)
      const apartment = Boolean(state.currentApartmentId)
      // Residential apartments stay the resident's home while away (rent continues); beds are held only by election.
      const keepsPlace = holdElected || apartment
      const leave: OpenLeave = { startedAt: at, kind: event.leaveKind ?? 'other', holdElected: keepsPlace, holdPaidBy: keepsPlace ? (event.holdPaidBy ?? (apartment ? 'private' : 'none')) : 'none', holdEndedAt: null, bedId: state.currentBedId, apartmentId: state.currentApartmentId }
      return {
        ...next,
        presence: keepsPlace ? 'on_leave_hold' : 'on_leave_no_hold',
        heldBedId: holdElected && state.currentBedId ? state.currentBedId : null,
        currentBedId: keepsPlace ? state.currentBedId : null,
        currentApartmentId: state.currentApartmentId,
        openLeave: leave,
        leaveCount: state.leaveCount + 1,
      }
    }
    case 'hold_release': {
      if (state.presence !== 'on_leave_hold' || !state.openLeave || !state.heldBedId) fail('There is no bed hold to release.', { currentStatus: state.presence })
      const used = openLeaveMedicaidDays(timeZone, state.openLeave, event.effectiveAt)
      return {
        ...next,
        presence: 'on_leave_no_hold',
        heldBedId: null,
        currentBedId: null,
        medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used),
        openLeave: { ...state.openLeave!, holdElected: false, holdPaidBy: 'none', holdEndedAt: at },
      }
    }
    case 'leave_end': {
      if (state.status !== 'admitted' || !state.openLeave) fail('There is no open leave to end.', { currentStatus: state.presence })
      const leave = state.openLeave!
      const used = leave.holdEndedAt ? {} : openLeaveMedicaidDays(timeZone, leave, event.effectiveAt)
      let bedId = state.currentBedId
      let apartmentId = state.currentApartmentId
      if (state.presence === 'on_leave_no_hold') {
        if (!event.toBedId === !event.toApartmentId) fail('The resident returns without a held bed: choose an available bed or apartment.')
        bedId = event.toBedId ?? null
        apartmentId = event.toApartmentId ?? null
      } else if (event.toBedId || event.toApartmentId) {
        fail('The resident returns to the held place; use a room change afterwards to move them.')
      }
      return { ...next, presence: 'in_house', heldBedId: null, currentBedId: bedId, currentApartmentId: apartmentId, openLeave: null, medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used) }
    }
    case 'coverage_change': {
      if (state.status !== 'admitted') fail('Coverage changes need an admitted stay.', { currentStatus: state.status })
      return next
    }
    case 'discharge':
    case 'death': {
      if (terminal || state.status !== 'admitted') fail('Only an admitted stay can end.', { currentStatus: state.status })
      const used = state.openLeave && !state.openLeave.holdEndedAt ? openLeaveMedicaidDays(timeZone, state.openLeave, event.effectiveAt) : {}
      return {
        ...next,
        status: event.kind === 'death' ? 'deceased' : 'discharged',
        presence: 'gone',
        currentBedId: null,
        currentApartmentId: null,
        heldBedId: null,
        openLeave: null,
        endedAt: at,
        dischargeDisposition: event.kind === 'death' ? 'deceased' : (event.dischargeDisposition ?? 'other'),
        medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used),
      }
    }
    case 'correction':
      return fail('Corrections are recorded through the census correction flow.')
  }
}

export function foldCensus(events: readonly CensusEventInput[], timeZone: string): StayProjection {
  return [...events].sort((a, b) => a.seq - b.seq).reduce((state, event) => applyCensusEvent(state, event, timeZone), EMPTY_PROJECTION)
}

export const projectionHash = (projection: StayProjection) => sha256(canonicalJson(projection))

/** Where a resident is on community-local day D at 23:59 (the midnight census convention). */
export function presenceAt(events: readonly CensusEventInput[], timeZone: string, date: string) {
  const cutoff = zonedInstant(timeZone, date, '23:59').getTime()
  const upto = [...events].sort((a, b) => a.seq - b.seq).filter(event => event.effectiveAt.getTime() <= cutoff)
  return foldCensus(upto, timeZone)
}
