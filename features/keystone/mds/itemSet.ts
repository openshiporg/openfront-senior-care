/**
 * MDS 3.0 item sets as AssessmentTemplate versions (code `mds_3_0`, scorer `mds`). The version in force is chosen by the
 * assessment reference date (ARD), never by the date the record is typed. Each definition lists the items this build
 * captures, their section, the allowed values and which record kinds need them. It is a working subset of the CMS item set
 * (the items PDPM, the CAAs and the record header need), not the full data specification.
 */

export const MDS_TEMPLATE_CODE = 'mds_3_0'

export type ItemDef = {
  id: string
  section: string
  label: string
  /** Allowed codes; `date` = YYYYMMDD; `icd` = ICD-10-CM; `int:a-b` = whole number range; `text` = free text. */
  values: readonly string[] | 'date' | 'icd' | 'text' | `int:${number}-${number}`
  /** Record kinds that must carry the item (others may). */
  requiredFor?: readonly string[]
  /** false: a worksheet answer the PDPM grouper needs that this build captures directly instead of deriving it (never exported). */
  exported?: false
}
export type ItemSetDefinition = { itemSetVersion: string; specVersion: string; effectiveFrom: string; effectiveTo: string | null; items: ItemDef[] }

export const MDS_VERIFY_NOTE =
  'Item set versions (V1.19.1 from 2024-10-01, V1.20.1 from 2025-10-01) and the edits below are a working subset of the CMS MDS 3.0 data specifications. Confirm item values, skip patterns and the iQIES header against the current data specifications before a live submission.'

const ASSESS = ['obra_admission', 'obra_quarterly', 'obra_annual', 'obra_significant_change', 'pps_5day', 'ipa']
const PPS = ['pps_5day', 'ipa']
const ALL = [...ASSESS, 'discharge_return_anticipated', 'discharge_return_not_anticipated', 'pps_discharge', 'entry', 'death_in_facility']
const DISCH = ['discharge_return_anticipated', 'discharge_return_not_anticipated', 'pps_discharge']
const yn = ['0', '1'] as const
const gg = ['01', '02', '03', '04', '05', '06', '07', '09', '10', '88'] as const

