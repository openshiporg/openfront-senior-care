import { actorUserId, type Actor } from '../lib/actor'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import { localDate } from '../lib/calendar'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { instalmentState, planInstalments } from './ar'
import { balanceOf, chargeStatement } from './payments'

/**
 * Payment plans (SCHEMA §10.7). A plan splits one statement's open balance into instalments that sum to it exactly. Each instalment
 * is charged by a staff button through the ordinary card/ACH path, so the one-open-card-payment-per-statement rule and the
 * intent-before-processor rule hold for plans too. A declined instalment is never charged again on its own: autopay skips a statement
 * on a plan, and only the Retry button (a new staff action with a new key) charges a declined instalment again.
 */

const day = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)

export async function createPlan(uow: UnitOfWork, actor: Actor, input: { statementId: string; instalments: number; firstDueOn: string }) {
  const statement = await uow.tx.statement.findUnique({ where: { id: input.statementId } })
  if (!statement) throw new DomainError(Codes.NOT_FOUND, 'Statement not found.')
  await lockRow(uow.tx, 'Statement', statement.id)
  const fresh = await uow.tx.statement.findUniqueOrThrow({ where: { id: statement.id } })
  if (fresh.status !== 'issued') throw new DomainError(Codes.GUARD_FAILED, `A plan is for an issued statement with a balance; this one is ${fresh.status}.`)
  const balance = balanceOf(fresh)
  if (balance <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'This statement has nothing left to pay.')
  if (await uow.tx.paymentPlan.findFirst({ where: { statementId: fresh.id, status: 'active' }, select: { id: true } })) throw new DomainError(Codes.GUARD_FAILED, 'This statement already has an active payment plan.', { reason: 'plan_exists' })
  const inFlight = await uow.tx.payment.findFirst({ where: { statementId: fresh.id, method: { in: ['card', 'ach'] }, status: { in: ['pending', 'unknown'] } }, select: { reference: true } })
  if (inFlight) throw new DomainError(Codes.GUARD_FAILED, `Payment ${inFlight.reference} has no final answer yet. Check its status before setting up a plan.`, { reason: 'charge_in_flight' })
  let schedule
  try {
    schedule = planInstalments(balance, Number(input.instalments), String(input.firstDueOn ?? '').slice(0, 10))
  } catch (error) {
    throw new DomainError(Codes.INVALID_INPUT, error instanceof Error ? error.message : 'Invalid plan.')
  }
  const plan = await uow.tx.paymentPlan.create({
    data: {
      communityId: fresh.communityId, residentId: fresh.residentId, statementId: fresh.id, reference: await nextReference(uow.tx, 'PLAN', uow.now, 5),
      totalMinor: balance, instalmentCount: schedule.length, status: 'active', createdById: actorUserId(actor),
    },
  })
  await uow.tx.paymentPlanInstalment.createMany({ data: schedule.map(row => ({ communityId: fresh.communityId, residentId: fresh.residentId, planId: plan.id, number: row.number, dueOn: day(row.dueOn), amountMinor: row.amountMinor })) })
  auditCreate(uow, actor, 'PaymentPlan', plan.id, 'payment_plan.created', { statement: fresh.number, totalMinor: balance.toString(), instalments: schedule.map(row => ({ dueOn: row.dueOn, amountMinor: row.amountMinor.toString() })) })
  return { planId: plan.id, reference: plan.reference, totalMinor: balance.toString(), instalments: schedule.length }
}

