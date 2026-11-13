/**
 * Care Area Assessment triggers (RAI Manual chapter 4). Checked when a comprehensive assessment (admission, annual,
 * significant change) completes; each triggered area needs a CAA review and a care-plan decision. The triggers below are
 * the simple item rules this build captures, a subset of the CMS Care Area Trigger specification (verify note on each).
 */
import type { MdsItems } from '../pdpm/mapMds'

export const CAA_VERIFY_NOTE = 'Simplified triggers from the RAI Manual chapter 4 CAT logic; confirm each against the current CAT specification.'
const n = (v: string | undefined) => (v === undefined || v === '' || v === '-' || v === '^' ? null : Number(v))
const any = (items: MdsItems, ids: string[], test: (v: number) => boolean) => ids.some(id => { const v = n(items[id]); return v !== null && test(v) })

export const CAAS: { code: number; area: string; trigger: (i: MdsItems) => boolean }[] = [
  { code: 1, area: 'Delirium', trigger: i => n(i.C1310A) === 1 && (n(i.C1310B) ?? 0) >= 1 },
  { code: 2, area: 'Cognitive loss/dementia', trigger: i => { const b = n(i.C0500); return (b !== null && b <= 12) || (n(i.C1000) ?? 0) >= 1 } },
  { code: 3, area: 'Visual function', trigger: i => (n(i.B1000) ?? 0) >= 1 },
  { code: 4, area: 'Communication', trigger: i => (n(i.B0700) ?? 0) >= 1 },
  { code: 5, area: 'ADL functional/rehabilitation potential', trigger: i => any(i, ['GG0130A1', 'GG0130C1', 'GG0170D1', 'GG0170F1'], v => v >= 1 && v <= 3) },
  { code: 6, area: 'Urinary incontinence and indwelling catheter', trigger: i => (n(i.H0300) ?? 0) >= 1 && n(i.H0300) !== 9 },
  { code: 9, area: 'Mood state', trigger: i => (n(i.D0160) ?? 0) >= 10 },
  { code: 10, area: 'Behavioural symptoms', trigger: i => any(i, ['E0200A', 'E0200B', 'E0200C'], v => v >= 1) },
  { code: 11, area: 'Falls', trigger: i => n(i.J1800) === 1 },
  { code: 12, area: 'Nutritional status', trigger: i => (n(i.K0300) ?? 0) >= 1 },
  { code: 13, area: 'Feeding tube', trigger: i => n(i.K0510B2) === 1 },
  { code: 14, area: 'Dehydration/fluid maintenance', trigger: i => n(i.J1550C) === 1 },
  { code: 16, area: 'Pressure ulcer/injury', trigger: i => n(i.M0210) === 1 },
  { code: 17, area: 'Psychotropic medication use', trigger: i => n(i.N0415A1) === 1 },
  { code: 18, area: 'Physical restraints', trigger: i => n(i.P0100) === 1 },
  { code: 19, area: 'Pain', trigger: i => n(i.J0300) === 1 },
  { code: 20, area: 'Return to community referral', trigger: i => n(i.Q0400A) === 1 },
]

export const COMPREHENSIVE = new Set(['obra_admission', 'obra_annual', 'obra_significant_change'])

export function caaTriggers(kind: string, items: MdsItems) {
  if (!COMPREHENSIVE.has(kind)) return []
  return CAAS.filter(c => c.trigger(items)).map(c => ({ code: c.code, area: c.area }))
}
