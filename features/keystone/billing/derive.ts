import { canonicalJson, sha256 } from '../lib/canonical'
import { addDays } from '../lib/calendar'
import { dec } from '../lib/decimal'
import { allocateMinor, roundToMinor } from '../lib/money'
import { benefitDays, hospiceRoomBoard, medicareDay, type MedicareInput } from './medicare'

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
  /** 1 for the first occupant of the apartment that day (by admission, then id), 2 for the second. Comes from the census. */
  occupantRank: number
  /** The primary coverage in force that day (Medicare A and hospice days need it). */
  coverageId?: string | null
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

/** levelMinPoints is the assigned level's minPoints: the rank used to tell an increase from a decrease (a manual level's own points can be anything). */
export type CareAssignmentIn = { stayId: string; careLevelId: string; points: number; levelMinPoints?: number; effectiveFrom: string; noticeDeliveredOn: string | null }
export type LiabilityIn = { stayId: string; liabilityMinor: bigint }

export type DerivationInput = {
  month: string
  days: DayRow[]
  rates: RateLineIn[]
  careAssignments: CareAssignmentIn[]
  liabilities: LiabilityIn[]
  /** Days of written notice before a care-level increase bills (pack rule careLevelIncreaseNoticeDays). */
  careNoticeDays: number
  /** Phase 4a: Part A days bill the PDPM per diem (absent = the Phase 3 behaviour, a published daily rate). */
  medicare?: MedicareInput & { coverages: Record<string, { qualifyingStayOk: boolean; skilledCertOk: boolean }> }
  /** Phase 4a: hospice-elected days bill the hospice agency room and board at its pass-through share. */
  hospice?: Record<string, { roomBoardBps: number }>
}

export type DerivedLine = {
  key: string
  stayId: string
  residentId: string
  date: string
  kind: 'rent' | 'second_person' | 'care_level' | 'room_board' | 'bed_hold' | 'patient_liability' | 'per_diem_claim' | 'coinsurance'
  responsibility: 'resident' | 'payer'
  payerKey: string
  payerId: string | null
  description: string
  amountMinor: bigint
  derivation: Record<string, unknown>
  derivationHash: string
}

export type DerivationProblem = { code: 'uncovered_days' | 'missing_rate' | 'missing_liability' | 'missing_assessment' | 'benefit_exhausted' | 'medicare_unqualified'; stayId?: string; residentId?: string; count: number }

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

/**
 * The care level billed on a date. A decrease (or the first assignment) applies from its effective date. An increase bills
 * only from the later of its effective date and noticeDeliveredOn + notice days; with no notice it never bills, so the old
 * level stays. Each row is compared with the level actually billed on that date (not the row before it), by the level's
 * minPoints, so a repeated no-notice increase or a manual level with low points can never bill early.
 */
const careOn = (assignments: readonly CareAssignmentIn[], stayId: string, date: string, noticeDays: number) => {
  const rows = assignments.filter(row => row.stayId === stayId).sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0))
  const rank = (row: CareAssignmentIn) => row.levelMinPoints ?? row.points
  let billed: CareAssignmentIn | null = null
  for (const row of rows) {
    if (row.effectiveFrom > date) break
    const increase = billed !== null && rank(row) > rank(billed)
    const billableFrom = !increase ? row.effectiveFrom : row.noticeDeliveredOn ? (addDays(row.noticeDeliveredOn, noticeDays) > row.effectiveFrom ? addDays(row.noticeDeliveredOn, noticeDays) : row.effectiveFrom) : '9999-12-31'
    if (billableFrom <= date) billed = row
  }
  return billed
}

const finish = (line: Omit<DerivedLine, 'key' | 'derivationHash'>): DerivedLine => {
  const key = lineKey(line)
  return { ...line, key, derivationHash: sha256(canonicalJson({ key, amountMinor: line.amountMinor, derivation: line.derivation, description: line.description })) }
}

const labelOf: Record<string, string> = { rent: 'Apartment rent', second_person: 'Second person', care_level: 'Care level', room_board: 'Room and board', bed_hold: 'Bed hold', patient_liability: 'Patient liability', per_diem_claim: 'Per diem', coinsurance: 'Medicare coinsurance' }

