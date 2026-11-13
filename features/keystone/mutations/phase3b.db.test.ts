import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { createFakeStripe } from '../../integrations/payment/fake'
import { usePaymentAdapter } from '../billing/payments'
import { portalPay } from '../billing/portalPay'
import { glExport } from '../billing/glExport'
import { trustAlerts } from '../trust/more'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import { billingCommand } from './billing'

/**
 * Phase 3b (r1 review M7): payment plans with staff-only retry, portal payments, the GL export, Medicaid applications and the
 * liability schedule, trust authorisations with a second approver, interest allocation, quarterly statements, alerts and bonds.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]

describe.skipIf(!hasTestDatabase)('phase 3b money (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, office: Ctx, trustOfficer: Ctx, trustApprover: Ctx, nurse: Ctx
  let periodId = ''
  const fake = createFakeStripe()
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c) as Promise<any>
  const approve = (requestId: string, c: Ctx) => decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, c)
  let n = 0
  const newStatement = async (totalMinor: bigint) => {
    n += 1
    const resident = await prisma.resident.create({ data: { reference: `P3B-${n}`, communityId: COMMUNITY.id, firstName: 'Res', lastName: `Number${n}`, status: 'current', synthetic: true } })
    const statement = await prisma.statement.create({ data: { communityId: COMMUNITY.id, residentId: resident.id, periodId, number: `STM-P3B-${String(n).padStart(5, '0')}`, status: 'issued', totalMinor, paidMinor: 0n, lines: [], chargeHash: 'b'.repeat(64), dueOn: new Date('2026-10-05T00:00:00Z') } })
    const token = await prisma.paymentMethodToken.create({ data: { communityId: COMMUNITY.id, residentId: resident.id, provider: 'card', brand: 'Visa', last4: '4242', token: 'pm_card_visa', status: 'active' } })
    return { resident, statement, token }
  }

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    usePaymentAdapter(fake.adapter)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    trustOfficer = ctx(prisma, 'seed_user_almeida', roleOf('seed_role_trust_officer'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    const approverUser = await prisma.user.create({ data: { name: 'Approver', email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60) } })
    await prisma.staffAssignment.create({ data: { userId: approverUser.id, communityId: COMMUNITY.id, status: 'active' } })
    trustApprover = ctx(prisma, approverUser.id, roleOf('seed_role_trust_approver'))
    periodId = (await prisma.billingPeriod.create({ data: { communityId: COMMUNITY.id, month: new Date('2026-10-01T00:00:00Z'), status: 'closed', statementCount: 0 } })).id
  }, 300_000)

  afterAll(async () => {
    usePaymentAdapter(null)
    await prisma?.$disconnect()
  })

  it('a payment plan: instalments sum to the balance, one open card payment, a decline is retried only by a person', async () => {
    const { statement, token } = await newStatement(1_000_01n)
    await expect(bc(nurse, 'plan.create', { statementId: statement.id, instalments: 3, firstDueOn: '2026-11-01' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const plan = await bc(office, 'plan.create', { statementId: statement.id, instalments: 3, firstDueOn: '2026-11-01' })
    const rows = await prisma.paymentPlanInstalment.findMany({ where: { planId: plan.planId }, orderBy: { number: 'asc' } })
    expect(rows.map(r => r.amountMinor)).toEqual([33_334n, 33_334n, 33_333n])
    await expect(bc(office, 'plan.create', { statementId: statement.id, instalments: 2, firstDueOn: '2026-11-01' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    // A one-off charge against a statement on a plan is refused: the plan is how it is paid.
    await expect(bc(office, 'payment.charge', { statementId: statement.id, method: 'card', amountMinor: '100', tokenId: token.id })).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'on_plan' } })

    fake.script('decline')
    const declined = await bc(office, 'plan.charge_instalment', { instalmentId: rows[0].id })
    expect(declined.status).toBe('failed')
    const callsAfterDecline = fake.calls.charge
    // Pressing Charge again does not charge a declined instalment, and neither does autopay or the portal.
    await expect(bc(office, 'plan.charge_instalment', { instalmentId: rows[0].id })).rejects.toMatchObject({ details: { reason: 'declined' } })
    await expect(bc(office, 'plan.retry_instalment', { instalmentId: rows[1].id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const autopay = await bc(office, 'billing.autopay', { periodId })
    expect(JSON.stringify(autopay)).not.toContain(statement.id + '","status":"succeeded')
    expect(fake.calls.charge).toBe(callsAfterDecline)
    // The database refuses pointing the instalment at another payment unless the last one failed (it did) — and never edits its amount.
    await expect(prisma.paymentPlanInstalment.update({ where: { id: rows[0].id }, data: { amountMinor: 1n } })).rejects.toThrow()
    await expect(prisma.paymentPlan.update({ where: { id: plan.planId }, data: { totalMinor: 5n } })).rejects.toThrow()

    // Retry is the staff action.
    fake.script('succeed')
    const retried = await bc(office, 'plan.retry_instalment', { instalmentId: rows[0].id })
    expect(retried.status).toBe('succeeded')
    const after = await prisma.paymentPlanInstalment.findUniqueOrThrow({ where: { id: rows[0].id }, include: { payment: true } })
    expect(after.attempts).toBe(2)
    expect(after.payment?.amountMinor).toBe(33_334n)
    // A paid instalment cannot be charged or retried.
    await expect(bc(office, 'plan.retry_instalment', { instalmentId: rows[0].id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(bc(office, 'plan.charge_instalment', { instalmentId: rows[0].id })).rejects.toMatchObject({ details: { reason: 'already_paid' } })

    // An unknown outcome keeps the one-in-flight rule: the next instalment cannot start, and the plan cannot be cancelled.
    fake.script('lose_answer')
    const lost = await bc(office, 'plan.charge_instalment', { instalmentId: rows[1].id })
    expect(lost.status).toBe('unknown')
    await expect(bc(office, 'plan.charge_instalment', { instalmentId: rows[2].id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(bc(office, 'plan.cancel', { planId: plan.planId, reason: 'Family paid by check' })).rejects.toMatchObject({ details: { reason: 'charge_in_flight' } })
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).paidMinor).toBe(33_334n)
  }, 120_000)

  it('portal payments need the payments scope and two-step sign-in, and see only their own resident', async () => {
    const { resident, statement, token } = await newStatement(250_00n)
    const other = await newStatement(99_00n)
    const user = await prisma.user.create({ data: { name: 'Daughter', email: `${uniqueKey('fam')}@test.local`, password: 'x'.repeat(60) } })
    const account = await prisma.portalAccount.create({ data: { userId: user.id, communityId: COMMUNITY.id, status: 'active', mfaEnrolled: false } })
    const principal = { userId: user.id, kind: 'portal' }
    const pay = (input: Partial<Parameters<typeof portalPay>[2]> = {}) => portalPay(prisma as never, principal, { residentId: resident.id, statementId: statement.id, tokenId: token.id, idempotencyKey: uniqueKey('pp'), ...input })
    await expect(pay()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await prisma.portalScopeGrant.create({ data: { accountId: account.id, residentId: resident.id, scope: 'payments', authorityBasis: 'poa_financial', status: 'granted' } })
    await expect(pay()).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'mfa_required' } })
    await prisma.portalAccount.update({ where: { id: account.id }, data: { mfaEnrolled: true } })
    // Another resident's statement or saved card reads the same as none.
    await expect(pay({ statementId: other.statement.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(pay({ tokenId: other.token.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(pay({ amountMinor: 250_01n })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(portalPay(prisma as never, { userId: 'seed_user_holloway', kind: 'staff' }, { residentId: resident.id, statementId: statement.id, tokenId: token.id, idempotencyKey: 'x' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    fake.script('succeed')
    const key = uniqueKey('same')
    const paid = await pay({ amountMinor: 100_00n, idempotencyKey: key }) as any
    expect(paid.status).toBe('succeeded')
    const again = await pay({ amountMinor: 100_00n, idempotencyKey: key }) as any
    expect(again.paymentId).toBe(paid.paymentId)
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })).paidMinor).toBe(100_00n)
    expect(await prisma.phiReadAudit.count({ where: { purpose: 'family_access', actorKind: 'portal' } })).toBeGreaterThanOrEqual(1)
  }, 120_000)

  it('the GL export balances and needs billing access', async () => {
    const open = await prisma.billingPeriod.create({ data: { communityId: COMMUNITY.id, month: new Date('2026-09-01T00:00:00Z'), status: 'open', statementCount: 0 } })
    await prisma.charge.create({ data: { communityId: COMMUNITY.id, periodId: open.id, date: new Date('2026-09-01T00:00:00Z'), kind: 'rent', responsibility: 'resident', amountMinor: 500_000n, status: 'posted', description: 'Rent', payerKey: 'r', source: 'manual', residentId: (await newStatement(1n)).resident.id } })
    await expect(glExport(prisma as never, nurse.session, { communityId: COMMUNITY.id, month: '2026-09-01' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const out = await glExport(prisma as never, office.session, { communityId: COMMUNITY.id, month: '2026-09-01' })
    const rows = out.csv.trim().split('\r\n').slice(1).map(line => line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)!.map(cell => cell.replace(/,$/, '')))
    const sum = (col: number) => rows.reduce((s, r) => s + BigInt((r[col] || '0').replace('.', '')), 0n)
    expect(sum(3)).toBe(sum(4))
    expect(out.csv).toContain('4010')
    expect(await prisma.auditEvent.count({ where: { eventType: 'billing.gl_exported' } })).toBe(1)
  }, 120_000)

  it('a Medicaid application runs its clocks and its approved schedule feeds the liability, never edited', async () => {
    const { resident } = await newStatement(1n)
    const stay = await prisma.stay.create({ data: { reference: `P3BSTAY-${uniqueKey('s')}`, residentId: resident.id, communityId: COMMUNITY.id, setting: 'assisted_living', status: 'admitted', presence: 'in_house', admittedAt: new Date('2026-08-01T00:00:00Z') } })
    const app = await bc(office, 'medicaid_app.start', { stayId: stay.id, requestedFrom: '2026-09-01' })
    await expect(bc(office, 'medicaid_app.start', { stayId: stay.id, requestedFrom: '2026-09-01' })).rejects.toBeTruthy()
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'submit', on: '2026-09-03' })
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'info_request', on: '2026-09-20' })
    await expect(bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'approve', on: '2026-09-21' })).rejects.toBeTruthy()
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'info_response', on: '2026-09-25' })
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'deny', on: '2026-10-01' })
    await expect(bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'appeal', on: '2027-01-15' })).rejects.toMatchObject({ details: { reason: 'appeal_window_closed' } })
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'appeal', on: '2026-10-20' })
    await bc(office, 'medicaid_app.advance', { applicationId: app.applicationId, step: 'appeal_approved', on: '2026-11-01', effectiveOn: '2026-09-01' })
    expect((await prisma.medicaidApplication.findUniqueOrThrow({ where: { id: app.applicationId } })).status).toBe('approved')

    const first = await bc(office, 'liability_schedule.record', { residentId: resident.id, stayId: stay.id, applicationId: app.applicationId, monthlyAmountMinor: 120_000, personalNeedsAllowanceMinor: 5_000, effectiveFrom: '2026-09-01' })
    const second = await bc(office, 'liability_schedule.record', { residentId: resident.id, stayId: stay.id, applicationId: app.applicationId, monthlyAmountMinor: 135_000, personalNeedsAllowanceMinor: 5_000, effectiveFrom: '2026-11-01' })
    const rows = await prisma.patientLiabilitySchedule.findMany({ where: { residentId: resident.id }, orderBy: { effectiveFrom: 'asc' } })
    expect(rows.map(r => [r.id, r.monthlyAmountMinor, r.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([[first.scheduleId, 120_000n, '2026-10-31'], [second.scheduleId, 135_000n, null]])
    await expect(prisma.patientLiabilitySchedule.update({ where: { id: first.scheduleId }, data: { monthlyAmountMinor: 1n } })).rejects.toThrow()
    await expect(prisma.patientLiabilitySchedule.delete({ where: { id: first.scheduleId } })).rejects.toThrow()
  }, 120_000)

  it('trust: withdrawals need an authorisation, a large one needs a second approver; interest balances; statements, alerts and the bond', async () => {
    await prisma.operatorSettings.update({ where: { id: 1 }, data: { trustApprovalThresholdMinor: 50_000n } })
    const account = await prisma.trustAccount.create({ data: { communityId: COMMUNITY.id, name: 'Resident funds 3b', bankName: 'Ohio Valley Bank', last4: '1234', status: 'active' } })
    const ledgerFor = async () => {
      const { resident } = await newStatement(1n)
      const { ledgerId } = await bc(trustOfficer, 'trust.open_ledger', { communityId: COMMUNITY.id, residentId: resident.id, accountId: account.id, consentOnFile: true })
      return { ledgerId, residentId: resident.id }
    }
    const a = await ledgerFor()
    const b = await ledgerFor()
    await bc(trustOfficer, 'trust.deposit', { ledgerId: a.ledgerId, amountMinor: 190_000, purpose: 'Savings', effectiveOn: '2026-07-01' })
    await bc(trustOfficer, 'trust.deposit', { ledgerId: b.ledgerId, amountMinor: 10_000, purpose: 'Personal needs', effectiveOn: '2026-07-16' })

    // No written authorisation: no withdrawal.
    await expect(bc(trustOfficer, 'trust.withdraw', { ledgerId: a.ledgerId, amountMinor: 1_000, purpose: 'Salon', effectiveOn: '2026-08-02' })).rejects.toMatchObject({ details: { reason: 'no_authorisation' } })
    // Within the pack threshold ($500): active at once. Over it, or unlimited: waits for a different person.
    const small = await bc(trustOfficer, 'trust.authorisation_record', { ledgerId: a.ledgerId, signedOn: '2026-07-01', kinds: ['withdrawal_purchase'], perWithdrawalLimitMinor: 5_000 })
    expect(small.status).toBe('active')
    await expect(bc(trustOfficer, 'trust.withdraw', { ledgerId: a.ledgerId, amountMinor: 6_000, purpose: 'Glasses', effectiveOn: '2026-08-02' })).rejects.toMatchObject({ details: { reason: 'over_authorised_limit' } })
    const big = await bc(trustOfficer, 'trust.authorisation_record', { ledgerId: a.ledgerId, signedOn: '2026-07-02', kinds: ['withdrawal_purchase', 'withdrawal_cash'] })
    expect(big.status).toBe('pending_approval')
    await expect(approve(big.approvalRequestId, trustOfficer)).rejects.toMatchObject({ code: expect.stringMatching(/SELF_APPROVAL|NOT_AUTHORIZED/) })
    // The database refuses activating it without a second person's approval.
    await expect(prisma.trustAuthorisation.update({ where: { id: big.authorisationId }, data: { status: 'active' } })).rejects.toThrow()
    await approve(big.approvalRequestId, trustApprover)
    const auths = await prisma.trustAuthorisation.findMany({ where: { ledgerId: a.ledgerId }, orderBy: { createdAt: 'asc' } })
    expect(auths.map(x => x.status)).toEqual(['revoked', 'active'])
    const w = await bc(trustOfficer, 'trust.withdraw', { ledgerId: a.ledgerId, amountMinor: 6_000, purpose: 'Glasses', effectiveOn: '2026-08-02' })
    expect(w.status).toBe('posted')

    // Interest for July: by daily balance; balanced; once per month; not before the month ends.
    await expect(bc(trustOfficer, 'trust.allocate_interest', { accountId: account.id, month: '2099-01-01', interestMinor: 100 })).rejects.toMatchObject({ details: { reason: 'month_not_over' } })
    const run = await bc(trustOfficer, 'trust.allocate_interest', { accountId: account.id, month: '2026-07-01', interestMinor: 1_001 })
    const shares = run.allocations as { ledgerId: string; amountMinor: string }[]
    expect(shares.reduce((s, x) => s + BigInt(x.amountMinor), 0n)).toBe(1_001n)
    // a: 31 days × 190,000; b: 16 days × 10,000 → b gets 1001 × 160,000 / 6,050,000 ≈ 26.47 → 26 (largest remainder).
    expect(shares.find(x => x.ledgerId === b.ledgerId)?.amountMinor).toBe('26')
    await expect(bc(trustOfficer, 'trust.allocate_interest', { accountId: account.id, month: '2026-07-01', interestMinor: 1_001 })).rejects.toMatchObject({ details: { reason: 'already_allocated' } })
    const lines = await prisma.trustLedgerLine.findMany({ where: { accountId: account.id } })
    const net = (bucket: string) => lines.filter(l => l.bucket === bucket).reduce((s, l) => s + (l.side === 'credit' ? l.amountMinor : -l.amountMinor), 0n)
    expect(net('client_liability') + net('bank_control')).toBe(0n)

    // Quarterly statements: a button, idempotent, frozen.
    const q = await bc(trustOfficer, 'trust.quarterly_statements', { accountId: account.id, quarter: '2026-07-01' })
    expect(q).toMatchObject({ ledgers: 2, created: 2 })
    expect((await bc(trustOfficer, 'trust.quarterly_statements', { accountId: account.id, quarter: '2026-07-01' })).created).toBe(0)
    const stmt = await prisma.trustStatement.findFirstOrThrow({ where: { ledgerId: a.ledgerId } })
    expect(stmt.closingMinor).toBe(stmt.openingMinor! + stmt.inMinor! - stmt.outMinor!)
    expect(stmt.closingMinor).toBe(190_000n - 6_000n + BigInt(shares.find(x => x.ledgerId === a.ledgerId)!.amountMinor))
    await expect(prisma.trustStatement.update({ where: { id: stmt.id }, data: { closingMinor: 1n } })).rejects.toThrow()
    await expect(bc(trustOfficer, 'trust.quarterly_statements', { accountId: account.id, quarter: '2099-01-01' })).rejects.toMatchObject({ details: { reason: 'quarter_not_over' } })

    // Alerts: a is near the $2,000 limit but not on Medicaid, so no alert; the bond is missing until recorded.
    const today = '2026-11-12'
    const before = await trustAlerts(prisma as never, account.id, today)
    expect(before.alerts.find(x => x.ledgerId === a.ledgerId)?.state).toBe('not_medicaid')
    expect(before.bondStatus.state).toBe('missing')
    await expect(bc(trustOfficer, 'trust.record_bond', { accountId: account.id, carrier: 'Acme Surety', bondNumber: 'B-1', amountMinor: 500_000, effectiveFrom: '2026-01-01', expiresOn: '2027-01-01' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const bond1 = await bc(trustApprover, 'trust.record_bond', { accountId: account.id, carrier: 'Acme Surety', bondNumber: 'B-1', amountMinor: 500_000, effectiveFrom: '2026-01-01', expiresOn: '2027-01-01' })
    const bond2 = await bc(trustApprover, 'trust.record_bond', { accountId: account.id, carrier: 'Acme Surety', bondNumber: 'B-2', amountMinor: 600_000, effectiveFrom: '2027-01-01', expiresOn: '2028-01-01' })
    expect(bond2.replaces).toBe(bond1.bondId)
    expect((await trustAlerts(prisma as never, account.id, today)).bondStatus.state).toBe('ok')
  }, 180_000)
})
