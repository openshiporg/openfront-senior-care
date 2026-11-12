import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { createFakeStripe } from '../../integrations/payment/fake'
import { applyPaymentEvent, usePaymentAdapter } from '../billing/payments'
import { systemActor } from '../lib/actor'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadBillingSetup, loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import { billingCommand } from './billing'

/** Phase 3 r1 fixes: M1 resident credit, M2 deposit rules and forfeit, M4 care_level.assign, M6 adjustments and write-offs. */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]

describe.skipIf(!hasTestDatabase)('r1 money fixes (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, director: Ctx, office: Ctx, officeSecond: Ctx
  let periodId = ''
  const fake = createFakeStripe()
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c) as Promise<any>
  const approve = async (requestId: string, c: Ctx = officeSecond) => decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, c)
  const residents: string[] = []
  const statementFor = async (index: number, total: bigint, pid = periodId) =>
    prisma.statement.create({ data: { communityId: COMMUNITY.id, residentId: residents[index], periodId: pid, number: `STM-F-${uniqueKey('n')}`, status: 'issued', totalMinor: total, paidMinor: 0n, lines: [], chargeHash: 'a'.repeat(64) } })

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    usePaymentAdapter(fake.adapter)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    await loadBillingSetup(null, { idempotencyKey: uniqueKey('billing') }, admin)
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    const second = await prisma.user.create({ data: { name: 'Second reviewer', email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60) } })
    await prisma.staffAssignment.create({ data: { userId: second.id, communityId: COMMUNITY.id, status: 'active' } })
    officeSecond = ctx(prisma, second.id, roleOf('seed_role_business_office'))
    periodId = (await prisma.billingPeriod.create({ data: { communityId: COMMUNITY.id, month: new Date('2026-10-01T00:00:00Z'), status: 'closed', statementCount: 4 } })).id
    for (let i = 0; i < 4; i += 1) residents.push((await prisma.resident.create({ data: { reference: `FIXRES-${i}`, communityId: COMMUNITY.id, firstName: `Fix${i}`, lastName: 'Resident', status: 'current', synthetic: true } })).id)
  }, 300_000)

  afterAll(async () => {
    usePaymentAdapter(null)
    await prisma?.$disconnect()
  })

  it('M1: a card that settles after a check paid the bill leaves a visible credit that can be applied or refunded', async () => {
    const statement = await statementFor(0, 900_000n)
    const token = await prisma.paymentMethodToken.create({ data: { communityId: COMMUNITY.id, residentId: residents[0], provider: 'card', brand: 'Visa', last4: '4242', token: 'pm_card_visa', autopay: false, status: 'active' } })
    fake.script('processing')
    const card = await bc(office, 'payment.charge', { statementId: statement.id, method: 'ach', amountMinor: '900000', tokenId: token.id })
    expect(card.status).toBe('pending')
    await bc(office, 'payment.record', { statementId: statement.id, method: 'check', amountMinor: '900000', reference: '1001' })
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).toMatchObject({ status: 'paid', paidMinor: 900_000n })

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: card.paymentId } })
    await applyPaymentEvent(prisma as never, systemActor('payment_webhook'), { id: uniqueKey('evt'), type: 'payment_intent.succeeded', objectRef: row.providerRef, outcome: 'succeeded' })
    const credit = await prisma.residentCredit.findFirstOrThrow({ where: { paymentId: card.paymentId } })
    expect(credit).toMatchObject({ amountMinor: 900_000n, remainingMinor: 900_000n, status: 'open', residentId: residents[0] })
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).toMatchObject({ paidMinor: 900_000n })

    // Apply part of it to a later statement, refund the rest.
    const november = await prisma.billingPeriod.create({ data: { communityId: COMMUNITY.id, month: new Date('2026-11-01T00:00:00Z'), status: 'open' } })
    const later = await statementFor(0, 300_000n, november.id)
    const applied = await bc(office, 'credit.apply', { creditId: credit.id, statementId: later.id })
    expect(applied).toMatchObject({ appliedMinor: '300000', remainingMinor: '600000' })
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: later.id } })).toMatchObject({ status: 'paid', paidMinor: 300_000n })
    await expect(bc(office, 'refund.request', { creditId: credit.id, amountMinor: '700000', reason: 'Too much' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const refund = await bc(office, 'refund.request', { creditId: credit.id, amountMinor: '600000', reason: 'Returned to the resident' })
    if (refund.approvalRequestId) await approve(refund.approvalRequestId)
    expect((await bc(office, 'refund.issue', { refundId: refund.refundId })).status).toBe('issued')
    expect(await prisma.residentCredit.findUniqueOrThrow({ where: { id: credit.id } })).toMatchObject({ remainingMinor: 0n, status: 'closed' })
    // The credit cannot be rewritten with SQL.
    await expect(prisma.residentCredit.update({ where: { id: credit.id }, data: { remainingMinor: 900_000n } })).rejects.toThrow()
  }, 300_000)

  it('M2: deposit refund rules come from the pack; a refund outside them is refused; held → forfeited needs a second person', async () => {
    const pack = await prisma.jurisdictionPack.findUniqueOrThrow({ where: { code: 'US-OH' } })
    expect((pack.rules as any).depositRefund.value.community_fee).toMatchObject({ refundable: true, refundWindowDays: 30, forfeitable: false })

    const stale = await bc(office, 'deposit.receive', { communityId: COMMUNITY.id, residentId: residents[1], kind: 'community_fee', method: 'check', amountMinor: 50_000, receivedOn: '2026-01-05' })
    await expect(bc(office, 'refund.request', { depositId: stale.depositId, amountMinor: 50_000, reason: 'Late request' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(bc(office, 'deposit.forfeit', { depositId: stale.depositId, reason: 'Keep it' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    const kept = await bc(office, 'deposit.receive', { communityId: COMMUNITY.id, residentId: residents[1], kind: 'reservation', method: 'check', amountMinor: 40_000, receivedOn: '2026-01-05' })
    const asked = await bc(office, 'deposit.forfeit', { depositId: kept.depositId, reason: 'Resident cancelled after the window' })
    expect((await prisma.deposit.findUniqueOrThrow({ where: { id: kept.depositId } })).status).toBe('held')
    await expect(approve(asked.approvalRequestId, office)).rejects.toThrow()
    await approve(asked.approvalRequestId)
    expect((await prisma.deposit.findUniqueOrThrow({ where: { id: kept.depositId } })).status).toBe('forfeited')
    await expect(prisma.deposit.update({ where: { id: kept.depositId }, data: { status: 'held' } })).rejects.toThrow()
  }, 300_000)

  it('M4: care_level.assign from AL points or by hand with a reason, superseding the current row', async () => {
    const stay = await prisma.stay.create({ data: { reference: `FIXSTAY-${uniqueKey('s')}`, residentId: residents[3], communityId: COMMUNITY.id, setting: 'assisted_living', status: 'admitted', presence: 'in_house', admittedAt: new Date('2026-08-01T00:00:00Z') } })
    const levels = await prisma.careLevel.findMany({ where: { communityId: COMMUNITY.id, setting: stay.setting, status: 'active' }, orderBy: { minPoints: 'asc' } })
    const first = await bc(office, 'care_level.assign', { stayId: stay.id, points: levels[0].minPoints, effectiveFrom: '2026-09-01' })
    expect(levels.length).toBeGreaterThan(1)
    expect(first.careLevelId).toBe(levels[0].id)
    await expect(bc(office, 'care_level.assign', { stayId: stay.id, careLevelId: levels[1].id, effectiveFrom: '2026-10-01' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const manual = await bc(office, 'care_level.assign', { stayId: stay.id, careLevelId: levels[1].id, effectiveFrom: '2026-10-01', noticeDeliveredOn: '2026-09-01', reason: 'Fall in September' })
    expect(manual.supersedes).toBe(first.assignmentId)
    expect(await prisma.careLevelAssignment.findUniqueOrThrow({ where: { id: first.assignmentId } })).toMatchObject({ status: 'superseded' })
    await expect(prisma.careLevelAssignment.update({ where: { id: manual.assignmentId }, data: { effectiveFrom: new Date('2026-01-01T00:00:00Z') } })).rejects.toThrow()
  }, 120_000)

  it('M6: adjustments and write-offs reduce the balance; at the threshold they need a different approver with canApproveWriteOffs', async () => {
    await prisma.operatorSettings.update({ where: { id: 1 }, data: { writeOffApprovalThresholdMinor: 100_000n } })
    const statement = await statementFor(2, 500_000n)
    const small = await bc(office, 'adjustment.create', { statementId: statement.id, amountMinor: '50000', reason: 'Laundry credited' })
    expect(small.status).toBe('posted')
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).toMatchObject({ adjustedMinor: 50_000n, status: 'issued' })

    const big = await bc(office, 'writeoff.create', { statementId: statement.id, amountMinor: '450000', reason: 'Uncollectable after move-out' })
    expect(big).toMatchObject({ status: 'pending_approval' })
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).adjustedMinor).toBe(50_000n)
    await expect(approve(big.approvalRequestId, office)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await expect(approve(big.approvalRequestId, officeSecond)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await approve(big.approvalRequestId, director)
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).toMatchObject({ adjustedMinor: 500_000n, status: 'paid' })
    await expect(bc(office, 'writeoff.create', { statementId: statement.id, amountMinor: '1000', reason: 'Again' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    // Append-only: the posted row cannot be edited; a correction supersedes it and the balance follows.
    await expect(prisma.balanceAdjustment.update({ where: { id: small.adjustmentId }, data: { amountMinor: 1n } })).rejects.toThrow()
    const fix = await bc(office, 'adjustment.create', { statementId: statement.id, amountMinor: '20000', reason: 'Laundry was 200.00, not 500.00', supersedesId: small.adjustmentId })
    expect(fix.status).toBe('posted')
    expect(await prisma.balanceAdjustment.findUniqueOrThrow({ where: { id: small.adjustmentId } })).toMatchObject({ status: 'superseded' })
    expect(await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).toMatchObject({ adjustedMinor: 470_000n, status: 'issued' })
    await expect(prisma.balanceAdjustment.deleteMany({ where: { id: fix.adjustmentId } })).rejects.toThrow()
  }, 300_000)
})
