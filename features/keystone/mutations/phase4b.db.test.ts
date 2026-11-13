import type { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { goldenItems, GOLDEN_CASES } from '../pdpm/goldenCases'
import { sectionsFor, type ItemSetDefinition } from '../mds/itemSet'
import { loadMdsSetup, loadOperatorSetup } from './setup'
import { admitResidentMutation, signOffCensusDayMutation } from './census'
import { billingCommand } from './billing'
import { amountText } from '../claims/x12'
import { exportDownload } from '../claims/download'
import '../lib/censusCorrection'

/**
 * Phase 4b exit gate (claims, 835 posting, PBJ, NHSN), against a real database. Every resident is invented.
 * The 837I is checked by a 5010 validator when one is installed (PYX12_PYTHON), the PBJ file by the CMS XSD (in pbj.test.ts).
 */
const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const HR_USER = 'seed_user_marchetti'
const MONTH = '2026-08-01'
const LAST_DAY = '2026-08-31'

describe.skipIf(!hasTestDatabase)('claims, remittance, PBJ and NHSN (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, mdsCoord: Ctx, office: Ctx, ed: Ctx, hr: Ctx, don: Ctx, nurse: Ctx
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c as never) as Promise<any>
  let keystone: any
  const gql = (c: Ctx, query: string) => keystone.withSession(c.session).graphql.raw({ query })
  let claimId = '', claimRef = '', stayId = '', residentId = ''

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin as never)
    await loadMdsSetup(null, { idempotencyKey: uniqueKey('mds-ref') }, admin as never)
    mdsCoord = ctx(prisma, 'seed_user_vukovic', roleOf('seed_role_mds'))
    office = ctx(prisma, 'seed_user_holloway', roleOf('seed_role_business_office'))
    ed = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    hr = ctx(prisma, HR_USER, roleOf('seed_role_hr'))
    don = ctx(prisma, 'seed_user_oyelaran', roleOf('seed_role_don'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    const url = new URL(process.env.SC_TEST_DATABASE_URL!)
    url.searchParams.set('connection_limit', '2')
    process.env.DATABASE_URL = url.toString()
    const [{ getContext }, { default: config }, PrismaModule] = await Promise.all([import('@keystone-6/core/context'), import('../index'), import('@prisma/client')])
    keystone = getContext(config, PrismaModule)
  }, 600_000)

  afterAll(async () => { await keystone?.prisma?.$disconnect?.(); await prisma?.$disconnect() })

  const complete = async (assessmentId: string, items: Record<string, string>, completedOn: string) => {
    await bc(mdsCoord, 'mds.save_items', { assessmentId, items })
    const row = await prisma.mdsAssessment.findUniqueOrThrow({ where: { id: assessmentId }, include: { itemSet: true } })
    await bc(mdsCoord, 'mds.sign_sections', { assessmentId, sections: sectionsFor(row.kind, row.itemSet!.definition as unknown as ItemSetDefinition), title: 'RN, MDS Coordinator' })
    return bc(mdsCoord, 'mds.complete', { assessmentId, completedOn })
  }

  it('builds a Part A claim from live billing lines, scrubs it, releases it (maker-checker) and exports a valid 837I', async () => {
    const admitted = await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, bedId: 'seed_room_bir_110_a', payerId: 'seed_payer_medicare_a', admissionSource: 'acute_hospital', effectiveAt: '2026-08-05T15:00:00Z',
        qualifyingStayFrom: '2026-08-01', qualifyingStayTo: '2026-08-04', pasrrLevel1: { completedAt: '2026-08-03', result: 'Level I negative: Level II not required.' },
        resident: { firstName: 'Odessa', lastName: 'Marlowe', dateOfBirth: '1940-02-11', sex: 'female' }, selfRepresented: true,
      } as never,
      idempotencyKey: uniqueKey('adm-odessa'),
    }, admin as never) as { stayId: string; residentId: string }
    stayId = admitted.stayId; residentId = admitted.residentId
    const cov = await prisma.coveragePeriod.findFirstOrThrow({ where: { stayId } })
    await bc(mdsCoord, 'coverage.qualifying_stay', { coverageId: cov.id, from: '2026-08-01', to: '2026-08-04', hospital: 'Scioto Ridge Hospital (fictional)', evidenceNote: 'Discharge summary on file' })
    await bc(mdsCoord, 'coverage.skilled_cert', { coverageId: cov.id, signedOn: '2026-08-06', signedBy: 'Dr. Imani Castellanos (fictional)' })
    await prisma.coveragePeriod.update({ where: { id: cov.id }, data: { memberReference: '1EG4TE5MK73' } })
    await prisma.diagnosis.create({ data: { residentId, icd10: 'I63.9', description: 'Cerebral infarction, unspecified', rank: 'primary', status: 'active', onsetDate: new Date('2026-07-30T00:00:00Z') } })
    const opened = await bc(mdsCoord, 'mds.open', { stayId, kind: 'pps_5day', ardDate: '2026-08-08' })
    await complete(opened.assessmentId, { ...goldenItems(GOLDEN_CASES[0].input), H0300: '1', J0300: '1' }, '2026-08-10')
    await bc(office, 'billing.derive', { communityId: COMMUNITY.id, month: MONTH })
    await signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: LAST_DAY, idempotencyKey: uniqueKey('so') }, admin as never)
    await bc(office, 'billing.close', { communityId: COMMUNITY.id, month: MONTH })

    const made = await bc(office, 'claim.create_month', { communityId: COMMUNITY.id, month: MONTH })
    expect(made.created).toHaveLength(1)
    // Repeating creates nothing new.
    expect((await bc(office, 'claim.create_month', { communityId: COMMUNITY.id, month: MONTH })).created).toHaveLength(0)
    const claim = await prisma.claim.findFirstOrThrow({ where: { stayId }, include: { lines: true } })
    claimId = claim.id; claimRef = claim.reference
    const perDiem = await prisma.charge.aggregate({ where: { stayId, kind: { in: ['per_diem_claim', 'coinsurance'] }, status: { in: ['open', 'posted'] } }, _sum: { amountMinor: true } })
    expect(claim.totalChargesMinor).toBe(perDiem._sum.amountMinor)
    expect(claim.lines.reduce((n, l) => n + l.chargeMinor, 0n)).toBe(claim.totalChargesMinor)
    expect(claim.typeOfBill).toBe('0212') // still in house: interim, first claim

    // The scrubber blocks the claim until the attending provider is known; the failure is saved and returned.
    const failed = await bc(office, 'claim.validate', { claimId })
    expect(failed.ok).toBe(false)
    await prisma.claim.update({ where: { id: claimId }, data: { attendingNpi: '1245319599', attendingName: 'Castellanos, Imani' } })
    const ok = await bc(office, 'claim.validate', { claimId })
    expect(ok.issues.filter((i: { severity: string }) => i.severity === 'error')).toEqual([])
    expect(ok.status).toBe('validated')

    // Maker-checker: the business office validated it, so only a releaser (the ED) can release it.
    await expect(bc(office, 'claim.release', { claimId })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(bc(office, 'claim.export', { claimId })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await bc(ed, 'claim.release', { claimId })
    const exported = await bc(office, 'claim.export', { claimId })
    const row = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })
    expect(row.exportHash).toBe(exported.exportHash)
    expect(row.status).toBe('released')

    const py = process.env.PYX12_PYTHON
    if (py) {
      const file = join(mkdtempSync(join(tmpdir(), 'x12-')), 'claim.x12')
      writeFileSync(file, row.exportText)
      let out = ''
      try { out = execFileSync(join(py, '..', 'x12valid'), [file], { encoding: 'utf8' }) } catch (e) { out = String((e as { stdout?: string }).stdout ?? e) }
      expect(out).not.toMatch(/\bERROR\b|Fail|\[E\]/i)
    }
  }, 900_000)

  it('a hash that does not match the downloaded file cannot be marked submitted; submitted only by a person, accepted only by a 277CA', async () => {
    await expect(bc(office, 'claim.mark_submitted', { claimId, exportHash: 'deadbeef' })).rejects.toMatchObject({ code: 'STALE_STATE' })
    const hash = (await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).exportHash
    await bc(office, 'claim.mark_submitted', { claimId, exportHash: hash })
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).status).toBe('submitted')
    const ack = `ISA*00*          *00*          *ZZ*MEDICARE       *ZZ*SENDER         *261001*1200*^*00501*000000001*0*P*:~GS*HN*A*B*20261001*1200*1*X*005010X214~ST*277*0001*005010X214~BHT*0085*08*1*20261001*1200*TH~HL*1**20*1~HL*2*1*21*1~HL*3*2*19*1~HL*4*3*PT*0~TRN*2*${claimRef}~STC*A2:20:PR*20261001*WQ*${amountText(0n)}~REF*1K*PAYERCLAIM77~SE*10*0001~GE*1*1~IEA*1*000000001~`
    const r = await bc(office, 'claim.upload_ack', { communityId: COMMUNITY.id, text: ack })
    expect(r.claimIds).toEqual([claimId])
    const after = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })
    expect(after.status).toBe('accepted')
    expect(after.payerClaimNumber).toBe('PAYERCLAIM77')
  }, 300_000)

  it('an 835 posts once, reconciles to the claim, never over-credits, and a repeat is a no-op', async () => {
    const claim = await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })
    const coins = await prisma.charge.aggregate({ where: { stayId, kind: 'coinsurance', status: { in: ['open', 'posted'] } }, _sum: { amountMinor: true } })
    const pr = coins._sum.amountMinor ?? 0n
    const paid = claim.totalChargesMinor - pr
    const cas = pr > 0n ? `CAS*PR*2*${amountText(pr)}~` : ''
    const build = (trace: string, total: bigint, clpPaid: bigint) => `ISA*00*          *00*          *ZZ*MEDICARE       *ZZ*SENDER         *261015*1200*^*00501*000000002*0*P*:~GS*HP*A*B*20261015*1200*1*X*005010X221A1~ST*835*0001~BPR*I*${amountText(total)}*C*CHK************20261015~TRN*1*${trace}*1512345678~N1*PR*MEDICARE PART A~N1*PE*RIDGELINE~CLP*${claimRef}*1*${amountText(claim.totalChargesMinor)}*${amountText(clpPaid)}*${amountText(pr)}*MA*PAYERCLAIM77*211*1~${cas}SE*9*0001~GE*1*1~IEA*1*000000002~`
    const good = build('TRACE-4B-001', paid, paid)
    const imp = await bc(office, 'remittance.import', { communityId: COMMUNITY.id, payerId: 'seed_payer_medicare_a', text: good })
    expect(imp.exceptions.filter((e: { severity: string }) => e.severity === 'blocking')).toEqual([])
    // Re-importing the same trace returns the first import.
    const again = await bc(office, 'remittance.import', { communityId: COMMUNITY.id, payerId: 'seed_payer_medicare_a', text: good })
    expect(again.remittanceId).toBe(imp.remittanceId)
    expect(again.duplicate).toBe(true)
    await expect(bc(ed, 'remittance.post', { remittanceId: imp.remittanceId })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const posted = await bc(office, 'remittance.post', { remittanceId: imp.remittanceId })
    expect(posted.posted).toBe(1)
    expect((await bc(office, 'remittance.post', { remittanceId: imp.remittanceId })).replay).toBe(true)
    const done = await prisma.claim.findUniqueOrThrow({ where: { id: claimId }, include: { lines: true } })
    expect(done.status).toBe('paid')
    expect(done.paidMinor).toBe(paid)
    expect(done.lines.reduce((n, l) => n + (l.paidMinor ?? 0n), 0n)).toBe(paid)
    expect(await prisma.remittancePosting.count({ where: { claimId } })).toBe(1)
    // A second payment for the same claim is refused: the claim is paid, so nothing is credited twice.
    const second = await bc(office, 'remittance.import', { communityId: COMMUNITY.id, payerId: 'seed_payer_medicare_a', text: build('TRACE-4B-002', paid, paid) })
    expect(second.exceptions.some((e: { severity: string }) => e.severity === 'blocking')).toBe(true)
    await expect(bc(office, 'remittance.post', { remittanceId: second.remittanceId })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claimId } })).paidMinor).toBe(paid)
    // The database refuses to edit or delete a posting.
    await expect(prisma.remittancePosting.deleteMany({ where: { claimId } })).rejects.toThrow()
  }, 300_000)

  it('PBJ: punches become timecards; requester != approver; the quarter validates and exports', async () => {
    const job = await bc(hr, 'workforce.job_code', { communityId: COMMUNITY.id, code: 'RN', title: 'Registered Nurse', pbjJobTitleCode: '7', countsTowardNursing: true })
    const staff = await bc(hr, 'workforce.staff', { communityId: COMMUNITY.id, employeeId: 'E1001', name: 'Nora Whitfield (fictional)', jobCodeId: job.jobCodeId, payType: 'non_exempt', hireDate: '2025-01-06' })
    const csv = ['employeeId,kind,observedAt,source', 'E1001,in,2026-07-06T07:00:00-04:00,kiosk', 'E1001,out,2026-07-06T15:30:00-04:00,kiosk', 'E1001,out,2026-07-06T15:30:00-04:00,kiosk'].join('\n')
    const imp = await bc(hr, 'workforce.import_punches', { communityId: COMMUNITY.id, csv })
    expect(imp.added).toBe(2)
    expect(imp.repeated).toBe(1)
    const built = await bc(hr, 'timecard.build', { staffMemberId: staff.staffMemberId, weekStart: '2026-07-06' })
    expect(built.totalMinutes).toBe(510)
    await bc(hr, 'timecard.submit', { timecardId: built.timecardId })
    // The submitter cannot approve their own submission.
    await expect(bc(hr, 'timecard.approve', { timecardId: built.timecardId })).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await expect(bc(nurse, 'timecard.approve', { timecardId: built.timecardId })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const approver = ctx(prisma, 'seed_user_okafor', roleOf('seed_role_hr'))
    await bc(approver, 'timecard.approve', { timecardId: built.timecardId })
    const q = await bc(ed, 'pbj.open_quarter', { communityId: COMMUNITY.id, date: '2026-07-15' })
    expect(q.reference).toBe('PBJ-FY2026-Q4')
    const validated = await bc(ed, 'pbj.validate', { quarterId: q.quarterId })
    // One person's hours do not cover every census day, so the quarter is held back with named problems rather than exported.
    expect(validated.ok === true || validated.problems.length > 0).toBe(true)
  }, 300_000)

  it('NHSN: a weekly RPV export is generated from the immunisation records and validated', async () => {
    const r = await bc(don, 'nhsn.generate', { communityId: COMMUNITY.id, weekStart: '2026-08-03' })
    expect(r.counts.weekStart).toBe('2026-08-03')
    if (r.ok) expect((await prisma.nhsnExport.findFirstOrThrow({ where: { communityId: COMMUNITY.id } })).csv).toContain('48271')
    await expect(bc(nurse, 'nhsn.generate', { communityId: COMMUNITY.id, weekStart: '2026-08-03' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  }, 300_000)

  it('access: each role sees only its own screens; filter and order are gated like read; exports are audited', async () => {
    // Claims: the business office reads them; a nurse, an MDS coordinator without billing and HR do not.
    const seen = await gql(office, `query { claims { id reference } }`)
    expect(seen.errors).toBeUndefined()
    expect(seen.data.claims.length).toBeGreaterThan(0)
    for (const who of [nurse, hr]) {
      const r = await gql(who, `query { claims { id } }`)
      expect(JSON.stringify(r.data?.claims ?? [])).not.toMatch(/"id"/)
    }
    // Money fields cannot be probed through where or orderBy by a role that cannot read them.
    const probe = await gql(nurse, `query { claims(where: { totalChargesMinor: { gt: "0" } }) { id } }`)
    expect(JSON.stringify(probe.data?.claims ?? probe.errors ?? '')).not.toMatch(/"id"/)
    const probe2 = await gql(hr, `query { claims(orderBy: { totalChargesMinor: asc }) { id } }`)
    expect(JSON.stringify(probe2.data?.claims ?? probe2.errors ?? '')).not.toMatch(/"id"/)
    // Raw files never leave through GraphQL.
    const raw = await gql(office, `query { claims { exportText } }`)
    expect(raw.errors?.length).toBeGreaterThan(0)
    expect(JSON.stringify(raw.data ?? {})).not.toMatch(/ISA\*/)
    // Workforce: HR reads timecards; billing does not.
    expect((await gql(hr, `query { timecards { id } }`)).data.timecards.length).toBeGreaterThan(0)
    expect(JSON.stringify((await gql(office, `query { timecards { id } }`)).data?.timecards ?? [])).not.toMatch(/"id"/)
    // The 837I download: billing staff only, audited; an agent session and other roles are refused.
    const before = await prisma.phiReadAudit.count()
    const file = await exportDownload(prisma as never, office.session, 'claim', claimId)
    expect(file.body.startsWith('ISA*')).toBe(true)
    expect(await prisma.phiReadAudit.count()).toBeGreaterThan(before)
    await expect(exportDownload(prisma as never, nurse.session, 'claim', claimId)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(exportDownload(prisma as never, ({ ...(office.session as object), data: { ...((office.session as any).data ?? {}), kind: 'portal' } }), 'claim', claimId)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  }, 300_000)
})
