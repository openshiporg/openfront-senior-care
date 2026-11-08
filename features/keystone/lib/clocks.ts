import { addDays, addWorkingDays, localDate, zonedInstant, type CalendarSpec } from './calendar'
import { DomainError, Codes } from './errors'
import { actorAgentId, actorUserId, type Actor } from './actor'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/**
 * The generic compliance clock engine (STATE-MACHINES §17). Facts open clocks; the obligation's
 * `dueRule` (pack data, never code) computes `dueAt` in the community's time zone and holiday
 * calendar; evidence satisfies them; a sweep marks them overdue and escalates. Opening is
 * idempotent on (obligationCode, subjectType, subjectId, occurrenceKey). A recompute supersedes
 * the clock row instead of editing it. Federal and state clocks are never waivable.
 */

export type DueRule =
  | { kind: 'duration'; hours: number }
  | { kind: 'calendar_days'; days: number }
  | { kind: 'working_days'; days: number }
  | { kind: 'at_start' }
  | { kind: 'operator_setting_hours'; setting: 'bedHoldNoticeGraceHours' }
  | { kind: 'published_dates'; dates: string[] }

export type ClockSubject = { subjectType: string; subjectId: string; occurrenceKey?: string }

type CommunityClockContext = { id: string; timeZone: string; calendar: CalendarSpec | null; packIds: string[] }

const END_OF_DAY = '23:59'

