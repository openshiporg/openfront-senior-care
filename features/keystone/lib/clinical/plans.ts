import { auditCreate, casUpdate, lockRow } from '../cas'
import { satisfyByEvidence, openClocksForFact } from '../clocks'
import { addDays, localDate, zonedInstant } from '../calendar'
import { Codes, DomainError } from '../errors'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { communityZone, createTask, invalid, notFound, oneOf, qty, residentFor, ref, ROLE_NAMES, text, userOf, when } from './common'
import { ORDER_KINDS } from '../../models/clinical'

/* Care plans (SCHEMA §6) and orders (SCHEMA §7). */

type ItemInput = { kind: 'focus' | 'goal' | 'intervention'; text: string; discipline?: string; frequency?: string; targetDate?: string | null; parentIndex?: number | null }
const FREQUENCIES = ['once', 'every_shift', 'daily', 'twice_daily', 'weekly', 'as_needed'] as const

export async function createCarePlan(uow: UnitOfWork, actor: Actor, input: { residentId: string; kind: string; items: ItemInput[]; basedOnAssessmentId?: string | null; proposalId?: string | null }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ['baseline', 'comprehensive', 'service_plan'] as const, 'plan type')
  if (!Array.isArray(input.items) || !input.items.length) invalid('Add at least one focus, goal or intervention.', 'items')
  const previous = await uow.tx.carePlan.findFirst({ where: { residentId: resident.id, kind, status: { in: ['active', 'draft'] } }, orderBy: { revision: 'desc' } })
  const plan = await uow.tx.carePlan.create({
    data: {
      residentId: resident.id, communityId: resident.communityId, reference: await ref(uow, 'CPL'), kind, status: 'draft', revision: (previous?.revision ?? 0) + 1,
      supersedesId: previous?.status === 'active' ? previous.id : null, basedOnAssessmentId: input.basedOnAssessmentId ?? null, proposalId: input.proposalId ?? null,
    },
  })
  const made: string[] = []
  for (const item of input.items) {
    const parentId = item.parentIndex != null ? made[item.parentIndex] ?? null : null
    const row = await uow.tx.carePlanItem.create({
      data: {
        residentId: resident.id, communityId: resident.communityId, carePlanId: plan.id, kind: oneOf(item.kind, ['focus', 'goal', 'intervention'] as const, 'item type'), parentId,
        text: text(item.text, 'Item text'), discipline: (item.discipline as never) ?? 'nursing', frequency: item.frequency ? oneOf(item.frequency, FREQUENCIES, 'frequency') : 'as_needed',
        targetDate: item.targetDate ? new Date(`${item.targetDate}T00:00:00Z`) : null, status: 'active',
      },
    })
    made.push(row.id)
  }
  auditCreate(uow, actor, 'CarePlan', plan.id, 'care_plan.drafted', { kind, revision: plan.revision, items: made.length, proposalId: input.proposalId ?? null })
  return { carePlanId: plan.id, reference: plan.reference, revision: plan.revision }
}

