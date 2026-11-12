import { canonicalJson, sha256 } from '../lib/canonical'
import { addDays } from '../lib/calendar'
import { dec } from '../lib/decimal'
import { allocateMinor, roundToMinor } from '../lib/money'

/**
 * Billing derivation (STATE-MACHINES §12.1). A pure function of its input: the same census days, coverage, care levels,
 * published rates and Medicaid liabilities always give the same lines in the same order with the same hashes, so a close
 * can be re-run and compared byte for byte. Nothing here reads the clock or the database.
 */

export type DayRow = {
  stayId: string
  residentId: string
  date: string
  setting: string
  presence: 'in_house' | 'on_leave_hold'
  apartmentTypeId: string | null
  payerKind: string
  payerId: string | null
}

export type RateLineIn = {
  id: string
  scheduleId: string
  effectiveFrom: string
  setting: string
  kind: string
  apartmentTypeId: string | null
  careLevelId: string | null
  amountMinor: bigint
  per: 'month' | 'day' | 'each'
  proration: 'actual_days_in_month' | 'thirty_day_month' | 'daily'
}

export type CareAssignmentIn = { stayId: string; careLevelId: string; effectiveFrom: string }
export type LiabilityIn = { stayId: string; liabilityMinor: bigint }

export type DerivationInput = {
  month: string
  days: DayRow[]
  rates: RateLineIn[]
  careAssignments: CareAssignmentIn[]
  liabilities: LiabilityIn[]
}

export type DerivedLine = {
  key: string
  stayId: string
  residentId: string
  date: string
  kind: 'rent' | 'care_level' | 'room_board' | 'bed_hold' | 'patient_liability' | 'per_diem_claim'
  responsibility: 'resident' | 'payer'
  payerKey: string
  payerId: string | null
  description: string
  amountMinor: bigint
  derivation: Record<string, unknown>
  derivationHash: string
}

export type DerivationProblem = { code: 'uncovered_days' | 'missing_rate' | 'missing_liability'; stayId?: string; residentId?: string; count: number }

export type Derivation = { lines: DerivedLine[]; problems: DerivationProblem[]; hash: string }

export const lineKey = (line: { stayId: string; date: string; kind: string; payerKey: string }) => `${line.stayId}|${line.date}|${line.kind}|${line.payerKey}`

export const monthDays = (month: string) => {
  const [year, mon] = month.split('-').map(part => Number.parseInt(part, 10))
  return new Date(Date.UTC(year, mon, 0)).getUTCDate()
}
export const monthEnd = (month: string) => addDays(month, monthDays(month) - 1)
export const nextMonth = (month: string) => addDays(month, monthDays(month))

/** The newest published rate line that applies on a date. */
function rateOn(rates: readonly RateLineIn[], date: string, match: { setting: string; kind: string; apartmentTypeId?: string | null; careLevelId?: string | null }) {
  let best: RateLineIn | null = null
  for (const rate of rates) {
    if (rate.kind !== match.kind || rate.setting !== match.setting || rate.effectiveFrom > date) continue
    if ((match.apartmentTypeId ?? null) !== rate.apartmentTypeId || (match.careLevelId ?? null) !== rate.careLevelId) continue
    if (!best || rate.effectiveFrom > best.effectiveFrom || (rate.effectiveFrom === best.effectiveFrom && rate.id > best.id)) best = rate
  }
  return best
}

const careOn = (assignments: readonly CareAssignmentIn[], stayId: string, date: string) => {
  let best: CareAssignmentIn | null = null
  for (const row of assignments) if (row.stayId === stayId && row.effectiveFrom <= date && (!best || row.effectiveFrom >= best.effectiveFrom)) best = row
  return best
}

const finish = (line: Omit<DerivedLine, 'key' | 'derivationHash'>): DerivedLine => {
  const key = lineKey(line)
  return { ...line, key, derivationHash: sha256(canonicalJson({ key, amountMinor: line.amountMinor, derivation: line.derivation, description: line.description })) }
}

const labelOf: Record<string, string> = { rent: 'Apartment rent', care_level: 'Care level', room_board: 'Room and board', bed_hold: 'Bed hold', patient_liability: 'Patient liability', per_diem_claim: 'Per diem' }

/** A monthly charge over `dates` (one group of identical rates): the prorated total, spread over the days so it sums exactly. */
function monthly(
  base: { stayId: string; residentId: string; kind: DerivedLine['kind']; responsibility: DerivedLine['responsibility']; payerKey: string; payerId: string | null; description: string },
  dates: string[], monthlyMinor: bigint, daysInMonth: number, derivation: Record<string, unknown>, proration: RateLineIn['proration'],
) {
  const divisor = proration === 'thirty_day_month' ? 30 : daysInMonth
  const total = dates.length >= daysInMonth ? monthlyMinor : roundToMinor(dec(monthlyMinor).times(dates.length).div(divisor))
  const shares = allocateMinor(total, dates.map(() => 1))
  return dates.map((date, index) => finish({ ...base, date, amountMinor: shares[index], derivation: { ...derivation, monthlyMinor, daysInGroup: dates.length, daysInMonth, proration } }))
}

