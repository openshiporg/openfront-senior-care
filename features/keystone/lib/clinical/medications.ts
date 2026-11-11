import { auditCreate, casUpdate, lockRow } from '../cas'
import { Codes, DomainError } from '../errors'
import { addDays, localDate, zonedInstant } from '../calendar'
import { Decimal } from '../decimal'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { communityZone, createTask, invalid, notFound, oneOf, qty, residentFor, ref, ROLE_NAMES, text, userOf, when } from './common'
import { createIncident } from './incidents'
import { MOVEMENT_KINDS, SUPPLY_KINDS } from '../../models/medications'

/* Medications (SCHEMA §7, STATE-MACHINES §10-11). Adapter `manual`: nothing is sent to a pharmacy; staff record what arrives. */

const HORIZON_MS = 72 * 3_600_000

/**
 * The 72-hour horizon. Runs on the request that opens the eMAR (and when a medication order is entered), never on a timer.
 * One slot per active scheduled dose; unique on slotKey, so opening the eMAR twice creates nothing the second time.
 */
export async function generateAdministrationSlots(uow: UnitOfWork, communityId: string, residentId?: string | null) {
  const tz = await communityZone(uow.tx, communityId)
  const details = await uow.tx.medicationOrderDetail.findMany({
    where: { communityId, ...(residentId ? { residentId } : {}), prn: false, order: { status: 'active' } },
    include: { order: { select: { id: true, startAt: true, stopAt: true } } },
  })
  const live = details.filter(d => d.order)
  const from = uow.now.getTime() - 2 * 3_600_000
  const to = uow.now.getTime() + HORIZON_MS
  let created = 0
  for (const dd of live) {
    const d = { ...dd, order: dd.order! }
    const times = Array.isArray(d.times) ? (d.times as string[]) : []
    const first = localDate(tz, new Date(from))
    for (let day = first; new Date(`${day}T00:00:00Z`).getTime() <= to + 86_400_000; day = addDays(day, 1)) {
      for (const hhmm of times) {
        const at = zonedInstant(tz, day, hhmm)
        const t = at.getTime()
        if (t < from || t > to) continue
        if (d.order.startAt && t < d.order.startAt.getTime()) continue
        if (d.order.stopAt && t >= d.order.stopAt.getTime()) continue
        const slotKey = `${d.id}:${day}:${hhmm}`
        const result = await uow.tx.administrationSlot.createMany({
          data: [{ residentId: d.residentId, communityId, detailId: d.id, orderId: d.order.id, drugName: d.drugName, slotKey, scheduledFor: at, status: 'scheduled' }],
          skipDuplicates: true,
        })
        created += result.count
      }
    }
  }
  return created
}

type HoldParameters = { vital: string; op: 'lt' | 'gt'; value: number }

/** The latest reading for a hold parameter within the last 12 hours, or null. */
async function latestVital(uow: UnitOfWork, residentId: string, kind: string) {
  return uow.tx.vitalSign.findFirst({ where: { residentId, kind, takenAt: { gte: new Date(uow.now.getTime() - 12 * 3_600_000) } }, orderBy: { takenAt: 'desc' } })
}

export type AdministerInput = {
  slotId: string; outcome: 'given' | 'held' | 'refused' | 'missed' | 'not_given'; reason?: string; doseGiven?: string | number | null
  identityCheck?: 'barcode' | 'photo' | 'two_identifiers' | null; supplyId?: string | null; witnessId?: string | null
  /** When it actually happened, for a late entry. */
  administeredAt?: string | null
}

/**
 * Record one scheduled dose. The slot is locked and settled once. A hold parameter that trips refuses a "given" outcome, so the nurse
 * records "held" with the reading. Early/late is judged against the slot's window; outside twice the window needs a reason. A controlled
 * drug needs a witness and takes stock out of a supply through the ledger in the same transaction.
 */
