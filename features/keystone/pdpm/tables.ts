import { Decimal, toScale } from '../lib/decimal'
/**
 * PDPM reference tables for FY2026 (Oct 1 2025 - Sep 30 2026), RESEARCH §8.2 and the CMS PDPM training deck.
 * Every number is a decimal STRING (SCHEMA G3): they are loaded into PdpmMappingVersion / ReferenceRate rows and parsed with decimal.js.
 * The CMIs and rates were transcribed from CMS FY2026 resources; the tables are data, not logic, so a new fiscal year ships as a new version.
 */
export const PDPM_VERSION = 'FY2026'
export const PDPM_EFFECTIVE_FROM = '2025-10-01'
export const PDPM_EFFECTIVE_TO = '2026-09-30'

export const PDPM_VERIFY_NOTE =
  'FY2026 CMIs and unadjusted urban rates were transcribed from CMS FY2026 resources (PDPM resources sheet, RESEARCH §8.2). Re-check every figure against the CMS final rule tables before first live claim; hand-check the golden cases.'

/** Unadjusted federal per diem, urban (RESEARCH §8.2 [S41]). */
export const UNADJUSTED_URBAN = { pt: '75.73', ot: '70.49', slp: '28.28', nursing: '132.00', nta: '99.59', nonCaseMix: '118.21' } as const

/** Labor-related share per component, used with the area wage index. verify: carried from the CMS final rule; confirm for FY2026. */
export const LABOR_SHARE = { pt: '0.702', ot: '0.702', slp: '0.702', nursing: '0.702', nta: '0.702', nonCaseMix: '0.702' } as const
export const LABOR_SHARE_VERIFY = 'Labor share 70.2% carried from the CMS final rule; confirm the FY2026 value. With wage index 1.0000 it has no effect.'

export const PT_OT_BANDS = ['0-5', '6-9', '10-23', '24'] as const
export type PtOtCategory = 'major_joint' | 'other_ortho' | 'medical_mgmt' | 'nonortho_surg_neuro'

/** Group letter by category and band: TA..TP. */
export const PT_OT_GROUP: Record<PtOtCategory, readonly string[]> = {
  major_joint: ['TA', 'TB', 'TC', 'TD'],
  other_ortho: ['TE', 'TF', 'TG', 'TH'],
  medical_mgmt: ['TI', 'TJ', 'TK', 'TL'],
  nonortho_surg_neuro: ['TM', 'TN', 'TO', 'TP'],
}
export const PT_CMI: Record<string, string> = { TA: '1.45', TB: '1.61', TC: '1.78', TD: '1.81', TE: '1.34', TF: '1.52', TG: '1.58', TH: '1.10', TI: '1.07', TJ: '1.34', TK: '1.44', TL: '1.03', TM: '1.20', TN: '1.40', TO: '1.47', TP: '1.02' }
export const OT_CMI: Record<string, string> = { TA: '1.41', TB: '1.54', TC: '1.60', TD: '1.45', TE: '1.33', TF: '1.51', TG: '1.55', TH: '1.09', TI: '1.12', TJ: '1.37', TK: '1.46', TL: '1.05', TM: '1.23', TN: '1.42', TO: '1.47', TP: '1.03' }

export const SLP_CMI: Record<string, string> = { SA: '0.64', SB: '1.72', SC: '2.52', SD: '1.38', SE: '2.21', SF: '2.82', SG: '1.93', SH: '2.70', SI: '3.34', SJ: '2.83', SK: '3.50', SL: '3.98' }
export const NURSING_CMI: Record<string, string> = {
  ES3: '3.84', ES2: '2.90', ES1: '2.77', HDE2: '2.27', HDE1: '1.88', HBC2: '2.12', HBC1: '1.76', LDE2: '1.97', LDE1: '1.64', LBC2: '1.63', LBC1: '1.35', CDE2: '1.77', CDE1: '1.53',
  CBC2: '1.47', CBC1: '1.27', CA2: '1.03', CA1: '0.89', BAB2: '0.98', BAB1: '0.94', PDE2: '1.48', PDE1: '1.39', PBC2: '1.15', PA2: '0.67', PBC1: '1.07', PA1: '0.62',
}
export const NTA_CMI: Record<string, string> = { NA: '3.06', NB: '2.39', NC: '1.74', ND: '1.26', NE: '0.91', NF: '0.68' }