/** Signing activates the plan, supersedes the one before it, satisfies the 48h/7d clock and generates the CNA kardex slots for today. */
export async function signCarePlan(uow: UnitOfWork, actor: Actor, input: { carePlanId: string; expectedVersion?: number | null }) {
  const plan = await lockRow<{ id: string; version: number; status: string; kind: string; residentId: string; communityId: string; supersedesId: string | null; proposalId: string | null }>(uow.tx, 'CarePlan', input.carePlanId)
  if (input.expectedVersion != null && input.expectedVersion !== plan.version) throw new DomainError(Codes.STALE_STATE, 'The plan changed. Reload and try again.', { currentVersion: plan.version })
  if (plan.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a draft plan is signed.', { currentStatus: plan.status })
  if (plan.supersedesId) {
    const old = await lockRow<{ id: string; version: number }>(uow.tx, 'CarePlan', plan.supersedesId)
    await casUpdate(uow, { model: 'CarePlan', id: old.id, version: old.version, from: ['active'], to: 'superseded', actor, eventType: 'care_plan.superseded', metadata: { by: plan.id } })
  }
  await casUpdate(uow, { model: 'CarePlan', id: plan.id, version: plan.version, from: ['draft'], to: 'active', actor, eventType: 'care_plan.signed', data: { signedById: userOf(actor), signedAt: uow.now, startedAt: uow.now } })
  await satisfyByEvidence(uow, actor, { subjectType: 'Stay', subjectId: await stayIdOf(uow, plan.residentId) }, { type: `care_plan:${plan.kind}`, id: plan.id, at: uow.now })
  if (plan.proposalId) {
    const proposal = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Proposal', plan.proposalId)
    if (proposal.status === 'proposed' || proposal.status === 'accepted') {
      await casUpdate(uow, { model: 'Proposal', id: proposal.id, version: proposal.version, from: ['proposed', 'accepted'], to: 'signed', actor, eventType: 'proposal.signed', data: { acceptedById: userOf(actor), resultRecordType: 'CarePlan', resultRecordId: plan.id } })
    }
  }
  const slots = await generatePocSlots(uow, plan.id)
  return { carePlanId: plan.id, status: 'active', slots }
}

const stayIdOf = async (uow: UnitOfWork, residentId: string) => (await uow.tx.resident.findUnique({ where: { id: residentId }, select: { currentStayId: true } }))?.currentStayId ?? ''

const SHIFTS = ['07:00', '15:00', '23:00']
const TIMES: Record<string, string[]> = { every_shift: SHIFTS, daily: ['09:00'], twice_daily: ['09:00', '17:00'], weekly: ['09:00'], once: ['09:00'] }

/** Kardex slots for the next 24 hours of every CNA/nursing intervention that repeats. Unique on slotKey, so repeating it changes nothing. */
export async function generatePocSlots(uow: UnitOfWork, carePlanId: string) {
  const plan = await uow.tx.carePlan.findUnique({ where: { id: carePlanId }, include: { items: { where: { kind: 'intervention', status: 'active' } } } })
  if (!plan?.communityId) return 0
  const tz = await communityZone(uow.tx, plan.communityId)
  const today = localDate(tz, uow.now)
  let made = 0
  for (const item of plan.items) {
    const times = TIMES[item.frequency ?? ''] ?? []
    if (!times.length) continue
    if (item.frequency === 'weekly' && item.createdAt && uow.now.getTime() - item.createdAt.getTime() > 60_000 && new Date(`${today}T00:00:00Z`).getUTCDay() !== item.createdAt.getUTCDay()) continue
    for (const date of [today, addDays(today, 1)]) {
      for (const hhmm of times) {
        const dueAt = zonedInstant(tz, date, hhmm)
        if (dueAt.getTime() < uow.now.getTime() - 12 * 3_600_000 || dueAt.getTime() > uow.now.getTime() + 24 * 3_600_000) continue
        const slotKey = `${item.id}:${date}:${hhmm}`
        if (await uow.tx.pocTaskSlot.findUnique({ where: { slotKey } })) continue
        await uow.tx.pocTaskSlot.create({ data: { residentId: plan.residentId, communityId: plan.communityId, itemId: item.id, label: item.text.slice(0, 200), dueAt, slotKey, status: 'pending' } })
        made += 1
      }
    }
  }
  return made
}

/* ------------------------------------------------------------------ orders */

export type OrderInput = {
  residentId: string; kind: string; summary: string; instructions?: string; source?: string; readBack?: boolean; prescriberId?: string | null; prescriberName?: string
  startAt?: string | null; stopAt?: string | null; allergyOverride?: string
  medication?: { referenceId?: string | null; drugName: string; dose: string | number; doseUnit: string; route?: string | null; prn?: boolean; prnReason?: string; prnMinIntervalMinutes?: number | null; prnFollowUpMinutes?: number | null; times?: string[]; holdParameters?: { vital: string; op: 'lt' | 'gt'; value: number } | null; controlled?: boolean }
}

/**
 * Enter an order. Verbal and telephone orders need a read-back and open a countersign task and clock (24h, an operator rule: verify the
 * state rule). A medication is checked against the resident's active allergies; a match blocks the order unless the entry says why it is
 * being overridden.
 */
export async function enterOrder(uow: UnitOfWork, actor: Actor, input: OrderInput) {
  const resident = await residentFor(uow.tx, input.residentId)
  const kind = oneOf(input.kind, ORDER_KINDS, 'order type')
  const source = oneOf(input.source ?? 'written', ['written', 'electronic', 'verbal', 'telephone'] as const, 'source')
  const verbal = source === 'verbal' || source === 'telephone'
  if (verbal && !input.readBack) invalid('A verbal or telephone order needs a read-back.', 'readBack')
  let allergyOverride = ''
  if (kind === 'medication') {
    if (!input.medication) invalid('Add the medication details.', 'medication')
    const med = input.medication!
    const allergies = await uow.tx.allergy.findMany({ where: { residentId: resident.id, status: 'active' }, select: { substance: true } })
    const name = med.drugName.toLowerCase()
    const hit = allergies.find(a => a.substance && (name.includes(a.substance.toLowerCase()) || a.substance.toLowerCase().includes(name)))
    if (hit) {
      if (!input.allergyOverride?.trim()) throw new DomainError(Codes.GUARD_FAILED, `${resident.firstName} has an allergy recorded for ${hit.substance}. Enter a reason to override.`, { field: 'allergyOverride' })
      allergyOverride = input.allergyOverride.trim()
    }
  }
  const order = await uow.tx.order.create({
    data: {
      residentId: resident.id, communityId: resident.communityId, reference: await ref(uow, 'ORD'), kind, summary: text(input.summary, 'Order', { max: 500 }), instructions: input.instructions ?? '',
      source, readBack: Boolean(input.readBack), status: 'active', startAt: when(input.startAt, 'startAt', uow.now), stopAt: input.stopAt ? when(input.stopAt, 'stopAt') : null,
      enteredById: userOf(actor), prescriberId: input.prescriberId ?? null, prescriberName: input.prescriberName ?? '', needsCountersign: verbal, allergyOverride,
    },
  })
  auditCreate(uow, actor, 'Order', order.id, 'order.entered', { kind, source, residentId: resident.id, allergyOverride: allergyOverride || undefined })
  if (kind === 'medication') {
    const med = input.medication!
    const holds = med.holdParameters
    if (holds && (!['systolic_bp', 'diastolic_bp', 'pulse', 'spo2', 'temperature', 'blood_glucose'].includes(holds.vital) || !['lt', 'gt'].includes(holds.op) || !Number.isFinite(holds.value))) invalid('Hold parameter is not valid.', 'holdParameters')
    if (!med.prn && !(med.times?.length)) invalid('Add the administration times.', 'times')
    for (const t of med.times ?? []) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) invalid('Times look like 08:00.', 'times')
    await uow.tx.medicationOrderDetail.create({
      data: {
        residentId: resident.id, communityId: resident.communityId, orderId: order.id, referenceId: med.referenceId ?? null, drugName: text(med.drugName, 'Drug'), dose: String(qty(med.dose, 'Dose')), doseUnit: text(med.doseUnit, 'Dose unit'),
        route: (med.route as never) ?? null, prn: Boolean(med.prn), prnReason: med.prnReason ?? '', prnMinIntervalMinutes: med.prnMinIntervalMinutes ?? null, prnFollowUpMinutes: med.prnFollowUpMinutes ?? 60,
        times: (med.times ?? []) as never, holdParameters: (holds ?? null) as never, controlled: Boolean(med.controlled),
      },
    })
  }
  if (verbal) {
    const dueAt = new Date(uow.now.getTime() + 24 * 3_600_000)
    await createTask(uow, actor, { communityId: resident.communityId, residentId: resident.id, kind: 'countersign', title: `Countersign ${source} order: ${order.summary.slice(0, 80)}`, ownerRole: 'Prescriber', dueAt, escalationOwnerRole: ROLE_NAMES.don, dedupeKey: `countersign:${order.id}`, subjectType: 'Order', subjectId: order.id })
  }
  return { orderId: order.id, reference: order.reference, needsCountersign: verbal }
}

