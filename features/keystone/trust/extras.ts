import { addDays, daysBetween } from '../lib/calendar'
import { allocateMinor } from '../lib/money'
import type { TrustLine } from './ledger'

/**
 * Pure trust arithmetic for Phase 3b (STATE-MACHINES §13.3, §13.5): interest allocation by average daily balance, quarterly
 * statements, the SSI/Medicaid resource-threshold alert and surety bond coverage. All computed on read; BigInt minor units only.
 */

const monthLength = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }
export const monthEndOf = (month: string) => addDays(month, monthLength(month) - 1)

/** Each ledger's end-of-day balance summed over every day of the month (the average daily balance times the days). */
export function dailyBalanceSums(lines: readonly TrustLine[], ledgerIds: readonly string[], month: string) {
  const days = monthLength(month)
  const end = monthEndOf(month)
  const out = new Map<string, bigint>(ledgerIds.map(id => [id, 0n]))
  for (const id of ledgerIds) {
    const own = lines.filter(line => line.bucket === 'client_liability' && line.ledgerId === id && line.effectiveOn <= end)
    let sum = 0n
    for (let i = 0; i < days; i += 1) {
      const d = addDays(month, i)
      let balance = 0n
      for (const line of own) if (line.effectiveOn <= d) balance += line.side === 'credit' ? line.amountMinor : -line.amountMinor
      if (balance > 0n) sum += balance
    }
    out.set(id, sum)
  }
  return out
}

export type InterestShare = { ledgerId: string; weightMinorDays: bigint; amountMinor: bigint }

/**
 * Shares one month's bank interest across ledgers by average daily balance, largest remainder (ties to the earlier ledger id). The
 * shares sum to the interest exactly; a ledger with no balance in the month gets nothing.
 */
export function allocateInterest(interestMinor: bigint, weights: ReadonlyMap<string, bigint>): InterestShare[] {
  if (typeof interestMinor !== 'bigint' || interestMinor <= 0n) throw new RangeError('The interest must be more than zero.')
  const entries = [...weights.entries()].filter(([, weight]) => weight > 0n).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  if (!entries.length) throw new RangeError('No resident held funds in this account during the month.')
  const shares = allocateMinor(interestMinor, entries.map(([, weight]) => weight.toString()))
  return entries.map(([ledgerId, weightMinorDays], index) => ({ ledgerId, weightMinorDays, amountMinor: shares[index] })).filter(share => share.amountMinor > 0n)
}

/* ---- Quarterly statements ------------------------------------------------------------------------------------- */

export const quarterStart = (date: string) => {
  const [y, m] = date.split('-').map(Number)
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
}
export const quarterEnd = (start: string) => {
  const [y, m] = start.split('-').map(Number)
  return monthEndOf(`${y}-${String(m + 2).padStart(2, '0')}-01`)
}
export const quarterLabel = (start: string) => `Q${Math.floor((Number(start.slice(5, 7)) - 1) / 3) + 1} ${start.slice(0, 4)}`

export type StatementTx = { reference: string; kind: string; purpose: string; effectiveOn: string; ledgerId: string; lines: readonly TrustLine[] }
export type StatementLine = { date: string; reference: string; description: string; inMinor: string; outMinor: string; balanceMinor: string }