/** A monthly charge over `dates` (one group of identical rates): the prorated total, spread over the days so it sums exactly. */
function monthly(
  base: { stayId: string; residentId: string; kind: DerivedLine['kind']; responsibility: DerivedLine['responsibility']; payerKey: string; payerId: string | null; description: string },
  dates: string[], monthlyMinor: bigint, daysInMonth: number, derivation: Record<string, unknown>, proration: RateLineIn['proration'], per: RateLineIn['per'] = 'month',
) {
  const divisor = proration === 'thirty_day_month' ? 30 : daysInMonth
  // A daily rate (per:'day' or the daily method) is rate × days; a monthly rate is prorated by the days in the month.
  const daily = per === 'day' || proration === 'daily'
  const total = daily ? monthlyMinor * BigInt(dates.length) : dates.length >= daysInMonth ? monthlyMinor : roundToMinor(dec(monthlyMinor).times(dates.length).div(divisor))
  const shares = allocateMinor(total, dates.map(() => 1))
  return dates.map((date, index) => finish({ ...base, date, amountMinor: shares[index], derivation: { ...derivation, monthlyMinor, daysInGroup: dates.length, daysInMonth, proration, per } }))
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
    const extra = new Map<DerivationProblem['code'], number>()
    const bump = (code: DerivationProblem['code']) => extra.set(code, (extra.get(code) ?? 0) + 1)
    let countedCache: { stay: unknown; map: ReturnType<typeof benefitDays> } | null = null
    const countedOf = (stay: NonNullable<DerivationInput['medicare']>['stays'][number]) => {
      if (countedCache?.stay !== stay) countedCache = { stay, map: benefitDays(stay, monthEnd(input.month)) }
      return countedCache.map
    }

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
        if (day.occupantRank > 1) {
          // The second occupant of an apartment pays the second-person rate instead of rent.
          const second = rateOn(input.rates, day.date, { setting, kind: 'second_person' })
          if (!second) { missingRate += 1; continue }
          add(second, { stayId, residentId, kind: 'second_person', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.second_person }, day.date)
        } else {
          const rent = rateOn(input.rates, day.date, { setting, kind: 'apartment_rent', apartmentTypeId: day.apartmentTypeId })
          if (!rent) { missingRate += 1; continue }
          add(rent, { stayId, residentId, kind: 'rent', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.rent }, day.date)
        }
        if (day.presence === 'in_house') {
          const care = careOn(input.careAssignments, stayId, day.date, input.careNoticeDays)
          const rate = care ? rateOn(input.rates, day.date, { setting, kind: 'care_level', careLevelId: care.careLevelId }) : null
          if (rate) add(rate, { stayId, residentId, kind: 'care_level', responsibility: 'resident', payerKey: 'resident', payerId: null, description: labelOf.care_level }, day.date)
        }
      } else if (day.payerKind === 'medicare_a' && input.medicare) {
        // Part A: the PDPM per diem of the classification in force, split into the Medicare claim and the resident's coinsurance.
        const stay = input.medicare.stays.find(row => row.stayId === stayId)
        const cov = day.coverageId ? input.medicare.coverages[day.coverageId] : undefined
        if (!stay || !cov || !cov.qualifyingStayOk || !cov.skilledCertOk) { bump('medicare_unqualified'); continue }
        if (day.presence !== 'in_house') continue // a leave day is not a Part A day (count_admit_not_discharge)
        const counted = countedOf(stay)
        const result = medicareDay(stay, counted, input.medicare.rates, day.date)
        if (result.kind === 'problem') { bump(result.code === 'missing_rate' ? 'missing_rate' : result.code); continue }
        const basis = { hipps: result.classification.hipps, classificationId: result.classification.id, benefitDay: result.benefitDay, vpdDay: result.vpdDay, version: input.medicare.rates!.version, components: result.components, pdpmMinor: result.pdpmMinor }
        if (day.payerId) lines.push(finish({ stayId, residentId, date: day.date, kind: 'per_diem_claim', responsibility: 'payer', payerKey: day.payerId, payerId: day.payerId, description: `Medicare Part A ${result.classification.hipps} day ${result.benefitDay}`, amountMinor: result.pdpmMinor - result.coinsuranceMinor, derivation: basis }))
        if (result.coinsuranceMinor > 0n) lines.push(finish({ stayId, residentId, date: day.date, kind: 'coinsurance', responsibility: 'resident', payerKey: 'resident', payerId: null, description: `${labelOf.coinsurance} (day ${result.benefitDay})`, amountMinor: result.coinsuranceMinor, derivation: { ...basis, coinsuranceMinor: result.coinsuranceMinor } }))
      } else if (day.payerKind === 'hospice_agency' && input.hospice) {
        // Hospice election: the facility bills the hospice its share of the nursing-facility daily rate (pass-through room and board).
        const share = day.coverageId ? input.hospice[day.coverageId] : undefined
        const rate = rateOn(input.rates, day.date, { setting: day.setting, kind: day.presence === 'on_leave_hold' ? 'bed_hold_daily' : 'room_daily' })
        if (!rate || !share) { missingRate += 1; continue }
        if (day.payerId) lines.push(finish({ stayId, residentId, date: day.date, kind: 'room_board', responsibility: 'payer', payerKey: day.payerId, payerId: day.payerId, description: 'Hospice room and board', amountMinor: hospiceRoomBoard(rate.amountMinor, share.roomBoardBps), derivation: { rateLineId: rate.id, roomBoardBps: share.roomBoardBps } }))
      } else if (day.payerKind === 'medicaid_ffs' || day.payerKind === 'medicaid_mco' || day.payerKind === 'medicare_a' || day.payerKind === 'medicare_advantage') {
        // The payer's per diem is a claim line (billed in Phase 4); it exists only where a daily rate is published.
        const rate = rateOn(input.rates, day.date, { setting: day.setting, kind: day.presence === 'on_leave_hold' ? 'bed_hold_daily' : 'room_daily' })
        if (rate && day.payerId) {
          lines.push(finish({ stayId, residentId, date: day.date, kind: 'per_diem_claim', responsibility: 'payer', payerKey: day.payerId, payerId: day.payerId, description: labelOf.per_diem_claim, amountMinor: rate.amountMinor, derivation: { rateLineId: rate.id, per: 'day' } }))
        }
      }
    }
    if (missingRate) problems.push({ code: 'missing_rate', stayId, residentId, count: missingRate })
    for (const [code, count] of [...extra.entries()].sort()) problems.push({ code, stayId, residentId, count })

    for (const id of [...groups.keys()].sort()) {
      const group = groups.get(id)!
      lines.push(...monthly(group.base, group.dates, group.rate.amountMinor, daysInMonth, { rateLineId: group.rate.id }, group.rate.proration, group.rate.per))
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