export async function administerDose(uow: UnitOfWork, actor: Actor, input: AdministerInput) {
  const slot = await lockRow<{ id: string; version: number; status: string; residentId: string; communityId: string; detailId: string; drugName: string; scheduledFor: Date; windowBefore: number; windowAfter: number }>(uow.tx, 'AdministrationSlot', input.slotId)
  if (slot.status !== 'scheduled') throw new DomainError(Codes.INVALID_TRANSITION, `This dose was already recorded (${slot.status}).`, { currentStatus: slot.status })
  const outcome = oneOf(input.outcome, ['given', 'held', 'refused', 'missed', 'not_given'] as const, 'outcome')
  const detail = await uow.tx.medicationOrderDetail.findUniqueOrThrow({ where: { id: slot.detailId } })
  const order = await uow.tx.order.findUniqueOrThrow({ where: { id: detail.orderId! }, select: { status: true } })
  if (order.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'This order is no longer active.')
  const actual = when(input.administeredAt, 'administeredAt', uow.now)
  const late = uow.now.getTime() - actual.getTime() > 30 * 60_000
  if (actual.getTime() > uow.now.getTime() + 60_000) invalid('A dose cannot be recorded in the future.', 'administeredAt')

  const minutesOff = Math.round((actual.getTime() - slot.scheduledFor.getTime()) / 60_000)
  const timing = minutesOff < -slot.windowBefore ? 'early' : minutesOff > slot.windowAfter ? 'late' : 'on_time'
  const reason = (input.reason ?? '').trim()
  if (outcome === 'given' && timing !== 'on_time' && Math.abs(minutesOff) > 2 * (minutesOff < 0 ? slot.windowBefore : slot.windowAfter) && !reason) invalid('This dose is well outside its window. Say why.', 'reason')
  if ((outcome === 'held' || outcome === 'refused' || outcome === 'not_given' || outcome === 'missed') && !reason) invalid('Say why the dose was not given.', 'reason')

  let holdVital: unknown = null
  const hold = detail.holdParameters as HoldParameters | null
  if (hold) {
    const reading = await latestVital(uow, slot.residentId, hold.vital)
    if (reading) {
      const v = Number(reading.value)
      holdVital = { kind: hold.vital, value: v, takenAt: reading.takenAt, rule: hold }
      const tripped = hold.op === 'lt' ? v < hold.value : v > hold.value
      if (tripped && outcome === 'given') throw new DomainError(Codes.GUARD_FAILED, `Hold parameter met: ${hold.vital.replace('_', ' ')} ${v} is ${hold.op === 'lt' ? 'below' : 'above'} ${hold.value}. Record the dose as held.`, { field: 'outcome' })
    } else if (outcome === 'given') {
      throw new DomainError(Codes.GUARD_FAILED, `This order holds on ${hold.vital.replace('_', ' ')}. Record a reading in the last 12 hours first.`, { field: 'outcome' })
    }
  }

  let supplyId: string | null = null
  const dose = outcome === 'given' ? qty(input.doseGiven ?? detail.dose, 'Dose given') : null
  if (outcome === 'given') {
    if (detail.controlled && !input.witnessId) invalid('A controlled drug needs a witness.', 'witnessId')
    if (input.witnessId && input.witnessId === userOf(actor)) invalid('The witness must be a different person.', 'witnessId')
    if (input.supplyId) {
      await postMovement(uow, actor, { supplyId: input.supplyId, kind: 'administer', quantity: dose!.negated(), reason: `Dose for ${slot.drugName}`, witnessId: input.witnessId ?? null, residentId: slot.residentId })
      supplyId = input.supplyId
    } else if (detail.controlled) {
      invalid('Choose the supply the controlled dose came from.', 'supplyId')
    }
  }

  const row = await uow.tx.medicationAdministration.create({
    data: {
      residentId: slot.residentId, communityId: slot.communityId, slotId: slot.id, detailId: detail.id, drugName: slot.drugName, outcome, prn: false,
      doseGiven: dose ? dose.toString() : null, doseUnit: detail.doseUnit, reason, administeredAt: actual, recordedAt: uow.now, lateEntry: late, timing,
      identityCheck: input.identityCheck ?? null, holdVital: (holdVital ?? undefined) as never, administeredById: userOf(actor), witnessId: input.witnessId ?? null, supplyId,
    },
  })
  const to = outcome === 'given' ? 'given' : outcome
  await casUpdate(uow, { model: 'AdministrationSlot', id: slot.id, version: slot.version, from: ['scheduled'], to, actor, eventType: `emar.dose_${outcome}`, reason: reason || null, data: { settledAt: uow.now }, audit: { administrationId: row.id, timing } })
  return { administrationId: row.id, outcome, timing, lateEntry: late }
}