/** HIPPS letters: position 1 PT/OT group, 2 SLP, 3 nursing, 4 NTA. */
export const PT_OT_LETTER: Record<string, string> = Object.fromEntries(Object.values(PT_OT_GROUP).flat().map((g, i) => [g, String.fromCharCode(65 + i)]))
export const SLP_LETTER: Record<string, string> = Object.fromEntries(Object.keys(SLP_CMI).map((g, i) => [g, String.fromCharCode(65 + i)]))
/** CMS HIPPS order for nursing (Noridian JE crosswalk): note CBC2, CA2, CBC1, CA1 and PBC2, PA2, PBC1, PA1. */
export const NURSING_HIPPS_ORDER = ['ES3', 'ES2', 'ES1', 'HDE2', 'HDE1', 'HBC2', 'HBC1', 'LDE2', 'LDE1', 'LBC2', 'LBC1', 'CDE2', 'CDE1', 'CBC2', 'CA2', 'CBC1', 'CA1', 'BAB2', 'BAB1', 'PDE2', 'PDE1', 'PBC2', 'PA2', 'PBC1', 'PA1'] as const
export const NURSING_LETTER: Record<string, string> = Object.fromEntries(NURSING_HIPPS_ORDER.map((g, i) => [g, String.fromCharCode(65 + i)]))
export const NTA_LETTER: Record<string, string> = Object.fromEntries(Object.keys(NTA_CMI).map((g, i) => [g, String.fromCharCode(65 + i)]))
/** Fifth HIPPS character (CMS MLN MM11152 / Noridian crosswalk): 0 IPA, 1 PPS 5-day, 6 OBRA. */
export const ASSESSMENT_INDICATOR: Record<string, string> = { ipa: '0', five_day: '1', obra: '6' }
export const HIPPS_SOURCE_NOTE = 'HIPPS letters and the assessment indicator follow the CMS crosswalk (MLN MM11152; Noridian JE "HIPPS Coding for PDPM", example TC/SD/PBC1/NE 5-day = CDXE1).'

/** Default billing when no valid assessment exists (CMS): HIPPS ZZZZZ = TP / TP / SA / PA1 / NF. */
export const DEFAULT_GROUPS = { ptOt: 'TP', slp: 'SA', nursing: 'PA1', nta: 'NF' } as const

/** Variable per-diem adjustment (VPD). PT/OT drop 2% per 7-day block from day 21; NTA is tripled on days 1-3. */
export function ptOtVpd(day: number): string {
  if (day <= 20) return '1.00'
  const block = Math.floor((day - 21) / 7) + 1
  return toScale(new Decimal(1).minus(new Decimal('0.02').times(block)), 2)
}
export const ntaVpd = (day: number) => (day <= 3 ? '3.00' : '1.00')
export const VPD_VERIFY_NOTE = 'PT/OT adjustment 1.00 days 1-20, then -0.02 per 7-day block (0.98 on 21-27 ... 0.76 on 98-100); NTA x3 days 1-3. Interrupted-stay window 3 consecutive days is carried from RESEARCH §8.2 (verify).'
export const AIDS_NURSING_ADDON = '1.18'

