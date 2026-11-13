import { daysBetween } from '../lib/calendar'

/* The claim scrubber (STATE-MACHINES §12.7): a pure function over the claim as it would be exported. A claim leaves draft only with no errors.
   Warnings are shown to the biller but do not block. */

export type ScrubIssue = { code: string; severity: 'error' | 'warning'; message: string; field?: string }
export type ScrubInput = {
  billingNpi: string
  attendingNpi?: string
  taxonomy: string
  ccn: string
  taxId: string
  zip: string
  mbi: string | null
  typeOfBill: string
  from: string
  to: string
  admittedOn: string | null
  principal: string | null
  otherDiagnoses: string[]
  occurrenceCodes: { code: string; date: string }[]
  occurrenceSpans: { code: string; from: string; to: string }[]
  valueCodes: { code: string; quantity?: number }[]
  conditionCodes: string[]
  lines: { revenueCode: string; hippsCode: string; from: string; to: string; units: number; chargeMinor: bigint }[]
  totalMinor: bigint
  /** Covered days the census says the stay was in-house under this payer in the period. */
  coveredDays: number
  previousMonthStatus: string | null
  hasPreviousMonth: boolean
  qualifyingStay: { from: string; to: string } | null
  skilledCertOk: boolean
}

/** NPI check digit: Luhn over the number prefixed with 80840. */
export function validNpi(npi: string): boolean {
  if (!/^\d{10}$/.test(npi)) return false
  const digits = `80840${npi}`.split('').reverse().map(Number)
  let sum = 0
  digits.forEach((d, i) => { let x = d; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x })
  return sum % 10 === 0
}

const MBI = /^[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9][0-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y0-9][0-9][AC-HJKMNP-RT-Y]{2}[0-9]{2}$/
export const validMbi = (mbi: string) => MBI.test(mbi.replace(/-/g, '').toUpperCase())
const ICD10 = /^[A-TV-Z][0-9][0-9AB]\.?[0-9A-TV-Z]{0,4}$/
const ICD10_EXTERNAL_ONLY = /^[VWXY]/

/** SNF type of bill: 021x, frequency 1 admit-through-discharge, 2 first interim, 3 continuing, 4 last, 7 replace, 8 void. */
export const SNF_TOB = /^021[1-4789]$/
const FREQUENCIES = new Set(['1', '2', '3', '4', '7', '8'])
const SNF_REVENUE = new Set(['0022'])
const ANCILLARY_REVENUE = /^0[2-9]\d\d$/