export async function cancelPlan(uow: UnitOfWork, actor: Actor, input: { planId: string; reason: string }) {
  const reason = input.reason.trim()
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the plan is cancelled.', { field: 'reason' })
  const plan = await lockRow<{ id: string; status: string; version: number }>(uow.tx, 'PaymentPlan', input.planId)
  if (!plan) throw new DomainError(Codes.NOT_FOUND, 'Plan not found.')
  const open = await uow.tx.paymentPlanInstalment.findFirst({ where: { planId: plan.id, payment: { status: { in: ['pending', 'unknown'] } } }, select: { number: true } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, `Instalment ${open.number} has a payment with no final answer yet. Check its status first.`, { reason: 'charge_in_flight' })
  await casUpdate(uow, { model: 'PaymentPlan', id: plan.id, version: plan.version, from: ['active'], to: 'cancelled', actor, eventType: 'payment_plan.cancelled', reason, data: { cancelledReason: reason } })
  return { planId: plan.id, status: 'cancelled' }
}

/**
 * Charges one instalment (Charge) or charges a declined one again (Retry). Both are staff buttons; the instalment row is locked and
 * re-checked inside the same transaction that records the payment intent, so two clicks cannot both start a charge.
 */
export async function chargeInstalment(db: Db, actor: Actor, input: { instalmentId: string; tokenId?: string | null; retry: boolean; idempotencyKey: string }) {
  const row = await db.paymentPlanInstalment.findUnique({ where: { id: input.instalmentId }, include: { plan: { select: { id: true, status: true, statementId: true, residentId: true } } } })
  if (!row || !row.plan?.statementId) throw new DomainError(Codes.NOT_FOUND, 'Instalment not found.')
  const token = input.tokenId
    ? await db.paymentMethodToken.findUnique({ where: { id: input.tokenId } })
    : await db.paymentMethodToken.findFirst({ where: { residentId: row.plan.residentId, status: 'active' }, orderBy: [{ autopay: 'desc' }, { createdAt: 'asc' }] })
  if (!token) throw new DomainError(Codes.GUARD_FAILED, 'There is no saved card or bank account for this resident. Record the instalment by hand instead.', { reason: 'no_token' })
  const statement = await db.statement.findUniqueOrThrow({ where: { id: row.plan.statementId }, select: { totalMinor: true, paidMinor: true, adjustedMinor: true } })
  // Never more than the statement still owes (a check may have paid part of it).
  const balance = balanceOf(statement)
  const amount = row.amountMinor! < balance ? row.amountMinor! : balance
  if (amount <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'The statement is already paid.', { reason: 'already_paid' })
  return chargeStatement(db, actor, {
    statementId: row.plan.statementId, method: token.provider === 'ach' ? 'ach' : 'card', amountMinor: amount, tokenId: token.id, idempotencyKey: input.idempotencyKey,
    instalment: {
      instalmentId: row.id, retry: input.retry,
      check: async uow => {
        await lockRow(uow.tx, 'PaymentPlanInstalment', row.id)
        const fresh = await uow.tx.paymentPlanInstalment.findUniqueOrThrow({ where: { id: row.id }, include: { plan: { select: { status: true } }, payment: { select: { status: true } } } })
        if (fresh.plan?.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'This plan is no longer active.')
        const state = instalmentState({ dueOn: iso(fresh.dueOn)!, paymentStatus: fresh.payment?.status ?? null }, localDate('UTC', uow.now))
        if (state === 'paid') throw new DomainError(Codes.GUARD_FAILED, 'This instalment is already paid.', { reason: 'already_paid' })
        if (state === 'in_flight') throw new DomainError(Codes.GUARD_FAILED, 'This instalment has a payment with no final answer yet. Check its status first.', { reason: 'charge_in_flight' })
        if (state === 'declined' && !input.retry) throw new DomainError(Codes.GUARD_FAILED, 'This instalment was declined. It is only charged again when someone presses Retry.', { reason: 'declined' })
        if (state !== 'declined' && input.retry) throw new DomainError(Codes.GUARD_FAILED, 'Only a declined instalment can be retried.')
      },
      link: async (uow, paymentId) => {
        await uow.tx.paymentPlanInstalment.update({ where: { id: row.id }, data: { paymentId, attempts: { increment: 1 }, version: { increment: 1 } } })
      },
    },
  })
}

/** A plan with each instalment's state, read now. */
export async function planView(db: Db, planId: string, today: string) {
  const plan = await db.paymentPlan.findUniqueOrThrow({ where: { id: planId }, include: { instalments: { orderBy: { number: 'asc' }, include: { payment: { select: { status: true, reference: true, failureCode: true } } } } } })
  return {
    ...plan,
    instalments: plan.instalments.map(row => ({ ...row, state: instalmentState({ dueOn: iso(row.dueOn)!, paymentStatus: row.payment?.status ?? null }, today) })),
  }
}