export function deriveCharges(input: DerivationInput): Derivation {
  const daysInMonth = monthDays(input.month)
  const problems: DerivationProblem[] = []
  const lines: DerivedLine[] = []
  const byStay = new Map<string, DayRow[]>()
  for (const day of input.days) byStay.set(day.stayId, [...(byStay.get(day.stayId) ?? []), day])

  for (const stayId of [...byStay.keys()].sort()) {
    const days = byStay.get(stayId)!.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const residentId = days[0].residentId
    const uncovered = days.filter(day => day.payerKind === 'uncovered').length
    if (uncovered) problems.push({ code: 'uncovered_days', stayId, residentId, count: uncovered })

    // Each (kind, rate line) group is billed together so partial months prorate once, not per day.
    const groups = new Map<string, { base: Parameters<typeof monthly>[0]; rate: RateLineIn; dates: string[] }>()
    const add = (rate: RateLineIn, base: Parameters<typeof monthly>[0], date: string) => {
      const id = `${base.kind}|${base.payerKey}|${rate.id}`
      const group = groups.get(id) ?? { base, rate, dates: [] }
      group.dates.push(date)
      groups.set(id, group)
    }
    let missingRate = 0

    for (const day of days) {
      if (day.payerKind === 'private_pay') {
        const setting = day.setting
        if (setting === 'nursing_facility') {
          const rate = rateOn(input.rates, day.date, { setting, kind: day.presence === 'on_leave_hold' ? 'bed_hold_daily' : 'room_daily' })
          if (!rate) { missingRate += 1; continue }
          const kind = day.presence === 'on_leave_hold' ? 'bed_hold' : 'room_board'
          lines.push(finish({ stayId, residentId, date: day.date, kind, responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf[kind], amountMinor: rate.amountMinor, derivation: { rateLineId: rate.id, per: 'day' } }))
          continue
        }
        // Assisted living, memory care, independent living: rent continues while a resident is away; care level only while in house.
        const rent = rateOn(input.rates, day.date, { setting, kind: 'apartment_rent', apartmentTypeId: day.apartmentTypeId })
        if (!rent) { missingRate += 1; continue }
        add(rent, { stayId, residentId, kind: 'rent', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.rent }, day.date)
        if (day.presence === 'in_house') {
          const care = careOn(input.careAssignments, stayId, day.date)
          const rate = care ? rateOn(input.rates, day.date, { setting, kind: 'care_level', careLevelId: care.careLevelId }) : null
          if (rate) add(rate, { stayId, residentId, kind: 'care_level', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.care_level }, day.date)
        }
      } else if (day.payerKind === 'medicaid_ffs' || day.payerKind === 'medicaid_mco' || day.payerKind === 'medicare_a' || day.payerKind === 'medicare_advantage') {
        // The payer's per diem is a claim line (billed in Phase 4); it exists only where a daily rate is published.
        const rate = rateOn(input.rates, day.date, { setting: day.setting, kind: day.presence === 'on_leave_hold' ? 'bed_hold_daily' : 'room_daily' })
        if (rate && day.payerId) {
          lines.push(finish({ stayId, residentId, date: day.date, kind: 'per_diem_claim', responsibility: 'payer', payerKey: day.payerId, payerId: day.payerId, description: labelOf.per_diem_claim, amountMinor: rate.amountMinor, derivation: { rateLineId: rate.id, per: 'day' } }))
        }
      }
    }
    if (missingRate) problems.push({ code: 'missing_rate', stayId, residentId, count: missingRate })

    for (const id of [...groups.keys()].sort()) {
      const group = groups.get(id)!
      lines.push(...monthly(group.base, group.dates, group.rate.amountMinor, daysInMonth, { rateLineId: group.rate.id }, group.rate.proration))
    }

    // Medicaid: the resident's monthly patient liability, prorated by the days Medicaid covered them this month.
    const medicaidDays = days.filter(day => day.payerKind === 'medicaid_ffs' || day.payerKind === 'medicaid_mco').map(day => day.date)
    if (medicaidDays.length) {
      const liability = input.liabilities.find(row => row.stayId === stayId)
      if (!liability) problems.push({ code: 'missing_liability', stayId, residentId, count: 1 })
      else if (liability.liabilityMinor > 0n) {
        lines.push(...monthly({ stayId, residentId, kind: 'patient_liability', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.patient_liability }, medicaidDays, liability.liabilityMinor, daysInMonth, { liability: true }, 'actual_days_in_month'))
      }
    }
  }

  lines.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  problems.sort((a, b) => (`${a.code}|${a.stayId}` < `${b.code}|${b.stayId}` ? -1 : 1))
  return { lines, problems, hash: sha256(canonicalJson({ month: input.month, lines: lines.map(line => line.derivationHash + line.key) })) }
}

/** Resident-pay lines of one stay grouped for a statement: one row per kind and rate, with the dates they cover. */
export function statementLines(lines: readonly { kind: string; description: string; date: string; amountMinor: bigint }[]) {
  const groups = new Map<string, { kind: string; description: string; from: string; to: string; days: number; amountMinor: bigint }>()
  for (const line of [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const id = `${line.kind}|${line.description}`
    const group = groups.get(id) ?? { kind: line.kind, description: line.description, from: line.date, to: line.date, days: 0, amountMinor: 0n }
    group.to = line.date
    group.days += 1
    group.amountMinor += line.amountMinor
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => (`${a.kind}${a.description}` < `${b.kind}${b.description}` ? -1 : 1))
}
