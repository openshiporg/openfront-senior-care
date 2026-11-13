import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { createFakeStripe } from '../../../tests/helpers/fakeStripe'
import { applyPaymentEvent, usePaymentAdapter } from '../billing/payments'
import { systemActor } from '../lib/actor'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import { billingCommand } from './billing'

/**
 * Phase 3 exit gate (BUILD-PLAN §3), part 2 of 3: gate 5, a payment webhook replay and an unknown outcome produce exactly one
 * payment, plus refunds, deposits and autopay. The statements are written directly (the close is proved in billing.db.test.ts).
 * The card processor is the deterministic Stripe test double, which obeys Stripe's idempotency rules.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]

describe.skipIf(!hasTestDatabase)('payments, refunds and deposits (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, director: Ctx, office: Ctx, officeSecond: Ctx
  let periodId = ''
  const fake = createFakeStripe()
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c) as Promise<any>
  const approve = async (requestId: string, c: Ctx = officeSecond) => decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, c)
  const statementOf = (residentId: string) => prisma.statement.findFirstOrThrow({ where: { periodId, residentId } })
  const residents: string[] = []
  let studioResidentId = ''

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    usePaymentAdapter(fake.adapter)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    const second = await prisma.user.create({ data: { name: 'Second reviewer', email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60) } })
    await prisma.staffAssignment.create({ data: { userId: second.id, communityId: COMMUNITY.id, status: 'active' } })
    officeSecond = ctx(prisma, second.id, roleOf('seed_role_business_office'))
    const period = await prisma.billingPeriod.create({ data: { communityId: COMMUNITY.id, month: new Date('2026-10-01T00:00:00Z'), status: 'closed', statementCount: 8 } })
    periodId = period.id
    const names: [string, string][] = [['Dorothy', 'Abbott'], ['Harold', 'Bauer'], ['Evelyn', 'Castillo'], ['Walter', 'Delgado'], ['Margaret', 'Eastman'], ['Eugene', 'Fischer'], ['Ruth', 'Gallagher'], ['Clarence', 'Hoffman']]
    for (const [index, [firstName, lastName]] of names.entries()) {
      const resident = await prisma.resident.create({ data: { reference: `PAYRES-${index}`, communityId: COMMUNITY.id, firstName, lastName, status: 'current', synthetic: true } })
      residents.push(resident.id)
      await prisma.statement.create({ data: { communityId: COMMUNITY.id, residentId: resident.id, periodId, number: `STM-T-${String(index + 1).padStart(6, '0')}`, status: 'issued', totalMinor: BigInt(585_000 + index * 1_000), paidMinor: 0n, lines: [], chargeHash: 'a'.repeat(64) } })
    }
    studioResidentId = residents[7]
  }, 300_000)

  afterAll(async () => {
    usePaymentAdapter(null)
    await prisma?.$disconnect()
  })

  it('gate 5: an unknown outcome, a check, and a webhook replay make exactly one payment', async () => {
    await prisma.operatorSettings.update({ where: { id: 1 }, data: { refundApprovalThresholdMinor: 100_000n } })
    const statements = await prisma.statement.findMany({ where: { periodId, residentId: { not: studioResidentId } }, orderBy: { number: 'asc' }, take: 6 })
    const [a, b, c, d] = statements
    const tokenFor = (residentId: string | null, autopay = false) => prisma.paymentMethodToken.create({ data: { communityId: COMMUNITY.id, residentId, provider: 'card', brand: 'Visa', last4: '4242', token: 'pm_card_visa', autopay, status: 'active' } })
    const tokenA = await tokenFor(a.residentId)

    // The answer is lost. The payment is unknown, a second charge is refused, and the database refuses it too.
    fake.script('lose_answer')
    const lost = await bc(office, 'payment.charge', { statementId: a.id, method: 'card', amountMinor: a.totalMinor!.toString(), tokenId: tokenA.id })
    expect(lost.status).toBe('unknown')
    await expect(bc(office, 'payment.charge', { statementId: a.id, method: 'card', amountMinor: a.totalMinor!.toString(), tokenId: tokenA.id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    expect(fake.calls.charge).toBe(1)
    await expect(prisma.payment.create({ data: { communityId: COMMUNITY.id, residentId: a.residentId, statementId: a.id, method: 'ach', status: 'pending', amountMinor: 100n, currency: 'USD', idempotencyKey: uniqueKey('x'), reference: uniqueKey('r') } })).rejects.toThrow()

    // The same click again (same key) is a replay and never reaches the processor.
    const key = uniqueKey('same-click')
    fake.script('succeed')
    const tokenB = await tokenFor(b.residentId)
    const firstClick = await bc(office, 'payment.charge', { statementId: b.id, method: 'card', amountMinor: b.totalMinor!.toString(), tokenId: tokenB.id }, key)
    expect(firstClick.status).toBe('succeeded')
    const secondClick = await bc(office, 'payment.charge', { statementId: b.id, method: 'card', amountMinor: b.totalMinor!.toString(), tokenId: tokenB.id }, key)
    expect(secondClick.replay).toBe(true)
    expect(fake.calls.charge).toBe(2)

    // "Check status" only reads: it finds the lost charge and settles it once, however often it is pressed.
    const created = fake.calls.created
    const checked = await bc(office, 'payment.check_status', { paymentId: lost.paymentId })
    expect(checked.status).toBe('succeeded')
    expect(fake.calls.created).toBe(created)
    const checkedAgain = await bc(office, 'payment.check_status', { paymentId: lost.paymentId })
    expect(checkedAgain.status).toBe('succeeded')
    const paymentA = await prisma.payment.findUniqueOrThrow({ where: { id: lost.paymentId } })
    expect(paymentA.providerRef).toMatch(/^pi_test_/)

    // The processor's webhook arrives afterwards, twice, and once more with a different id: still one payment.
    const event = { id: 'evt_test_0001', type: 'payment_intent.succeeded', objectRef: paymentA.providerRef, outcome: 'succeeded' }
    expect((await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), event)).duplicate).toBe(false)
    expect((await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), event)).duplicate).toBe(true)
    await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), { ...event, id: 'evt_test_0002' })
    expect(await prisma.payment.count({ where: { statementId: a.id } })).toBe(1)
    expect(await prisma.paymentAllocation.count({ where: { statementId: a.id } })).toBe(1)
    expect(await prisma.paymentEvent.count({ where: { providerEventId: 'evt_test_0001' } })).toBe(1)
    expect(await statementOf(a.residentId!)).toMatchObject({ status: 'paid', paidMinor: a.totalMinor })

    // A webhook can also be the first to learn the result of a payment still processing.
    fake.script('processing')
    const processing = await bc(office, 'payment.charge', { statementId: c.id, method: 'ach', amountMinor: c.totalMinor!.toString(), tokenId: (await tokenFor(c.residentId)).id })
    expect(processing.status).toBe('pending')
    const processingRow = await prisma.payment.findUniqueOrThrow({ where: { id: processing.paymentId } })
    const hook = { id: 'evt_test_0003', type: 'payment_intent.succeeded', objectRef: processingRow.providerRef, outcome: 'succeeded' }
    await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), hook)
    await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), hook)
    expect((await bc(office, 'payment.check_status', { paymentId: processing.paymentId })).message).toBe('Nothing to check.')
    expect(await prisma.payment.count({ where: { statementId: c.id, status: 'succeeded' } })).toBe(1)
    expect(await prisma.paymentAllocation.count({ where: { statementId: c.id } })).toBe(1)

    // A decline is final for that key; trying again is a staff action with a new click.
    fake.script('decline')
    const declined = await bc(office, 'payment.charge', { statementId: d.id, method: 'card', amountMinor: d.totalMinor!.toString(), tokenId: (await tokenFor(d.residentId)).id })
    expect(declined.status).toBe('failed')
    expect((await bc(office, 'payment.check_status', { paymentId: declined.paymentId })).status).toBe('failed')
    expect(await statementOf(d.residentId!)).toMatchObject({ status: 'issued', paidMinor: 0n })
    fake.script('succeed')
    const retried = await bc(office, 'payment.charge', { statementId: d.id, method: 'card', amountMinor: d.totalMinor!.toString(), tokenId: (await tokenFor(d.residentId)).id })
    expect(retried.status).toBe('succeeded')
    expect(await prisma.payment.count({ where: { statementId: d.id } })).toBe(2)

    // Money rows are append-only.
    const allocation = await prisma.paymentAllocation.findFirstOrThrow({ where: { statementId: a.id } })
    await expect(prisma.paymentAllocation.update({ where: { id: allocation.id }, data: { amountMinor: 1n } })).rejects.toThrow()
    await expect(prisma.paymentEvent.deleteMany({ where: { providerEventId: 'evt_test_0001' } })).rejects.toThrow()
  }, 300_000)

  it('refunds never reopen a paid statement; a deposit is held, applied or refunded in full', async () => {
    const paid = await prisma.statement.findFirstOrThrow({ where: { periodId, status: 'paid' }, orderBy: { number: 'asc' } })
    const payment = await prisma.payment.findFirstOrThrow({ where: { statementId: paid.id, status: 'succeeded' } })
    const small = await bc(office, 'refund.request', { paymentId: payment.id, amountMinor: 5_000, reason: 'Duplicate laundry charge' })
    expect(small.status).toBe('requested')
    const issued = await bc(office, 'refund.issue', { refundId: small.refundId })
    expect(issued.status).toBe('issued')
    expect((await bc(office, 'refund.issue', { refundId: small.refundId })).status).toBe('issued')
    expect(fake.calls.refund).toBe(1)
    expect(await statementOf(paid.residentId!)).toMatchObject({ status: 'paid', paidMinor: paid.paidMinor })
    await expect(bc(office, 'refund.request', { paymentId: payment.id, amountMinor: payment.amountMinor.toString(), reason: 'Too much' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    // Over the threshold a second person approves before any money moves.
    const big = await bc(office, 'refund.request', { paymentId: payment.id, amountMinor: (payment.amountMinor - 5_000n).toString(), reason: 'Resident moved out; pro-rata return' })
    expect(big).toMatchObject({ status: 'pending_approval' })
    await expect(bc(office, 'refund.issue', { refundId: big.refundId })).rejects.toThrow()
    await approve(big.approvalRequestId)
    expect((await bc(office, 'refund.issue', { refundId: big.refundId })).status).toBe('issued')
    expect(await statementOf(paid.residentId!)).toMatchObject({ status: 'paid', paidMinor: paid.paidMinor })

    // Deposits.
    const open = await prisma.statement.findFirstOrThrow({ where: { periodId, status: 'issued', residentId: { not: studioResidentId } }, orderBy: { number: 'asc' } })
    const deposit = await bc(office, 'deposit.receive', { communityId: COMMUNITY.id, residentId: open.residentId, kind: 'security', method: 'check', amountMinor: 100_000, receivedOn: '2026-09-18' })
    const refundDeposit = await bc(office, 'refund.request', { depositId: deposit.depositId, amountMinor: 100_000, reason: 'Moved out before move-in' })
    expect(refundDeposit.status).toBe('pending_approval')
    await approve(refundDeposit.approvalRequestId)
    await bc(office, 'refund.issue', { refundId: refundDeposit.refundId })
    expect((await prisma.deposit.findUniqueOrThrow({ where: { id: deposit.depositId } })).status).toBe('refunded')
    const second = await bc(office, 'deposit.receive', { communityId: COMMUNITY.id, residentId: open.residentId, kind: 'reservation', method: 'check', amountMinor: 40_000, receivedOn: '2026-09-19' })
    const applied = await bc(office, 'deposit.apply', { depositId: second.depositId, statementId: open.id })
    expect(applied.paymentId).toBeTruthy()
    expect((await statementOf(open.residentId!)).paidMinor).toBe(40_000n)
    await expect(bc(office, 'deposit.apply', { depositId: second.depositId, statementId: open.id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
  }, 300_000)

  it('autopay is a staff button in the close: it charges the stored token once and never retries a decline', async () => {
    const next = await prisma.statement.findFirstOrThrow({ where: { periodId, status: 'issued', residentId: { not: studioResidentId }, paidMinor: 0n }, orderBy: { number: 'asc' } })
    await prisma.paymentMethodToken.create({ data: { communityId: COMMUNITY.id, residentId: next.residentId, provider: 'card', brand: 'Mastercard', last4: '4444', token: 'pm_card_mastercard', autopay: true, status: 'active' } })
    fake.script('decline')
    const run1 = await bc(office, 'billing.autopay', { periodId })
    expect(run1.results.find((r: { statementId: string }) => r.statementId === next.id)).toMatchObject({ status: 'failed' })
    const run2 = await bc(office, 'billing.autopay', { periodId })
    expect(run2.results.find((r: { statementId: string }) => r.statementId === next.id)).toMatchObject({ status: 'declined_earlier' })
    expect(await prisma.payment.count({ where: { statementId: next.id } })).toBe(1)
  }, 120_000)
})
