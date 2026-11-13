import { addDays, daysBetween } from '../lib/calendar'
import { allocateMinor } from '../lib/money'

/**
 * Accounts receivable arithmetic (SCHEMA §10.7, §10.13; STATE-MACHINES §12.6). Pure: no database, BigInt minor units only.
 * Payment plan instalments, collections ageing and the GL journal are worked out here and computed on read: no job runs them.
 */

export const MAX_INSTALMENTS = 24

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The same day of a later month, clamped to that month's last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split('-').map(Number)
  const index = y * 12 + (m - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, lastDay(year, month))).padStart(2, '0')}`
}

export type Instalment = { number: number; dueOn: string; amountMinor: bigint }

/**
 * Splits a balance into `count` monthly instalments that sum to it exactly. Shares differ by at most one cent and the earlier
 * instalments carry the extra cents (largest remainder, ties to the earlier one).
 */
export function planInstalments(totalMinor: bigint, count: number, firstDueOn: string): Instalment[] {
  if (typeof totalMinor !== 'bigint' || totalMinor <= 0n) throw new RangeError('A plan needs a balance above zero.')
  if (!Number.isInteger(count) || count < 2 || count > MAX_INSTALMENTS) throw new RangeError(`A plan has 2 to ${MAX_INSTALMENTS} instalments.`)
  if (BigInt(count) > totalMinor) throw new RangeError('Each instalment must be at least one cent.')
  addDays(firstDueOn, 0)
  const shares = allocateMinor(totalMinor, Array.from({ length: count }, () => 1))
  return shares.map((amountMinor, index) => ({ number: index + 1, dueOn: addMonths(firstDueOn, index), amountMinor }))
}

export type InstalmentState = 'paid' | 'in_flight' | 'declined' | 'overdue' | 'due' | 'upcoming'

/**
 * An instalment's state, read from its latest payment and today's date. A declined instalment stays declined until a person
 * presses Retry: nothing here or anywhere else charges it again on its own.
 */
export function instalmentState(row: { dueOn: string; paymentStatus: string | null }, today: string): InstalmentState {
  if (row.paymentStatus === 'succeeded') return 'paid'
  if (row.paymentStatus === 'pending' || row.paymentStatus === 'unknown') return 'in_flight'
  if (row.paymentStatus === 'failed') return 'declined'
  const left = daysBetween(today, row.dueOn)
  return left < 0 ? 'overdue' : left <= 7 ? 'due' : 'upcoming'
}

export const AGEING_BUCKETS = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_over_90'] as const
export type AgeingBucket = (typeof AGEING_BUCKETS)[number]

/** Which bucket a balance falls in, by whole days past its due date (not yet due, or due today, is current). */
export function bucketOf(dueOn: string | null, today: string): AgeingBucket {
  if (!dueOn) return 'current'
  const late = daysBetween(dueOn, today)
  if (late <= 0) return 'current'
  if (late <= 30) return 'days_1_30'
  if (late <= 60) return 'days_31_60'
  if (late <= 90) return 'days_61_90'
  return 'days_over_90'
}

export type AgeingRow = { residentId: string; name: string; onPlan: boolean; buckets: Record<AgeingBucket, bigint>; totalMinor: bigint; oldestDueOn: string | null }

/**
 * Collections ageing over open statements, grouped by resident. A statement on an active payment plan is still aged, and marked,
 * so a plan never hides a balance.
 */
export function ageing(statements: readonly { residentId: string; name: string; dueOn: string | null; status: string; totalMinor: bigint; paidMinor: bigint; adjustedMinor: bigint; onPlan?: boolean }[], today: string) {
  const zero = () => Object.fromEntries(AGEING_BUCKETS.map(bucket => [bucket, 0n])) as Record<AgeingBucket, bigint>
  const totals = zero()
  const byResident = new Map<string, AgeingRow>()
  for (const s of statements) {
    if (s.status === 'void') continue
    const balance = s.totalMinor - s.paidMinor - s.adjustedMinor
    if (balance <= 0n) continue
    const bucket = bucketOf(s.dueOn, today)
    const row = byResident.get(s.residentId) ?? { residentId: s.residentId, name: s.name, onPlan: false, buckets: zero(), totalMinor: 0n, oldestDueOn: null }
    row.buckets[bucket] += balance
    row.totalMinor += balance
    row.onPlan ||= s.onPlan === true
    if (s.dueOn && (!row.oldestDueOn || s.dueOn < row.oldestDueOn)) row.oldestDueOn = s.dueOn
    byResident.set(s.residentId, row)
    totals[bucket] += balance
  }
  const rows = [...byResident.values()].sort((a, b) => (a.oldestDueOn ?? '9999') < (b.oldestDueOn ?? '9999') ? -1 : (a.oldestDueOn ?? '9999') > (b.oldestDueOn ?? '9999') ? 1 : a.name < b.name ? -1 : 1)
  return { rows, totals, totalMinor: AGEING_BUCKETS.reduce((sum, bucket) => sum + totals[bucket], 0n) }
}

/* ---- General ledger export ------------------------------------------------------------------------------------ */

/**
 * The default chart of accounts the export posts to. The operator's accountant maps these numbers in their own GL import; the
 * numbers and names are printed on every line so nothing is hidden.
 */
export const GL_ACCOUNTS = {
  cash: { number: '1010', name: 'Operating cash' },
  arResident: { number: '1200', name: 'Accounts receivable, residents' },
  arPayer: { number: '1210', name: 'Accounts receivable, payers' },
  depositsHeld: { number: '2300', name: 'Resident deposits held' },
  residentCredits: { number: '2310', name: 'Resident credits on account' },
  revenue: {
    rent: { number: '4010', name: 'Rent revenue' },
    second_person: { number: '4011', name: 'Second person revenue' },
    care_level: { number: '4020', name: 'Care level revenue' },
    room_board: { number: '4030', name: 'Room and board revenue' },
    bed_hold: { number: '4031', name: 'Bed hold revenue' },
    per_diem_claim: { number: '4040', name: 'Payer per diem revenue' },
    coinsurance: { number: '4041', name: 'Coinsurance revenue' },
    patient_liability: { number: '4042', name: 'Patient liability revenue' },
    ancillary: { number: '4050', name: 'Ancillary revenue' },
    community_fee: { number: '4060', name: 'Community fee revenue' },
    late_fee: { number: '4070', name: 'Late fee revenue' },
    adjustment: { number: '4090', name: 'Prior month adjustments' },
    deposit_application: { number: '4095', name: 'Deposits applied' },
  } as Record<string, { number: string; name: string }>,
  adjustments: { number: '4900', name: 'Billing adjustments' },
  badDebt: { number: '6900', name: 'Bad debt written off' },
} as const

export type GlLine = { date: string; account: string; accountName: string; debitMinor: bigint; creditMinor: bigint; memo: string }

/**
 * A balanced journal for one month: charges by kind and responsibility, settled payments by method, posted adjustments and
 * write-offs. Every entry is a debit and a credit of the same amount, so the journal always balances.
 */
export function glJournal(input: {
  monthEnd: string
  charges: readonly { kind: string; responsibility: string; amountMinor: bigint }[]
  payments: readonly { method: string; amountMinor: bigint; settledOn: string }[]
  adjustments: readonly { kind: string; amountMinor: bigint; postedOn: string }[]
}): GlLine[] {
  const out: GlLine[] = []
  const pair = (date: string, debit: { number: string; name: string }, credit: { number: string; name: string }, amount: bigint, memo: string) => {
    if (amount === 0n) return
    // A negative amount (a prior-month credit) swaps the sides, so every line stays positive.
    const [d, c, a] = amount > 0n ? [debit, credit, amount] : [credit, debit, -amount]
    out.push({ date, account: d.number, accountName: d.name, debitMinor: a, creditMinor: 0n, memo })
    out.push({ date, account: c.number, accountName: c.name, debitMinor: 0n, creditMinor: a, memo })
  }
  const sums = new Map<string, bigint>()
  for (const charge of input.charges) sums.set(`${charge.kind}|${charge.responsibility}`, (sums.get(`${charge.kind}|${charge.responsibility}`) ?? 0n) + charge.amountMinor)
  for (const key of [...sums.keys()].sort()) {
    const [kind, responsibility] = key.split('|')
    const revenue = GL_ACCOUNTS.revenue[kind] ?? GL_ACCOUNTS.revenue.ancillary
    pair(input.monthEnd, responsibility === 'payer' ? GL_ACCOUNTS.arPayer : GL_ACCOUNTS.arResident, revenue, sums.get(key)!, `Charges: ${kind.replace(/_/g, ' ')} (${responsibility})`)
  }
  const byPayment = new Map<string, bigint>()
  for (const p of input.payments) byPayment.set(`${p.settledOn}|${p.method}`, (byPayment.get(`${p.settledOn}|${p.method}`) ?? 0n) + p.amountMinor)
  for (const key of [...byPayment.keys()].sort()) {
    const [date, method] = key.split('|')
    const source = method === 'deposit' ? GL_ACCOUNTS.depositsHeld : method === 'credit' ? GL_ACCOUNTS.residentCredits : GL_ACCOUNTS.cash
    pair(date, source, GL_ACCOUNTS.arResident, byPayment.get(key)!, `Payments received: ${method}`)
  }
  const byAdjustment = new Map<string, bigint>()
  for (const a of input.adjustments) byAdjustment.set(`${a.postedOn}|${a.kind}`, (byAdjustment.get(`${a.postedOn}|${a.kind}`) ?? 0n) + a.amountMinor)
  for (const key of [...byAdjustment.keys()].sort()) {
    const [date, kind] = key.split('|')
    pair(date, kind === 'write_off' ? GL_ACCOUNTS.badDebt : GL_ACCOUNTS.adjustments, GL_ACCOUNTS.arResident, byAdjustment.get(key)!, kind === 'write_off' ? 'Balances written off' : 'Balance adjustments')
  }
  return out
}

const cents = (minor: bigint) => {
  const digits = (minor < 0n ? -minor : minor).toString().padStart(3, '0')
  return `${minor < 0n ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`
}
const cell = (value: string) => (/[",\n\r]/.test(value) || /^[=+\-@]/.test(value) ? `"${value.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : value)

/** The journal as CSV (dollars and cents as exact decimal text, no floats; spreadsheet formulas neutralised). */
export function glCsv(lines: readonly GlLine[], reference: string) {
  const rows = [['date', 'account', 'account_name', 'debit', 'credit', 'memo', 'reference']]
  for (const line of lines) rows.push([line.date, line.account, line.accountName, line.debitMinor ? cents(line.debitMinor) : '', line.creditMinor ? cents(line.creditMinor) : '', line.memo, reference])
  return `${rows.map(row => row.map(cell).join(',')).join('\r\n')}\r\n`
}
