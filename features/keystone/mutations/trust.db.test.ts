import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import { billingCommand } from './billing'

/**
 * Phase 3 exit gate (BUILD-PLAN §3), part 3 of 3: gate 4, a trust withdrawal over the threshold needs a second approver and the
 * preparer is never the signer; plus reversal, reconciliation and the 30-day conveyance. Gate 3 (the properties) is trust/ledger.test.ts.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const MONTH = '2026-10-01'

describe.skipIf(!hasTestDatabase)('resident trust (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, director: Ctx, trustOfficer: Ctx, trustApprover: Ctx, both: Ctx, nurse: Ctx
  let resident: { id: string }
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c) as Promise<any>
  const approve = async (requestId: string, c: Ctx = director) => decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, c)

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    trustOfficer = ctx(prisma, 'seed_user_almeida', roleOf('seed_role_trust_officer'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    const person = async (name: string, perms: Permission[]) => {
      const user = await prisma.user.create({ data: { name, email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60) } })
      await prisma.staffAssignment.create({ data: { userId: user.id, communityId: COMMUNITY.id, status: 'active' } })
      return ctx(prisma, user.id, perms)
    }
    trustApprover = await person('Approver', roleOf('seed_role_trust_approver'))
    both = await person('Both', [...roleOf('seed_role_trust_officer'), ...roleOf('seed_role_trust_approver')])
    resident = await prisma.resident.create({ data: { reference: 'TRUSTRES-1', communityId: COMMUNITY.id, firstName: 'Evelyn', lastName: 'Castillo', status: 'current', synthetic: true } })
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('keeps trust to the people who hold it', async () => {
    await expect(bc(nurse, 'trust.deposit', { ledgerId: 'x', amountMinor: 5 })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(trustOfficer, 'trust.sign', { transactionId: 'x' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('gate 4: a trust withdrawal over the threshold needs a second approver and the preparer is never the signer', async () => {
    await prisma.operatorSettings.update({ where: { id: 1 }, data: { trustApprovalThresholdMinor: 50_000n } })
    const account = await prisma.trustAccount.create({ data: { communityId: COMMUNITY.id, name: 'Resident funds', bankName: 'Ohio Valley Bank', last4: '7712', status: 'active' } })
    const residentId = resident.id
    await expect(bc(trustOfficer, 'trust.open_ledger', { communityId: COMMUNITY.id, residentId, accountId: account.id, consentOnFile: false })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const { ledgerId } = await bc(trustOfficer, 'trust.open_ledger', { communityId: COMMUNITY.id, residentId, accountId: account.id, consentOnFile: true })
    await bc(trustOfficer, 'trust.deposit', { ledgerId, amountMinor: 300_000, purpose: 'Personal needs deposit', effectiveOn: '2026-10-05' })

    // Under the threshold: the preparer posts it.
    const small = await bc(trustOfficer, 'trust.withdraw', { ledgerId, amountMinor: 20_000, purpose: 'Hair salon', effectiveOn: '2026-10-20' })
    expect(small.status).toBe('posted')

    // Over it: held until a different person with trust approval signs.
    const large = await bc(both, 'trust.withdraw', { ledgerId, amountMinor: 100_000, purpose: 'Hearing aids', effectiveOn: '2026-10-21' })
    expect(large).toMatchObject({ status: 'pending_signature' })
    await expect(bc(both, 'trust.sign', { transactionId: large.transactionId })).rejects.toMatchObject({ code: expect.stringMatching(/SELF_APPROVAL|APPROVAL_REQUIRED/) })
    await expect(approve(large.approvalRequestId, both)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await expect(bc(trustOfficer, 'trust.sign', { transactionId: large.transactionId })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(trustApprover, 'trust.sign', { transactionId: large.transactionId })).rejects.toBeTruthy()
    await approve(large.approvalRequestId, trustApprover)
    const signed = await bc(trustApprover, 'trust.sign', { transactionId: large.transactionId })
    expect(signed.status).toBe('posted')
    const row = await prisma.trustTransaction.findUniqueOrThrow({ where: { id: large.transactionId } })
    expect(row.signedById).not.toBe(row.preparedById)
    await expect(bc(trustApprover, 'trust.sign', { transactionId: large.transactionId })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })

    // The database itself refuses a signer who is the preparer.
    const pending = await bc(both, 'trust.withdraw', { ledgerId, amountMinor: 60_000, purpose: 'Winter coat', effectiveOn: '2026-10-22' })
    await expect(prisma.trustTransaction.update({ where: { id: pending.transactionId }, data: { signedById: row.preparedById === null ? undefined : (await prisma.trustTransaction.findUniqueOrThrow({ where: { id: pending.transactionId } })).preparedById } })).rejects.toThrow()
    await bc(trustApprover, 'trust.reject', { transactionId: pending.transactionId, reason: 'Resident declined the purchase' })

    // No negative balance, today or at any past date: a back-dated withdrawal before the deposit is refused, as is overdrawing.
    await expect(bc(trustOfficer, 'trust.withdraw', { ledgerId, amountMinor: 10_000, purpose: 'Back-dated', effectiveOn: '2026-10-01' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(bc(trustOfficer, 'trust.withdraw', { ledgerId, amountMinor: 900_000, purpose: 'Too much' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    // A correction is a new reversing transaction; the original lines are untouched.
    const originalLines = await prisma.trustLedgerLine.findMany({ where: { transactionId: small.transactionId } })
    const reversed = await bc(trustOfficer, 'trust.reverse', { transactionId: small.transactionId, reason: 'Salon visit was cancelled' })
    expect(reversed.reverses).toBe(small.transactionId)
    expect(await prisma.trustLedgerLine.findMany({ where: { transactionId: small.transactionId } })).toEqual(originalLines)
    await expect(bc(trustOfficer, 'trust.reverse', { transactionId: small.transactionId, reason: 'Again' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(prisma.trustLedgerLine.update({ where: { id: originalLines[0].id }, data: { amountMinor: 1n } })).rejects.toThrow()
    await expect(prisma.trustLedgerLine.delete({ where: { id: originalLines[0].id } })).rejects.toThrow()
    // A line added to a posted transaction would unbalance it, so the commit is refused.
    await expect(prisma.trustLedgerLine.create({ data: { communityId: COMMUNITY.id, residentId, transactionId: small.transactionId, ledgerId, accountId: account.id, bucket: 'suspense', side: 'debit', amountMinor: 5n, effectiveOn: new Date('2026-10-20T00:00:00Z') } })).rejects.toThrow()

    // October ends at 300,000 - 20,000 - 100,000 = 180,000 (the reversal is dated today, in November). The three-way reconciliation ties only on the exact figure.
    const off = await bc(trustOfficer, 'trust.reconcile', { accountId: account.id, month: MONTH, bankBalanceMinor: 179_999 })
    expect(off.tied).toBe(false)
    await expect(bc(trustApprover, 'trust.sign_reconciliation', { reconciliationId: off.reconciliationId })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const tied = await bc(trustOfficer, 'trust.reconcile', { accountId: account.id, month: MONTH, bankBalanceMinor: 180_000 })
    expect(tied).toMatchObject({ tied: true, differenceMinor: '0', bookBalanceMinor: '180000', residentTotalMinor: '180000' })
    await expect(bc(both, 'trust.sign_reconciliation', { reconciliationId: tied.reconciliationId })).resolves.toMatchObject({ status: 'signed' })

    // Closing the ledger starts a 30-day clock that is computed, not scheduled; the balance leaves through the same signature.
    // The reversal restored the 20,000, so the whole 200,000 is still held when the resident leaves.
    const closedLedger = await bc(trustOfficer, 'trust.close_ledger', { ledgerId, reason: 'discharge', closedOn: '2026-10-25' })
    expect(closedLedger.dueBy).toBe('2026-11-24')
    const conveyance = await bc(trustOfficer, 'trust.convey', { ledgerId, conveyedTo: 'the resident\'s daughter and agent' })
    expect(conveyance.status).toBe('pending_signature')
    await approve(conveyance.approvalRequestId, trustApprover)
    await bc(trustApprover, 'trust.sign', { transactionId: conveyance.transactionId })
    expect((await prisma.residentTrustLedger.findUniqueOrThrow({ where: { id: ledgerId } })).status).toBe('conveyed')
    const lines = await prisma.trustLedgerLine.findMany({ where: { accountId: account.id } })
    const net = (bucket: string, credit: boolean) => lines.filter(l => l.bucket === bucket && (l.side === 'credit') === credit).reduce((s, l) => s + l.amountMinor, 0n)
    expect(net('client_liability', true) - net('client_liability', false)).toBe(0n)
    expect(net('bank_control', false) - net('bank_control', true)).toBe(0n)
  }, 300_000)
})