const base: ItemDef[] = [
  { id: 'A0310A', section: 'A', label: 'Federal OBRA reason for assessment', values: ['01', '02', '03', '04', '05', '06', '99'], requiredFor: ALL },
  { id: 'A0310B', section: 'A', label: 'PPS assessment', values: ['01', '08', '99'], requiredFor: ALL },
  { id: 'A0310F', section: 'A', label: 'Entry/discharge reporting', values: ['01', '10', '11', '12', '99'], requiredFor: ALL },
  { id: 'A0310H', section: 'A', label: 'Is this a SNF Part A PPS discharge assessment?', values: yn, requiredFor: ALL },
  { id: 'A0500A', section: 'A', label: 'Resident first name', values: 'text', requiredFor: ALL },
  { id: 'A0500C', section: 'A', label: 'Resident last name', values: 'text', requiredFor: ALL },
  { id: 'A0900', section: 'A', label: 'Birth date', values: 'date', requiredFor: ALL },
  { id: 'A0800', section: 'A', label: 'Gender', values: ['1', '2', '-'], requiredFor: ALL },
  { id: 'A1600', section: 'A', label: 'Entry date', values: 'date', requiredFor: ALL },
  { id: 'A1700', section: 'A', label: 'Type of entry', values: ['1', '2'], requiredFor: ['entry'] },
  { id: 'A2000', section: 'A', label: 'Discharge date', values: 'date', requiredFor: [...DISCH.filter(k => k !== 'pps_discharge'), 'death_in_facility'] },
  { id: 'A2300', section: 'A', label: 'Assessment reference date', values: 'date', requiredFor: [...ASSESS, ...DISCH] },
  { id: 'A2400A', section: 'A', label: 'Has the resident had a Medicare-covered stay since the most recent entry?', values: yn, requiredFor: ASSESS },
  { id: 'A2400B', section: 'A', label: 'Start of most recent Medicare stay', values: 'date' },
  { id: 'A2400C', section: 'A', label: 'End date of most recent Medicare stay', values: 'date', requiredFor: ['pps_discharge'] },
  { id: 'B0700', section: 'B', label: 'Makes self understood', values: ['0', '1', '2', '3', '-'] },
  { id: 'B1000', section: 'B', label: 'Vision', values: ['0', '1', '2', '3', '4', '-'] },
  { id: 'C0100', section: 'C', label: 'Should the BIMS be conducted?', values: yn, requiredFor: ASSESS },
  { id: 'C0500', section: 'C', label: 'BIMS summary score', values: 'int:0-15' },
  { id: 'C1000', section: 'C', label: 'Cognitive skills for daily decision making (staff assessment)', values: ['0', '1', '2', '3', '-'] },
  { id: 'C1310A', section: 'C', label: 'Acute onset of mental status change', values: yn },
  { id: 'C1310B', section: 'C', label: 'Inattention', values: ['0', '1', '2'] },
  { id: 'D0160', section: 'D', label: 'PHQ resident total severity score', values: 'int:0-27' },
  { id: 'E0200A', section: 'E', label: 'Physical behavioural symptoms directed toward others', values: ['0', '1', '2', '3'] },
  { id: 'E0200B', section: 'E', label: 'Verbal behavioural symptoms directed toward others', values: ['0', '1', '2', '3'] },
  { id: 'E0200C', section: 'E', label: 'Other behavioural symptoms not directed toward others', values: ['0', '1', '2', '3'] },
  ...[['GG0130A1', 'Eating'], ['GG0130B1', 'Oral hygiene'], ['GG0130C1', 'Toileting hygiene']].map(([id, label]) => ({ id, section: 'GG', label: `${label} (admission performance)`, values: gg, requiredFor: PPS })),
  ...[['GG0170B1', 'Sit to lying'], ['GG0170C1', 'Lying to sitting on side of bed'], ['GG0170D1', 'Sit to stand'], ['GG0170E1', 'Chair/bed-to-chair transfer'], ['GG0170F1', 'Toilet transfer'], ['GG0170I1', 'Walk 10 feet'], ['GG0170J1', 'Walk 50 feet with two turns'], ['GG0170K1', 'Walk 150 feet']].map(([id, label]) => ({ id, section: 'GG', label: `${label} (admission performance)`, values: gg, requiredFor: PPS })),
  { id: 'H0300', section: 'H', label: 'Urinary continence', values: ['0', '1', '2', '3', '9'] },
  { id: 'I0020', section: 'I', label: 'Primary medical condition category', values: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'], requiredFor: PPS },
  { id: 'I0020B', section: 'I', label: 'Primary condition ICD-10-CM code', values: 'icd', requiredFor: PPS },
  { id: 'I2900', section: 'I', label: 'Diabetes mellitus', values: yn },
  { id: 'I4300', section: 'I', label: 'Aphasia', values: yn },
  { id: 'I4500', section: 'I', label: 'CVA, TIA or stroke', values: yn },
  { id: 'I4900', section: 'I', label: 'Hemiplegia or hemiparesis', values: yn },
  { id: 'I8000', section: 'I', label: 'Additional active diagnoses (ICD-10-CM, comma separated)', values: 'text' },
  { id: 'J0300', section: 'J', label: 'Pain presence', values: ['0', '1', '9'] },
  { id: 'J1550C', section: 'J', label: 'Dehydrated', values: yn },
  { id: 'J1800', section: 'J', label: 'Any falls since admission or prior assessment', values: yn },
  { id: 'K0300', section: 'K', label: 'Weight loss', values: ['0', '1', '2'] },
  { id: 'K0100', section: 'K', label: 'Swallowing disorder signs (any of K0100A-D)', values: yn },
  { id: 'K0510B2', section: 'K', label: 'Feeding tube while a resident', values: yn },
  { id: 'K0510C2', section: 'K', label: 'Mechanically altered diet while a resident', values: yn },
  { id: 'M0210', section: 'M', label: 'Unhealed pressure ulcers/injuries', values: yn },
  { id: 'N0415A1', section: 'N', label: 'Antipsychotic received', values: yn },
  { id: 'O0110C1', section: 'O', label: 'Oxygen therapy', values: yn },
  { id: 'O0110E1', section: 'O', label: 'Tracheostomy care', values: yn },
  { id: 'O0110F1', section: 'O', label: 'Invasive mechanical ventilator', values: yn },
  { id: 'O0110H1', section: 'O', label: 'IV medications', values: yn },
  { id: 'O0110M1', section: 'O', label: 'Isolation or quarantine for active infectious disease', values: yn },
  { id: 'P0100', section: 'P', label: 'Physical restraints used', values: yn },
  { id: 'Q0400A', section: 'Q', label: 'Active discharge planning for return to the community', values: yn },
  { id: 'SLP_COMORBIDITY', section: 'PDPM', label: 'Worksheet: any SLP-related comorbidity (aphasia, CVA, hemiplegia, TBI, ALS, oral cancer, ...)', values: yn, exported: false },
  { id: 'NURSING_SCH', section: 'PDPM', label: 'Worksheet: qualifies for special care high', values: yn, exported: false },
  { id: 'NURSING_SCL', section: 'PDPM', label: 'Worksheet: qualifies for special care low', values: yn, exported: false },
  { id: 'NURSING_CC', section: 'PDPM', label: 'Worksheet: qualifies for clinically complex', values: yn, exported: false },
  { id: 'NURSING_BEHAVIOR', section: 'PDPM', label: 'Worksheet: behavioural symptoms or cognitive impairment (BAB)', values: yn, exported: false },
  { id: 'H_RESTORATIVE', section: 'PDPM', label: 'Worksheet: restorative nursing programmes (6+ days)', values: 'int:0-10', exported: false },
  { id: 'Z0400', section: 'Z', label: 'Signatures of persons completing the assessment (structured, see signatures)', values: 'text' },
  { id: 'Z0500B', section: 'Z', label: 'Date the RN coordinator signed the assessment as complete', values: 'date', requiredFor: [...ASSESS, ...DISCH] },
]

/** The two item-set versions this build knows. A new CMS release is a new template version with its own dates. */
export const ITEM_SETS: ItemSetDefinition[] = [
  { itemSetVersion: '1.19.1', specVersion: '3.00.1', effectiveFrom: '2024-10-01', effectiveTo: '2025-09-30', items: base },
  { itemSetVersion: '1.20.1', specVersion: '3.00.2', effectiveFrom: '2025-10-01', effectiveTo: null, items: base },
]

/** The item set in force on an ARD (or the event date for tracking records). */
export function itemSetFor<T extends { effectiveFrom: string; effectiveTo: string | null }>(sets: readonly T[], ard: string): T | null {
  return sets.filter(s => s.effectiveFrom <= ard && (s.effectiveTo === null || ard <= s.effectiveTo)).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null
}

/** A0310 header values for a record kind (CMS item A0310 combinations). */
export const A0310: Record<string, { A: string; B: string; F: string; H: string }> = {
  obra_admission: { A: '01', B: '99', F: '99', H: '0' },
  obra_quarterly: { A: '02', B: '99', F: '99', H: '0' },
  obra_annual: { A: '03', B: '99', F: '99', H: '0' },
  obra_significant_change: { A: '04', B: '99', F: '99', H: '0' },
  pps_5day: { A: '99', B: '01', F: '99', H: '0' },
  ipa: { A: '99', B: '08', F: '99', H: '0' },
  pps_discharge: { A: '99', B: '99', F: '99', H: '1' },
  discharge_return_not_anticipated: { A: '99', B: '99', F: '10', H: '0' },
  discharge_return_anticipated: { A: '99', B: '99', F: '11', H: '0' },
  death_in_facility: { A: '99', B: '99', F: '12', H: '0' },
  entry: { A: '99', B: '99', F: '01', H: '0' },
}

/** Sections a record kind carries, for section signatures (Z0400). Tracking records carry A and Z only. */
export function sectionsFor(kind: string, def: Pick<ItemSetDefinition, 'items'>): string[] {
  if (kind === 'entry' || kind === 'death_in_facility') return ['A', 'Z']
  return [...new Set(def.items.filter(i => i.exported !== false).map(i => i.section))]
}

export type Signature = { userId: string; name: string; title: string; sections: string[]; signedOn: string }
/** Sections nobody has attested yet. Z0500B (the RN coordinator's completion) needs this to be empty. */
export function unsignedSections(kind: string, def: Pick<ItemSetDefinition, 'items'>, signatures: readonly Signature[]) {
  const signed = new Set(signatures.flatMap(s => s.sections))
  return sectionsFor(kind, def).filter(s => !signed.has(s))
}
