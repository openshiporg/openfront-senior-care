import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey, TEST_DATABASE_URL } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup, loadClinicalSetup } from './setup'
import { clinicalCommand } from './clinical'
import { decideApprovalRequest } from './approvals'
import { admitResidentMutation } from './census'
import { listFindings } from './workflowReads'
import { infer } from '../lib/inference/gateway'
import { z } from 'zod'
import '../lib/operatorControls'
import '../lib/censusCorrection'

/**
 * Review r1 fixes (BUILD-PLAN §2 exit gates 3–6, SM §9.5, the blind count). Every person, note and drug is invented.
 *  M1  a charge nurse never reads the expected balance — list, item and relationship queries through Keystone's own GraphQL.
 *  M2  an open count discrepancy freezes routine doses from that supply; an emergency dose with a reason is logged and tells the DON.
 *  G3  a fall described only in a progress note → finding with a span → post-fall huddle for the charge nurse → done → re-check closes it.
 *  G4  an AI-drafted care-plan update stays a Proposal until a nurse accepts it and signs the plan.
 *  G5  one InferenceCall per call, no content; self_hosted_only refuses a BAA provider; the built-in rules engine reads a real resident in-process.
 *  G6  describe the job → catalogue-only graph → 30-day dry run → DON then administrator, never the proposer, never an agent.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const SLOW = 240_000

describe.skipIf(!hasTestDatabase)('review r1 fixes (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, nurse: Ctx, nurse2: Ctx, don: Ctx, director: Ctx, agentCtx: Ctx
  let nurse2Id = '', residentId = '', unitId = ''
  let keystone: any
  const run = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op)) => clinicalCommand(null, { op, input, idempotencyKey: key }, c as never) as Promise<any>
  const gql = (c: Ctx, query: string, variables: Record<string, unknown> = {}) => keystone.withSession(c.session).graphql.raw({ query, variables })

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
    const n2 = await prisma.user.create({ data: { name: 'Second Nurse', email: `${uniqueKey('u')}@test.local`, password: 'x'.repeat(60), roleId: 'seed_role_charge_nurse' } })
    await prisma.staffAssignment.create({ data: { userId: n2.id, communityId: COMMUNITY.id, status: 'active' } })
    nurse2Id = n2.id
    nurse2 = ctx(prisma, n2.id, roleOf('seed_role_charge_nurse'))
    await loadClinicalSetup(null, { idempotencyKey: uniqueKey('clin') }, admin as never)
    const T = Date.now()
    const admitted = await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, resident: { firstName: 'Odessa', lastName: 'Pruitt', dateOfBirth: '1934-07-21', sex: 'female' },
        representatives: [{ firstName: 'Lyle', lastName: 'Pruitt', email: `${uniqueKey('rep')}@gmail.com`, roles: ['healthcare_poa'] }],
        bedId: 'seed_room_bir_110_a', payerId: 'seed_payer_ohio_medicaid', admissionSource: 'acute_hospital', effectiveAt: new Date(T - 3 * 3_600_000).toISOString(),
        pasrrLevel1: { completedAt: new Date(T - 6 * 86_400_000).toISOString(), result: 'No Level II referral indicated' },
        notices: [{ kind: 'bed_hold_policy', method: 'in_person', deliveredAt: new Date(T - 3 * 3_600_000).toISOString(), acknowledgement: 'signed' }, { kind: 'privacy_practices', method: 'in_person', deliveredAt: new Date(T - 3 * 3_600_000).toISOString(), acknowledgement: 'signed' }],
      } as never,
      idempotencyKey: uniqueKey('adm'),
    }, ctx(prisma, 'seed_user_patel', roleOf('seed_role_admissions')) as never)
    residentId = admitted.residentId
    unitId = (await prisma.unit.findFirstOrThrow({ where: { communityId: COMMUNITY.id, setting: 'nursing_facility' }, orderBy: { code: 'asc' } })).id

    // An agent bound to an OAuth app, with grants to propose and draft (never to approve).
    const app = await prisma.oAuthApp.create({ data: { name: 'Test agent app (invented)', clientId: uniqueKey('client') } })
    const agent = await prisma.agentIdentity.create({ data: { name: uniqueKey('Agent'), ownerId: 'seed_user_oyelaran', oauthAppId: app.id, status: 'active' } })
    for (const scope of ['workflow.read', 'workflow.propose', 'workflow.dry_run', 'finding.read', 'finding.recheck', 'proposal.create_care_plan']) await prisma.agentToolGrant.create({ data: { agentId: agent.id, scope, status: 'active' } })
    agentCtx = ctx(prisma, 'seed_user_oyelaran', roleOf('seed_role_don'), { mcp: { clientId: app.clientId, scopes: ['mcp:read', 'mcp:write'], tokenId: 't', resource: 'r' } })

    // Keystone's own GraphQL over the test schema, for the field-access proofs.
    const url = new URL(TEST_DATABASE_URL)
    url.searchParams.set('connection_limit', '2')
    process.env.DATABASE_URL = url.toString()
    const [{ getContext }, { default: config }, PrismaModule] = await Promise.all([import('@keystone-6/core/context'), import('../index'), import('@prisma/client')])
    keystone = getContext(config, PrismaModule)
  }, 600_000)

  afterAll(async () => {
    await keystone?.prisma?.$disconnect?.()
    await prisma?.$disconnect()
  })

  it('M1 + M2: the count is blind to a charge nurse, and an open discrepancy freezes routine doses (the PRN lorazepam repro)', async () => {
    const supply = await prisma.medicationSupply.findFirstOrThrow({ where: { communityId: COMMUNITY.id, controlled: true, label: { contains: 'Lorazepam' } } })
    const order = await run(nurse, 'order.enter', { residentId, kind: 'medication', summary: 'Lorazepam 0.5 mg PRN anxiety', medication: { drugName: 'Lorazepam', dose: 0.5, doseUnit: 'mg', route: 'oral', prn: true, prnReason: 'anxiety', controlled: true } })
    const detail = await prisma.medicationOrderDetail.findFirstOrThrow({ where: { orderId: order.orderId } })

    // Blind count: the nurses count 30 and 29 of 30; a discrepancy opens.
    const start = await run(nurse, 'count.start', { unitId: supply.unitLocationId, shift: 'day', incomingId: nurse2Id })
    const controlled = await prisma.medicationSupply.findMany({ where: { communityId: COMMUNITY.id, unitLocationId: supply.unitLocationId, controlled: true, status: 'active' } })
    for (const s of controlled) await run(nurse, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: s.id, counted: Number(s.balance) })
    for (const s of controlled) await run(nurse2, 'count.entry', { shiftCountId: start.shiftCountId, supplyId: s.id, counted: s.id === supply.id ? Number(supply.balance) - 1 : Number(s.balance) })

    // M1 — before and after submit, the charge nurse cannot read the expected balance by any route.
    const asNurse = async () => {
      const list = await gql(nurse, `query { medicationSupplies(where: { id: { equals: "${supply.id}" } }) { id label balance } }`)
      expect(list.data?.medicationSupplies?.[0]?.label).toContain('Lorazepam')
      expect(list.data?.medicationSupplies?.[0]?.balance ?? null).toBeNull()
      const item = await gql(nurse, `query { medicationSupply(where: { id: "${supply.id}" }) { id balance } }`)
      expect(item.data?.medicationSupply?.balance ?? null).toBeNull()
      const rel = await gql(nurse, `query { shiftCount(where: { id: "${start.shiftCountId}" }) { id entries { counted supply { label balance } } } }`)
      expect(rel.data?.shiftCount?.entries?.length).toBeGreaterThan(0)
      for (const e of rel.data?.shiftCount?.entries ?? []) expect(e.supply?.balance ?? null).toBeNull()
      const disc = await gql(nurse, `query { countDiscrepancies(where: { shiftCount: { id: { equals: "${start.shiftCountId}" } } }) { expected outgoingCounted } }`)
      expect(disc.data?.countDiscrepancies ?? []).toEqual([])
      const movements = await gql(nurse, `query { medicationSupplyMovements(where: { supply: { id: { equals: "${supply.id}" } } }) { balanceAfter } }`)
      expect(movements.data?.medicationSupplyMovements ?? []).toEqual([])
      const viaSupply = await gql(nurse, `query { medicationSupply(where: { id: "${supply.id}" }) { movements { balanceAfter } } }`)
      expect(viaSupply.data?.medicationSupply?.movements ?? []).toEqual([])
      // Filtering or ordering by the balance would leak it by bisection: refused.
      const probe = await gql(nurse, `query { medicationSupplies(where: { balance: { gt: "10" } }) { id } }`)
      expect(probe.errors?.length ?? 0).toBeGreaterThan(0)
      // The other nurse's entry is not readable either.
      const others = await gql(nurse, `query { shiftCountEntries(where: { shiftCount: { id: { equals: "${start.shiftCountId}" } } }) { counted countedBy { id } } }`)
      for (const e of others.data?.shiftCountEntries ?? []) expect(e.countedBy?.id).toBe('seed_user_ramos')
    }
    await asNurse()
    const done = await run(nurse2, 'count.complete', { shiftCountId: start.shiftCountId })
    expect(done).toMatchObject({ status: 'discrepancy', discrepancies: 1 })
    await asNurse()
    // The DON sees it for resolution.
    const forDon = await gql(don, `query { countDiscrepancies(where: { shiftCount: { id: { equals: "${start.shiftCountId}" } } }) { expected outgoingCounted incomingCounted status } medicationSupply(where: { id: "${supply.id}" }) { balance } }`)
    expect(forDon.errors).toBeUndefined()
    expect(Number(forDon.data.countDiscrepancies[0].expected)).toBe(Number(supply.balance))
    expect(Number(forDon.data.medicationSupply.balance)).toBe(Number(supply.balance))

    // M2 — a routine PRN dose from the frozen supply is refused in the service…
    await expect(run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Anxious, pacing', supplyId: supply.id, witnessId: nurse2Id })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    // …and at the database, if anything skipped the service.
    await expect(prisma.medicationSupplyMovement.create({ data: { communityId: COMMUNITY.id, supplyId: supply.id, kind: 'administer', quantity: '-1', balanceAfter: '29', occurredAt: new Date() } as never })).rejects.toThrow(/discrepancy/i)
    // An emergency needs a real reason…
    await expect(run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Acute agitation', supplyId: supply.id, witnessId: nurse2Id, emergency: true, emergencyReason: 'now' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    // …and with one it goes through, is logged and gives the DON a task.
    const dose = await run(nurse, 'emar.prn', { detailId: detail.id, reason: 'Acute agitation, striking out', supplyId: supply.id, witnessId: nurse2Id, emergency: true, emergencyReason: 'Resident striking at staff, redirection failed twice' })
    expect(dose.administrationId ?? dose.id).toBeTruthy()
    const movement = await prisma.medicationSupplyMovement.findFirstOrThrow({ where: { supplyId: supply.id, emergency: true } })
    expect(movement.emergencyReason).toMatch(/redirection failed/)
    expect(await prisma.auditEvent.count({ where: { eventType: 'supply.emergency_override' } })).toBe(1)
    expect(await prisma.task.findFirstOrThrow({ where: { dedupeKey: `emergency-dose:${movement.id}` } })).toMatchObject({ kind: 'count_discrepancy', ownerRole: 'Director of Nursing', status: 'open' })
  }, SLOW)

  it('G3: a fall described only in a progress note opens a finding with a span, a huddle for the charge nurse, and closes on re-check', async () => {
    const body = 'Night rounds 02:10. Resident was found on the floor beside her bed, alert, no visible injury. Assisted back to bed with two staff. Vitals stable. Denies pain.'
    await run(nurse, 'note.create', { residentId, kind: 'nursing', body, sign: true, eventAt: new Date(Date.now() - 30 * 60_000).toISOString() })
    const ran = await run(don, 'workflow.run', { communityId: COMMUNITY.id })
    expect(ran.extraction).toMatchObject({ extracted: expect.any(Number) })
    const finding = await prisma.finding.findFirstOrThrow({ where: { workflowCode: 'incident_analysis', residentId, status: 'open' }, include: { evidence: true, task: true } })
    const cause = finding.evidence.find(e => e.role !== 'resolution')!
    expect(cause.recordType).toBe('ProgressNote')
    expect(body.slice(cause.spanStart!, cause.spanEnd!)).toBe(cause.quote)
    expect(cause.quote).toMatch(/found on the floor/)
    expect(finding.task).toMatchObject({ kind: 'post_fall_huddle', ownerRole: 'Charge Nurse (RN/LPN)', status: 'open' })
    // One InferenceCall per note read, with hashes and never the text.
    const call = await prisma.inferenceCall.findFirstOrThrow({ where: { purpose: 'extract', outcome: 'ok' } })
    expect(call).toMatchObject({ outcome: 'ok', mode: 'self_hosted', provider: 'builtin-rules', syntheticOnly: true })
    expect(call.inputHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(call)).not.toContain('found on the floor')

    // Re-check before the huddle changes nothing; after it, the finding resolves by evidence.
    expect(await run(nurse, 'finding.recheck', { findingId: finding.id })).toMatchObject({ status: 'open', changed: false })
    await run(nurse, 'task.complete', { taskId: finding.task!.id, note: 'Huddle held with night staff; bed alarm on, low bed in place.' })
    const rechecked = await run(nurse, 'finding.recheck', { findingId: finding.id })
    expect(rechecked).toMatchObject({ status: 'resolved_by_evidence', changed: true })
    const closed = await prisma.finding.findUniqueOrThrow({ where: { id: finding.id }, include: { evidence: true } })
    expect(closed.evidence.some(e => e.role === 'resolution' && e.recordType === 'Task')).toBe(true)
    // A second extraction of the same note version uses the cache: no new call.
    const calls = await prisma.inferenceCall.count()
    await run(don, 'workflow.run', { communityId: COMMUNITY.id })
    expect(await prisma.inferenceCall.count()).toBe(calls)
  }, SLOW)

  it('G4: an AI-drafted care-plan update stays a Proposal until a nurse accepts it and signs the plan', async () => {
    const finding = await prisma.finding.findFirstOrThrow({ where: { workflowCode: 'incident_analysis', residentId } })
    const plansBefore = await prisma.carePlan.count({ where: { residentId } })
    const drafted = await run(agentCtx, 'proposal.draftCarePlan', { findingId: finding.id })
    expect(drafted.status).toBe('proposed')
    const proposal = await prisma.proposal.findUniqueOrThrow({ where: { id: drafted.proposalId } })
    expect(proposal).toMatchObject({ kind: 'care_plan_update', status: 'proposed', sourceFindingId: finding.id })
    expect(proposal.proposedByAgentId).toBeTruthy()
    expect(proposal.inferenceCallId).toBeTruthy()
    expect(await prisma.carePlan.count({ where: { residentId } })).toBe(plansBefore)
    // The agent cannot accept or sign; a nurse without care-plan rights cannot accept.
    await expect(run(agentCtx, 'proposal.accept', { proposalId: proposal.id })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(run(nurse, 'proposal.accept', { proposalId: proposal.id })).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const accepted = await run(don, 'proposal.accept', { proposalId: proposal.id })
    const plan = await prisma.carePlan.findUniqueOrThrow({ where: { id: accepted.carePlanId } })
    expect(plan).toMatchObject({ status: 'draft', proposalId: proposal.id })
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe('accepted')
    await expect(run(agentCtx, 'carePlan.sign', { carePlanId: plan.id })).rejects.toBeTruthy()
    await run(don, 'carePlan.sign', { carePlanId: plan.id })
    expect((await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })).status).toBe('signed')
    expect((await prisma.carePlan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe('active')
  }, SLOW)

  it('G5: the gateway writes one content-free row per call and fails closed on policy', async () => {
    const actor = { kind: 'user' as const, userId: 'seed_user_oyelaran', permissions: new Set<never>() }
    const out = z.object({ events: z.array(z.unknown()) })
    const base = { purpose: 'extract' as const, task: 'extract.fall_from_note@1', system: 's', output: out, dataCategories: ['clinical_notes'], data: [{ label: 'note', text: 'Resident found on the floor at 03:00.' }] }
    // The default is the built-in rules engine: self-hosted, so a real (non-synthetic) resident is read in-process.
    const before = await prisma.inferenceCall.count()
    const real = await infer(prisma as never, { ...base, carriesPhi: true, context: { communityId: COMMUNITY.id, actor, synthetic: false } })
    expect(real).toMatchObject({ ok: true })
    expect(await prisma.inferenceCall.count()).toBe(before + 1)
    // A BAA provider is refused under self_hosted_only, even with a registration.
    const reg = await prisma.processorRegistration.findFirst({ select: { id: true } })
    const baa = await prisma.inferenceProvider.create({ data: { key: uniqueKey('azure'), name: 'Azure (invented)', adapter: 'azure_openai', mode: 'baa_hosted', model: 'gpt', status: 'active', endpoint: 'https://example.invalid', processorRegistrationId: reg?.id ?? null } })
    const refused = await infer(prisma as never, { ...base, carriesPhi: true, providerKey: baa.key, context: { communityId: COMMUNITY.id, actor, synthetic: true } })
    expect(refused).toMatchObject({ ok: false, code: 'INFERENCE_POLICY_REFUSED' })
    // A no_phi provider never receives protected data.
    const free = await prisma.inferenceProvider.create({ data: { key: uniqueKey('free'), name: 'Public model (invented)', adapter: 'self_hosted_openai_compat', mode: 'no_phi', model: 'm', status: 'active', endpoint: 'https://example.invalid' } })
    expect(await infer(prisma as never, { ...base, carriesPhi: true, providerKey: free.key, context: { communityId: COMMUNITY.id, actor, synthetic: true } })).toMatchObject({ ok: false, code: 'INFERENCE_PHI_BLOCKED' })
    const ok = await infer(prisma as never, { ...base, carriesPhi: true, context: { communityId: COMMUNITY.id, actor, synthetic: true } })
    expect(ok.ok).toBe(true)
    const rows = await prisma.inferenceCall.findMany({ where: { createdAt: { gte: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: 'asc' } })
    expect(await prisma.inferenceCall.count()).toBe(before + 4)
    expect(rows.slice(-4).map(r => r.outcome)).toEqual(['ok', 'refused_policy', 'refused_policy', 'ok'])
    expect(JSON.stringify(rows)).not.toContain('found on the floor')
    // Append-only at the database.
    await expect(prisma.inferenceCall.updateMany({ data: { outcome: 'ok' } })).rejects.toThrow()
    await expect(prisma.inferenceCall.deleteMany({})).rejects.toThrow()
  }, SLOW)

  it('G6: a staff-described workflow is built from the catalogue, dry-run over 30 days, and activated by two people', async () => {
    // The agent proposes; an unbuildable job is refused.
    await expect(run(agentCtx, 'workflow.build', { communityId: COMMUNITY.id, request: 'Write a poem about the sea every morning please' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const built = await run(agentCtx, 'workflow.build', { communityId: COMMUNITY.id, request: 'When a note says a resident fell, the charge nurse on shift holds a post-fall huddle within 48 hours.' })
    const version = await prisma.workflowVersion.findUniqueOrThrow({ where: { id: built.versionId }, include: { definition: true } })
    expect(version).toMatchObject({ status: 'proposed', communityId: COMMUNITY.id })
    expect(version.definition?.origin).toBe('staff_described')
    expect((version.graph as any).nodes.map((n: any) => n.block)).toEqual(['source.progress_notes', 'extract.fall_from_note', 'rule.deadline_after_event', 'coordinate.task_to_on_shift'])
    // It cannot go for approval before a dry run.
    await expect(run(don, 'workflow.requestActivation', { versionId: version.id, communityId: COMMUNITY.id, reviewNote: 'Looks fine' })).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const findingsBefore = await prisma.finding.count()
    const tasksBefore = await prisma.task.count()
    const dry = await run(agentCtx, 'workflow.dryRun', { versionId: version.id })
    expect(dry).toMatchObject({ days: 30, wouldOpen: expect.any(Number) })
    expect(dry.wouldOpen).toBeGreaterThanOrEqual(1)
    expect(dry.perDay).toHaveLength(30)
    expect(dry.diff).toMatchObject({ added: expect.any(Number), removed: expect.any(Number) })
    expect(await prisma.finding.count()).toBe(findingsBefore)
    expect(await prisma.task.count()).toBe(tasksBefore)
    // The agent requests activation; it cannot approve. The DON approves clinically, then the administrator activates.
    const requested = await run(agentCtx, 'workflow.requestActivation', { versionId: version.id, communityId: COMMUNITY.id, reviewNote: 'Dry run found the night fall; one huddle task to the charge nurse.' })
    expect(requested.stage).toBe('clinical')
    const decide = (c: Ctx, id: string, decision: 'approve' | 'reject' = 'approve') => prisma.approvalRequest.findUniqueOrThrow({ where: { id } }).then(r => decideApprovalRequest(null, { requestId: id, decision, reason: 'Reviewed the dry run', expectedVersion: r.version, idempotencyKey: uniqueKey('d') }, c as never) as Promise<any>)
    await expect(decide(agentCtx, requested.approvalRequestId)).rejects.toBeTruthy()
    await expect(decide(director, requested.approvalRequestId)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    // The DON owns the agent, so the agent's proposal counts as hers: she cannot approve it.
    await expect(decide(don, requested.approvalRequestId)).rejects.toMatchObject({ code: expect.stringMatching(/SELF_APPROVAL|NOT_AUTHORIZED/) })

    // A human proposer: the DON describes one; she is refused; another DON-role person approves; the ED activates.
    const second = await run(don, 'workflow.build', { communityId: COMMUNITY.id, request: 'When a resident falls in a note, charge nurse holds a huddle within 24 hours.' })
    await run(don, 'workflow.dryRun', { versionId: second.versionId })
    const req2 = await run(don, 'workflow.requestActivation', { versionId: second.versionId, communityId: COMMUNITY.id, reviewNote: 'One fall in the last 30 days; huddle within 24 hours.' })
    await expect(decide(don, req2.approvalRequestId)).rejects.toMatchObject({ code: expect.stringMatching(/SELF_APPROVAL|NOT_AUTHORIZED/) })
    const don2User = await prisma.user.create({ data: { name: 'Assistant DON', email: `${uniqueKey('adon')}@test.local`, password: 'x'.repeat(60), roleId: 'seed_role_don' } })
    await prisma.staffAssignment.create({ data: { userId: don2User.id, communityId: COMMUNITY.id, status: 'active' } })
    const don2 = ctx(prisma, don2User.id, roleOf('seed_role_don'))
    const clinical = await decide(don2, req2.approvalRequestId)
    const nextId = clinical.applied?.nextApprovalRequestId ?? clinical.nextApprovalRequestId ?? (await prisma.approvalRequest.findFirstOrThrow({ where: { action: 'workflow.activate', status: 'pending' }, orderBy: { createdAt: 'desc' } })).id
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: second.versionId } })).status).toBe('pending_activation')
    // The clinical approver cannot also activate, and an agent never can.
    await expect(decide(don2, nextId)).rejects.toBeTruthy()
    await expect(decide(agentCtx, nextId)).rejects.toBeTruthy()
    await decide(director, nextId)
    const activation = await prisma.workflowActivation.findFirstOrThrow({ where: { workflowVersionId: second.versionId } })
    expect(activation.status).toBe('active')
    expect(JSON.stringify(activation.approvals)).toContain(don2User.id)
    expect((await prisma.workflowVersion.findUniqueOrThrow({ where: { id: second.versionId } })).status).toBe('active')

    // Finding reads for MCP are audited; the read tool works for the agent.
    const listed = await listFindings(null, { communityId: COMMUNITY.id, status: 'resolved_by_evidence' }, agentCtx as never)
    expect(listed.length).toBeGreaterThan(0)
    expect(await prisma.phiReadAudit.count({ where: { operationName: 'listFindings' } })).toBeGreaterThan(0)
  }, SLOW)
})

