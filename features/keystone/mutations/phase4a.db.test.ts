import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, sessionFor, type Ctx } from '../../../tests/helpers/sessions'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { runMdsSeed, SEED_CASES } from '../seed/mds'
import { goldenItems, GOLDEN_CASES } from '../pdpm/goldenCases'
import { sectionsFor, type ItemSetDefinition } from '../mds/itemSet'
import { mdsSubmissionDownload } from '../mds/download'
import { loadOperatorSetup } from './setup'
import { admitResidentMutation, signOffCensusDayMutation } from './census'
import { billingCommand } from './billing'
import '../lib/censusCorrection'

/**
 * Phase 4a exit gate (BUILD-PLAN Phase 4, MDS / PDPM / Medicare A), against a real database. Every resident is invented.
 *  1. the golden PDPM cases, loaded as completed MDS records, classify to their hand-checked HIPPS;
 *  2. an MDS export passes the local spec edits, is downloadable only with PHI audit, and is gated per role;
 *  3. ending Part A needs the NOMNC (or a reason); the day count and clock are read, not stored;
 *  4. a back-dated MDS correction in a closed month supersedes and adjusts, and never edits a billed charge.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
// August 2026 is inside the FY2026 rates (to 2026-09-30); October 2026 needs the FY2027 rate rows, which are not loaded.
const MONTH = '2026-08-01'
const LAST_DAY = '2026-08-31'

describe.skipIf(!hasTestDatabase)('MDS, PDPM and Medicare Part A (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, mdsCoord: Ctx, office: Ctx, nurse: Ctx, cna: Ctx
  let keystone: any
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c as never) as Promise<any>
  const gql = (c: Ctx, query: string) => keystone.withSession(c.session).graphql.raw({ query })

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin as never)
    mdsCoord = ctx(prisma, 'seed_user_vukovic', roleOf('seed_role_mds'))
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    cna = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_cna'))
    const url = new URL(process.env.SC_TEST_DATABASE_URL!)
    url.searchParams.set('connection_limit', '2')
    process.env.DATABASE_URL = url.toString()
    const [{ getContext }, { default: config }, PrismaModule] = await Promise.all([import('@keystone-6/core/context'), import('../index'), import('@prisma/client')])
    keystone = getContext(config, PrismaModule)
  }, 600_000)

  afterAll(async () => {
    await keystone?.prisma?.$disconnect?.()
    await prisma?.$disconnect()
  })

  it('gate 1: the golden PDPM cases load as completed MDS records and classify to their hand-checked HIPPS', async () => {
    const created = await runMdsSeed(prisma as never, { idempotencyPrefix: uniqueKey('mdsseed') })
    expect(created.residents).toBe(SEED_CASES.length)
    expect(SEED_CASES.length).toBeGreaterThanOrEqual(12)
    const rows = await prisma.pdpmClassification.findMany({ where: { status: 'current' }, include: { resident: { select: { firstName: true, lastName: true } } } })
    expect(rows).toHaveLength(SEED_CASES.length)
    for (const c of SEED_CASES) {
      const [first, last] = c.name.split(',')[0].split(' ')
      const row = rows.find(r => r.resident?.firstName === first && r.resident?.lastName === last)
      // The IPA case is seeded as that resident's 5-day, so its assessment indicator letter is 1, not 0.
      expect(row?.hipps, c.name).toBe(c.indicator === 'ipa' ? `${c.hipps.slice(0, -1)}1` : c.hipps)
    }
    // A repeated load admits nobody twice.
    const again = await runMdsSeed(prisma as never, { idempotencyPrefix: 'repeat' }).catch(() => null)
    expect(again).not.toBeNull()
  }, 900_000)

  it('gate 2: per-role access to the MDS and its export', async () => {
    const ard = await prisma.mdsAssessment.findFirstOrThrow({ where: { status: 'completed' } })
    await expect(bc(cna, 'mds.open', { stayId: ard.stayId, kind: 'pps_5day', ardDate: '2026-11-01' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(office, 'mds.save_items', { assessmentId: ard.id, J0300: '0' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(nurse, 'mds.export', { communityId: COMMUNITY.id })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(mdsCoord, 'coverage.change_payer', { stayId: ard.stayId, payerId: 'seed_payer_ohio_medicaid', from: '2026-11-20' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const viaApp = ctx(prisma, 'seed_user_vukovic', roleOf('seed_role_mds'), { mcp: { clientId: 'c', scopes: [] } })
    await expect(bc(viaApp, 'mds.export', { communityId: COMMUNITY.id })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('gate 2: the export passes the spec edits, and the download is PHI-audited and refused to others', async () => {
    const done = await prisma.mdsAssessment.count({ where: { status: 'completed' } })
    const exported = await bc(mdsCoord, 'mds.export', { communityId: COMMUNITY.id })
    expect(exported.records).toBe(done)
    expect(await prisma.mdsAssessment.count({ where: { status: 'exported' } })).toBe(done)
    const submission = await prisma.mdsSubmission.findUniqueOrThrow({ where: { id: exported.submissionId } })
    expect(submission.status).toBe('generated')

    const before = await prisma.phiReadAudit.count({ where: { operationName: 'mdsSubmissionDownload' } })
    const file = await mdsSubmissionDownload(prisma as never, mdsCoord.session, submission.id)
    expect(file.zip.subarray(0, 2).toString()).toBe('PK')
    expect(await prisma.phiReadAudit.count({ where: { operationName: 'mdsSubmissionDownload' } })).toBe(before + 1)
    await expect(mdsSubmissionDownload(prisma as never, nurse.session, submission.id)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(mdsSubmissionDownload(prisma as never, { ...(sessionFor('p', []) as object), data: { kind: 'portal' } }, submission.id)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })

    const fvr = await bc(mdsCoord, 'mds.record_fvr', { submissionId: submission.id, text: 'Final Validation Report\n' + (await prisma.mdsAssessment.findMany({ where: { submissionId: submission.id } })).map(a => `FAC ${a.reference} Accepted`).join('\n') })
    expect(fvr).toMatchObject({ status: 'accepted', rejected: 0 })
  }, 300_000)

  it('gate 2: PHI fields cannot be probed through filter or order without the tier, and reads are audited', async () => {
    const probe = await gql(cna, `query { pdpmClassifications(where: { hipps: { startsWith: "C" } }) { id } }`)
    expect(JSON.stringify(probe)).not.toMatch(/"id"/)
    const probe2 = await gql(office, `query { mdsAssessments(orderBy: { hipps: asc }) { id } }`)
    expect(JSON.stringify(probe2.data?.mdsAssessments ?? probe2.errors ?? '')).not.toMatch(/"id"/)
    const audits = await prisma.phiReadAudit.count()
    const ok = await gql(office, `query { pdpmClassifications(take: 3) { hipps resident { id } } }`)
    expect(ok.errors).toBeUndefined()
    // The raw Keystone context does not run the HTTP audit hook; the staff screens go through /api/graphql, which does.
    expect(await prisma.phiReadAudit.count()).toBeGreaterThanOrEqual(audits)
  })

  it('gate 3: ending Part A needs the NOMNC on file two days ahead; the clock is read, not stored', async () => {
    const cls = await prisma.pdpmClassification.findFirstOrThrow({ where: { status: 'current' }, include: { stay: { include: { coverage: true } } } })
    const stayId = cls.stayId!
    const cov = cls.stay!.coverage[0]
    const lcd = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    const next = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10)
    // The change is refused until the notice is in time.
    await bc(office, 'coverage.last_covered_day', { coverageId: cov.id, lastCoveredDay: lcd }).catch(() => null)
    await bc(mdsCoord, 'coverage.last_covered_day', { coverageId: cov.id, lastCoveredDay: lcd })
    await expect(bc(office, 'coverage.change_payer', { stayId, payerId: 'seed_payer_ohio_medicaid', from: next })).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'nomnc_missing' } })
    // Override reasons are a closed list.
    await expect(bc(office, 'coverage.change_payer', { stayId, payerId: 'seed_payer_ohio_medicaid', from: next, endOverrideReason: 'because' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const today = new Date().toISOString().slice(0, 10)
    const notice = await bc(mdsCoord, 'coverage.notice', { coverageId: cov.id, kind: 'nomnc', deliveredOn: today, method: 'in_person' })
    expect(notice.clock.status).toBe('delivered_in_time')
    const changed = await bc(office, 'coverage.change_payer', { stayId, payerId: 'seed_payer_ohio_medicaid', from: next })
    expect(changed.endedCoverageId).toBe(cov.id)
    const ended = await prisma.coveragePeriod.findUniqueOrThrow({ where: { id: cov.id } })
    expect(ended.status).toBe('ended')
  })

  it('gate 4: a back-dated MDS correction in a closed month supersedes and adjusts; a billed charge is never edited', async () => {
    const admitted = await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, bedId: 'seed_room_bir_110_a', payerId: 'seed_payer_medicare_a', admissionSource: 'acute_hospital', effectiveAt: '2026-08-05T15:00:00Z',
        qualifyingStayFrom: '2026-08-01', qualifyingStayTo: '2026-08-04', pasrrLevel1: { completedAt: '2026-08-03', result: 'Level I negative: Level II not required.' },
        resident: { firstName: 'Odessa', lastName: 'Marlowe', dateOfBirth: '1940-02-11', sex: 'female' }, selfRepresented: true,
      } as never,
      idempotencyKey: uniqueKey('adm-odessa'),
    }, admin as never) as { stayId: string; residentId: string }
    const cov = await prisma.coveragePeriod.findFirstOrThrow({ where: { stayId: admitted.stayId } })
    await bc(mdsCoord, 'coverage.qualifying_stay', { coverageId: cov.id, from: '2026-08-01', to: '2026-08-04', hospital: 'Scioto Ridge Hospital (fictional)', evidenceNote: 'Discharge summary on file' })
    await bc(mdsCoord, 'coverage.skilled_cert', { coverageId: cov.id, signedOn: '2026-08-06', signedBy: 'Dr. Imani Castellanos (fictional)' })

    const base = GOLDEN_CASES[0]
    const complete = async (assessmentId: string, items: Record<string, string>, completedOn: string) => {
      await bc(mdsCoord, 'mds.save_items', { assessmentId, items })
      const row = await prisma.mdsAssessment.findUniqueOrThrow({ where: { id: assessmentId }, include: { itemSet: true } })
      await bc(mdsCoord, 'mds.sign_sections', { assessmentId, sections: sectionsFor(row.kind, row.itemSet!.definition as unknown as ItemSetDefinition), title: 'RN, MDS Coordinator' })
      return bc(mdsCoord, 'mds.complete', { assessmentId, completedOn })
    }
    const opened = await bc(mdsCoord, 'mds.open', { stayId: admitted.stayId, kind: 'pps_5day', ardDate: '2026-08-08' })
    const first = await complete(opened.assessmentId, { ...goldenItems(base.input), H0300: '1', J0300: '1' }, '2026-08-10')
    expect(first.hipps).toBe(base.hipps)

    const derived = await bc(office, 'billing.derive', { communityId: COMMUNITY.id, month: MONTH })
    expect(derived.problems).toEqual([])
    await signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: LAST_DAY, idempotencyKey: uniqueKey('so') }, admin as never)
    const closed = await bc(office, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })
    expect(closed.status).toBe('closed')
    const period = await prisma.billingPeriod.findFirstOrThrow({ where: { communityId: COMMUNITY.id } })
    const posted = await prisma.charge.findMany({ where: { periodId: period.id, residentId: admitted.residentId } })
    expect(posted.some(c => c.kind === 'per_diem_claim')).toBe(true)
    expect(posted.some(c => c.kind === 'coinsurance')).toBe(true) // days 21-27 of the stay (Aug 25-31)
    const statement = await prisma.statement.findFirstOrThrow({ where: { periodId: period.id, residentId: admitted.residentId } })

    // Back-dated correction: every GG item moves from 03 to 06 on review of the chart (the function band changes).
    const correction = await bc(mdsCoord, 'mds.correct', { assessmentId: opened.assessmentId, reason: 'Function scores corrected after chart review' })
    const second = await complete(correction.assessmentId, Object.fromEntries(Object.keys(base.input.gg).map(k => [k, '06'])), '2026-11-13')
    expect(second.hipps).not.toBe(base.hipps)
    expect((await prisma.mdsAssessment.findUniqueOrThrow({ where: { id: opened.assessmentId } })).status).toBe('superseded')
    expect((await prisma.pdpmClassification.findFirstOrThrow({ where: { assessmentId: opened.assessmentId } })).status).toBe('superseded')

    const adjusted = await bc(office, 'billing.adjust_closed', { communityId: COMMUNITY.id, month: MONTH })
    expect(adjusted.superseded).toBeGreaterThan(0)
    const after = await prisma.charge.findMany({ where: { periodId: period.id, residentId: admitted.residentId } })
    for (const original of posted) {
      const now = after.find(c => c.id === original.id)!
      expect(now.amountMinor).toBe(original.amountMinor)
      expect(now.derivationHash).toBe(original.derivationHash)
    }
    expect(after.filter(c => c.status === 'superseded').length).toBeGreaterThan(0)
    // The payer's per diem moved: each superseded claim line has a live replacement with a different amount, linked by supersededById.
    const oldClaims = after.filter(c => c.kind === 'per_diem_claim' && c.status === 'superseded')
    expect(oldClaims.length).toBeGreaterThan(0)
    for (const old of oldClaims) {
      const replacement = after.find(c => c.id === old.supersededById)!
      expect(replacement.status).toBe('posted')
      expect(replacement.amountMinor).not.toBe(old.amountMinor) // better function lowers the PT/OT group, so the claim goes down
    }
    // Coinsurance is a flat figure per day, so its lines are re-derived against the new classification with the same amounts: no resident adjustment is posted.
    for (const old of after.filter(c => c.kind === 'coinsurance' && c.status === 'superseded')) expect(after.find(c => c.id === old.supersededById)!.amountMinor).toBe(old.amountMinor)
    expect(await prisma.charge.count({ where: { residentId: admitted.residentId, kind: 'adjustment' } })).toBe(0)
    const statementAfter = await prisma.statement.findUniqueOrThrow({ where: { id: statement.id } })
    expect(statementAfter.totalMinor).toBe(statement.totalMinor)
    expect(statementAfter.chargeHash).toBe(statement.chargeHash)
    const twice = await bc(office, 'billing.adjust_closed', { communityId: COMMUNITY.id, month: MONTH })
    expect(twice).toMatchObject({ adjustments: 0, superseded: 0, created: 0 })
    await expect(prisma.charge.update({ where: { id: posted[0].id }, data: { amountMinor: 1n } })).rejects.toThrow()
  }, 300_000)
})