/** The community's time zone, holiday calendar (from the DB rows) and packs (US-FED + its own). */
export async function communityClockContext(tx: Tx, communityId: string): Promise<CommunityClockContext> {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { id: true, timeZone: true, jurisdictionPackId: true, holidayCalendarId: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  const fed = await tx.jurisdictionPack.findUnique({ where: { code: 'US-FED' }, select: { id: true } })
  const packIds = [fed?.id, community.jurisdictionPackId].filter((id): id is string => Boolean(id))
  let calendar: CalendarSpec | null = null
  if (community.holidayCalendarId) {
    const row = await tx.holidayCalendar.findUnique({ where: { id: community.holidayCalendarId }, include: { dates: { select: { date: true } } } })
    if (row?.coverageThrough) {
      calendar = {
        code: row.code,
        timeZone: row.timeZone,
        weekendDays: Array.isArray(row.weekendDays) ? (row.weekendDays as number[]) : [0, 6],
        holidays: new Set(row.dates.map(d => d.date.toISOString().slice(0, 10))),
        coverageThrough: row.coverageThrough.toISOString().slice(0, 10),
      }
    }
  }
  return { id: community.id, timeZone: community.timeZone, calendar, packIds }
}

/** dueAt for a rule. Calendar and working-day rules end at the end of the community-local day. */
export async function computeDueAt(tx: Tx, rule: DueRule, startedAt: Date, ctx: CommunityClockContext): Promise<Date> {
  const startDate = localDate(ctx.timeZone, startedAt)
  switch (rule.kind) {
    case 'duration':
      return new Date(startedAt.getTime() + rule.hours * 3_600_000)
    case 'at_start':
      return startedAt
    case 'calendar_days':
      return zonedInstant(ctx.timeZone, addDays(startDate, rule.days), END_OF_DAY)
    case 'working_days': {
      if (!ctx.calendar) throw new DomainError(Codes.GUARD_FAILED, 'This community has no holiday calendar, so working-day deadlines cannot be computed.')
      return zonedInstant(ctx.timeZone, addWorkingDays(ctx.calendar, startDate, rule.days), END_OF_DAY)
    }
    case 'operator_setting_hours': {
      const settings = await tx.operatorSettings.findUnique({ where: { id: 1 }, select: { bedHoldNoticeGraceHours: true } })
      return new Date(startedAt.getTime() + (settings?.bedHoldNoticeGraceHours ?? 24) * 3_600_000)
    }
    case 'published_dates': {
      const next = [...rule.dates].sort().find(date => date >= startDate)
      if (!next) throw new DomainError(Codes.GUARD_FAILED, 'The pack has no published deadline after this date. Load the next pack version.')
      return zonedInstant(ctx.timeZone, next, END_OF_DAY)
    }
  }
}

export type OpenClockInput = ClockSubject & {
  obligationCode: string
  communityId: string
  residentId?: string | null
  startedAt: Date
  setting?: string | null
  payerKind?: string | null
}

/**
 * Opens a clock for an active obligation that applies to the setting/payer. Returns null when the
 * obligation is dormant, absent from the community's packs or does not apply. Idempotent.
 */
export async function openClock(uow: UnitOfWork, actor: Actor, input: OpenClockInput, known?: CommunityClockContext) {
  const ctx = known?.id === input.communityId ? known : await communityClockContext(uow.tx, input.communityId)
  const obligation = await uow.tx.regulatoryObligation.findFirst({ where: { code: input.obligationCode, active: true, packId: { in: ctx.packIds } } })
  if (!obligation) return null
  const applies = (obligation.appliesTo ?? {}) as { settings?: string[]; payerKinds?: string[] }
  if (applies.settings?.length && input.setting && !applies.settings.includes(input.setting)) return null
  if (applies.payerKinds?.length && (!input.payerKind || !applies.payerKinds.includes(input.payerKind))) return null
  const occurrenceKey = input.occurrenceKey ?? 'default'
  const existing = await uow.tx.complianceClock.findFirst({ where: { obligationCode: input.obligationCode, subjectType: input.subjectType, subjectId: input.subjectId, occurrenceKey, current: true } })
  if (existing) return existing
  const dueAt = await computeDueAt(uow.tx, obligation.dueRule as DueRule, input.startedAt, ctx)
  const clock = await uow.tx.complianceClock.create({
    data: {
      obligationId: obligation.id,
      obligationCode: obligation.code,
      communityId: input.communityId,
      residentId: input.residentId ?? null,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurrenceKey,
      startedAt: input.startedAt,
      dueAt,
      status: 'open',
      ownerRole: obligation.ownerRole,
      ruleRef: obligation.ruleRef,
      verifyNote: obligation.verifyNote,
      current: true,
    },
  })
  uow.audit({ eventType: 'clock.opened', entityType: 'ComplianceClock', entityId: clock.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { obligationCode: clock.obligationCode, subjectType: clock.subjectType, subjectId: clock.subjectId, dueAt: clock.dueAt } })
  uow.emit({ topic: 'clock.opened', aggregateType: 'ComplianceClock', aggregateId: clock.id, payload: { obligationCode: clock.obligationCode, dueAt: clock.dueAt }, dedupeKey: `clock.opened:${clock.id}` })
  return clock
}

/**
 * Opens every active obligation whose `startFact` is this fact (pack data decides which deadlines a
 * census event starts). Obligations whose evidence is the fact itself (`census_event:<kind>`) are
 * satisfied at once, so tracking obligations leave an audited, closed clock.
 */
export async function openClocksForFact(uow: UnitOfWork, actor: Actor, input: Omit<OpenClockInput, 'obligationCode'> & { fact: string; evidence?: { type: string; id: string } }) {
  const ctx = await communityClockContext(uow.tx, input.communityId)
  const obligations = await uow.tx.regulatoryObligation.findMany({ where: { startFact: input.fact, active: true, packId: { in: ctx.packIds } }, select: { code: true, evidenceTypes: true } })
  const opened: string[] = []
  for (const obligation of obligations) {
    const clock = await openClock(uow, actor, { ...input, obligationCode: obligation.code }, ctx)
    if (!clock) continue
    opened.push(clock.id)
    const evidenceTypes = Array.isArray(obligation.evidenceTypes) ? (obligation.evidenceTypes as string[]) : []
    if (input.evidence && evidenceTypes.includes(input.evidence.type)) {
      await satisfyClocks(uow, actor, { obligationCodes: [obligation.code], subjectType: input.subjectType, subjectId: input.subjectId, occurrenceKey: input.occurrenceKey ?? 'default' }, { ...input.evidence, at: input.startedAt })
    }
  }
  return opened
}

/** Satisfies the open clocks on a subject whose obligation accepts this evidence type. */
export async function satisfyByEvidence(uow: UnitOfWork, actor: Actor, subject: { subjectType: string; subjectId: string; occurrenceKey?: string }, evidence: { type: string; id: string; at: Date }) {
  const open = await uow.tx.complianceClock.findMany({
    where: { subjectType: subject.subjectType, subjectId: subject.subjectId, ...(subject.occurrenceKey ? { occurrenceKey: subject.occurrenceKey } : {}), current: true, status: { in: ['open', 'overdue'] } },
    select: { obligationCode: true, obligation: { select: { evidenceTypes: true } } },
  })
  const codes = open.filter(clock => Array.isArray(clock.obligation?.evidenceTypes) && (clock.obligation!.evidenceTypes as string[]).includes(evidence.type)).map(clock => clock.obligationCode)
  if (!codes.length) return []
  return satisfyClocks(uow, actor, { obligationCodes: [...new Set(codes)], ...subject }, evidence)
}

/** Marks matching open/overdue clocks satisfied (late if past due) with an evidence reference. */
export async function satisfyClocks(uow: UnitOfWork, actor: Actor, where: { obligationCodes: string[]; subjectType: string; subjectId: string; occurrenceKey?: string }, evidence: { type: string; id: string; at: Date }) {
  const clocks = await uow.tx.complianceClock.findMany({
    where: { obligationCode: { in: where.obligationCodes }, subjectType: where.subjectType, subjectId: where.subjectId, ...(where.occurrenceKey ? { occurrenceKey: where.occurrenceKey } : {}), current: true, status: { in: ['open', 'overdue'] } },
  })
  const satisfied: string[] = []
  for (const clock of clocks) {
    const late = clock.dueAt ? evidence.at.getTime() > clock.dueAt.getTime() : false
    const to = late ? 'satisfied_late' : 'satisfied'
    const result = await uow.tx.complianceClock.updateMany({
      where: { id: clock.id, version: clock.version, status: { in: ['open', 'overdue'] } },
      data: { status: to, satisfiedAt: evidence.at, satisfiedBy: [{ type: evidence.type, id: evidence.id }], version: { increment: 1 } },
    })
    if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, 'A compliance clock changed while it was being satisfied. Try again.', { currentVersion: clock.version })
    uow.audit({ eventType: `clock.${to}`, entityType: 'ComplianceClock', entityId: clock.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), before: { status: clock.status }, after: { status: to, evidence } })
    satisfied.push(clock.id)
  }
  return satisfied
}

