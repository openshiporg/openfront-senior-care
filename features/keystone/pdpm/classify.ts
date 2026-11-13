import { type Decimal, dec } from '../lib/decimal'
import { toMinor } from '../lib/money'
import * as T from './tables'

/** PDPM classifier (STATE-MACHINES §6.3). A pure function of the MDS-derived input: same input -> same groups, HIPPS and CMIs. */

export type ClinicalCategory = 'major_joint' | 'other_ortho' | 'medical_mgmt' | 'nonortho_surgery' | 'acute_neuro' | 'cancer' | 'pulmonary' | 'cardiovascular' | 'infection'
export type CognitiveLevel = 'intact' | 'mild' | 'moderate' | 'severe'

export type PdpmInput = {
  clinicalCategory: ClinicalCategory
  /** GG item responses by item code (01-10, 88; missing counts as 0). */
  gg: Record<string, string | undefined>
  cannotWalk?: boolean
  cognition: CognitiveLevel
  acuteNeuro?: boolean
  slpComorbidity?: boolean
  mechanicallyAlteredDiet?: boolean
  swallowingDisorder?: boolean
  tracheostomy?: boolean
  ventilator?: boolean
  isolation?: boolean
  specialCareHigh?: boolean
  specialCareLow?: boolean
  clinicallyComplex?: boolean
  behavioral?: boolean
  depression?: boolean
  restorativeNursingCount?: number
  ntaConditions?: string[]
  aids?: boolean
}

const GG_POINTS: Record<string, number> = { '06': 4, '05': 4, '04': 3, '03': 2, '02': 1 }
const ggScore = (value: string | undefined) => GG_POINTS[(value ?? '').padStart(2, '0')] ?? 0
/**
 * Function scores. The averages (bed mobility of 2, transfers of 3, walking of 2) are kept exact by working in sixths; only the
 * total is rounded, half up. verify: CMS PDPM grouper rounding point (RAI manual ch. 6); no golden case here depends on it.
 */
export const FUNCTION_ROUNDING_VERIFY = 'Averages kept exact, total rounded half up; confirm against the RAI Manual chapter 6 PDPM calculation worksheet.'
const roundSixths = (sixths: number) => Math.floor((sixths + 3) / 6)
export function functionScores(input: Pick<PdpmInput, 'gg' | 'cannotWalk'>) {
  const g = input.gg
  const eating = ggScore(g.GG0130A1), oral = ggScore(g.GG0130B1), toileting = ggScore(g.GG0130C1)
  const bed3 = 3 * (ggScore(g.GG0170B1) + ggScore(g.GG0170C1))
  const transfers2 = 2 * (ggScore(g.GG0170D1) + ggScore(g.GG0170E1) + ggScore(g.GG0170F1))
  const walking3 = input.cannotWalk ? 0 : 3 * (ggScore(g.GG0170J1) + ggScore(g.GG0170K1))
  return { ptOt: roundSixths(6 * (eating + oral + toileting) + bed3 + transfers2 + walking3), nursing: roundSixths(6 * (eating + toileting) + bed3 + transfers2) }
}

const ptOtBand = (score: number) => (score <= 5 ? 0 : score <= 9 ? 1 : score <= 23 ? 2 : 3)
export function ptOtCategory(c: ClinicalCategory): T.PtOtCategory {
  if (c === 'major_joint') return 'major_joint'
  if (c === 'other_ortho') return 'other_ortho'
  if (c === 'nonortho_surgery' || c === 'acute_neuro') return 'nonortho_surg_neuro'
  return 'medical_mgmt'
}

export function slpGroup(input: PdpmInput): string {
  const count = [input.acuteNeuro || input.clinicalCategory === 'acute_neuro', Boolean(input.slpComorbidity), input.cognition !== 'intact'].filter(Boolean).length
  const swallow = [input.mechanicallyAlteredDiet, input.swallowingDisorder].filter(Boolean).length
  const either = swallow === 0 ? 0 : swallow === 1 ? 1 : 2
  const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  return `S${letters[count * 3 + either]}`
}

