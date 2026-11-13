import type { PdpmInput } from './classify'

/**
 * Golden PDPM cases (BUILD-PLAN Phase 4 exit gate). Thirteen invented residents. Every HIPPS and every per diem below was worked
 * by hand before the code ran: the arithmetic is in the comment of each case (FY2026 unadjusted urban rates, wage index 1.0000
 * unless stated, each component rounded to the cent half-even, then summed). HIPPS letters per the CMS crosswalk. The seed loads
 * the same cases as MDS records (goldenItems), so the community starts with them.
 */
const gg = (eat: string, oral: string, toilet: string, bed: [string, string], tr: [string, string, string], walk: [string, string] | null) => ({
  gg: { GG0130A1: eat, GG0130B1: oral, GG0130C1: toilet, GG0170B1: bed[0], GG0170C1: bed[1], GG0170D1: tr[0], GG0170E1: tr[1], GG0170F1: tr[2], ...(walk ? { GG0170J1: walk[0], GG0170K1: walk[1] } : {}) },
  cannotWalk: walk === null,
})
const all = (code: string, walk = true) => gg(code, code, code, [code, code], [code, code, code], walk ? [code, code] : null)

export type GoldenCase = { name: string; input: PdpmInput; indicator?: 'five_day' | 'ipa'; hipps: string; groups: string; day: number; wageIndex?: string; perDiem: string }
export const GOLDEN_CASES: GoldenCase[] = [
  // GG all 03 → 2 each: PT/OT 12 (TC), nursing 8 (PBC1). PT 75.73×1.78=134.7994→134.80; OT 70.49×1.60=112.784→112.78; SLP 28.28×0.64=18.0992→18.10;
  // NUR 132×1.07=141.24; NTA 99.59×0.68×3=203.1636→203.16; NCM 118.21. Σ 728.29
  { name: 'Ada Quill, hip replacement, day 1', input: { clinicalCategory: 'major_joint', ...all('03'), cognition: 'intact' }, hipps: 'CAXF1', groups: 'TC/SA/PBC1/NF', day: 1, perDiem: '728.29' },
  // Same resident on day 25: PT/OT ×0.98, NTA ×1. PT 132.103412→132.10; OT 110.52832→110.53; SLP 18.10; NUR 141.24; NTA 67.7212→67.72; NCM 118.21. Σ 587.90
  { name: 'Ada Quill, day 25', input: { clinicalCategory: 'major_joint', ...all('03'), cognition: 'intact' }, hipps: 'CAXF1', groups: 'TC/SA/PBC1/NF', day: 25, perDiem: '587.90' },
  // The CMS/Noridian example TC/SD/PBC1/NE 5-day = CDXE1. SLP 28.28×1.38=39.0264→39.03; NTA 99.59×0.91×3=271.8807→271.88. Σ 134.80+112.78+39.03+141.24+271.88+118.21 = 817.94
  { name: 'Bram Okafor, knee replacement, mild impairment, diabetes', input: { clinicalCategory: 'major_joint', ...all('03'), cognition: 'mild', ntaConditions: ['diabetes'] }, hipps: 'CDXE1', groups: 'TC/SD/PBC1/NE', day: 1, perDiem: '817.94' },
  // Eat 06(4) oral 03(2) toilet 02(1) bed 03/03(2) transfers 02(1) cannot walk: PT/OT 10 → TO; nursing 8 → PBC1. Neuro + cognition = 2, mech diet → SH.
  // IV med 5 + diabetes 2 = 7 → NC. PT 75.73×1.47=111.3231→111.32; OT 70.49×1.47=103.6203→103.62; SLP 28.28×2.70=76.356→76.36; NUR 141.24;
  // NTA 99.59×1.74×3=519.8598→519.86; NCM 118.21. Σ 1070.61
  { name: 'Cleo Varga, stroke, moderate impairment', input: { clinicalCategory: 'acute_neuro', ...gg('06', '03', '02', ['03', '03'], ['02', '02', '02'], null), cognition: 'moderate', mechanicallyAlteredDiet: true, ntaConditions: ['iv_medication', 'diabetes'] }, hipps: 'OHXC1', groups: 'TO/SH/PBC1/NC', day: 1, perDiem: '1070.61' },
  // All 01 → 0: TI; trach + vent → ES3. Comorbidity + severe cognition = 2, both swallow items → SI. Vent 4 + trach 1 = 5 → ND.
  // PT 75.73×1.07=81.0311→81.03; OT 70.49×1.12=78.9488→78.95; SLP 28.28×3.34=94.4552→94.46; NUR 132×3.84=506.88; NTA 99.59×1.26×3=376.4502→376.45; NCM 118.21. Σ 1255.98
  { name: 'Dov Lindqvist, heart failure on a ventilator', input: { clinicalCategory: 'cardiovascular', ...all('01'), cognition: 'severe', slpComorbidity: true, mechanicallyAlteredDiet: true, swallowingDisorder: true, tracheostomy: true, ventilator: true, ntaConditions: ['ventilator', 'tracheostomy'] }, hipps: 'IIAD1', groups: 'TI/SI/ES3/ND', day: 1, perDiem: '1255.98' },
  // All 06: PT/OT 24 → TH; nursing 16, so isolation falls to clinically complex: CA2 (depression). Isolation 1 + MDRO 1 = 2 → NE.
  // PT 75.73×1.10=83.303→83.30; OT 70.49×1.09=76.8341→76.83; SLP 18.10; NUR 132×1.03=135.96; NTA 271.88; NCM 118.21. Σ 704.28
  { name: 'Esme Hart, hip fracture in isolation, independent', input: { clinicalCategory: 'other_ortho', ...all('06'), cognition: 'intact', isolation: true, depression: true, ntaConditions: ['isolation', 'mdro'] }, hipps: 'HAOE1', groups: 'TH/SA/CA2/NE', day: 1, perDiem: '704.28' },
  // All 02 → 1: PT/OT 6 → TJ; nursing 4, special care high + depression → HDE2. Comorbidity + cognition = 2, neither → SG. Parenteral high 7 + DM 2 = 9 → NB.
  // PT 75.73×1.34=101.4782→101.48; OT 70.49×1.37=96.5713→96.57; SLP 28.28×1.93=54.5804→54.58; NUR 132×2.27=299.64; NTA 99.59×2.39×3=714.0603→714.06; NCM 118.21. Σ 1384.54
  { name: 'Faro Mensah, COPD on parenteral nutrition', input: { clinicalCategory: 'pulmonary', ...all('02'), cognition: 'moderate', slpComorbidity: true, specialCareHigh: true, depression: true, ntaConditions: ['parenteral_iv_high', 'diabetes'] }, hipps: 'JGDB1', groups: 'TJ/SG/HDE2/NB', day: 1, perDiem: '1384.54' },
  // All 04 → 3: PT/OT 18 → TO; nursing 12, special care low → LBC1. Swallowing only → SB. MDS NTA: IV med 5 → ND on the HIPPS; paid with AIDS +8 = 13 → NA.
  // PT 111.32; OT 103.62; SLP 28.28×1.72=48.6416→48.64; NUR 132×1.35×1.18=210.276→210.28; NTA 99.59×3.06×3=914.2362→914.24; NCM 118.21. Σ 1506.31
  { name: 'Gil Ferreira, after abdominal surgery, AIDS on the claim', input: { clinicalCategory: 'nonortho_surgery', ...all('04'), cognition: 'intact', swallowingDisorder: true, specialCareLow: true, ntaConditions: ['iv_medication'], aids: true }, hipps: 'OBKD1', groups: 'TO/SB/LBC1/NA', day: 1, perDiem: '1506.31' },
  // All 05 → 4, cannot walk: PT/OT 20 → TK; nursing 16, behaviour + 2 restorative → BAB2. Severe cognition → SD. NTA 0 → NF.
  // PT 75.73×1.44=109.0512→109.05; OT 70.49×1.46=102.9154→102.92; SLP 39.03; NUR 132×0.98=129.36; NTA 203.16; NCM 118.21. Σ 701.73
  { name: 'Hana Brod, cancer with behaviours', input: { clinicalCategory: 'cancer', ...all('05', false), cognition: 'severe', behavioral: true, restorativeNursingCount: 2 }, hipps: 'KDRF1', groups: 'TK/SD/BAB2/NF', day: 1, perDiem: '701.73' },
  // Eat 03 (2), the rest 01: PT/OT 2 → TI; nursing 2, clinically complex → CDE1. Mild + both swallow → SF. Wound infection 2 + tube 1 + malnutrition 1 = 4 → ND.
  // SLP 28.28×2.82=79.7496→79.75; NUR 132×1.53=201.96. Σ 81.03+78.95+79.75+201.96+376.45+118.21 = 936.35
  { name: 'Ivo Sato, sepsis', input: { clinicalCategory: 'infection', ...gg('03', '01', '01', ['01', '01'], ['01', '01', '01'], ['01', '01']), cognition: 'mild', mechanicallyAlteredDiet: true, swallowingDisorder: true, clinicallyComplex: true, ntaConditions: ['wound_infection', 'feeding_tube', 'malnutrition'] }, hipps: 'IFMD1', groups: 'TI/SF/CDE1/ND', day: 1, perDiem: '936.35' },
  // IPA, all 06: PT/OT 24 → TD; nursing 16 → PA1. Day 30 is the 28-34 block: PT/OT ×0.96. PT 75.73×1.81×0.96=131.588448→131.59;
  // OT 70.49×1.45×0.96=98.12208→98.12; SLP 18.10; NUR 132×0.62=81.84; NTA 67.72; NCM 118.21. Σ 515.58
  { name: 'Jun Abara, spinal surgery, IPA on day 30', input: { clinicalCategory: 'major_joint', ...all('06'), cognition: 'intact' }, indicator: 'ipa', hipps: 'DAYF0', groups: 'TD/SA/PA1/NF', day: 30, perDiem: '515.58' },
  // All 02, cannot walk: PT/OT 5 → TM; nursing 4, 2 restorative → PDE2. Neuro + comorbidity + cognition, both swallow → SL.
  // PT 75.73×1.20=90.876→90.88; OT 70.49×1.23=86.7027→86.70; SLP 28.28×3.98=112.5544→112.55; NUR 132×1.48=195.36; NTA 203.16; NCM 118.21. Σ 806.86
  { name: 'Kai Duarte, stroke with aphasia', input: { clinicalCategory: 'acute_neuro', ...all('02', false), cognition: 'moderate', slpComorbidity: true, mechanicallyAlteredDiet: true, swallowingDisorder: true, restorativeNursingCount: 2 }, hipps: 'MLTF1', groups: 'TM/SL/PDE2/NF', day: 1, perDiem: '806.86' },
  // As Ada Quill day 1, wage index 1.0500: factor 0.702×1.05+0.298 = 1.0351. PT 75.73×1.0351×1.78=139.5308…→139.53; OT 72.964199×1.60=116.7427…→116.74;
  // SLP 29.272628×0.64=18.7344…→18.73; NUR 136.6332×1.07=146.1975…→146.20; NTA 103.085609×0.68×3=210.2946…→210.29; NCM 118.21×1.0351=122.3591…→122.36. Σ 753.85
  { name: 'Lena Wexford, hip replacement, wage index 1.05', input: { clinicalCategory: 'major_joint', ...all('03'), cognition: 'intact' }, hipps: 'CAXF1', groups: 'TC/SA/PBC1/NF', day: 1, wageIndex: '1.0500', perDiem: '753.85' },
]


