import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { verifyAuditChain } from '../lib/audit'
import { localDate } from '../lib/calendar'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { decideApprovalRequest } from './approvals'
import {
  admitResidentMutation, changeRoomMutation, correctCensus, dischargeResidentMutation, endLeaveMutation,
  signOffCensusDayMutation, snapshotCensusDayMutation, startLeaveMutation, verifyStay,
} from './census'
import { bedBoard, censusSummary, residentRoster } from './reads'
import '../lib/censusCorrection'
import '../lib/operatorControls'

/**
 * Phase 1 exit gate (BUILD-PLAN §1): admit → room change → hospital leave with bed hold → return →
 * discharge on a migrated database, with places, clocks, audit and the projection rebuild checked
 * at each step; then the midnight census, sign-off and a closed-period correction through a second
 * person. Every resident is invented.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const HOUR = 3_600_000
const DAY = 24 * HOUR
const TZ = COMMUNITY.timeZone
const BED = (room: number, label = 'a') => `seed_room_bir_${room}_${label}`

describe.skipIf(!hasTestDatabase)('census lifecycle (database)', () => {
  let prisma: PrismaClient
  let admin: Ctx, admissions: Ctx, nurse: Ctx, director: Ctx, don: Ctx, cna: Ctx, stranger: Ctx
  const T = Date.now()
  const at = (offsetMs: number) => new Date(T + offsetMs).toISOString()

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin)
    admissions = ctx(prisma, 'seed_user_patel', roleOf('seed_role_admissions'))
    nurse = ctx(prisma, 'seed_user_ramos', roleOf('seed_role_charge_nurse'))
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    don = ctx(prisma, 'seed_user_oyelaran', roleOf('seed_role_don'))
    const aide = await prisma.user.create({ data: { name: 'Aide', email: `${uniqueKey('cna')}@test.local`, password: 'x'.repeat(60) } })
    await prisma.staffAssignment.create({ data: { userId: aide.id, communityId: COMMUNITY.id, status: 'active' } })
    cna = ctx(prisma, aide.id, roleOf('seed_role_cna'))
    // Admissions permissions, but assigned to no community.
    const other = await prisma.user.create({ data: { name: 'Elsewhere', email: `${uniqueKey('other')}@test.local`, password: 'x'.repeat(60) } })
    stranger = ctx(prisma, other.id, roleOf('seed_role_admissions'))
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  const admitInput = (bedId: string, firstName: string, effectiveAt: string) => ({
    communityId: COMMUNITY.id,
    resident: { firstName, lastName: 'Whitaker', dateOfBirth: '1938-04-12', sex: 'female' },
    representatives: [{ firstName: 'Colin', lastName: 'Whitaker', email: `${uniqueKey('rep')}@gmail.com`, roles: ['healthcare_poa', 'financial_responsible'] }],
    bedId, payerId: 'seed_payer_ohio_medicaid', admissionSource: 'acute_hospital', effectiveAt,
    pasrrLevel1: { completedAt: at(-6 * DAY), result: 'No Level II referral indicated' },
    notices: [
      { kind: 'bed_hold_policy', method: 'in_person', deliveredAt: effectiveAt, acknowledgement: 'signed' },
      { kind: 'privacy_practices', method: 'in_person', deliveredAt: effectiveAt, acknowledgement: 'signed' },
    ] as never,
  })

  const bed = (id: string) => prisma.bed.findUniqueOrThrow({ where: { id } })
  const stayRow = (id: string) => prisma.stay.findUniqueOrThrow({ where: { id } })

  let stayA = ''

  it('admits, moves, sends to hospital with a bed hold, takes back and discharges', async () => {
    // Who may admit: not a CNA, and not someone outside the community (which reads as not found).
    await expect(admitResidentMutation(null, { input: admitInput(BED(101), 'Dorothy', at(-5 * DAY)) as never, idempotencyKey: uniqueKey('adm') }, cna)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(admitResidentMutation(null, { input: admitInput(BED(101), 'Dorothy', at(-5 * DAY)) as never, idempotencyKey: uniqueKey('adm') }, stranger)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // A Medicaid-certified NF admission needs the Level I PASRR screen.
    await expect(admitResidentMutation(null, { input: { ...admitInput(BED(101), 'Dorothy', at(-5 * DAY)), pasrrLevel1: null } as never, idempotencyKey: uniqueKey('adm') }, admissions)).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    const key = uniqueKey('adm')
    const input = admitInput(BED(101), 'Dorothy', at(-5 * DAY)) as never
    const admitted = await admitResidentMutation(null, { input, idempotencyKey: key }, admissions)
    expect(admitted).toMatchObject({ replay: false, status: 'admitted', presence: 'in_house' })
    stayA = admitted.stayId
    // A retry with the same key replays; it does not admit twice.
    const replay = await admitResidentMutation(null, { input, idempotencyKey: key }, admissions)
    expect(replay).toMatchObject({ replay: true, stayId: stayA })
    expect(await prisma.stay.count()).toBe(1)
    expect(await bed(BED(101))).toMatchObject({ status: 'occupied', currentStayId: stayA })
    expect(await prisma.resident.findUniqueOrThrow({ where: { id: admitted.residentId } })).toMatchObject({ status: 'current', currentStayId: stayA, synthetic: true })
    const policyClock = await prisma.complianceClock.findFirstOrThrow({ where: { subjectId: stayA, obligationCode: 'BEDHOLD_POLICY_BEFORE_TRANSFER', current: true } })
    expect(['satisfied', 'satisfied_late']).toContain(policyClock.status)
    // The bed is taken: a second admission to it is refused before the exclusion constraint.
    await expect(admitResidentMutation(null, { input: admitInput(BED(101), 'Evelyn', at(-5 * DAY)) as never, idempotencyKey: uniqueKey('adm') }, admissions)).rejects.toMatchObject({ code: 'PLACE_UNAVAILABLE' })

    // Room change: the old bed goes to housekeeping, the new one is occupied.
    let version = (await stayRow(stayA)).version
    await expect(changeRoomMutation(null, { stayId: stayA, toBedId: BED(102), effectiveAt: at(-4 * DAY), expectedVersion: version - 1, idempotencyKey: uniqueKey('rc') }, nurse)).rejects.toMatchObject({ code: 'STALE_STATE', details: { currentVersion: version } })
    const moved = await changeRoomMutation(null, { stayId: stayA, toBedId: BED(102), effectiveAt: at(-4 * DAY), reason: 'Quieter room by the nurses station', expectedVersion: version, idempotencyKey: uniqueKey('rc') }, nurse)
    expect(moved).toMatchObject({ presence: 'in_house' })
    expect(await bed(BED(101))).toMatchObject({ status: 'cleaning', currentStayId: null })
    expect(await bed(BED(102))).toMatchObject({ status: 'occupied', currentStayId: stayA })
    // Forbidden: returning from a leave that never started; back-dating without a correction.
    await expect(endLeaveMutation(null, { stayId: stayA, effectiveAt: at(-4 * DAY + HOUR), idempotencyKey: uniqueKey('le') }, nurse)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await expect(changeRoomMutation(null, { stayId: stayA, toBedId: BED(103), effectiveAt: at(-4.5 * DAY), idempotencyKey: uniqueKey('rc') }, nurse)).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'late_entry' } })

    // Hospital transfer with a Medicaid-paid bed hold and the notice given at transfer.
    version = (await stayRow(stayA)).version
    const leave = await startLeaveMutation(null, {
      stayId: stayA, leaveKind: 'hospital', holdElected: true, holdPaidBy: 'medicaid', facilityInitiated: true, effectiveAt: at(-3 * DAY), destination: 'Riverside General',
      noticeAtTransfer: { method: 'in_person', deliveredAt: at(-3 * DAY), acknowledgement: 'signed', copyToOmbudsmanAt: at(-3 * DAY + HOUR) }, expectedVersion: version, idempotencyKey: uniqueKey('ls'),
    } as never, nurse)
    expect(leave).toMatchObject({ presence: 'on_leave_hold' })
    expect(await bed(BED(102))).toMatchObject({ status: 'held', currentStayId: stayA })
    const transferClock = await prisma.complianceClock.findFirstOrThrow({ where: { subjectId: stayA, obligationCode: 'BEDHOLD_AT_TRANSFER', occurrenceKey: leave.eventId, current: true } })
    expect(transferClock.status).toBe('satisfied')
    const ombudsman = await prisma.complianceClock.findFirstOrThrow({ where: { subjectId: stayA, obligationCode: 'TRANSFER_NOTICE_OMBUDSMAN', occurrenceKey: leave.eventId, current: true } })
    expect(ombudsman.status).toBe('satisfied')
    // A held bed cannot be given to anyone else.
    await expect(admitResidentMutation(null, { input: admitInput(BED(102), 'Evelyn', at(-3 * DAY + HOUR)) as never, idempotencyKey: uniqueKey('adm') }, admissions)).rejects.toMatchObject({ code: 'PLACE_UNAVAILABLE' })

    // Return to the held bed.
    const back = await endLeaveMutation(null, { stayId: stayA, effectiveAt: at(-2 * DAY), idempotencyKey: uniqueKey('le') }, nurse)
    expect(back).toMatchObject({ presence: 'in_house', interruptedStay: true })
    expect(await bed(BED(102))).toMatchObject({ status: 'occupied', currentStayId: stayA })
    const projection = (await stayRow(stayA)).projection as { medicaidHoldDaysByYear: Record<string, number> }
    expect(Object.values(projection.medicaidHoldDaysByYear).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1)

    // Discharge home at the resident's request.
    const out = await dischargeResidentMutation(null, { stayId: stayA, disposition: 'community_home', initiatedBy: 'resident', effectiveAt: at(-2 * HOUR), idempotencyKey: uniqueKey('dc') } as never, admissions)
    expect(out).toMatchObject({ status: 'discharged' })
    expect(await bed(BED(102))).toMatchObject({ status: 'cleaning', currentStayId: null })
    expect(await prisma.resident.findUniqueOrThrow({ where: { id: admitted.residentId } })).toMatchObject({ status: 'former', currentStayId: null })
    expect(await prisma.coveragePeriod.findFirstOrThrow({ where: { stayId: stayA } })).toMatchObject({ status: 'ended' })
    await expect(dischargeResidentMutation(null, { stayId: stayA, disposition: 'community_home', initiatedBy: 'resident', effectiveAt: at(-HOUR), idempotencyKey: uniqueKey('dc') } as never, admissions)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })

    // Every bed claim is a closed interval, and the events rebuild the stored projection exactly.
    const occupancies = await prisma.bedOccupancy.findMany({ where: { stayId: stayA }, orderBy: { startAt: 'asc' } })
    expect(occupancies.map(o => [o.bedId, o.endAt !== null])).toEqual([[BED(101), true], [BED(102), true]])
    const events = await prisma.censusEvent.findMany({ where: { stayId: stayA }, orderBy: { seq: 'asc' } })
    expect(events.map(e => e.kind)).toEqual(['admission', 'room_change', 'leave_start', 'leave_end', 'discharge'])
    const verified = await verifyStay(null, { stayId: stayA }, nurse)
    expect(verified.projection.matches).toBe(true)
    expect(verified.chain).toEqual({ ok: true, count: 5 })
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
    // Census events are append-only in the database itself.
    await expect(prisma.censusEvent.updateMany({ where: { stayId: stayA }, data: { kind: 'death' } })).rejects.toThrow(/append-only/)
  }, 300_000)

  it('takes the midnight census, signs it off, and corrects a closed day only with a second person', async () => {
    const b = await admitResidentMutation(null, { input: admitInput(BED(103), 'Margaret', at(-5 * DAY + HOUR)) as never, idempotencyKey: uniqueKey('adm') }, admissions)

    // Day of A's hospital leave: A counts on leave with a hold, B in house; no names in the summary.
    const leaveDay = localDate(TZ, new Date(T - 3 * DAY))
    const summary = await censusSummary(null, { communityId: COMMUNITY.id, date: leaveDay }, nurse)
    expect(summary.totals).toMatchObject({ present: 2, inHouse: 1, onLeaveHold: 1 })
    expect(JSON.stringify(summary)).not.toContain('Whitaker')

    const snap = await snapshotCensusDayMutation(null, { communityId: COMMUNITY.id, date: leaveDay, idempotencyKey: uniqueKey('snap') }, nurse)
    expect(snap).toMatchObject({ written: 2, superseded: 0 })
    const again = await snapshotCensusDayMutation(null, { communityId: COMMUNITY.id, date: leaveDay, idempotencyKey: uniqueKey('snap') }, nurse)
    expect(again).toMatchObject({ written: 0, superseded: 0 })

    // Sign-off is human-only: a person's own connected-app session is refused.
    const closeDay = localDate(TZ, new Date(T - 2 * DAY))
    const viaApp = { ...nurse, session: { ...(nurse.session as object), mcp: { clientId: 'client-x', scopes: [] } } }
    await expect(signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: closeDay, idempotencyKey: uniqueKey('so') }, viaApp)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: localDate(TZ, new Date(T)), idempotencyKey: uniqueKey('so') }, nurse)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const signed = await signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: closeDay, note: 'Reviewed against the 24-hour report', idempotencyKey: uniqueKey('so') }, nurse)
    expect(signed.date).toBe(closeDay)
    await expect(signOffCensusDayMutation(null, { communityId: COMMUNITY.id, date: closeDay, idempotencyKey: uniqueKey('so') }, nurse)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(snapshotCensusDayMutation(null, { communityId: COMMUNITY.id, date: leaveDay, idempotencyKey: uniqueKey('snap') }, nurse)).rejects.toMatchObject({ code: 'GUARD_FAILED' })

    // A move that happened on a closed day: refused live, then requested as a correction.
    const before = await stayRow(b.stayId)
    await expect(changeRoomMutation(null, { stayId: b.stayId, toBedId: BED(104), effectiveAt: at(-3 * DAY), idempotencyKey: uniqueKey('rc') }, nurse)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' })
    const correction = { stayId: b.stayId, reason: 'Moved to 104A on the night shift; charted on paper only', events: [{ kind: 'room_change', effectiveAt: at(-3 * DAY), toBedId: BED(104) }], expectedStayVersion: before.version }
    const asked = await correctCensus(null, { input: correction as never, idempotencyKey: uniqueKey('cc') }, nurse)
    expect(asked).toMatchObject({ status: 'approval_requested' })
    expect((await stayRow(b.stayId)).currentBedId).toBe(BED(103))

    const requestId = (asked as { approvalRequestId: string }).approvalRequestId
    await expect(decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, nurse)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await expect(decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, don)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const decided = await decideApprovalRequest(null, { requestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, director)
    expect(decided).toMatchObject({ status: 'approved' })
    const afterStay = await stayRow(b.stayId)
    expect(afterStay.currentBedId).toBe(BED(104))
    expect(await bed(BED(103))).toMatchObject({ status: 'cleaning' })
    const late = await prisma.censusEvent.findFirstOrThrow({ where: { stayId: b.stayId, kind: 'room_change' } })
    expect(late.approvalId).toBe(requestId)
    expect((await verifyStay(null, { stayId: b.stayId }, nurse)).projection.matches).toBe(true)

    // The bed board shows names to people who may see them and audits the read.
    const audits = await prisma.phiReadAudit.count()
    const board = await bedBoard(null, { communityId: COMMUNITY.id, unitId: 'seed_unit_birch' }, nurse)
    const birch = board[0]
    expect(birch.beds.find((row: { id: string }) => row.id === BED(104)).occupant).toMatchObject({ stayId: b.stayId, name: 'Margaret Whitaker' })
    expect(await prisma.phiReadAudit.count()).toBe(audits + 1)
    const roster = await residentRoster(null, { communityId: COMMUNITY.id }, nurse)
    expect(JSON.stringify(roster)).toContain('Margaret')
    await expect(bedBoard(null, { communityId: COMMUNITY.id }, stranger)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  }, 300_000)
})