export function scrub(input: ScrubInput): { ok: boolean; issues: ScrubIssue[] } {
  const issues: ScrubIssue[] = []
  const err = (code: string, message: string, field?: string) => issues.push({ code, severity: 'error', message, field })
  const warn = (code: string, message: string, field?: string) => issues.push({ code, severity: 'warning', message, field })

  if (!validNpi(input.attendingNpi ?? '')) err('attending_npi', 'An institutional claim needs the attending provider: a valid NPI and name.', 'attendingNpi')
  if (!validNpi(input.billingNpi)) err('npi_invalid', 'The community NPI is missing or fails the check digit.', 'npi')
  if (!/^\d{9}$/.test(input.taxId.replace(/\D/g, ''))) err('tax_id_missing', 'The community tax ID (9 digits) is not set in its identifiers.', 'taxId')
  if (!/^\d{9}$/.test(input.zip.replace(/\D/g, ''))) err('zip_plus4', 'The billing address needs a nine-digit ZIP (ZIP+4) on a 5010 claim.', 'zip')
  if (!/^[0-9A-Z]{10}$/.test(input.taxonomy)) err('taxonomy_missing', 'The community taxonomy code (10 characters, e.g. 314000000X for a skilled nursing facility) is not set.', 'taxonomy')
  if (!/^\d{6}$/.test(input.ccn)) err('ccn_invalid', 'The CMS Certification Number must be 6 digits.', 'ccn')
  else if (!['5', '6', '7', '0'].includes(input.ccn.slice(2, 3))) warn('ccn_range', 'A skilled nursing facility CCN normally has 5, 6, 7 or 0 as its third digit.', 'ccn')
  if (!input.mbi) err('mbi_missing', 'The resident has no Medicare Beneficiary Identifier on file.', 'mbi')
  else if (!validMbi(input.mbi)) err('mbi_invalid', 'The Medicare Beneficiary Identifier is not in the MBI format.', 'mbi')

  if (!/^\d{4}$/.test(input.typeOfBill) || !SNF_TOB.test(input.typeOfBill)) err('tob_invalid', `Type of bill ${input.typeOfBill || '(blank)'} is not a skilled nursing facility inpatient bill (021x).`, 'typeOfBill')
  else if (!FREQUENCIES.has(input.typeOfBill.slice(3))) err('tob_frequency', 'The type-of-bill frequency must be 1, 2, 3, 4, 7 or 8.', 'typeOfBill')

  if (input.from > input.to) err('period_order', 'The statement period ends before it starts.', 'period')
  if (input.from.slice(0, 7) !== input.to.slice(0, 7)) err('period_month', 'A Part A claim covers one calendar month; split the stay by month.', 'period')

  if (!input.principal) err('dx_principal', 'A principal diagnosis is required.', 'diagnoses')
  else if (!ICD10.test(input.principal) || ICD10_EXTERNAL_ONLY.test(input.principal)) err('dx_invalid', `Principal diagnosis ${input.principal} is not a valid ICD-10-CM code for a principal diagnosis.`, 'diagnoses')
  for (const code of input.otherDiagnoses) if (!ICD10.test(code)) err('dx_invalid', `Diagnosis ${code} is not a valid ICD-10-CM code.`, 'diagnoses')

  // Occurrence span 70: the qualifying three-day hospital stay, required on the claim that starts the benefit (admission month).
  const span70 = input.occurrenceSpans.find(s => s.code === '70')
  const admitMonth = input.admittedOn && input.admittedOn.slice(0, 7) === input.from.slice(0, 7)
  if (admitMonth || input.typeOfBill.slice(3) === '1' || input.typeOfBill.slice(3) === '2') {
    if (!span70) err('occurrence_70', 'Occurrence span code 70 (qualifying hospital stay) is required on the first claim of a Part A stay.', 'occurrenceSpans')
    else {
      if (daysBetween(span70.from, span70.to) < 2) err('occurrence_70_days', 'The qualifying hospital stay must be at least three days (span 70).', 'occurrenceSpans')
      if (input.admittedOn && daysBetween(span70.to, input.admittedOn) > 30) err('occurrence_70_gap', 'The qualifying stay ended more than 30 days before admission.', 'occurrenceSpans')
    }
  }
  if (span70 && input.qualifyingStay && (span70.from !== input.qualifyingStay.from || span70.to !== input.qualifyingStay.to)) warn('occurrence_70_mismatch', 'Span 70 differs from the qualifying stay recorded on coverage.', 'occurrenceSpans')
  if (!input.skilledCertOk) err('cert_missing', 'The physician skilled-need certification is not on file for this coverage.', 'coverage')
  if (!input.occurrenceCodes.some(o => o.code === '22') && input.typeOfBill.slice(3) === '4') warn('occurrence_22', 'A last-claim usually carries occurrence code 22 (date active care ended).', 'occurrenceCodes')

  // Value code 80 (covered days) and 81 (non-covered) must agree with the lines.
  const unitsTotal = input.lines.filter(l => l.revenueCode === '0022').reduce((n, l) => n + l.units, 0)
  const v80 = input.valueCodes.find(v => v.code === '80')
  if (!v80) err('value_80', 'Value code 80 (covered days) is required.', 'valueCodes')
  else if (v80.quantity !== unitsTotal) err('value_80_units', `Value code 80 says ${v80.quantity} covered days but the 0022 lines add up to ${unitsTotal}.`, 'valueCodes')
  if (unitsTotal !== input.coveredDays) err('units_covered_days', `The claim bills ${unitsTotal} covered days but the census shows ${input.coveredDays} in-house covered days.`, 'lines')

  if (!input.lines.length) err('lines_none', 'The claim has no lines.', 'lines')
  let sum = 0n
  input.lines.forEach((line, i) => {
    sum += line.chargeMinor
    if (!/^\d{4}$/.test(line.revenueCode) || !(SNF_REVENUE.has(line.revenueCode) || ANCILLARY_REVENUE.test(line.revenueCode))) err('revenue_code', `Line ${i + 1}: revenue code ${line.revenueCode || '(blank)'} is not valid.`, 'lines')
    if (SNF_REVENUE.has(line.revenueCode)) {
      if (!/^[A-Z0-9]{5}$/.test(line.hippsCode)) err('hipps_missing', `Line ${i + 1}: revenue code 0022 needs a 5-character HIPPS code.`, 'lines')
      if (line.units < 1) err('units_zero', `Line ${i + 1}: units must be at least 1.`, 'lines')
      if (daysBetween(line.from, line.to) + 1 !== line.units) err('units_span', `Line ${i + 1}: ${line.units} unit(s) do not match ${line.from} to ${line.to}.`, 'lines')
    }
    if (line.chargeMinor < 0n) err('charge_negative', `Line ${i + 1}: a charge cannot be negative.`, 'lines')
    if (line.from < input.from || line.to > input.to) err('line_outside_period', `Line ${i + 1}: service dates fall outside the statement period.`, 'lines')
  })
  if (sum !== input.totalMinor) err('total_mismatch', 'The total charges do not equal the sum of the lines.', 'totalChargesMinor')
  if (input.totalMinor <= 0n && input.lines.length) warn('total_zero', 'The total charges are zero.', 'totalChargesMinor')

  for (const code of input.conditionCodes) if (!/^[0-9A-Z]{2}$/.test(code)) err('condition_code', `Condition code ${code} is not two characters.`, 'conditionCodes')
  for (const o of input.occurrenceCodes) if (!/^[0-9A-Z]{2}$/.test(o.code)) err('occurrence_code', `Occurrence code ${o.code} is not two characters.`, 'occurrenceCodes')

  // Sequencing: the previous month's claim for this stay and payer is accepted first (released step enforces it too; this is the early notice).
  if (input.hasPreviousMonth && !['accepted', 'paid', 'partially_paid', 'denied', 'appealed', 'finalised'].includes(input.previousMonthStatus ?? '')) {
    warn('previous_claim_open', `The previous month's claim is ${input.previousMonthStatus ?? 'missing'}; it must be accepted before this one can be released.`, 'previousClaim')
  }
  return { ok: !issues.some(i => i.severity === 'error'), issues }
}

/** The frequency code by position in the stay: the first month of a continuing stay is 2, later months 3, the discharge month 4, a one-month stay 1. */
export function frequencyFor(opts: { firstMonth: boolean; lastMonth: boolean }): string {
  if (opts.firstMonth && opts.lastMonth) return '1'
  if (opts.firstMonth) return '2'
  return opts.lastMonth ? '4' : '3'
}