/** Cancels open clocks whose start fact no longer holds (e.g. the stay ended before the deadline). */
export async function cancelClocks(uow: UnitOfWork, actor: Actor, where: { obligationCodes?: string[]; subjectType: string; subjectId: string }, reason: string) {
  const clocks = await uow.tx.complianceClock.findMany({ where: { ...(where.obligationCodes ? { obligationCode: { in: where.obligationCodes } } : {}), subjectType: where.subjectType, subjectId: where.subjectId, current: true, status: 'open' } })
  for (const clock of clocks) {
    const result = await uow.tx.complianceClock.updateMany({ where: { id: clock.id, version: clock.version, status: 'open' }, data: { status: 'cancelled', cancelReason: reason, version: { increment: 1 } } })
    if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, 'A compliance clock changed while it was being cancelled. Try again.')
    uow.audit({ eventType: 'clock.cancelled', entityType: 'ComplianceClock', entityId: clock.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), reason, before: { status: 'open' }, after: { status: 'cancelled' } })
  }
  return clocks.length
}

/**
 * Supersedes a clock with a recomputed one (start fact changed). The old row is kept with
 * current=false; the new row points back to it.
 */
export async function supersedeClock(uow: UnitOfWork, actor: Actor, clockId: string, startedAt: Date) {
  const old = await uow.tx.complianceClock.findUnique({ where: { id: clockId }, include: { obligation: true } })
  if (!old || !old.current || !old.obligation || !old.communityId) throw new DomainError(Codes.NOT_FOUND, 'Clock not found.')
  const ctx = await communityClockContext(uow.tx, old.communityId)
  const dueAt = await computeDueAt(uow.tx, old.obligation.dueRule as DueRule, startedAt, ctx)
  const updated = await uow.tx.complianceClock.updateMany({ where: { id: old.id, version: old.version, current: true }, data: { current: false, version: { increment: 1 } } })
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'The clock changed while it was being recomputed.')
  const next = await uow.tx.complianceClock.create({
    data: { obligationId: old.obligationId, obligationCode: old.obligationCode, communityId: old.communityId, residentId: old.residentId, subjectType: old.subjectType, subjectId: old.subjectId, occurrenceKey: old.occurrenceKey, startedAt, dueAt, status: 'open', ownerRole: old.ownerRole, ruleRef: old.ruleRef, verifyNote: old.verifyNote, supersedesId: old.id, current: true },
  })
  uow.audit({ eventType: 'clock.superseded', entityType: 'ComplianceClock', entityId: next.id, actorUserId: actorUserId(actor), before: { id: old.id, dueAt: old.dueAt }, after: { dueAt } })
  return next
}

/** The sweep: open clocks past due become overdue and escalate one level. */
export async function sweepClocks(uow: UnitOfWork, actor: Actor) {
  const due = await uow.tx.complianceClock.findMany({ where: { current: true, status: 'open', dueAt: { lt: uow.now } }, take: 500, orderBy: { dueAt: 'asc' } })
  let overdue = 0
  for (const clock of due) {
    const result = await uow.tx.complianceClock.updateMany({ where: { id: clock.id, version: clock.version, status: 'open' }, data: { status: 'overdue', escalationLevel: { increment: 1 }, version: { increment: 1 } } })
    if (result.count !== 1) continue
    overdue += 1
    uow.audit({ eventType: 'clock.overdue', entityType: 'ComplianceClock', entityId: clock.id, actorUserId: actorUserId(actor), before: { status: 'open' }, after: { status: 'overdue', escalationLevel: (clock.escalationLevel ?? 0) + 1 } })
    uow.emit({ topic: 'clock.overdue', aggregateType: 'ComplianceClock', aggregateId: clock.id, payload: { obligationCode: clock.obligationCode, communityId: clock.communityId, ownerRole: clock.ownerRole }, dedupeKey: `clock.overdue:${clock.id}:${(clock.escalationLevel ?? 0) + 1}` })
  }
  return { checked: due.length, overdue }
}
