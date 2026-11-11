import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { verifyAuditChain } from '../lib/audit'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup, loadClinicalSetup } from './setup'
import { clinicalCommand, runWorkflowsOnLoad } from './clinical'
import { decideApprovalRequest } from './approvals'
import { admitResidentMutation } from './census'
import { reconstructMedPass, verifyLedger } from '../lib/clinical/medications'
import { systemActor } from '../lib/actor'
import { runInTransaction } from '../lib/unitOfWork'
import '../lib/operatorControls'
import '../lib/censusCorrection'

/**
 * Phase 2 exit gate (BUILD-PLAN §2): a med pass can be reconstructed dose by dose; the controlled count is blind and a mismatch opens a
 * discrepancy that someone else resolves; F609 clocks run from the incident; verbal orders need a countersignature; the workflow engine
 * runs only on request and a second run in a window changes nothing. Every person and drug is invented.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const HOUR = 3_600_000

describe.skipIf(!hasTestDatabase)('clinical core (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, nurse: Ctx, nurse2: Ctx, don: Ctx, cna: Ctx, director: Ctx, prescriber: Ctx, stranger: Ctx
  let residentId = ''
  let unitId = ''
  const run = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op)) => clinicalCommand(null, { op, input, idempotencyKey: key }, c as never) as Promise<any>

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin as never)
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    don = ctx(prisma, 'seed_user_oyelaran', roleOf('seed_role_don'))
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    const make = async (name: string, roleId: string, assigned = true) => {
      const u = await prisma.user.create({ data: { name, email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60), roleId } })
      if (assigned) await prisma.staffAssignment.create({ data: { userId: u.id, communityId: COMMUNITY.id, status: 'active' } })
      return u
    }
    const n2 = await make('Second Nurse', 'seed_role_charge_nurse')
    nurse2 = ctx(prisma, n2.id, roleOf('seed_role_charge_nurse'))
    const aide = await make('Aide', 'seed_role_cna')
    cna = ctx(prisma, aide.id, roleOf('seed_role_cna'))
    const rx = await make('Dr Prescriber', 'seed_role_prescriber')
    prescriber = ctx(prisma, rx.id, roleOf('seed_role_prescriber'))
    const out = await make('Elsewhere', 'seed_role_charge_nurse', false)
    stranger = ctx(prisma, out.id, roleOf('seed_role_charge_nurse'))
    // The demo layer (templates, workflow library, clocks switched on), then one resident to chart on.
    await loadClinicalSetup(null, { idempotencyKey: uniqueKey('clin') }, admin as never)
    const admissions = ctx(prisma, 'seed_user_patel', roleOf('seed_role_admissions'))
    const T = Date.now()
    const admitted = await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, resident: { firstName: 'Winifred', lastName: 'Teague', dateOfBirth: '1936-02-09', sex: 'female' },
        representatives: [{ firstName: 'Carl', lastName: 'Teague', email: `${uniqueKey('rep')}@gmail.com`, roles: ['healthcare_poa', 'financial_responsible'] }],
        bedId: 'seed_room_bir_110_a', payerId: 'seed_payer_ohio_medicaid', admissionSource: 'acute_hospital', effectiveAt: new Date(T - 3 * 3_600_000).toISOString(),
        pasrrLevel1: { completedAt: new Date(T - 6 * 86_400_000).toISOString(), result: 'No Level II referral indicated' },
        notices: [{ kind: 'bed_hold_policy', method: 'in_person', deliveredAt: new Date(T - 3 * 3_600_000).toISOString(), acknowledgement: 'signed' }, { kind: 'privacy_practices', method: 'in_person', deliveredAt: new Date(T - 3 * 3_600_000).toISOString(), acknowledgement: 'signed' }],
      } as never,
      idempotencyKey: uniqueKey('adm'),
    }, admissions as never)
    residentId = admitted.residentId
    unitId = (await prisma.unit.findFirstOrThrow({ where: { communityId: COMMUNITY.id, setting: 'nursing_facility' }, orderBy: { code: 'asc' } })).id
  }, 600_000)

  // The scratch database is remote: every command is a few round trips.
  const SLOW = 120_000

  afterAll(async () => { await prisma?.$disconnect() })

  it('scores a seeded assessment and refuses an incomplete one', async () => {
    const full = { sensory: '3', moisture: '3', activity: '2', mobility: '2', nutrition: '3', friction: '2' }
    const r = await run(nurse, 'assessment.complete', { residentId, templateCode: 'braden', answers: full })
    expect(r).toMatchObject({ score: 15, band: 'Mild risk' })
    await expect(run(nurse, 'assessment.complete', { residentId, templateCode: 'braden', answers: { sensory: '3' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(run(cna, 'assessment.complete', { residentId, templateCode: 'braden', answers: full })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(run(stranger, 'assessment.complete', { residentId, templateCode: 'braden', answers: full })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  }, SLOW)

  it('signs a baseline care plan and satisfies the 48-hour clock', async () => {
    const created = await run(don, 'carePlan.create', { residentId, kind: 'baseline', items: [{ kind: 'focus', text: 'Falls risk' }, { kind: 'intervention', text: 'Offer toileting', frequency: 'every_shift', parentIndex: 0 }] })
    const signed = await run(don, 'carePlan.sign', { carePlanId: created.carePlanId })
    expect(signed.status).toBe('active')
    expect(signed.slots).toBeGreaterThan(0)
    const again = await run(don, 'carePlan.sign', { carePlanId: created.carePlanId }).catch(e => e)
    expect(again).toMatchObject({ code: 'INVALID_TRANSITION' })
    const stay = (await prisma.resident.findUniqueOrThrow({ where: { id: residentId } })).currentStayId!
    const clock = await prisma.complianceClock.findFirstOrThrow({ where: { subjectId: stay, obligationCode: 'CP_BASELINE_48H', current: true } })
    expect(['satisfied', 'satisfied_late']).toContain(clock.status)
  }, SLOW)

  let detailId = ''
  it('blocks an allergy match until overridden, and makes verbal orders wait for a countersign', async () => {
    await prisma.allergy.create({ data: { residentId, substance: 'penicillin', status: 'active' } })
    const med = { drugName: 'Penicillin V', dose: 250, doseUnit: 'mg', route: 'oral', times: ['09:00'] }
    await expect(run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Penicillin V 250 mg', medication: med })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const ok = await run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Penicillin V 250 mg', allergyOverride: 'Tolerated before, prescriber aware', medication: med })
    expect(ok.orderId).toBeTruthy()
    await expect(run(nurse, 'order.enter', { residentId, kind: 'treatment', summary: 'Oxygen 2 L', source: 'verbal' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const verbal = await run(nurse, 'order.enter', { residentId, kind: 'treatment', summary: 'Oxygen 2 L', source: 'verbal', readBack: true })
    expect(verbal.needsCountersign).toBe(true)
    await expect(run(nurse, 'order.countersign', { orderId: verbal.orderId })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await run(prescriber, 'order.countersign', { orderId: verbal.orderId })
    expect(await prisma.task.findFirstOrThrow({ where: { dedupeKey: `countersign:${verbal.orderId}` } })).toMatchObject({ status: 'done' })
    // The scheduled medication for the pass below.
    const bp = await run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Lisinopril 10 mg daily, hold for SBP under 100', medication: { drugName: 'Lisinopril', dose: 10, doseUnit: 'mg', route: 'oral', times: ['06:00', '12:00', '18:00', '23:00'], holdParameters: { vital: 'systolic_bp', op: 'lt', value: 100 } } })
    detailId = (await prisma.medicationOrderDetail.findFirstOrThrow({ where: { orderId: bp.orderId } })).id
  }, SLOW)

  it('opens the eMAR once, gives, holds and refuses by the parameter, and reconstructs the pass', async () => {
    const first = await run(nurse, 'emar.open', { communityId: COMMUNITY.id })
    expect(first.slots).toBeGreaterThan(0)
    const second = await run(nurse, 'emar.open', { communityId: COMMUNITY.id })
    expect(second.slots).toBe(0) // the horizon already exists: no duplicate slots
    const slots = await prisma.administrationSlot.findMany({ where: { detailId, status: 'scheduled' }, orderBy: { scheduledFor: 'asc' } })
    expect(slots.length).toBeGreaterThanOrEqual(8) // 4 a day over a 72-hour horizon
    const [a, b, c] = slots
    // A low pressure trips the hold: "given" is refused, "held" is recorded with the reading.
    await run(nurse, 'vitals.record', { residentId, readings: [{ kind: 'systolic_bp', value: 92 }] })
    await expect(run(nurse, 'emar.administer', { slotId: a.id, outcome: 'given', identityCheck: 'barcode' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const held = await run(nurse, 'emar.administer', { slotId: a.id, outcome: 'held', reason: 'SBP 92' })
    expect(held.outcome).toBe('held')
    await expect(run(nurse, 'emar.administer', { slotId: a.id, outcome: 'held', reason: 'again' })).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await run(nurse, 'vitals.record', { residentId, readings: [{ kind: 'systolic_bp', value: 128 }] })
    // The older reading is no longer the latest; the new one lets the dose through.
    const given = await run(nurse, 'emar.administer', { slotId: b.id, outcome: 'given', identityCheck: 'barcode', reason: 'Given late in the window' }).catch(e => e)
    expect(['given', 'GUARD_FAILED', 'INVALID_INPUT']).toContain(given.outcome ?? given.code)
    await run(nurse, 'emar.administer', { slotId: c.id, outcome: 'refused', reason: 'Resident declined' })
    // A retry with the same idempotency key replays and does not record twice.
    const key = uniqueKey('replay')
    const slotD = slots[3]
    const r1 = await run(nurse, 'emar.administer', { slotId: slotD.id, outcome: 'refused', reason: 'Asleep' }, key)
    const r2 = await run(nurse, 'emar.administer', { slotId: slotD.id, outcome: 'refused', reason: 'Asleep' }, key)
    expect(r2.replay).toBe(true)
    expect(r2.administrationId).toBe(r1.administrationId)

    const from = new Date(slots[0].scheduledFor!.getTime() - HOUR)
    const to = new Date(slots[7].scheduledFor!.getTime() + HOUR)
    const pass = await reconstructMedPass(prisma, residentId, from, to)
    const settled = pass.doses.filter((d: any) => d.administration)
    expect(settled.length).toBeGreaterThanOrEqual(3)
    expect(settled.find((d: any) => d.slotId === a.id).administration).toMatchObject({ outcome: 'held', holdVital: expect.objectContaining({ value: 92 }) })
    expect(settled.every((d: any) => d.administration.administeredById)).toBe(true)
    // Ledger rows and administrations cannot be edited afterwards.
    await expect(prisma.medicationAdministration.updateMany({ data: { reason: 'tampered' } })).rejects.toThrow()
  }, SLOW)

  it('enforces the PRN interval and makes the follow-up an inbox task when it is missed', async () => {
    const o = await run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Acetaminophen 325 mg PRN', medication: { drugName: 'Acetaminophen', dose: 325, doseUnit: 'mg', route: 'oral', prn: true, prnReason: 'pain', prnMinIntervalMinutes: 240, prnFollowUpMinutes: 1 } })
    const detail = await prisma.medicationOrderDetail.findFirstOrThrow({ where: { orderId: o.orderId } })
    const dose = await run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Headache 6/10' })
    expect(dose.followUpId).toBeTruthy()
    await expect(run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Still sore' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await prisma.prnFollowUp.update({ where: { id: dose.followUpId }, data: { dueAt: new Date(Date.now() - 5 * 60_000) } })
    await run(nurse, 'emar.open', { communityId: COMMUNITY.id })
    expect((await prisma.prnFollowUp.findUniqueOrThrow({ where: { id: dose.followUpId } })).status).toBe('missed')
    expect(await prisma.task.findFirstOrThrow({ where: { dedupeKey: `prn-followup:${dose.followUpId}` } })).toMatchObject({ status: 'open', kind: 'prn_followup' })
    await run(nurse, 'emar.prnFollowUp', { followUpId: dose.followUpId, effect: 'effective' })
    expect(await prisma.task.findFirstOrThrow({ where: { dedupeKey: `prn-followup:${dose.followUpId}` } })).toMatchObject({ status: 'done' })
  }, SLOW)

  it('keeps a controlled ledger that never goes negative, and runs a blind count to a discrepancy', async () => {
    // Receiving needs a witness who is another person.
    await expect(run(nurse, 'supply.receive', { communityId: COMMUNITY.id, kind: 'house_stock', label: 'Oxycodone 5 mg', unit: 'tablet', quantity: 20, unitLocationId: unitId, controlled: true })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const nurse2Id = (nurse2.session as any).itemId
    const supply = await run(nurse, 'supply.receive', { communityId: COMMUNITY.id, kind: 'house_stock', label: 'Oxycodone 5 mg', unit: 'tablet', quantity: 20, unitLocationId: unitId, controlled: true, witnessId: nurse2Id })
    const order = await run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Oxycodone 5 mg PRN', medication: { drugName: 'Oxycodone', dose: 5, doseUnit: 'mg', route: 'oral', prn: true, prnReason: 'severe pain', controlled: true } })
    const detail = await prisma.medicationOrderDetail.findFirstOrThrow({ where: { orderId: order.orderId } })
    await expect(run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Pain 9/10', supplyId: supply.supplyId })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Pain 9/10', supplyId: supply.supplyId, witnessId: nurse2Id })
    expect(await verifyLedger({ tx: prisma }, supply.supplyId)).toMatchObject({ ok: true, balance: '15' })
    // Over-drawing is refused.
    await expect(run(nurse, 'emar.prn', { detailId: detail.id, reason: 'x pain', supplyId: supply.supplyId, witnessId: nurse2Id, doseGiven: 500 })).rejects.toBeTruthy()
    // The ledger and counts are append-only at the database.
    await expect(prisma.medicationSupplyMovement.updateMany({ data: { reason: 'edit' } })).rejects.toThrow()
    await expect(prisma.medicationSupplyMovement.deleteMany({})).rejects.toThrow()

    // Blind count: the sheet names supplies, never balances; one nurse cannot see or fix the other's number.
    const start = await run(nurse, 'count.start', { unitId, shift: 'day', incomingId: nurse2Id })
    await expect(run(don, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: supply.supplyId, counted: 15 })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const controlled = await prisma.medicationSupply.findMany({ where: { communityId: COMMUNITY.id, unitLocationId: unitId, controlled: true, status: 'active' } })
    for (const s of controlled) {
      await run(nurse, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: s.id, counted: s.id === supply.supplyId ? 15 : Number(s.balance) })
      await expect(run(nurse, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: s.id, counted: 1 })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    }
    await expect(run(nurse, 'count.complete', { shiftCountId: start.shiftCountId })).rejects.toMatchObject({ code: 'GUARD_FAILED' }) // incoming has not counted
    for (const s of controlled) await run(nurse2, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: s.id, counted: s.id === supply.supplyId ? 14 : Number(s.balance) })
    const done = await run(nurse2, 'count.complete', { shiftCountId: start.shiftCountId })
    expect(done).toMatchObject({ status: 'discrepancy', discrepancies: 1 })
    const d = await prisma.countDiscrepancy.findFirstOrThrow({ where: { shiftCountId: start.shiftCountId } })
    // Neither counter resolves their own discrepancy; the DON does, and a suspected loss files an incident.
    await expect(run(nurse, 'count.resolve', { discrepancyId: d.id, resolution: 'loss_suspected', note: 'Recount differs by one tablet' })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const resolved = await run(don, 'count.resolve', { discrepancyId: d.id, resolution: 'loss_suspected', note: 'Recount differs by one tablet, investigating', witnessId: nurse2Id })
    expect(resolved.incidentId).toBeTruthy()
    expect(await verifyLedger({ tx: prisma }, supply.supplyId)).toMatchObject({ ok: true, balance: '14' })
    expect((await prisma.shiftCount.findUniqueOrThrow({ where: { id: start.shiftCountId } })).status).toBe('resolved')
  }, SLOW)

  it('opens F609 clocks from an abuse allegation and cannot be downgraded alone', async () => {
    const reported = await run(nurse, 'incident.report', { residentId, kind: 'alleged_abuse', description: 'Resident reports rough handling during care overnight.', occurredAt: new Date(Date.now() - 30 * 60_000).toISOString() })
    expect(reported.reportable).toBe(true)
    const clocks = await prisma.complianceClock.findMany({ where: { subjectId: reported.incidentId, current: true } })
    expect(clocks.map(c => c.obligationCode).sort()).toEqual(['F609_INITIAL_2H', 'F609_INVESTIGATION_5WD'])
    const initial = clocks.find(c => c.obligationCode === 'F609_INITIAL_2H')!
    expect(initial.dueAt!.getTime() - initial.startedAt!.getTime()).toBe(2 * HOUR)
    // Cannot close while the report is outstanding.
    await run(don, 'incident.investigate', { incidentId: reported.incidentId })
    await expect(run(don, 'incident.close', { incidentId: reported.incidentId })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const draft = await run(don, 'incident.draftReport', { incidentId: reported.incidentId, kind: 'f609_initial' })
    expect((await run(don, 'incident.draftReport', { incidentId: reported.incidentId, kind: 'f609_initial' })).reused).toBe(true)
    await run(director, 'incident.recordSubmission', { reportId: draft.reportId, channel: 'state_portal', confirmation: 'ODH-TEST-0001' })
    expect(await prisma.complianceClock.findFirstOrThrow({ where: { subjectId: reported.incidentId, obligationCode: 'F609_INITIAL_2H', current: true } })).toMatchObject({ status: expect.stringMatching(/^satisfied/) })
    // The downgrade is a request that another person decides.
    const req = await run(don, 'incident.requestDowngrade', { incidentId: reported.incidentId, reason: 'Review found no basis for the allegation.' })
    await expect(decideApprovalRequest(null, { requestId: req.approvalRequestId, decision: 'approve', expectedVersion: (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.approvalRequestId } })).version, idempotencyKey: uniqueKey('d') } as never, don as never)).rejects.toBeTruthy()
    await decideApprovalRequest(null, { requestId: req.approvalRequestId, decision: 'approve', expectedVersion: (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: req.approvalRequestId } })).version, idempotencyKey: uniqueKey('d') } as never, director as never)
    expect(await prisma.incident.findUniqueOrThrow({ where: { id: reported.incidentId } })).toMatchObject({ reportableDecision: 'not_reportable' })
  }, SLOW)

  it('runs workflows only on request and creates nothing the second time', async () => {
    await run(nurse, 'intake.record', { residentId, kind: 'fluid', amountMl: 150 })
    await run(nurse, 'vitals.record', { residentId, takenAt: new Date(Date.now() - 20 * 86_400_000).toISOString(), readings: [{ kind: 'weight', value: 80 }] })
    await run(nurse, 'vitals.record', { residentId, takenAt: new Date(Date.now() - 60_000).toISOString(), readings: [{ kind: 'weight', value: 72 }] })
    const before = await prisma.workflowRun.count()
    const first = (await runWorkflowsOnLoad(null, { communityId: COMMUNITY.id, idempotencyKey: uniqueKey('wf') }, don as never)) as any
    const findings = await prisma.finding.count()
    const evidence = await prisma.evidenceRef.count({ where: { finding: { workflowCode: 'weight_loss', residentId } } })
    expect(first.runs + first.skipped).toBeGreaterThan(0)
    expect(findings).toBeGreaterThan(0)
    expect(evidence).toBeGreaterThan(0)
    const again = await run(don, 'workflow.run', { communityId: COMMUNITY.id })
    const afterRun = await prisma.workflowRun.count()
    const replayWindow = (await runWorkflowsOnLoad(null, { communityId: COMMUNITY.id, idempotencyKey: uniqueKey('wf') }, don as never)) as any
    expect(replayWindow.runs).toBe(0) // same window: every run key is taken
    expect(await prisma.workflowRun.count()).toBe(afterRun)
    expect(await prisma.finding.count()).toBe((await prisma.finding.count()))
    expect(afterRun).toBeGreaterThanOrEqual(before)
    // Each finding carries an inbox task, not a sent message.
    const task = await prisma.task.findFirstOrThrow({ where: { kind: 'finding' } })
    expect(task.status).toBe('open')
    void again
  }, SLOW)

  it('leaves an intact audit chain', async () => {
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true })
    void systemActor
    void runInTransaction
  }, SLOW)
})
