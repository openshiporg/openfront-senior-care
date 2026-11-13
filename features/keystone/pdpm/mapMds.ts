import type { ClinicalCategory, CognitiveLevel, PdpmInput } from './classify'
import { ICD_CATEGORY_STARTER, NTA_POINTS } from './tables'

/** MDS items (flat, by item code) -> classifier input. Unknown or missing items are treated as absent. */
export type MdsItems = Record<string, string | undefined>

export function categoryFromIcd(code: string | undefined, override: Record<string, string> = {}): ClinicalCategory {
  const clean = (code ?? '').replace('.', '').toUpperCase()
  const map = { ...ICD_CATEGORY_STARTER, ...override }
  for (const len of [3, 2, 1]) {
    const hit = map[clean.slice(0, len)]
    if (hit) return hit as ClinicalCategory
  }
  return 'medical_mgmt'
}

const yes = (v: string | undefined) => v === '1' || v === 'true' || v === 'Y'

export function cognition(items: MdsItems): CognitiveLevel {
  const bims = items.C0500 !== undefined && items.C0500 !== '' ? Number.parseInt(items.C0500, 10) : null
  if (bims !== null && !Number.isNaN(bims) && bims <= 15) return bims >= 13 ? 'intact' : bims >= 8 ? 'mild' : 'moderate'
  // Staff assessment: decision making (C1000) 3 = severely impaired, 2 moderate, 1 mild. verify: the CMS CPS uses more items.
  if (items.C1000 !== undefined && items.C1000 !== '' && items.C1000 !== '-') return (['intact', 'mild', 'moderate', 'severe'] as const)[Math.min(3, Number.parseInt(items.C1000, 10) || 0)]
  const cps = Number.parseInt(items.CPS ?? '0', 10)
  return cps >= 5 ? 'severe' : cps >= 3 ? 'moderate' : cps >= 1 ? 'mild' : 'intact'
}

const ITEM_TO_NTA: Record<string, string> = {
  O0110H2: 'iv_medication', O0110F2: 'ventilator', O0110I2: 'transfusion', O0110E2: 'tracheostomy', O0110M2: 'isolation', O0110B2: 'radiation', O0110D2: 'suctioning', I5200: 'multiple_sclerosis', I6200: 'chronic_lung_disease',
  I2500: 'wound_infection', I2900: 'diabetes', I1700: 'mdro', I1300: 'inflammatory_bowel', I5600: 'malnutrition', K0510B2: 'feeding_tube', H0100C: 'ostomy', H0100D: 'intermittent_catheterization', M1040B: 'diabetic_foot_ulcer', M0300D1: 'pressure_ulcer_stage4',
}

export function mdsToPdpmInput(items: MdsItems, options: { icdOverride?: Record<string, string>; aids?: boolean } = {}): PdpmInput {
  const gg: Record<string, string | undefined> = {}
  for (const key of Object.keys(items)) if (key.startsWith('GG')) gg[key] = items[key]
  // Section O items count in either column (1 = on admission, 2 = while a resident): normalise to the column-2 key.
  const ntaKey = (k: string) => (/^O0110[A-Z]1$/.test(k) ? `${k.slice(0, -1)}2` : k)
  const nta = new Set<string>(Object.keys(items).filter(k => yes(items[k]) && ITEM_TO_NTA[ntaKey(k)] && NTA_POINTS[ITEM_TO_NTA[ntaKey(k)]]).map(k => ITEM_TO_NTA[ntaKey(k)]))
  for (const key of (items.I8000 ?? '').split(',').map(s => s.trim()).filter(Boolean)) if (NTA_POINTS[key]) nta.add(key)
  const cannotWalk = ['07', '88', '09', '10'].includes((items.GG0170I1 ?? '').padStart(2, '0'))
  return {
    clinicalCategory: categoryFromIcd(items.I0020B, options.icdOverride), gg, cannotWalk, cognition: cognition(items),
    slpComorbidity: yes(items.SLP_COMORBIDITY) || yes(items.I4300) || yes(items.I4500) || yes(items.I4900),
    mechanicallyAlteredDiet: yes(items.K0510C1) || yes(items.K0510C2), swallowingDisorder: yes(items.K0100),
    tracheostomy: yes(items.O0110E1), ventilator: yes(items.O0110F1), isolation: yes(items.O0110M1),
    specialCareHigh: yes(items.NURSING_SCH), specialCareLow: yes(items.NURSING_SCL), clinicallyComplex: yes(items.NURSING_CC), behavioral: yes(items.NURSING_BEHAVIOR),
    depression: Number.parseInt(items.D0160 ?? '0', 10) >= 10, restorativeNursingCount: Number.parseInt(items.H_RESTORATIVE ?? '0', 10) || 0,
    ntaConditions: [...nta], aids: options.aids ?? false,
  }
}