/** NTA conditions: key -> points (CMS deck pp 35-38). `source` documents the MDS item. */
export const NTA_POINTS: Record<string, { points: number; source: string }> = {
  hiv_aids: { points: 8, source: 'SNF claim B20' }, parenteral_iv_high: { points: 7, source: 'K0510A2' }, iv_medication: { points: 5, source: 'O0110H2' }, ventilator: { points: 4, source: 'O0110F2' },
  parenteral_iv_low: { points: 3, source: 'K0710' }, lung_transplant: { points: 3, source: 'I8000' }, transfusion: { points: 2, source: 'O0110I2' }, major_organ_transplant: { points: 2, source: 'I8000' },
  multiple_sclerosis: { points: 2, source: 'I5200' }, opportunistic_infection: { points: 2, source: 'I8000' }, chronic_lung_disease: { points: 2, source: 'I6200' }, bone_joint_infection: { points: 2, source: 'I8000' },
  chronic_myeloid_leukemia: { points: 2, source: 'I8000' }, wound_infection: { points: 2, source: 'I2500' }, diabetes: { points: 2, source: 'I2900' },
  endocarditis: { points: 1, source: 'I8000' }, immune_disorder: { points: 1, source: 'I8000' }, end_stage_liver: { points: 1, source: 'I8000' }, diabetic_foot_ulcer: { points: 1, source: 'M1040B' }, narcolepsy: { points: 1, source: 'I8000' },
  cystic_fibrosis: { points: 1, source: 'I8000' }, tracheostomy: { points: 1, source: 'O0110E2' }, mdro: { points: 1, source: 'I1700' }, isolation: { points: 1, source: 'O0110M2' }, hereditary_metabolic: { points: 1, source: 'I8000' },
  morbid_obesity: { points: 1, source: 'I8000' }, radiation: { points: 1, source: 'O0110B2' }, pressure_ulcer_stage4: { points: 1, source: 'M0300D1' }, psoriatic_sclerosis: { points: 1, source: 'I8000' }, chronic_pancreatitis: { points: 1, source: 'I8000' },
  proliferative_retinopathy: { points: 1, source: 'I8000' }, foot_infection_lesion: { points: 1, source: 'M1040A/C' }, implanted_device_complication: { points: 1, source: 'I8000' }, intermittent_catheterization: { points: 1, source: 'H0100D' },
  inflammatory_bowel: { points: 1, source: 'I1300' }, aseptic_necrosis: { points: 1, source: 'I8000' }, suctioning: { points: 1, source: 'O0110D2' }, cardiorespiratory_failure: { points: 1, source: 'I8000' },
  myelodysplastic: { points: 1, source: 'I8000' }, lupus_connective: { points: 1, source: 'I8000' }, diabetic_retinopathy: { points: 1, source: 'I8000' }, feeding_tube: { points: 1, source: 'K0510B2' },
  severe_skin_burn: { points: 1, source: 'I8000' }, intractable_epilepsy: { points: 1, source: 'I8000' }, malnutrition: { points: 1, source: 'I5600' }, immunity_disorder_other: { points: 1, source: 'I8000' },
  cirrhosis: { points: 1, source: 'I8000' }, ostomy: { points: 1, source: 'H0100C' }, respiratory_arrest: { points: 1, source: 'I8000' }, pulmonary_fibrosis: { points: 1, source: 'I8000' },
}
export const NTA_GROUPS: { min: number; group: string }[] = [{ min: 12, group: 'NA' }, { min: 9, group: 'NB' }, { min: 6, group: 'NC' }, { min: 3, group: 'ND' }, { min: 1, group: 'NE' }, { min: 0, group: 'NF' }]

/**
 * First-letter ICD-10-CM prefixes of I0020B -> PDPM clinical category. A STARTER map covering common SNF primary diagnoses, not the complete CMS file.
 * Prefixes are matched longest first. The full CMS ICD-10 mapping loads as a PdpmMappingVersion.icdMap override.
 */
export const ICD_CATEGORY_STARTER: Record<string, string> = {
  Z96: 'major_joint', M16: 'major_joint', M17: 'major_joint', S72: 'other_ortho', S32: 'other_ortho', M80: 'other_ortho', M81: 'other_ortho', M25: 'other_ortho',
  I63: 'acute_neuro', I61: 'acute_neuro', G81: 'acute_neuro', G20: 'acute_neuro', S06: 'acute_neuro',
  I50: 'cardiovascular', I48: 'cardiovascular', I21: 'cardiovascular', I26: 'cardiovascular',
  J44: 'pulmonary', J96: 'pulmonary', J18: 'infection', A41: 'infection', N39: 'infection', L03: 'infection',
  C: 'cancer', E11: 'medical_mgmt', E87: 'medical_mgmt', N18: 'medical_mgmt', R26: 'medical_mgmt', R53: 'medical_mgmt', Z48: 'nonortho_surgery', K56: 'nonortho_surgery',
}
export const ICD_VERIFY_NOTE = 'Starter ICD-10-CM -> clinical category map; replace with the CMS PDPM ICD-10 mapping file for production.'

/** SNF coinsurance per day, days 21-100 of a benefit period, calendar year 2026 (one-eighth of the $1,736 inpatient deductible). */
export const SNF_COINSURANCE_2026 = '217.00'
export const COINSURANCE_VERIFY = 'Sourced: CMS MLN MM14279 and Federal Register 2025-20249 (CY 2026: $217.00/day). A new calendar year is a new ReferenceRate row.'