export function nursingGroup(input: PdpmInput, nursingFunction: number): string {
  const dep = input.depression ? '2' : '1'
  const rest = (input.restorativeNursingCount ?? 0) >= 2 ? '2' : '1'
  // Extensive services need function 0-14; at 15-16 the resident is classified clinically complex (CMS).
  const extensive = Boolean(input.tracheostomy || input.ventilator || input.isolation)
  if (extensive && nursingFunction <= 14) {
    if (input.tracheostomy && input.ventilator) return 'ES3'
    if (input.tracheostomy || input.ventilator) return 'ES2'
    return 'ES1'
  }
  if (input.specialCareHigh && nursingFunction <= 14) return nursingFunction <= 5 ? `HDE${dep}` : `HBC${dep}`
  if (input.specialCareLow && nursingFunction <= 14) return nursingFunction <= 5 ? `LDE${dep}` : `LBC${dep}`
  // Special care with function 15-16 classifies as clinically complex (CMS).
  if (input.clinicallyComplex || input.specialCareHigh || input.specialCareLow || extensive) return nursingFunction <= 5 ? `CDE${dep}` : nursingFunction <= 14 ? `CBC${dep}` : `CA${dep}`
  if (input.behavioral && nursingFunction >= 11) return `BAB${rest}`
  if (nursingFunction <= 5) return `PDE${rest}`
  if (nursingFunction <= 14) return `PBC${rest}`
  return `PA${rest}`
}

export function ntaScore(conditions: readonly string[], aids = false) {
  const set = new Set(conditions)
  if (aids) set.add('hiv_aids')
  let score = 0
  for (const key of [...set].sort()) score += T.NTA_POINTS[key]?.points ?? 0
  const group = T.NTA_GROUPS.find(g => score >= g.min)!.group
  return { score, group }
}

export type PdpmResult = {
  version: string
  functionScore: { ptOt: number; nursing: number }
  groups: { pt: string; ot: string; slp: string; nursing: string; nta: string }
  /** NTA group on the HIPPS (MDS only); differs from groups.nta only for AIDS. */
  hippsNta: string
  ntaScore: number
  aids: boolean
  hipps: string
  cmi: { pt: string; ot: string; slp: string; nursing: string; nta: string }
}

export type PdpmTables = { ptCmi: Record<string, string>; otCmi: Record<string, string>; slpCmi: Record<string, string>; nursingCmi: Record<string, string>; ntaCmi: Record<string, string> }
export const DEFAULT_TABLES: PdpmTables = { ptCmi: T.PT_CMI, otCmi: T.OT_CMI, slpCmi: T.SLP_CMI, nursingCmi: T.NURSING_CMI, ntaCmi: T.NTA_CMI }

export function classify(input: PdpmInput, indicator: 'five_day' | 'ipa' | 'obra' = 'five_day', tables: PdpmTables = DEFAULT_TABLES): PdpmResult {
  const fn = functionScores(input)
  const category = ptOtCategory(input.clinicalCategory)
  const ptOt = T.PT_OT_GROUP[category][ptOtBand(fn.ptOt)]
  const slp = slpGroup(input)
  const nursing = nursingGroup(input, fn.nursing)
  // HIV/AIDS is on the claim (ICD-10 B20), not the MDS: the HIPPS carries the MDS-only NTA group and the CMS PRICER adds the 8 points
  // (and the 18% nursing add-on) to payment. So `hippsNta` excludes AIDS and `groups.nta` (what is paid) includes it.
  const mdsNta = ntaScore((input.ntaConditions ?? []).filter(c => c !== 'hiv_aids'), false)
  const nta = ntaScore(input.ntaConditions ?? [], input.aids)
  const hipps = `${T.PT_OT_LETTER[ptOt]}${T.SLP_LETTER[slp]}${T.NURSING_LETTER[nursing]}${T.NTA_LETTER[mdsNta.group]}${T.ASSESSMENT_INDICATOR[indicator]}`
  return {
    version: T.PDPM_VERSION, functionScore: fn, groups: { pt: ptOt, ot: ptOt, slp, nursing, nta: nta.group }, hippsNta: mdsNta.group, ntaScore: nta.score, aids: Boolean(input.aids), hipps,
    cmi: { pt: tables.ptCmi[ptOt], ot: tables.otCmi[ptOt], slp: tables.slpCmi[slp], nursing: tables.nursingCmi[nursing], nta: tables.ntaCmi[nta.group] },
  }
}

