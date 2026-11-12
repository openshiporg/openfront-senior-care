import { actorUserId, type Actor } from '../lib/actor'
import { addDays, localDate } from '../lib/calendar'
import { canonicalJson, sha256 } from '../lib/canonical'
import { closedThrough } from '../lib/census'
import { deriveCensusRange } from '../lib/censusDay'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { lockRow } from '../lib/cas'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { deriveCharges, monthDays, monthEnd, nextMonth, statementLines, type DayRow, type Derivation, type DerivationInput, type DerivedLine } from './derive'

/**
 * Month-end close (STATE-MACHINES §12.2). A staff button, idempotent per period: it derives the charges from the census,
 * freezes them, and issues one statement per resident. A change dated inside a closed month never edits it: the affected
 * charges are superseded by new ones and the difference becomes an adjustment in the next open period.
 */

const DATE = /^\d{4}-01$|^\d{4}-\d{2}-01$/
const day = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '')

export function assertMonth(month: string) {
  if (!DATE.test(month) && !/^\d{4}-\d{2}-01$/.test(month)) throw new DomainError(Codes.INVALID_INPUT, 'The month is the first day of the month, like 2026-10-01.', { field: 'month' })
}

/** Everything the pure derivation needs, read from the live census and the published rates. */
export async function loadDerivationInput(tx: Tx, communityId: string, month: string): Promise<DerivationInput> {
  assertMonth(month)
  const dates = Array.from({ length: monthDays(month) }, (_, index) => addDays(month, index))
  const byDate = await deriveCensusRange(tx, communityId, dates)
  const derived = dates.map(date => ({ date, rows: byDate.get(date) ?? [] }))

  const stayIds = [...new Set(derived.flatMap(entry => entry.rows.map(row => row.stayId)))]
  const apartmentIds = [...new Set(derived.flatMap(entry => entry.rows.map(row => row.apartmentId).filter((id): id is string => Boolean(id))))]
  const coverageIds = [...new Set(derived.flatMap(entry => entry.rows.map(row => row.coverageId).filter((id): id is string => Boolean(id))))]
  const [stays, apartments, coverages, schedules, assignments, liabilities, pack] = await Promise.all([
    tx.stay.findMany({ where: { id: { in: stayIds } }, select: { id: true, residentId: true, admittedAt: true } }),
    tx.apartment.findMany({ where: { id: { in: apartmentIds } }, select: { id: true, apartmentTypeId: true } }),
    tx.coveragePeriod.findMany({ where: { id: { in: coverageIds } }, select: { id: true, payerId: true } }),
    tx.rateSchedule.findMany({ where: { communityId, status: 'published', effectiveFrom: { lte: day(monthEnd(month)) } }, select: { setting: true, lines: true } }),
    tx.careLevelAssignment.findMany({ where: { communityId, effectiveFrom: { lte: day(monthEnd(month)) } }, select: { stayId: true, careLevelId: true, points: true, effectiveFrom: true, noticeDeliveredOn: true }, orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
    tx.medicaidLiability.findMany({ where: { communityId, month: day(month), status: { not: 'superseded' } }, select: { stayId: true, liabilityMinor: true } }),
    tx.community.findUnique({ where: { id: communityId }, select: { jurisdictionPack: { select: { rules: true } } } }),
  ])
  const noticeRule = ((pack?.jurisdictionPack?.rules ?? {}) as { careLevelIncreaseNoticeDays?: { value?: number } }).careLevelIncreaseNoticeDays?.value
  const careNoticeDays = Number.isInteger(noticeRule) && (noticeRule as number) >= 0 ? (noticeRule as number) : 30
  const admittedOf = new Map(stays.map(stay => [stay.id, stay.admittedAt?.toISOString() ?? '']))
  const residentOf = new Map(stays.map(stay => [stay.id, stay.residentId ?? '']))
  const typeOf = new Map(apartments.map(apartment => [apartment.id, apartment.apartmentTypeId]))
  const payerOf = new Map(coverages.map(coverage => [coverage.id, coverage.payerId]))

  const days: DayRow[] = []
  for (const entry of derived) {
    // Occupancy comes from the census: the first occupant of an apartment that day (by admission, then id) is rank 1, the next rank 2.
    const rank = new Map<string, number>()
    const inApartment = new Map<string, typeof entry.rows>()
    for (const row of entry.rows) if (row.apartmentId) inApartment.set(row.apartmentId, [...(inApartment.get(row.apartmentId) ?? []), row])
    for (const group of inApartment.values()) {
      group.sort((a, b) => ((admittedOf.get(a.stayId) ?? '') + a.stayId < (admittedOf.get(b.stayId) ?? '') + b.stayId ? -1 : 1)).forEach((row, index) => rank.set(row.stayId, index + 1))
    }
    for (const row of entry.rows) {
      days.push({
        stayId: row.stayId, residentId: residentOf.get(row.stayId) ?? '', date: entry.date, setting: row.setting ?? '',
        presence: row.presence as DayRow['presence'], apartmentTypeId: row.apartmentId ? typeOf.get(row.apartmentId) ?? null : null,
        payerKind: row.payerKind, payerId: row.coverageId ? payerOf.get(row.coverageId) ?? null : null, occupantRank: rank.get(row.stayId) ?? 1,
      })
    }
  }
  const scheduleIds = new Map<string, string>()
  const rates = schedules.length ? await tx.rateLine.findMany({
    where: { schedule: { communityId, status: 'published', effectiveFrom: { lte: day(monthEnd(month)) } } },
    select: { id: true, kind: true, amountMinor: true, per: true, proration: true, apartmentTypeId: true, careLevelId: true, scheduleId: true, schedule: { select: { setting: true, effectiveFrom: true } } },
  }) : []
  void scheduleIds
  return {
    month, days,
    rates: rates.map(line => ({
      id: line.id, scheduleId: line.scheduleId ?? '', effectiveFrom: iso(line.schedule?.effectiveFrom), setting: line.schedule?.setting ?? '', kind: line.kind,
      apartmentTypeId: line.apartmentTypeId, careLevelId: line.careLevelId, amountMinor: line.amountMinor ?? 0n,
      per: (line.per ?? 'month') as 'month' | 'day' | 'each', proration: (line.proration ?? 'actual_days_in_month') as 'actual_days_in_month' | 'thirty_day_month' | 'daily',
    })),
    careAssignments: assignments.filter(row => row.stayId && row.careLevelId).map(row => ({ stayId: row.stayId!, careLevelId: row.careLevelId!, points: row.points, effectiveFrom: iso(row.effectiveFrom), noticeDeliveredOn: iso(row.noticeDeliveredOn) || null })),
    careNoticeDays,
    liabilities: liabilities.filter(row => row.stayId).map(row => ({ stayId: row.stayId!, liabilityMinor: row.liabilityMinor ?? 0n })),
  }
}

export async function deriveForMonth(tx: Tx, communityId: string, month: string): Promise<Derivation> {
  return deriveCharges(await loadDerivationInput(tx, communityId, month))
}

async function getOrCreatePeriod(uow: UnitOfWork, actor: Actor, communityId: string, month: string) {
  const existing = await uow.tx.billingPeriod.findFirst({ where: { communityId, month: day(month) } })
  if (existing) return existing
  const created = await uow.tx.billingPeriod.create({ data: { communityId, month: day(month), status: 'open' } })
  uow.audit({ eventType: 'billing.period_opened', entityType: 'BillingPeriod', entityId: created.id, actorUserId: actorUserId(actor), after: { month } })
  return created
}


type ChargeRow = { id: string; stayId: string | null; residentId: string | null; date: Date | null; kind: string; payerKey: string; amountMinor: bigint; status: string; derivationHash: string; responsibility: string }
const keyOf = (row: { stayId: string | null; date: Date | null; kind: string; payerKey: string }) => `${row.stayId}|${iso(row.date)}|${row.kind}|${row.payerKey}`

/**
 * Brings a period's derived charges in line with `derivation`. Unchanged rows are not touched, a changed row is superseded
 * by a new row, a row no longer derived is voided. `status` is what new rows are written with (open before the close, posted after).
 */
async function applyDerivation(uow: UnitOfWork, communityId: string, period: { id: string }, derivation: Derivation, liveStatuses: string[], newStatus: 'open' | 'posted') {
  const existing = (await uow.tx.charge.findMany({
    where: { periodId: period.id, source: 'derived', kind: { not: 'adjustment' }, status: { in: liveStatuses } },
    select: { id: true, stayId: true, residentId: true, date: true, kind: true, payerKey: true, amountMinor: true, status: true, derivationHash: true, responsibility: true },
  })) as ChargeRow[]
  const byKey = new Map(existing.map(row => [keyOf(row), row]))
  const created: DerivedLine[] = []
  const changes: { residentId: string; stayId: string; before: bigint; after: bigint; oldId: string | null; responsibility: string; date: string; kind: string }[] = []

  const toCreate = [] as DerivedLine[]
  const supersede = [] as { oldId: string; line: DerivedLine }[]
  for (const line of derivation.lines) {
    const prior = byKey.get(line.key)
    byKey.delete(line.key)
    if (prior && prior.derivationHash === line.derivationHash) continue
    if (prior) supersede.push({ oldId: prior.id, line })
    else toCreate.push(line)
    changes.push({ residentId: line.residentId, stayId: line.stayId, before: prior?.amountMinor ?? 0n, after: line.amountMinor, oldId: prior?.id ?? null, responsibility: line.responsibility, date: line.date, kind: line.kind })
  }
  const data = (line: DerivedLine) => ({
    communityId, residentId: line.residentId, stayId: line.stayId, periodId: period.id, date: day(line.date), kind: line.kind, responsibility: line.responsibility,
    payerKey: line.payerKey, payerId: line.payerId, description: line.description, amountMinor: line.amountMinor, source: 'derived', status: newStatus,
    derivation: line.derivation as never, derivationHash: line.derivationHash,
  })
  if (toCreate.length) await uow.tx.charge.createMany({ data: toCreate.map(data) })
  created.push(...toCreate)
  for (const { oldId, line } of supersede) {
    // The old row must stop counting before the new one (same key) exists: the live-key unique index allows one at a time.
    await uow.tx.charge.update({ where: { id: oldId }, data: { status: 'superseded' } })
    const row = await uow.tx.charge.create({ data: data(line) })
    await uow.tx.charge.update({ where: { id: oldId }, data: { supersededBy: { connect: { id: row.id } } } })
    created.push(line)
  }
  const removed = [...byKey.values()]
  for (const row of removed) {
    await uow.tx.charge.update({ where: { id: row.id }, data: { status: 'voided' } })
    changes.push({ residentId: row.residentId ?? '', stayId: row.stayId ?? '', before: row.amountMinor, after: 0n, oldId: row.id, responsibility: row.responsibility, date: iso(row.date), kind: row.kind })
  }
  return { created: created.length, superseded: supersede.length, voided: removed.length, unchanged: derivation.lines.length - toCreate.length - supersede.length, changes }
}

/** Staff button: derive (or re-derive) the open period's charges. Safe to run again; nothing changes if the census has not. */
export async function runDerivation(uow: UnitOfWork, actor: Actor, input: { communityId: string; month: string }) {
  assertMonth(input.month)
  const period = await getOrCreatePeriod(uow, actor, input.communityId, input.month)
  await lockRow(uow.tx, 'BillingPeriod', period.id)
  if (period.status === 'closed') throw new DomainError(Codes.GUARD_FAILED, 'This month is closed. A change dated inside it posts an adjustment to the next open month.', { reason: 'closed_period' })
  const derivation = await deriveForMonth(uow.tx, input.communityId, input.month)
  const result = await applyDerivation(uow, input.communityId, period, derivation, ['open'], 'open')
  uow.audit({ eventType: 'billing.derived', entityType: 'BillingPeriod', entityId: period.id, actorUserId: actorUserId(actor), after: { month: input.month, hash: derivation.hash, lines: derivation.lines.length, created: result.created, superseded: result.superseded, voided: result.voided, problems: derivation.problems.length } })
  return { periodId: period.id, hash: derivation.hash, lines: derivation.lines.length, created: result.created, superseded: result.superseded, voided: result.voided, unchanged: result.unchanged, problems: derivation.problems }
}

/** The charge hash a statement is issued against: the ids and hashes of its charges, in a fixed order. */
export const chargeHashOf = (charges: readonly { id: string; derivationHash: string; amountMinor: bigint }[]) =>
  sha256(canonicalJson([...charges].sort((a, b) => (a.id < b.id ? -1 : 1)).map(charge => [charge.id, charge.derivationHash, charge.amountMinor])))

async function issueStatements(uow: UnitOfWork, communityId: string, period: { id: string }, month: string) {
  const charges = await uow.tx.charge.findMany({
    where: { periodId: period.id, responsibility: 'resident', status: { in: ['open', 'posted'] } },
    select: { id: true, residentId: true, kind: true, description: true, date: true, amountMinor: true, derivationHash: true },
    orderBy: [{ residentId: 'asc' }, { date: 'asc' }, { id: 'asc' }],
  })
  const byResident = new Map<string, typeof charges>()
  for (const charge of charges) if (charge.residentId) byResident.set(charge.residentId, [...(byResident.get(charge.residentId) ?? []), charge])
  const dueOn = addDays(nextMonth(month), 9)
  let issued = 0
  for (const residentId of [...byResident.keys()].sort()) {
    const rows = byResident.get(residentId)!
    const total = rows.reduce((sum, row) => sum + (row.amountMinor ?? 0n), 0n)
    const lines = statementLines(rows.map(row => ({ kind: row.kind, description: row.description, date: iso(row.date), amountMinor: row.amountMinor ?? 0n })))
    await uow.tx.statement.create({
      data: {
        communityId, residentId, periodId: period.id, number: await nextReference(uow.tx, 'STM', uow.now, 6), status: total > 0n ? 'issued' : 'paid', issuedAt: uow.now, dueOn: day(dueOn),
        totalMinor: total, paidMinor: 0n, lines: lines.map(line => ({ ...line, amountMinor: line.amountMinor.toString() })) as never,
        chargeHash: chargeHashOf(rows.map(row => ({ id: row.id, derivationHash: row.derivationHash, amountMinor: row.amountMinor ?? 0n }))),
      },
    })
    issued += 1
  }
  return issued
}

/** Staff button: close the month. Idempotent: a closed period answers with what it already holds. */
export async function closePeriod(uow: UnitOfWork, actor: Actor, input: { communityId: string; month: string }) {
  assertMonth(input.month)
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { timeZone: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const period = await getOrCreatePeriod(uow, actor, input.communityId, input.month)
  await lockRow(uow.tx, 'BillingPeriod', period.id)
  const fresh = await uow.tx.billingPeriod.findUniqueOrThrow({ where: { id: period.id } })
  if (fresh.status === 'closed') return { periodId: period.id, status: 'closed', alreadyClosed: true, statements: fresh.statementCount ?? 0, hash: fresh.derivationHash }
  const end = monthEnd(input.month)
  if (localDate(community.timeZone, uow.now) <= end) throw new DomainError(Codes.GUARD_FAILED, 'The month has not ended yet.', { reason: 'month_not_ended' })
  const closed = await closedThrough(uow.tx, input.communityId)
  if (!closed || closed < end) throw new DomainError(Codes.GUARD_FAILED, `Sign off the midnight census through ${end} before closing the month.`, { reason: 'census_not_signed_off' })

  const derivation = await deriveForMonth(uow.tx, input.communityId, input.month)
  if (derivation.problems.length) {
    throw new DomainError(Codes.GUARD_FAILED, `The month cannot close yet: ${derivation.problems.map(p => (p.code === 'uncovered_days' ? `${p.count} uncovered day(s)` : p.code === 'missing_rate' ? `${p.count} day(s) without a published rate` : 'a Medicaid month without a patient liability')).filter((v, i, a) => a.indexOf(v) === i).join('; ')}.`, { reason: 'derivation_problems', problems: derivation.problems.map(p => ({ ...p })) })
  }
  await applyDerivation(uow, input.communityId, period, derivation, ['open'], 'open')
  await uow.tx.charge.updateMany({ where: { periodId: period.id, status: 'open' }, data: { status: 'posted' } })
  const statements = await issueStatements(uow, input.communityId, period, input.month)
  await uow.tx.billingPeriod.update({ where: { id: period.id }, data: { status: 'closed', derivationHash: derivation.hash, statementCount: statements, closedAt: uow.now, closedById: actorUserId(actor), version: { increment: 1 } } })
  uow.audit({ eventType: 'billing.period_closed', entityType: 'BillingPeriod', entityId: period.id, actorUserId: actorUserId(actor), before: { status: fresh.status, version: fresh.version }, after: { status: 'closed', hash: derivation.hash, statements, lines: derivation.lines.length } })
  return { periodId: period.id, status: 'closed', alreadyClosed: false, statements, hash: derivation.hash }
}

/**
 * After a back-dated change to a closed month: re-derive, supersede the affected posted charges, and post the difference
 * per resident as an adjustment in the next open period. Never edits a statement, never changes a posted amount.
 */
export async function adjustClosedPeriod(uow: UnitOfWork, actor: Actor, input: { communityId: string; month: string }) {
  assertMonth(input.month)
  const period = await uow.tx.billingPeriod.findFirst({ where: { communityId: input.communityId, month: day(input.month) } })
  if (!period) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  await lockRow(uow.tx, 'BillingPeriod', period.id)
  if (period.status !== 'closed') throw new DomainError(Codes.GUARD_FAILED, 'This month is still open; derive it again instead.', { reason: 'period_open' })
  // The database refuses any change to a closed month's charges except inside this command (flag is local to the transaction).
  await uow.tx.$queryRawUnsafe(`SELECT set_config('senior_care.adjusting', $1, true)`, period.id)
  const derivation = await deriveForMonth(uow.tx, input.communityId, input.month)
  if (derivation.problems.length) throw new DomainError(Codes.GUARD_FAILED, 'The corrected month has gaps (an uncovered day, a missing rate or a missing patient liability). Fix those first.', { reason: 'derivation_problems', problems: derivation.problems.map(p => ({ ...p })) })
  const result = await applyDerivation(uow, input.communityId, period, derivation, ['posted'], 'posted')
  const nextMonthStart = nextMonth(input.month)
  const next = await getOrCreatePeriod(uow, actor, input.communityId, nextMonthStart)
  if (next.status === 'closed') throw new DomainError(Codes.GUARD_FAILED, 'The next month is closed too; reopen is not available in this build.', { reason: 'next_period_closed' })

  const byResident = new Map<string, { delta: bigint; oldIds: string[]; stayId: string }>()
  for (const change of result.changes) {
    if (change.responsibility !== 'resident' || !change.residentId) continue
    const entry = byResident.get(change.residentId) ?? { delta: 0n, oldIds: [], stayId: change.stayId }
    entry.delta += change.after - change.before
    if (change.oldId) entry.oldIds.push(change.oldId)
    byResident.set(change.residentId, entry)
  }
  let adjustments = 0
  for (const residentId of [...byResident.keys()].sort()) {
    const entry = byResident.get(residentId)!
    if (entry.delta === 0n) continue
    const basis = { month: input.month, replaces: entry.oldIds.sort(), delta: entry.delta.toString() }
    const hash = sha256(canonicalJson(basis))
    const payerKey = `adj:${hash.slice(0, 12)}`
    const exists = await uow.tx.charge.findFirst({ where: { stayId: entry.stayId, kind: 'adjustment', payerKey, status: { in: ['open', 'posted'] } }, select: { id: true } })
    if (exists) continue
    await uow.tx.charge.create({
      data: {
        communityId: input.communityId, residentId, stayId: entry.stayId, periodId: next.id, date: day(nextMonthStart), kind: 'adjustment', responsibility: 'resident', payerKey,
        description: `Adjustment to ${new Date(`${input.month}T12:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })} charges`,
        amountMinor: entry.delta, source: 'derived', status: 'open', adjustsChargeId: entry.oldIds[0] ?? null, derivation: basis as never, derivationHash: hash,
      },
    })
    adjustments += 1
  }
  uow.audit({ eventType: 'billing.period_adjusted', entityType: 'BillingPeriod', entityId: period.id, actorUserId: actorUserId(actor), after: { month: input.month, superseded: result.superseded, created: result.created, voided: result.voided, adjustments } })
  return { periodId: period.id, superseded: result.superseded, created: result.created, voided: result.voided, adjustments, nextPeriodId: next.id }
}

/** Re-derives a period from the live census and compares it to what was frozen. Read only. */
export async function verifyPeriod(tx: Tx, periodId: string) {
  const period = await tx.billingPeriod.findUnique({ where: { id: periodId } })
  if (!period?.communityId || !period.month) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const month = iso(period.month)
  const derivation = await deriveForMonth(tx, period.communityId, month)
  const stored = await tx.charge.findMany({ where: { periodId, source: 'derived', kind: { not: 'adjustment' }, status: { in: ['posted', 'open'] } }, select: { stayId: true, date: true, kind: true, payerKey: true, derivationHash: true } })
  const storedKeys = stored.map(row => `${keyOf(row)}#${row.derivationHash}`).sort()
  const derivedKeys = derivation.lines.map(line => `${line.key}#${line.derivationHash}`).sort()
  const statements = await tx.statement.findMany({ where: { periodId }, select: { id: true, residentId: true, chargeHash: true } })
  return {
    month, hash: derivation.hash, storedHash: period.derivationHash, hashMatches: derivation.hash === period.derivationHash,
    linesMatch: JSON.stringify(storedKeys) === JSON.stringify(derivedKeys), lines: derivation.lines.length, statements: statements.length,
  }
}