export async function countersignOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; expectedVersion?: number | null }) {
  const order = await lockRow<{ id: string; version: number; status: string; needsCountersign: boolean; enteredById: string | null; countersignedAt: Date | null }>(uow.tx, 'Order', input.orderId)
  if (!order.needsCountersign || order.countersignedAt) throw new DomainError(Codes.INVALID_TRANSITION, 'This order needs no countersignature.')
  if (order.enteredById && order.enteredById === userOf(actor)) throw new DomainError(Codes.SELF_APPROVAL, 'Someone other than the person who took the order countersigns it.')
  const result = await uow.tx.order.updateMany({ where: { id: order.id, version: order.version }, data: { countersignedById: userOf(actor), countersignedAt: uow.now, version: { increment: 1 } } })
  if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, 'The order changed. Reload and try again.')
  uow.audit({ eventType: 'order.countersigned', entityType: 'Order', entityId: order.id, actorUserId: userOf(actor), before: { countersigned: false }, after: { countersigned: true } })
  const task = await uow.tx.task.findUnique({ where: { dedupeKey: `countersign:${order.id}` } })
  if (task && (task.status === 'open' || task.status === 'in_progress')) await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: userOf(actor), completedAt: uow.now } })
  return { orderId: order.id }
}

export async function discontinueOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; reason: string; expectedVersion?: number | null }) {
  const order = await lockRow<{ id: string; version: number }>(uow.tx, 'Order', input.orderId)
  const reason = text(input.reason, 'Reason', { min: 3 })
  await casUpdate(uow, { model: 'Order', id: order.id, version: order.version, from: ['active'], to: 'discontinued', actor, eventType: 'order.discontinued', reason, data: { stopAt: uow.now, discontinuedReason: reason } })
  // Doses not yet due are cancelled; given or refused doses stay as they were.
  await uow.tx.administrationSlot.updateMany({ where: { orderId: order.id, status: 'scheduled', scheduledFor: { gt: uow.now } }, data: { status: 'not_given', settledAt: uow.now, version: { increment: 1 } } })
  return { orderId: order.id, status: 'discontinued' }
}

export { openClocksForFact }