/**
 * Doses past their window with nothing recorded are "missed". This is computed on read (the eMAR page calls it as it opens), written
 * once per slot with an audit event, and idempotent: a settled slot is never touched again.
 */
export async function settleMissedDoses(uow: UnitOfWork, actor: Actor, communityId: string) {
  const cutoff = new Date(uow.now.getTime() - 4 * 3_600_000)
  const due = await uow.tx.administrationSlot.findMany({ where: { communityId, status: 'scheduled', scheduledFor: { lt: cutoff } }, take: 500, select: { id: true, version: true, residentId: true, drugName: true } })
  let missed = 0
  for (const slot of due) {
    const result = await uow.tx.administrationSlot.updateMany({ where: { id: slot.id, version: slot.version, status: 'scheduled' }, data: { status: 'missed', settledAt: uow.now, version: { increment: 1 } } })
    if (result.count !== 1) continue
    missed += 1
    uow.audit({ eventType: 'emar.dose_missed', entityType: 'AdministrationSlot', entityId: slot.id, actorUserId: userOf(actor), before: { status: 'scheduled' }, after: { status: 'missed' }, reason: 'No administration recorded within 4 hours of the scheduled time.' })
    await createTask(uow, actor, { communityId, residentId: slot.residentId, kind: 'general', title: `Missed dose: ${slot.drugName}`, ownerRole: ROLE_NAMES.charge, escalationOwnerRole: ROLE_NAMES.don, dedupeKey: `missed-dose:${slot.id}`, subjectType: 'AdministrationSlot', subjectId: slot.id })
  }
  return missed
}

/** A PRN dose: the order's minimum interval is enforced, a reason is required, and a follow-up is due after the order's follow-up minutes. */
export async function administerPrn(uow: UnitOfWork, actor: Actor, input: { detailId: string; reason: string; doseGiven?: string | number | null; supplyId?: string | null; witnessId?: string | null; identityCheck?: 'barcode' | 'photo' | 'two_identifiers' | null; administeredAt?: string | null }) {
  const detail = await uow.tx.medicationOrderDetail.findUnique({ where: { id: input.detailId } })
  if (!detail || !detail.prn || !detail.orderId) return notFound('PRN order')
  const order = await lockRow<{ id: string; status: string }>(uow.tx, 'Order', detail.orderId)
  if (order.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'This order is no longer active.')
  const reason = text(input.reason, 'Reason for the PRN dose', { min: 3 })
  const actual = when(input.administeredAt, 'administeredAt', uow.now)
  if (detail.prnMinIntervalMinutes) {
    const last = await uow.tx.medicationAdministration.findFirst({ where: { detailId: detail.id, outcome: 'given' }, orderBy: { administeredAt: 'desc' } })
    if (last?.administeredAt && actual.getTime() - last.administeredAt.getTime() < detail.prnMinIntervalMinutes * 60_000) {
      throw new DomainError(Codes.GUARD_FAILED, `The last dose was less than ${detail.prnMinIntervalMinutes} minutes ago.`)
    }
  }
  const dose = qty(input.doseGiven ?? detail.dose, 'Dose given')
  if (detail.controlled && (!input.witnessId || input.witnessId === userOf(actor))) invalid('A controlled drug needs a different person as witness.', 'witnessId')
  if (detail.controlled && !input.supplyId) invalid('Choose the supply the controlled dose came from.', 'supplyId')
  if (input.supplyId) await postMovement(uow, actor, { supplyId: input.supplyId, kind: 'administer', quantity: dose.negated(), reason: `PRN ${detail.drugName}`, witnessId: input.witnessId ?? null, residentId: detail.residentId })
  const followUpAt = new Date(actual.getTime() + (detail.prnFollowUpMinutes ?? 60) * 60_000)
  const row = await uow.tx.medicationAdministration.create({
    data: {
      residentId: detail.residentId!, communityId: detail.communityId!, detailId: detail.id, drugName: detail.drugName, outcome: 'given', prn: true, doseGiven: dose.toString(), doseUnit: detail.doseUnit, reason,
      administeredAt: actual, recordedAt: uow.now, lateEntry: uow.now.getTime() - actual.getTime() > 30 * 60_000, timing: 'not_scheduled', identityCheck: input.identityCheck ?? null,
      administeredById: userOf(actor), witnessId: input.witnessId ?? null, supplyId: input.supplyId ?? null, followUpDueAt: followUpAt,
    },
  })
  const followUp = await uow.tx.prnFollowUp.create({ data: { residentId: detail.residentId!, communityId: detail.communityId!, administrationId: row.id, dueAt: followUpAt, status: 'open' } })
  auditCreate(uow, actor, 'MedicationAdministration', row.id, 'emar.prn_given', { detailId: detail.id, followUpDueAt: followUpAt })
  return { administrationId: row.id, followUpId: followUp.id, followUpDueAt: followUpAt }
}