export type PdpmRates = { pt: string; ot: string; slp: string; nursing: string; nta: string; nonCaseMix: string }
export type PerDiem = { day: number; componentsMinor: { pt: bigint; ot: bigint; slp: bigint; nursing: bigint; nta: bigint; nonCaseMix: bigint }; totalMinor: bigint; vpd: { ptOt: string; nta: string } }

/** Wage-adjusted component rate: base x (labor x wageIndex + (1 - labor)). */
export function adjustedRate(base: string, labor: string, wageIndex: string): Decimal {
  const l = dec(labor)
  return dec(base).times(l.times(dec(wageIndex)).plus(dec(1).minus(l)))
}

/**
 * The per diem for one day of the stay (day 1 = first day of the stay under the current interrupted-stay rule). Each component is
 * rate x CMI x VPD, rounded to the cent half-even, then summed (CMS pays each component rounded to the cent).
 */
export function perDiem(result: Pick<PdpmResult, 'cmi' | 'aids'>, rates: PdpmRates, day: number, options: { wageIndex?: string; labor?: Partial<Record<keyof PdpmRates, string>> } = {}): PerDiem {
  const wi = options.wageIndex ?? '1'
  const rate = (k: keyof PdpmRates) => adjustedRate(rates[k], options.labor?.[k] ?? T.LABOR_SHARE[k], wi)
  const ptVpd = T.ptOtVpd(day), ntVpd = T.ntaVpd(day)
  let nursing = rate('nursing').times(result.cmi.nursing)
  if (result.aids) nursing = nursing.times(T.AIDS_NURSING_ADDON)
  const c = {
    pt: toMinor(rate('pt').times(result.cmi.pt).times(ptVpd)), ot: toMinor(rate('ot').times(result.cmi.ot).times(ptVpd)), slp: toMinor(rate('slp').times(result.cmi.slp)),
    nursing: toMinor(nursing), nta: toMinor(rate('nta').times(result.cmi.nta).times(ntVpd)), nonCaseMix: toMinor(rate('nonCaseMix')),
  }
  return { day, componentsMinor: c, totalMinor: c.pt + c.ot + c.slp + c.nursing + c.nta + c.nonCaseMix, vpd: { ptOt: ptVpd, nta: ntVpd } }
}

/**
 * Interrupted stay. Reading used: CMS RAI Version 3.0 Manual ch. 2 (Assessments for the RAI), "Interrupted Stay": the interruption
 * window is 3 consecutive calendar days that START WITH THE DAY OF DISCHARGE and the 2 FOLLOWING calendar days, ending at 11:59 pm
 * on the third day. A stretch's `to` is the last covered Part A day L (midnight census), so the day of discharge is L+1 and the window
 * is L+1..L+3: a return on L+3 or earlier continues the variable per-diem day count (no new 5-day assessment); a return on L+4 or
 * later is a NEW stay (VPD day 1, NTA x3, new 5-day). `stays` are the covered Part A stretches at this SNF ({from, to} inclusive,
 * to=null for the open one). Returns the VPD day number.
 */
export const INTERRUPTED_STAY_DAYS = 3
export type StaySegment = { from: string; to: string | null }
export function vpdDayNumber(stays: readonly StaySegment[], day: string): number | null {
  let count = 0
  let prevEnd: string | null = null
  for (const s of [...stays].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    if (prevEnd !== null && !isInterruptedStay(prevEnd, s.from)) count = 0
    const end = s.to ?? day
    if (day >= s.from && day <= end) return count + daysBetween(s.from, day) + 1
    if (day < s.from) return null
    count += daysBetween(s.from, end) + 1
    prevEnd = end
  }
  return null
}
/** True when the return on `returnOn` after leaving on `leftOn` (L = last covered day; the return must fall on L+1..L+3) is an interrupted stay. */
export const isInterruptedStay = (leftOn: string, returnOn: string) => daysBetween(leftOn, returnOn) <= INTERRUPTED_STAY_DAYS
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