/** One resident's quarter: opening balance, each posted entry with its running balance, and the closing balance. */
export function quarterStatement(ledgerId: string, txs: readonly StatementTx[], start: string) {
  const end = quarterEnd(start)
  const delta = (tx: StatementTx) => tx.lines.filter(line => line.bucket === 'client_liability' && line.ledgerId === ledgerId).reduce((sum, line) => sum + (line.side === 'credit' ? line.amountMinor : -line.amountMinor), 0n)
  let opening = 0n
  for (const tx of txs) if (tx.effectiveOn < start) opening += delta(tx)
  const within = txs.filter(tx => tx.effectiveOn >= start && tx.effectiveOn <= end).sort((a, b) => (a.effectiveOn < b.effectiveOn ? -1 : a.effectiveOn > b.effectiveOn ? 1 : a.reference < b.reference ? -1 : 1))
  let running = opening
  let inMinor = 0n
  let outMinor = 0n
  const lines: StatementLine[] = []
  for (const tx of within) {
    const d = delta(tx)
    if (d === 0n) continue
    running += d
    if (d > 0n) inMinor += d
    else outMinor += -d
    lines.push({ date: tx.effectiveOn, reference: tx.reference, description: `${tx.kind.replace(/_/g, ' ')}${tx.purpose ? `: ${tx.purpose}` : ''}`, inMinor: d > 0n ? d.toString() : '', outMinor: d < 0n ? (-d).toString() : '', balanceMinor: running.toString() })
  }
  return { start, end, openingMinor: opening, inMinor, outMinor, closingMinor: running, lines }
}

/* ---- Resource threshold and surety bond ----------------------------------------------------------------------- */

export type ResourceRule = { limitMinor: bigint; marginMinor: bigint }
export type ResourceAlert = { state: 'none' | 'not_medicaid' | 'near_limit' | 'over_limit'; limitMinor: bigint; headroomMinor: bigint }

/** The SSI/Medicaid resource alert: a Medicaid resident whose funds reach the limit less the margin is near it; above the limit is over. */
export function resourceAlert(balanceMinor: bigint, medicaid: boolean, rule: ResourceRule): ResourceAlert {
  const headroomMinor = rule.limitMinor - balanceMinor
  if (!medicaid) return { state: 'not_medicaid', limitMinor: rule.limitMinor, headroomMinor }
  if (balanceMinor > rule.limitMinor) return { state: 'over_limit', limitMinor: rule.limitMinor, headroomMinor }
  if (balanceMinor >= rule.limitMinor - rule.marginMinor) return { state: 'near_limit', limitMinor: rule.limitMinor, headroomMinor }
  return { state: 'none', limitMinor: rule.limitMinor, headroomMinor }
}

export const BOND_RENEWAL_DAYS = 30

/** Whether the active bond assures the funds held: missing, expired, expiring within 30 days, or smaller than the funds. */
export function bondStatus(bond: { amountMinor: bigint; expiresOn: string | null } | null, fundsMinor: bigint, today: string) {
  if (!bond) return { state: 'missing' as const, daysLeft: null, shortMinor: fundsMinor > 0n ? fundsMinor : 0n }
  const shortMinor = fundsMinor > bond.amountMinor ? fundsMinor - bond.amountMinor : 0n
  const daysLeft = bond.expiresOn ? daysBetween(today, bond.expiresOn) : null
  if (daysLeft !== null && daysLeft < 0) return { state: 'expired' as const, daysLeft, shortMinor }
  if (shortMinor > 0n) return { state: 'under_covered' as const, daysLeft, shortMinor }
  if (daysLeft !== null && daysLeft <= BOND_RENEWAL_DAYS) return { state: 'renewal_due' as const, daysLeft, shortMinor }
  return { state: 'ok' as const, daysLeft, shortMinor }
}

/** The pack's trust rules (US-OH: Ohio Medicaid and SSI resource limit $2,000, alert at $200 below). */
export function trustRules(rules: unknown) {
  const r = (rules ?? {}) as { trustResourceThreshold?: { value?: { limitMinor?: string | number; marginMinor?: string | number } }; trustAuthorisationApproval?: { value?: { overMinor?: string | number } } }
  const toMinor = (value: unknown, fallback: bigint) => (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? BigInt(value) : fallback)
  return {
    resource: { limitMinor: toMinor(r.trustResourceThreshold?.value?.limitMinor, 200_000n), marginMinor: toMinor(r.trustResourceThreshold?.value?.marginMinor, 20_000n) },
    authorisationOverMinor: toMinor(r.trustAuthorisationApproval?.value?.overMinor, 0n),
  }
}