export async function recordPrnFollowUp(uow: UnitOfWork, actor: Actor, input: { followUpId: string; effect: string }) {
  const follow = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'PrnFollowUp', input.followUpId)
  const effect = oneOf(input.effect, ['effective', 'partly_effective', 'not_effective', 'adverse_reaction'] as const, 'effect')
  await casUpdate(uow, { model: 'PrnFollowUp', id: follow.id, version: follow.version, from: ['open', 'missed'], to: 'done', actor, eventType: 'emar.prn_follow_up', data: { effect, recordedById: userOf(actor), recordedAt: uow.now } })
  const task = await uow.tx.task.findUnique({ where: { dedupeKey: `prn-followup:${follow.id}` } })
  if (task && (task.status === 'open' || task.status === 'in_progress')) await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: userOf(actor), completedAt: uow.now } })
  return { followUpId: follow.id, effect }
}

/** PRN follow-ups past due are marked missed and become a task. Called as the eMAR opens. */
export async function settlePrnFollowUps(uow: UnitOfWork, actor: Actor, communityId: string) {
  const due = await uow.tx.prnFollowUp.findMany({ where: { communityId, status: 'open', dueAt: { lt: uow.now } }, take: 200 })
  for (const f of due) {
    const result = await uow.tx.prnFollowUp.updateMany({ where: { id: f.id, version: f.version, status: 'open' }, data: { status: 'missed', version: { increment: 1 } } })
    if (result.count !== 1) continue
    uow.audit({ eventType: 'emar.prn_follow_up_missed', entityType: 'PrnFollowUp', entityId: f.id, actorUserId: userOf(actor), before: { status: 'open' }, after: { status: 'missed' } })
    await createTask(uow, actor, { communityId, residentId: f.residentId, kind: 'prn_followup', title: 'PRN follow-up not recorded', ownerRole: ROLE_NAMES.charge, escalationOwnerRole: ROLE_NAMES.don, dedupeKey: `prn-followup:${f.id}`, subjectType: 'PrnFollowUp', subjectId: f.id })
  }
  return due.length
}

/* ------------------------------------------------------------------ supplies and the movement ledger */

