import { addDays } from '../lib/calendar'
import { dec } from '../lib/decimal'
import { roundToMinor } from '../lib/money'
import { countCoveredDays, type CountedDay } from '../coverage/medicare'
import { perDiem, vpdDayNumber, type PdpmRates, type StaySegment } from '../pdpm/classify'

/**
 * Medicare Part A and hospice days for the billing derivation (pure). A Part A day bills the PDPM per diem of the
 * classification in force that day (the 5-day from day 1 of the Part A stretch, an IPA from its ARD), on the variable
 * per-diem day number (interrupted stays continue the count). Days 21-100 of the benefit period split into the Medicare
 * claim (per diem less coinsurance) and the resident's coinsurance; day 101 on is not covered and is a problem until the
 * coverage is ended and the next payer opened. Hospice days bill the hospice agency room and board at its share of the
 * nursing-facility daily rate.
 */

export type ClassificationIn = { id: string; effectiveFrom: string; hipps: string; cmi: { pt: string; ot: string; slp: string; nursing: string; nta: string }; aids: boolean }
export type MedicareStayIn = {
  stayId: string
  /** Every Part A stretch of the resident at this facility (all stays), for the day count and the interrupted-stay rule. */
  stretches: StaySegment[]
  priorDaysUsed: number
  classifications: ClassificationIn[]
  qualifyingStayOk: boolean
  skilledCertOk: boolean
}
export type MedicareRatesIn = { rates: PdpmRates; laborShare: string; wageIndex: string; coinsuranceMinor: bigint; version: string }
export type MedicareInput = { stays: MedicareStayIn[]; rates: MedicareRatesIn | null }
export type HospiceIn = { stayId: string; roomBoardBps: number }

/** Every date of the stretches up to `through` (inclusive). */
export function stretchDates(stretches: readonly StaySegment[], through: string) {
  const out: string[] = []
  for (const s of [...stretches].sort((a, b) => (a.from < b.from ? -1 : 1))) {
    const end = s.to && s.to < through ? s.to : through
    for (let d = s.from; d <= end; d = addDays(d, 1)) out.push(d)
  }
  return [...new Set(out)].sort()
}

export function benefitDays(stay: MedicareStayIn, through: string): Map<string, CountedDay> {
  return new Map(countCoveredDays(stretchDates(stay.stretches, through), { priorDaysUsed: stay.priorDaysUsed }).map(d => [d.date, d]))
}

export function classificationOn(stay: MedicareStayIn, date: string) {
  return [...stay.classifications].filter(c => c.effectiveFrom <= date).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : a.id < b.id ? 1 : -1))[0] ?? null
}

export type MedicareDay =
  | { kind: 'billed'; benefitDay: number; vpdDay: number; classification: ClassificationIn; pdpmMinor: bigint; coinsuranceMinor: bigint; components: Record<string, string> }
  | { kind: 'problem'; code: 'missing_assessment' | 'benefit_exhausted' | 'missing_rate' }

export function medicareDay(stay: MedicareStayIn, counted: Map<string, CountedDay>, rates: MedicareRatesIn | null, date: string): MedicareDay {
  if (!rates) return { kind: 'problem', code: 'missing_rate' }
  const day = counted.get(date)
  if (!day || day.bucket === 'exhausted') return { kind: 'problem', code: 'benefit_exhausted' }
  const cls = classificationOn(stay, date)
  if (!cls) return { kind: 'problem', code: 'missing_assessment' }
  const vpdDay = vpdDayNumber(stay.stretches, date) ?? day.n
  const labor = { pt: rates.laborShare, ot: rates.laborShare, slp: rates.laborShare, nursing: rates.laborShare, nta: rates.laborShare, nonCaseMix: rates.laborShare }
  const pd = perDiem({ cmi: cls.cmi, aids: cls.aids }, rates.rates, vpdDay, { wageIndex: rates.wageIndex, labor })
  const coinsuranceMinor = day.bucket === 'coinsurance' ? (rates.coinsuranceMinor < pd.totalMinor ? rates.coinsuranceMinor : pd.totalMinor) : 0n
  return { kind: 'billed', benefitDay: day.n, vpdDay, classification: cls, pdpmMinor: pd.totalMinor, coinsuranceMinor, components: Object.fromEntries(Object.entries(pd.componentsMinor).map(([k, v]) => [k, v.toString()])) }
}

/** Hospice room and board: the facility's daily rate times the pass-through share (basis points), rounded half-even. */
export const hospiceRoomBoard = (dailyMinor: bigint, bps: number) => roundToMinor(dec(dailyMinor).times(bps).div(10_000))
