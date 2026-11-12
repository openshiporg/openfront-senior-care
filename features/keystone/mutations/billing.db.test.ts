import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { verifyPeriod } from '../billing/period'
import { ROLES, COMMUNITY, FAMILY_NAMES, GIVEN_NAMES } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import { admitResidentMutation, correctCensus, signOffCensusDayMutation } from './census'
import { billingCommand } from './billing'
import '../lib/censusCorrection'

/**
 * Phase 3 exit gate (BUILD-PLAN §3), part 1 of 3 (payments.db.test.ts and trust.db.test.ts hold the rest):
 *  1. a month-end close for 48 AL apartments and 24 MC suites gives statements whose charges re-derive byte-identically;
 *  2. a back-dated room change after the statement gives superseding charges and an adjustment line, never edited history;
 * Every resident is invented.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const MONTH = '2026-10-01'
const LAST_DAY = '2026-10-31'

describe.skipIf(!hasTestDatabase)('billing, payments and trust (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, director: Ctx, office: Ctx, nurse: Ctx
  let studioStayId = ''
  let studioResidentId = ''
  let periodId = ''
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c) as Promise<any>
  const approve = async (requestId: string, c: Ctx = director) => decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, c)
  const statementOf = (residentId: string) => prisma.statement.findFirstOrThrow({ where: { periodId, residentId } })

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('refuses billing and trust actions to people without the permission, and to a connected app', async () => {
    await expect(bc(nurse, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(nurse, 'trust.deposit', { ledgerId: 'x', amountMinor: 5 })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const viaApp = { ...office, session: { ...(office.session as object), mcp: { clientId: 'client-x', scopes: [] } } }
    await expect(bc(viaApp, 'payment.record', { statementId: 'x', method: 'cash', amountMinor: 5 })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('publishes rates through a second approver, then closes October for 48 AL apartments and 24 MC suites', async () => {
    // Rates: one schedule per setting. A different person approves the publish.
    const al = await bc(admin, 'rate.create', { communityId: COMMUNITY.id, name: 'Assisted living 2026', setting: 'assisted_living', effectiveFrom: '2026-09-01' })
    const mc = await bc(admin, 'rate.create', { communityId: COMMUNITY.id, name: 'Memory care 2026', setting: 'memory_care', effectiveFrom: '2026-09-01' })
    const careAL = await prisma.careLevel.create({ data: { communityId: COMMUNITY.id, code: 'AL2', name: 'Level 2 assistance', setting: 'assisted_living', minPoints: 10, maxPoints: 19, status: 'active' } })
    const careMC = await prisma.careLevel.create({ data: { communityId: COMMUNITY.id, code: 'MC3', name: 'Memory care level 3', setting: 'memory_care', minPoints: 20, maxPoints: 40, status: 'active' } })
    const lines: [string, string, string | null, string | null, number][] = [
      [al.scheduleId, 'apartment_rent', 'seed_apt_studio', null, 450_000], [al.scheduleId, 'apartment_rent', 'seed_apt_one_bed', null, 560_000],
      [al.scheduleId, 'apartment_rent', 'seed_apt_companion', null, 620_000], [al.scheduleId, 'care_level', null, careAL.id, 135_000],
      [mc.scheduleId, 'apartment_rent', 'seed_apt_mc_suite', null, 520_000], [mc.scheduleId, 'care_level', null, careMC.id, 310_000],
    ]
    for (const [scheduleId, kind, apartmentTypeId, careLevelId, amountMinor] of lines) await bc(admin, 'rate.add_line', { scheduleId, kind, apartmentTypeId, careLevelId, amountMinor, per: 'month', proration: 'actual_days_in_month' })
    const askedPublish = await bc(admin, 'rate.request_publish', { scheduleId: al.scheduleId })
    await expect(approve(askedPublish.approvalRequestId, admin)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    expect((await approve(askedPublish.approvalRequestId)).status).toBe('approved')
    const askedMc = await bc(admin, 'rate.request_publish', { scheduleId: mc.scheduleId })
    await approve(askedMc.approvalRequestId)
    expect((await prisma.rateSchedule.findUniqueOrThrow({ where: { id: al.scheduleId } })).status).toBe('published')
    await expect(bc(admin, 'rate.add_line', { scheduleId: al.scheduleId, kind: 'apartment_rent', apartmentTypeId: 'seed_apt_studio', amountMinor: 1, per: 'month' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    // 48 assisted-living residents and 24 memory-care residents, admitted into the seeded apartments (a few mid-October).
    const spare = await prisma.apartment.create({ data: { id: 'seed_apartment_mea_49', unitId: 'seed_unit_meadow', number: 'A4-01', apartmentTypeId: 'seed_apt_one_bed', capacity: 1, allowsUnrelatedCompanion: false, status: 'available', occupantCount: 0 } })
    expect(spare.id).toBe('seed_apartment_mea_49')
    // The studio resident goes through the real admission command (the correction below needs a real projection); the other
    // 71 are written as the same census facts directly, because each admission is a long chain of round trips to a remote database.
    const stayTimes = (index: number) => (index % 9 === 4 ? '2026-10-12T15:00:00Z' : '2026-09-18T15:00:00Z')
    const real = await admitResidentMutation(null, {
      input: { communityId: COMMUNITY.id, apartmentId: 'seed_apartment_mea_2', payerId: 'seed_payer_private', admissionSource: 'home', effectiveAt: stayTimes(2), selfRepresented: true, resident: { firstName: 'Dorothy', lastName: 'Abbott', dateOfBirth: '1941-03-09', sex: 'female' } } as never,
      idempotencyKey: uniqueKey('adm-studio'),
    }, admin) as { stayId: string; residentId: string }
    const placed: { stayId: string; residentId: string; apartmentId: string }[] = [{ ...real, apartmentId: 'seed_apartment_mea_2' }]
    const rows: { n: number; unit: 'mea' | 'har'; index: number }[] = []
    for (let n = 1; n <= 48; n += 1) if (n !== 2) rows.push({ n, unit: 'mea', index: n })
    for (let n = 1; n <= 24; n += 1) rows.push({ n, unit: 'har', index: 100 + n })
    const resident = rows.map(r => ({ id: `t_res_${r.unit}_${r.n}`, reference: `TRES-${r.unit}-${r.n}`, communityId: COMMUNITY.id, firstName: GIVEN_NAMES[r.index % GIVEN_NAMES.length], lastName: FAMILY_NAMES[(r.index * 5 + 3) % FAMILY_NAMES.length], sex: r.index % 2 ? 'male' : 'female', status: 'current', synthetic: true }))
    await prisma.resident.createMany({ data: resident })
    await prisma.stay.createMany({ data: rows.map(r => ({ id: `t_stay_${r.unit}_${r.n}`, reference: `TSTY-${r.unit}-${r.n}`, residentId: `t_res_${r.unit}_${r.n}`, communityId: COMMUNITY.id, setting: r.unit === 'mea' ? 'assisted_living' : 'memory_care', status: 'admitted', presence: 'in_house', admittedAt: new Date(stayTimes(r.index)), currentApartmentId: `seed_apartment_${r.unit}_${r.n}`, initialPayerKind: 'private_pay', synthetic: true })) })
    await prisma.coveragePeriod.createMany({ data: rows.map(r => ({ id: `t_cov_${r.unit}_${r.n}`, stayId: `t_stay_${r.unit}_${r.n}`, payerId: 'seed_payer_private', rank: 'primary', startDate: new Date(stayTimes(r.index).slice(0, 10) + 'T00:00:00Z'), status: 'active' })) })
    await prisma.censusEvent.createMany({ data: rows.map(r => ({ stayId: `t_stay_${r.unit}_${r.n}`, seq: 1, kind: 'admission', effectiveAt: new Date(stayTimes(r.index)), toApartmentId: `seed_apartment_${r.unit}_${r.n}`, coverageId: `t_cov_${r.unit}_${r.n}`, idempotencyKey: `t_evt_${r.unit}_${r.n}`, prevHash: '0'.repeat(64), hash: createHash('sha256').update(`t_evt_${r.unit}_${r.n}`).digest('hex') })) })
    await prisma.careLevelAssignment.createMany({
      data: [{ r: { unit: 'mea', n: 2, index: 2 }, careLevelId: careAL.id, residentId: real.residentId, stayId: real.stayId }, ...rows.map(r => ({ r, careLevelId: r.unit === 'mea' ? careAL.id : careMC.id, residentId: `t_res_${r.unit}_${r.n}`, stayId: `t_stay_${r.unit}_${r.n}` }))]
        .map(x => ({ communityId: COMMUNITY.id, residentId: x.residentId, stayId: x.stayId, careLevelId: x.careLevelId, points: 15, effectiveFrom: new Date(stayTimes(x.r.index).slice(0, 10) + 'T00:00:00Z'), status: 'active' })),
    })
    for (const r of rows) placed.push({ stayId: `t_stay_${r.unit}_${r.n}`, residentId: `t_res_${r.unit}_${r.n}`, apartmentId: `seed_apartment_${r.unit}_${r.n}` })
    expect(placed).toHaveLength(72)
    const studio = placed.find(p => p.apartmentId === 'seed_apartment_mea_2')!
    studioStayId = studio.stayId
    studioResidentId = studio.residentId

    // Deriving is a staff button and can be run again and again with the same result.
    const first = await bc(office, 'billing.derive', { communityId: COMMUNITY.id, month: MONTH })
    const again = await bc(office, 'billing.derive', { communityId: COMMUNITY.id, month: MONTH })
    expect(again.hash).toBe(first.hash)
    expect(again).toMatchObject({ created: 0, superseded: 0 })
    expect(first.problems).toEqual([])

    // The month cannot close until the midnight census is signed off through its last day.
    await expect(bc(office, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: LAST_DAY, idempotencyKey: uniqueKey('so') }, admin)

    const closed = await bc(office, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })
    expect(closed).toMatchObject({ status: 'closed', alreadyClosed: false, statements: 72 })
    periodId = closed.periodId
    const replay = await bc(office, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })
    expect(replay).toMatchObject({ alreadyClosed: true, statements: 72, hash: closed.hash })
    expect(await prisma.statement.count({ where: { periodId } })).toBe(72)

    // Gate 1: re-deriving from the census gives byte-identical charges, and every statement is the sum of its charges.
    const verified = await verifyPeriod(prisma as never, periodId)
    expect(verified).toMatchObject({ hashMatches: true, linesMatch: true, statements: 72 })
    const charges = await prisma.charge.findMany({ where: { periodId } })
    expect(charges.every(c => c.status === 'posted')).toBe(true)
    const statements = await prisma.statement.findMany({ where: { periodId } })
    for (const statement of statements) {
      const total = charges.filter(c => c.residentId === statement.residentId).reduce((sum, c) => sum + c.amountMinor, 0n)
      expect(statement.totalMinor).toBe(total)
      expect(statement.paidMinor).toBe(0n)
      expect(statement.status).toBe('issued')
    }
    // A full-month studio resident pays the whole monthly rent plus care, to the cent.
    const studioStatement = statements.find(s => s.residentId === studioResidentId)!
    expect(studioStatement.totalMinor).toBe(450_000n + 135_000n)
  }, 600_000)

  it('gate 2: a back-dated room change after the statement supersedes charges and adds an adjustment, never editing history', async () => {
    const before = await statementOf(studioResidentId)
    const oldCharges = await prisma.charge.findMany({ where: { periodId, residentId: studioResidentId, kind: 'rent' } })
    const stay = await prisma.stay.findUniqueOrThrow({ where: { id: studioStayId } })
    const asked = await correctCensus(null, {
      input: { stayId: studioStayId, reason: 'Moved to the one-bedroom on the 15th; charted late', events: [{ kind: 'room_change', effectiveAt: '2026-10-15T14:00:00Z', toApartmentId: 'seed_apartment_mea_49' }], expectedStayVersion: stay.version } as never,
      idempotencyKey: uniqueKey('cc'),
    }, admin) as { status: string; approvalRequestId: string }
    expect(asked.status).toBe('approval_requested')
    await approve(asked.approvalRequestId)

    const adjusted = await bc(office, 'billing.adjust_closed', { communityId: COMMUNITY.id, month: MONTH })
    expect(adjusted.adjustments).toBe(1)
    expect(adjusted.superseded).toBeGreaterThan(0)

    // The old rows are kept exactly as posted, marked superseded and pointing at their replacement.
    const after = await prisma.charge.findMany({ where: { periodId, residentId: studioResidentId, kind: 'rent' } })
    const old = after.filter(c => c.status === 'superseded')
    expect(old.length).toBe(31)
    for (const row of old) {
      const original = oldCharges.find(c => c.id === row.id)!
      expect(row.amountMinor).toBe(original.amountMinor)
      expect(row.derivationHash).toBe(original.derivationHash)
      expect(row.supersededById).not.toBeNull()
    }
    const live = after.filter(c => c.status === 'posted')
    const delta = live.reduce((s, c) => s + c.amountMinor, 0n) - oldCharges.reduce((s, c) => s + c.amountMinor, 0n)
    expect(delta).toBeGreaterThan(0n)

    // The adjustment lands in November's open period; October's statement is untouched.
    const adjustment = await prisma.charge.findFirstOrThrow({ where: { residentId: studioResidentId, kind: 'adjustment' } })
    expect(adjustment.amountMinor).toBe(delta)
    expect(adjustment.status).toBe('open')
    expect(adjustment.periodId).not.toBe(periodId)
    expect(adjustment.adjustsChargeId).not.toBeNull()
    const statementAfter = await statementOf(studioResidentId)
    expect(statementAfter).toMatchObject({ totalMinor: before.totalMinor, chargeHash: before.chargeHash, status: 'issued' })
    expect(JSON.stringify(statementAfter.lines)).toBe(JSON.stringify(before.lines))

    // Running it again changes nothing.
    const twice = await bc(office, 'billing.adjust_closed', { communityId: COMMUNITY.id, month: MONTH })
    expect(twice).toMatchObject({ adjustments: 0, superseded: 0, created: 0 })
    expect(await prisma.charge.count({ where: { residentId: studioResidentId, kind: 'adjustment' } })).toBe(1)

    // History cannot be rewritten underneath: a posted amount cannot be edited or deleted.
    const posted = live[0]
    await expect(prisma.charge.update({ where: { id: posted.id }, data: { amountMinor: 1n } })).rejects.toThrow()
    await expect(prisma.charge.delete({ where: { id: posted.id } })).rejects.toThrow()
  }, 300_000)
})