export async function receiveSupply(uow: UnitOfWork, actor: Actor, input: { communityId: string; kind: string; label: string; unit: string; quantity: string | number; referenceId?: string | null; residentId?: string | null; unitLocationId?: string | null; lot?: string; expiresOn?: string | null; controlled?: boolean; witnessId?: string | null }) {
  const kind = oneOf(input.kind, SUPPLY_KINDS, 'supply type')
  const quantity = qty(input.quantity, 'Quantity')
  if (quantity.lte(0)) invalid('Quantity must be more than zero.', 'quantity')
  if (input.controlled && (!input.witnessId || input.witnessId === userOf(actor))) invalid('Receiving a controlled drug needs a different person as witness.', 'witnessId')
  const supply = await uow.tx.medicationSupply.create({
    data: {
      communityId: input.communityId, residentId: input.residentId ?? null, referenceId: input.referenceId ?? null, unitLocationId: input.unitLocationId ?? null, label: text(input.label, 'Label'), kind,
      lot: input.lot ?? '', expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00Z`) : null, controlled: Boolean(input.controlled), unit: text(input.unit, 'Unit'), balance: '0', status: 'active',
    },
  })
  auditCreate(uow, actor, 'MedicationSupply', supply.id, 'supply.created', { kind, controlled: supply.controlled })
  await postMovement(uow, actor, { supplyId: supply.id, kind: 'receive', quantity, reason: 'Received (manual pharmacy entry)', witnessId: input.witnessId ?? null })
  return { supplyId: supply.id }
}

/**
 * The only way a balance changes. Locks the supply, takes the next seq, refuses a negative balance, writes an immutable movement row
 * and moves the balance with the supply's version in one statement. A movement can never be edited; a correction is another movement.
 */
export async function postMovement(uow: UnitOfWork, actor: Actor, input: { supplyId: string; kind: (typeof MOVEMENT_KINDS)[number]; quantity: Decimal | string | number; reason?: string; witnessId?: string | null; residentId?: string | null }) {
  const supply = await lockRow<{ id: string; version: number; communityId: string; balance: { toString(): string }; controlled: boolean; status: string }>(uow.tx, 'MedicationSupply', input.supplyId)
  if (supply.status !== 'active' && input.kind !== 'destroy' && input.kind !== 'count_adjust') throw new DomainError(Codes.GUARD_FAILED, `This supply is ${supply.status}.`)
  const q = qty(input.quantity instanceof Decimal ? input.quantity.toString() : input.quantity, 'Quantity')
  if (q.isZero()) invalid('Quantity cannot be zero.', 'quantity')
  const witnessKinds = ['waste', 'destroy', 'adjust', 'count_adjust', 'transfer_out', 'return_to_pharmacy']
  if (supply.controlled && witnessKinds.includes(input.kind) && (!input.witnessId || input.witnessId === userOf(actor))) invalid('A controlled drug needs a different person as witness.', 'witnessId')
  const next = new Decimal(supply.balance.toString()).plus(q)
  if (next.lt(0)) throw new DomainError(Codes.GUARD_FAILED, 'That would take the balance below zero.', { field: 'quantity' })
  const last = await uow.tx.medicationSupplyMovement.findFirst({ where: { supplyId: supply.id }, orderBy: { seq: 'desc' }, select: { seq: true } })
  const movement = await uow.tx.medicationSupplyMovement.create({
    data: { communityId: supply.communityId, supplyId: supply.id, seq: (last?.seq ?? 0) + 1, kind: input.kind, quantity: q.toString(), balanceAfter: next.toString(), at: uow.now, actorId: userOf(actor), witnessId: input.witnessId ?? null, reason: input.reason ?? '' },
  })
  const moved = await uow.tx.medicationSupply.updateMany({ where: { id: supply.id, version: supply.version }, data: { balance: next.toString(), status: next.isZero() && input.kind !== 'destroy' ? 'empty' : undefined, version: { increment: 1 } } })
  if (moved.count !== 1) throw new DomainError(Codes.STALE_STATE, 'The supply changed. Reload and try again.')
  uow.audit({ eventType: `supply.${input.kind}`, entityType: 'MedicationSupply', entityId: supply.id, actorUserId: userOf(actor), approverId: input.witnessId ?? null, after: { movementId: movement.id, quantity: q.toString(), balanceAfter: next.toString() }, reason: input.reason ?? null })
  return { movementId: movement.id, balance: next.toString() }
}

/** Verify a supply's balance against the sum of its ledger. Used by the reconstruction check. */
export async function verifyLedger(uow: { tx: any }, supplyId: string) {
  const rows = await uow.tx.medicationSupplyMovement.findMany({ where: { supplyId }, orderBy: { seq: 'asc' } })
  let running = new Decimal(0)
  for (const r of rows) {
    running = running.plus(r.quantity.toString())
    if (!running.equals(r.balanceAfter.toString())) return { ok: false, brokenAtSeq: r.seq as number }
  }
  const supply = await uow.tx.medicationSupply.findUniqueOrThrow({ where: { id: supplyId } })
  return { ok: running.equals(supply.balance.toString()), movements: rows.length, balance: running.toString() }
}

export async function destroySupply(uow: UnitOfWork, actor: Actor, input: { supplyId: string; method: string; witnessId: string; quantity?: string | number | null }) {
  const supply = await uow.tx.medicationSupply.findUnique({ where: { id: input.supplyId } })
  if (!supply) return notFound('Supply')
  if (!input.witnessId || input.witnessId === userOf(actor)) invalid('Destruction needs a different person as witness.', 'witnessId')
  const q = input.quantity != null && input.quantity !== '' ? qty(input.quantity, 'Quantity') : new Decimal(supply.balance.toString())
  if (q.lte(0)) invalid('Nothing to destroy.', 'quantity')
  const posted = await postMovement(uow, actor, { supplyId: supply.id, kind: 'destroy', quantity: q.negated(), reason: `Destroyed: ${input.method}`, witnessId: input.witnessId })
  const row = await uow.tx.medicationDestruction.create({ data: { communityId: supply.communityId!, supplyId: supply.id, quantity: q.toString(), method: text(input.method, 'Method'), destroyedAt: uow.now, destroyedById: userOf(actor), witnessId: input.witnessId, movementId: posted.movementId } })
  const fresh = await uow.tx.medicationSupply.findUniqueOrThrow({ where: { id: supply.id } })
  if (new Decimal(fresh.balance.toString()).isZero()) await casUpdate(uow, { model: 'MedicationSupply', id: fresh.id, version: fresh.version, from: ['active', 'empty', 'quarantined'], to: 'destroyed', actor, eventType: 'supply.destroyed' })
  return { destructionId: row.id }
}

/** E-kit: an emergency supply opened by a nurse for a specific resident and reason; the draw is a normal movement. */
export async function drawFromEkit(uow: UnitOfWork, actor: Actor, input: { supplyId: string; residentId: string; quantity: string | number; reason: string; witnessId?: string | null }) {
  const supply = await uow.tx.medicationSupply.findUnique({ where: { id: input.supplyId } })
  if (!supply || supply.kind !== 'ekit') return notFound('E-kit')
  const resident = await residentFor(uow.tx, input.residentId)
  if (supply.communityId !== resident.communityId) return notFound('E-kit')
  const q = qty(input.quantity, 'Quantity')
  if (q.lte(0)) invalid('Quantity must be more than zero.', 'quantity')
  const posted = await postMovement(uow, actor, { supplyId: supply.id, kind: 'administer', quantity: q.negated(), reason: `E-kit for resident: ${text(input.reason, 'Reason')}`, witnessId: input.witnessId ?? null, residentId: resident.id })
  await createTask(uow, actor, { communityId: supply.communityId!, residentId: resident.id, kind: 'general', title: `E-kit used: restock and pharmacy verification for ${supply.label}`, ownerRole: ROLE_NAMES.charge, dedupeKey: `ekit:${posted.movementId}`, subjectType: 'MedicationSupply', subjectId: supply.id })
  return posted
}

/* ------------------------------------------------------------------ blind shift count */

export async function startShiftCount(uow: UnitOfWork, actor: Actor, input: { unitId: string; shift: string; incomingId: string }) {
  const unit = await uow.tx.unit.findUnique({ where: { id: input.unitId }, select: { id: true, communityId: true } })
  if (!unit?.communityId) return notFound('Unit')
  const shift = oneOf(input.shift, ['day', 'evening', 'night'] as const, 'shift')
  if (!input.incomingId || input.incomingId === userOf(actor)) invalid('The incoming nurse must be a different person.', 'incomingId')
  const open = await uow.tx.shiftCount.findFirst({ where: { unitId: unit.id, status: 'open' } })
  if (open) return { shiftCountId: open.id, reference: open.reference, reused: true }
  const row = await uow.tx.shiftCount.create({ data: { communityId: unit.communityId, unitId: unit.id, reference: await ref(uow, 'CNT'), shift, status: 'open', outgoingId: userOf(actor), incomingId: input.incomingId, startedAt: uow.now } })
  auditCreate(uow, actor, 'ShiftCount', row.id, 'shift_count.started', { unitId: unit.id, shift })
  return { shiftCountId: row.id, reference: row.reference, reused: false }
}

/** The supplies to count: controlled, active, on this unit. The response names them but never their expected balance. */
export async function countSheet(tx: any, shiftCountId: string) {
  const count = await tx.shiftCount.findUnique({ where: { id: shiftCountId } })
  if (!count) return null
  const supplies = await tx.medicationSupply.findMany({ where: { communityId: count.communityId, unitLocationId: count.unitId, controlled: true, status: 'active' }, select: { id: true, label: true, unit: true }, orderBy: { label: 'asc' } })
  return { count, supplies }
}

/** One person's blind count of one supply. Each of the two named people counts once per supply, and cannot see the other's number. */
export async function submitCountEntry(uow: UnitOfWork, actor: Actor, input: { shiftCountId: string; supplyId: string; counted: string | number }) {
  const count = await lockRow<{ id: string; status: string; outgoingId: string | null; incomingId: string | null; communityId: string; unitId: string }>(uow.tx, 'ShiftCount', input.shiftCountId)
  if (count.status !== 'open') throw new DomainError(Codes.INVALID_TRANSITION, 'This count is closed.', { currentStatus: count.status })
  const me = userOf(actor)
  const role = me === count.outgoingId ? 'outgoing' : me === count.incomingId ? 'incoming' : null
  if (!role) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only the two nurses named on this count record it.')
  const supply = await uow.tx.medicationSupply.findUnique({ where: { id: input.supplyId }, select: { id: true, communityId: true, unitLocationId: true, controlled: true } })
  if (!supply || supply.communityId !== count.communityId || supply.unitLocationId !== count.unitId || !supply.controlled) return notFound('Supply')
  if (await uow.tx.shiftCountEntry.findFirst({ where: { shiftCountId: count.id, supplyId: supply.id, role } })) throw new DomainError(Codes.GUARD_FAILED, 'You already counted this one.')
  const counted = qty(input.counted, 'Count')
  if (counted.lt(0)) invalid('A count cannot be negative.', 'counted')
  await uow.tx.shiftCountEntry.create({ data: { communityId: count.communityId, shiftCountId: count.id, supplyId: supply.id, role, counted: counted.toString(), countedById: me, at: uow.now } })
  return { recorded: true, role }
}

/**
 * Compare both counts with the ledger balance. Every controlled supply on the unit needs both counts. A mismatch of either person's
 * number against the ledger opens a CountDiscrepancy and a DON task; all-equal closes the count as matched.
 */
export async function completeShiftCount(uow: UnitOfWork, actor: Actor, input: { shiftCountId: string }) {
  const count = await lockRow<{ id: string; version: number; status: string; communityId: string; unitId: string; outgoingId: string | null; incomingId: string | null }>(uow.tx, 'ShiftCount', input.shiftCountId)
  if (count.status !== 'open') throw new DomainError(Codes.INVALID_TRANSITION, 'This count is closed.', { currentStatus: count.status })
  if (userOf(actor) !== count.outgoingId && userOf(actor) !== count.incomingId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only the two nurses named on this count can finish it.')
  const supplies = await uow.tx.medicationSupply.findMany({ where: { communityId: count.communityId, unitLocationId: count.unitId, controlled: true, status: 'active' } })
  const entries = await uow.tx.shiftCountEntry.findMany({ where: { shiftCountId: count.id } })
  const mismatched: string[] = []
  for (const s of supplies) {
    const out = entries.find(e => e.supplyId === s.id && e.role === 'outgoing')
    const inc = entries.find(e => e.supplyId === s.id && e.role === 'incoming')
    if (!out || !inc) throw new DomainError(Codes.GUARD_FAILED, `Both nurses must count ${s.label} before the count can finish.`)
    const expected = new Decimal(s.balance.toString())
    if (!expected.equals(out.counted.toString()) || !expected.equals(inc.counted.toString())) {
      mismatched.push(s.id)
      const d = await uow.tx.countDiscrepancy.create({ data: { communityId: count.communityId, shiftCountId: count.id, supplyId: s.id, expected: expected.toString(), outgoingCounted: out.counted.toString(), incomingCounted: inc.counted.toString(), status: 'open' } })
      auditCreate(uow, actor, 'CountDiscrepancy', d.id, 'count_discrepancy.opened', { supplyId: s.id })
      await createTask(uow, actor, { communityId: count.communityId, kind: 'count_discrepancy', title: `Controlled count discrepancy: ${s.label}`, ownerRole: ROLE_NAMES.don, dedupeKey: `count-discrepancy:${d.id}`, subjectType: 'CountDiscrepancy', subjectId: d.id, dueAt: new Date(uow.now.getTime() + 4 * 3_600_000) })
    }
  }
  const to = mismatched.length ? 'discrepancy' : 'matched'
  await casUpdate(uow, { model: 'ShiftCount', id: count.id, version: count.version, from: ['open'], to, actor, eventType: `shift_count.${to}`, data: { completedAt: uow.now } })
  return { status: to, discrepancies: mismatched.length }
}

/** The DON resolves a discrepancy. It cannot be one of the counters. A loss adjusts the ledger (witnessed) and files an incident linked to the discrepancy. */
export async function resolveDiscrepancy(uow: UnitOfWork, actor: Actor, input: { discrepancyId: string; resolution: string; note: string; witnessId?: string | null; expectedVersion?: number | null }) {
  const d = await lockRow<{ id: string; version: number; status: string; communityId: string; supplyId: string; shiftCountId: string; expected: { toString(): string }; outgoingCounted: { toString(): string }; incomingCounted: { toString(): string } }>(uow.tx, 'CountDiscrepancy', input.discrepancyId)
  if (d.status !== 'open') throw new DomainError(Codes.INVALID_TRANSITION, 'Already resolved.', { currentStatus: d.status })
  const count = await uow.tx.shiftCount.findUniqueOrThrow({ where: { id: d.shiftCountId } })
  if (userOf(actor) === count.outgoingId || userOf(actor) === count.incomingId) throw new DomainError(Codes.SELF_APPROVAL, 'A nurse who did the count cannot resolve its discrepancy.')
  const resolution = oneOf(input.resolution, ['recount_matched', 'documentation_error', 'loss_suspected', 'found'] as const, 'resolution')
  const note = text(input.note, 'Note', { min: 10 })
  let adjustmentId: string | null = null
  const expected = new Decimal(d.expected.toString())
  const counted = new Decimal(d.incomingCounted.toString())
  if (resolution !== 'recount_matched' && !expected.equals(counted)) {
    const posted = await postMovement(uow, actor, { supplyId: d.supplyId, kind: 'count_adjust', quantity: counted.minus(expected), reason: `Count discrepancy ${resolution}: ${note}`, witnessId: input.witnessId ?? null })
    adjustmentId = posted.movementId
  }
  let incidentId: string | null = null
  if (resolution === 'loss_suspected' || resolution === 'documentation_error') {
    const supply = await uow.tx.medicationSupply.findUniqueOrThrow({ where: { id: d.supplyId }, select: { label: true } })
    const incident = await createIncident(uow, actor, { communityId: d.communityId, residentId: null, kind: 'controlled_substance_discrepancy', description: `Controlled count discrepancy for ${supply.label}. Expected ${expected}, counted ${d.outgoingCounted} and ${d.incomingCounted}. Resolution: ${resolution}. ${note}`, occurredAt: count.completedAt ?? uow.now })
    incidentId = incident.incidentId
  }
  await casUpdate(uow, { model: 'CountDiscrepancy', id: d.id, version: d.version, from: ['open'], to: 'resolved', actor, eventType: 'count_discrepancy.resolved', reason: note, data: { resolution, resolutionNote: note, resolvedById: userOf(actor), resolvedAt: uow.now, adjustmentId, incidentId } })
  const open = await uow.tx.countDiscrepancy.count({ where: { shiftCountId: d.shiftCountId, status: 'open' } })
  if (!open) {
    const fresh = await uow.tx.shiftCount.findUniqueOrThrow({ where: { id: d.shiftCountId } })
    if (fresh.status === 'discrepancy') await casUpdate(uow, { model: 'ShiftCount', id: fresh.id, version: fresh.version, from: ['discrepancy'], to: 'resolved', actor, eventType: 'shift_count.resolved' })
  }
  const task = await uow.tx.task.findUnique({ where: { dedupeKey: `count-discrepancy:${d.id}` } })
  if (task && (task.status === 'open' || task.status === 'in_progress')) await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: userOf(actor), completedAt: uow.now } })
  return { discrepancyId: d.id, resolution, incidentId, adjustmentId }
}

/** Reconstruct a med pass: for one resident and day, every scheduled and PRN dose with who/when/why, held vital, supply and ledger link. */
export async function reconstructMedPass(tx: any, residentId: string, from: Date, to: Date) {
  const slots = await tx.administrationSlot.findMany({ where: { residentId, scheduledFor: { gte: from, lt: to } }, orderBy: { scheduledFor: 'asc' } })
  const admins = await tx.medicationAdministration.findMany({ where: { residentId, OR: [{ administeredAt: { gte: from, lt: to } }, { slotId: { in: slots.map((s: any) => s.id) } }] }, orderBy: { administeredAt: 'asc' } })
  const follow = await tx.prnFollowUp.findMany({ where: { administrationId: { in: admins.map((a: any) => a.id) } } })
  return {
    doses: slots.map((s: any) => ({ slotId: s.id, drug: s.drugName, scheduledFor: s.scheduledFor, status: s.status, administration: admins.find((a: any) => a.slotId === s.id) ?? null })),
    prn: admins.filter((a: any) => a.prn).map((a: any) => ({ ...a, followUp: follow.find((f: any) => f.administrationId === a.id) ?? null })),
  }
}
