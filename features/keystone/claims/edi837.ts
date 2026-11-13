import { amountText, clean, digits, segment, ymd } from './x12'

/**
 * The 837I (ASC X12N 005010X223A2) for a Medicare Part A SNF claim. It is written as a file that staff download and upload to the
 * payer's portal or clearinghouse (INTEGRATIONS I§5, manual_export): nothing here transmits anything.
 * Money is BigInt minor units. Dates arrive as ISO yyyy-mm-dd.
 */

export type Claim837Line = { revenueCode: string; hippsCode: string; from: string; to: string; units: number; chargeMinor: bigint }
export type Claim837Input = {
  controlNumber: string // interchange control number, 9 digits
  sentOn: string // yyyy-mm-dd
  sentAt: string // hhmm
  submitter: { name: string; id: string; contact: string; phone: string }
  receiver: { name: string; id: string }
  billing: { name: string; npi: string; taxId: string; taxonomy: string; line1: string; city: string; state: string; zip: string }
  subscriber: { last: string; first: string; mbi: string; dob: string; sex: string }
  payer: { name: string; id: string }
  claim: {
    reference: string
    totalMinor: bigint
    typeOfBill: string // 4 digits, e.g. 0212
    from: string
    to: string
    admittedOn: string
    admittedHour: string // hhmm
    admissionType: string
    pointOfOrigin: string
    patientStatus: string
    dischargeHour: string | null
    payerClaimNumber: string | null
    principal: string
    otherDiagnoses: string[]
    occurrenceCodes: { code: string; date: string }[]
    occurrenceSpans: { code: string; from: string; to: string }[]
    valueCodes: { code: string; amountMinor?: bigint; quantity?: number }[]
    conditionCodes: string[]
  }
  attending: { npi: string; last: string; first: string } | null
  lines: Claim837Line[]
}

const icd = (code: string) => code.replace(/\./g, '').toUpperCase()

/** Positions in HI of the 5010 institutional claim are limited to 12 per segment; split into several HI segments of one qualifier. */
function hi(qualifier: string, items: string[][]) {
  const out: string[] = []
  const first = qualifier === 'ABK' || qualifier === 'BK'
  void first
  for (let i = 0; i < items.length; i += 12) out.push(segment('HI', ...items.slice(i, i + 12).map(parts => parts.join(':'))))
  return out
}

export function build837I(input: Claim837Input): { text: string; segmentCount: number } {
  const c = input.claim
  const b = input.billing
  const body: string[] = []
  const submitterId = clean(input.submitter.id, 15)
  body.push(segment('BHT', '0019', '00', clean(c.reference, 50), ymd(input.sentOn), input.sentAt, 'CH'))
  body.push(segment('NM1', '41', '2', clean(input.submitter.name, 60), '', '', '', '', '46', submitterId))
  body.push(segment('PER', 'IC', clean(input.submitter.contact, 60), 'TE', digits(input.submitter.phone)))
  body.push(segment('NM1', '40', '2', clean(input.receiver.name, 60), '', '', '', '', '46', clean(input.receiver.id, 15)))
  body.push(segment('HL', '1', '', '20', '1'))
  body.push(segment('NM1', '85', '2', clean(b.name, 60), '', '', '', '', 'XX', digits(b.npi)))
  body.push(segment('N3', clean(b.line1, 55)))
  body.push(segment('N4', clean(b.city, 30), clean(b.state, 2), digits(b.zip).slice(0, 9)))
  body.push(segment('REF', 'EI', digits(b.taxId)))
  body.push(segment('HL', '2', '1', '22', '0'))
  body.push(segment('SBR', 'P', '18', '', '', '', '', '', '', 'MA'))
  body.push(segment('NM1', 'IL', '1', clean(input.subscriber.last, 60), clean(input.subscriber.first, 35), '', '', '', 'MI', clean(input.subscriber.mbi, 20)))
  body.push(segment('DMG', 'D8', ymd(input.subscriber.dob), input.subscriber.sex))
  body.push(segment('NM1', 'PR', '2', clean(input.payer.name, 60), '', '', '', '', 'PI', clean(input.payer.id, 15)))
  const tob = c.typeOfBill
  body.push(segment('CLM', clean(c.reference, 38), amountText(c.totalMinor), '', '', `${tob.slice(1, 3)}:A:${tob.slice(3, 4)}`, '', 'A', 'Y', 'Y'))
  body.push(segment('DTP', '434', 'RD8', `${ymd(c.from)}-${ymd(c.to)}`))
  body.push(segment('DTP', '435', 'DT', `${ymd(c.admittedOn)}${c.admittedHour}`))
  if (c.dischargeHour) body.push(segment('DTP', '096', 'TM', c.dischargeHour))
  body.push(segment('CL1', c.admissionType, c.pointOfOrigin, c.patientStatus))
  if (c.payerClaimNumber) body.push(segment('REF', 'F8', clean(c.payerClaimNumber, 50)))
  body.push(...hi('ABK', [[ 'ABK', icd(c.principal) ]]))
  if (c.otherDiagnoses.length) body.push(...hi('ABF', c.otherDiagnoses.map(code => ['ABF', icd(code)])))
  if (c.occurrenceCodes.length) body.push(...hi('BH', c.occurrenceCodes.map(o => ['BH', o.code, 'D8', ymd(o.date)])))
  if (c.occurrenceSpans.length) body.push(...hi('BI', c.occurrenceSpans.map(o => ['BI', o.code, 'RD8', `${ymd(o.from)}-${ymd(o.to)}`])))
  if (c.valueCodes.length) body.push(...hi('BE', c.valueCodes.map(v => ['BE', v.code, '', '', v.amountMinor !== undefined ? amountText(v.amountMinor) : String(v.quantity ?? 0)])))
  if (c.conditionCodes.length) body.push(...hi('BG', c.conditionCodes.map(code => ['BG', code])))
  if (input.attending) body.push(segment('NM1', '71', '1', clean(input.attending.last, 60), clean(input.attending.first, 35), '', '', '', 'XX', digits(input.attending.npi)))
  input.lines.forEach((line, index) => {
    body.push(segment('LX', index + 1))
    body.push(segment('SV2', line.revenueCode, `HP:${clean(line.hippsCode, 5)}`, amountText(line.chargeMinor), 'DA', line.units))
    body.push(line.from === line.to ? segment('DTP', '472', 'D8', ymd(line.from)) : segment('DTP', '472', 'RD8', `${ymd(line.from)}-${ymd(line.to)}`))
  })

  const control = digits(input.controlNumber).padStart(9, '0').slice(-9)
  const isa = ['ISA', '00', ' '.repeat(10), '00', ' '.repeat(10), 'ZZ', clean(submitterId, 15).padEnd(15), 'ZZ', clean(input.receiver.id, 15).padEnd(15), ymd(input.sentOn).slice(2), input.sentAt, '^', '00501', control, '0', 'P', ':']
  const stHeader = [segment('ST', '837', '0001', '005010X223A2')]
  const seCount = stHeader.length + body.length + 1
  const lines = [
    isa.join('*') + '~',
    segment('GS', 'HC', submitterId, clean(input.receiver.id, 15), ymd(input.sentOn), input.sentAt, '1', 'X', '005010X223A2'),
    ...stHeader, ...body,
    segment('SE', seCount, '0001'), segment('GE', '1', '1'), segment('IEA', '1', control),
  ]
  return { text: lines.join('\n') + '\n', segmentCount: lines.length }
}
