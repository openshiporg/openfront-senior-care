import { admitResident, changeRoom, dischargeResident, endLeave, recordDeath, recordNotice, releaseBedHold, startLeave, verifyCensusChain, verifyCensusProjection, type AdmitInput, type DischargeInput, type NoticeInput, type StartLeaveInput } from '../lib/census'
import { applyCorrection, requestClosedPeriodCorrection, type CorrectionPayload } from '../lib/censusCorrection'
import { closedThrough } from '../lib/census'
import { signOffCensusDay, snapshotCensusDay } from '../lib/censusDay'
import { localDate } from '../lib/calendar'
import { actorFor } from './actorFor'
import { requirePermission } from '../lib/actor'
import { assertCommunityAccess, communityOf, date, optionalDate, runDomain } from './run'

type Ctx = { session: any; prisma: any }
const census = (name: string, community: RunSpecCommunity, permissions: Parameters<typeof runDomain>[2]['permissions'] = ['canRecordCensus', 'canAdmitDischarge']) => ({ name, permissions, serializable: true, community })
type RunSpecCommunity = Parameters<typeof runDomain>[2]['community']

export async function admitResidentMutation(_root: unknown, args: { input: AdmitInput & { effectiveAt: string; observedAt?: string | null }; idempotencyKey: string }, context: Ctx) {
  const input = args.input
  return runDomain(context, args, { name: 'census.admit', permissions: ['canAdmitDischarge'], serializable: true, community: async () => input.communityId }, (uow, actor) =>
    admitResident(uow, actor, { ...input, effectiveAt: date(input.effectiveAt, 'effectiveAt'), observedAt: optionalDate(input.observedAt, 'observedAt'), idempotencyKey: args.idempotencyKey }).then(result => ({ ...result })))
}

export async function changeRoomMutation(_root: unknown, args: { stayId: string; toBedId?: string | null; toApartmentId?: string | null; effectiveAt: string; observedAt?: string | null; reason?: string | null; companionRelationship?: string | null; reservationId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, census('census.room_change', tx => communityOf.stay(tx, args.stayId)), (uow, actor) =>
    changeRoom(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt'), observedAt: optionalDate(args.observedAt, 'observedAt') }))
}

export async function startLeaveMutation(_root: unknown, args: Omit<StartLeaveInput, 'effectiveAt' | 'observedAt'> & { effectiveAt: string; observedAt?: string | null }, context: Ctx) {
  return runDomain(context, args, census('census.leave_start', tx => communityOf.stay(tx, args.stayId)), (uow, actor) =>
    startLeave(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt'), observedAt: optionalDate(args.observedAt, 'observedAt') }))
}

export async function releaseBedHoldMutation(_root: unknown, args: { stayId: string; effectiveAt: string; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, census('census.hold_release', tx => communityOf.stay(tx, args.stayId)), (uow, actor) =>
    releaseBedHold(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt') }))
}

export async function endLeaveMutation(_root: unknown, args: { stayId: string; effectiveAt: string; observedAt?: string | null; toBedId?: string | null; toApartmentId?: string | null; reservationId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, census('census.leave_end', tx => communityOf.stay(tx, args.stayId)), (uow, actor) =>
    endLeave(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt'), observedAt: optionalDate(args.observedAt, 'observedAt') }))
}

export async function dischargeResidentMutation(_root: unknown, args: Omit<DischargeInput, 'effectiveAt' | 'observedAt'> & { effectiveAt: string; observedAt?: string | null }, context: Ctx) {
  return runDomain(context, args, census('census.discharge', tx => communityOf.stay(tx, args.stayId), ['canAdmitDischarge']), (uow, actor) =>
    dischargeResident(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt'), observedAt: optionalDate(args.observedAt, 'observedAt') }))
}

export async function recordDeathMutation(_root: unknown, args: { stayId: string; effectiveAt: string; pronouncedBy: string; observedAt?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, { ...census('census.death', tx => communityOf.stay(tx, args.stayId), ['canAdmitDischarge', 'canChartNursing']), humanOnly: true }, (uow, actor) =>
    recordDeath(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, 'effectiveAt'), observedAt: optionalDate(args.observedAt, 'observedAt') }))
}

export async function recordNoticeMutation(_root: unknown, args: { input: NoticeInput; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, { name: 'census.notice', permissions: ['canAdmitDischarge', 'canRecordCensus', 'canManageRepresentatives'], community: tx => communityOf.stay(tx, args.input.stayId) }, (uow, actor) =>
    recordNotice(uow, actor, args.input))
}

/**
 * A census correction. Inside an open period it applies now; for a signed-off day it opens a
 * maker-checker request that a second person approves (and the approval applies it).
 */
export async function correctCensus(_root: unknown, args: { input: CorrectionPayload; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, { name: 'census.correct', permissions: ['canRecordCensus', 'canAdmitDischarge'], serializable: true, humanOnly: true, community: tx => communityOf.stay(tx, args.input.stayId) }, async (uow, actor) => {
    const stay = await uow.tx.stay.findUnique({ where: { id: args.input.stayId }, select: { communityId: true, community: { select: { timeZone: true } } } })
    const closed = await closedThrough(uow.tx, stay!.communityId!)
    const touchesClosed = closed && args.input.events.some(event => localDate(stay!.community!.timeZone, new Date(event.effectiveAt)) <= closed)
    if (touchesClosed) {
      const request = await requestClosedPeriodCorrection(uow, actor, args.input)
      return { status: 'approval_requested', approvalRequestId: request.id }
    }
    return { status: 'applied', ...(await applyCorrection(uow, actor, args.input, null)) }
  })
}

export async function snapshotCensusDayMutation(_root: unknown, args: { communityId: string; date: string; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, { name: 'census.snapshot', permissions: ['canRecordCensus'], serializable: true, community: async () => args.communityId }, (uow, actor) =>
    snapshotCensusDay(uow, actor, { communityId: args.communityId, date: args.date }))
}

export async function signOffCensusDayMutation(_root: unknown, args: { communityId: string; date: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  return runDomain(context, args, { name: 'census.sign_off', permissions: ['canRecordCensus'], serializable: true, humanOnly: true, community: async () => args.communityId }, (uow, actor) =>
    signOffCensusDay(uow, actor, args))
}

/** Read: rebuilds a stay's projection from its events and checks the hash chain (exit gate). */
export async function verifyStay(_root: unknown, args: { stayId: string }, context: Ctx) {
  const actor = await actorFor(context)
  requirePermission(actor, 'canRecordCensus', 'canAdmitDischarge', 'canReadAudit')
  return context.prisma.$transaction(async (tx: any) => {
    await assertCommunityAccess(tx, actor, await communityOf.stay(tx, args.stayId))
    return { projection: await verifyCensusProjection(tx, args.stayId), chain: await verifyCensusChain(tx, args.stayId) }
  })
}