/** An invented primary diagnosis per clinical category (starter ICD map) and the I0020 category code. */
const ICD: Record<string, [string, string]> = {
  major_joint: ['Z96.651', '05'], other_ortho: ['S72.001A', '06'], acute_neuro: ['I63.9', '01'], cardiovascular: ['I50.9', '10'], pulmonary: ['J44.1', '11'],
  nonortho_surgery: ['K56.7', '13'], cancer: ['C18.9', '12'], infection: ['A41.9', '13'], medical_mgmt: ['E11.9', '13'],
}
/** MDS items for a golden case, so that mdsToPdpmInput(goldenItems(c)) classifies exactly as c.input (checked in golden.test.ts). */
export function goldenItems(input: PdpmInput): Record<string, string> {
  const items: Record<string, string> = {}
  const [icd, category] = ICD[input.clinicalCategory]
  items.I0020B = icd
  items.I0020 = category
  for (const key of ['GG0130A1', 'GG0130B1', 'GG0130C1', 'GG0170B1', 'GG0170C1', 'GG0170D1', 'GG0170E1', 'GG0170F1', 'GG0170J1', 'GG0170K1']) items[key] = input.gg[key] ?? '88'
  items.GG0170I1 = input.cannotWalk ? '88' : input.gg.GG0170J1 ?? '88'
  if (input.cognition === 'severe') { items.C0100 = '0'; items.C1000 = '3' } else { items.C0100 = '1'; items.C0500 = { intact: '15', mild: '10', moderate: '5' }[input.cognition] }
  const flag = (key: string, on: boolean | undefined) => { if (on) items[key] = '1' }
  flag('SLP_COMORBIDITY', input.slpComorbidity)
  flag('K0510C2', input.mechanicallyAlteredDiet)
  flag('K0100', input.swallowingDisorder)
  flag('O0110E1', input.tracheostomy)
  flag('O0110F1', input.ventilator)
  flag('O0110M1', input.isolation)
  flag('NURSING_SCH', input.specialCareHigh)
  flag('NURSING_SCL', input.specialCareLow)
  flag('NURSING_CC', input.clinicallyComplex)
  flag('NURSING_BEHAVIOR', input.behavioral)
  if (input.depression) items.D0160 = '12'
  if (input.restorativeNursingCount) items.H_RESTORATIVE = String(input.restorativeNursingCount)
  // NTA conditions: the item when the item set has one, otherwise listed in I8000 (the starter map keys the list by condition).
  const byItem: Record<string, string> = { iv_medication: 'O0110H1', diabetes: 'I2900', ventilator: 'O0110F1', tracheostomy: 'O0110E1', isolation: 'O0110M1', feeding_tube: 'K0510B2' }
  const listed: string[] = []
  for (const c of input.ntaConditions ?? []) { if (byItem[c]) items[byItem[c]] = '1'; else listed.push(c) }
  if (listed.length) items.I8000 = listed.join(',')
  return items
}
