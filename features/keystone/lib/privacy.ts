import { auditCreate, casUpdate, lockRow } from './cas'
import { type Actor } from './actor'
import { DomainError, Codes } from './errors'
import type { UnitOfWork } from './unitOfWork'

/**
 * Break-glass (SCHEMA §1.7, STATE-MACHINES §18): a time-boxed grant that lets a staff member with
 * `canBreakGlass` read one resident's demographic and clinical record outside their assignment.
 * Every grant is reviewed by the privacy officer. Opening needs a reason and a note; the duration
 * is capped by OperatorSettings.breakGlassMaxHours. Human-only (never MCP).
 */

export const BREAK_GLASS_REASONS = ['emergency_care', 'coverage_gap', 'other'] as const

export async function openBreakGlass(uow: UnitOfWork, actor: Actor, input: { residentId: string; reason: (typeof BREAK_GLASS_REASONS)[number]; note: string; hours?: number | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Only a person can use break-glass.')
  if (!(BREAK_GLASS_REASONS as readonly string[]).includes(input.reason)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a reason.', { field: 'reason' })
  if (!input.note?.trim() || input.note.trim().length < 10) throw new DomainError(Codes.INVALID_INPUT, 'Describe the situation (at least 10 characters).', { field: 'note' })
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { breakGlassMaxHours: true } })
  const max = settings?.breakGlassMaxHours ?? 4
  const hours = input.hours ?? max
  if (!Number.isInteger(hours) || hours < 1 || hours > max) throw new DomainError(Codes.INVALID_INPUT, `Break-glass lasts 1 to ${max} hours.`, { field: 'hours' })
  const resident = await uow.tx.resident.findUnique({ where: { id: input.residentId }, select: { id: true } })
  if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
  const open = await uow.tx.breakGlassGrant.findFirst({ where: { userId: actor.userId, residentId: input.residentId, status: 'active', expiresAt: { gt: uow.now } }, select: { id: true, expiresAt: true } })
  if (open) return { grantId: open.id, expiresAt: open.expiresAt, reused: true }
  const grant = await uow.tx.breakGlassGrant.create({ data: { userId: actor.userId, residentId: input.residentId, reason: input.reason, note: input.note.trim(), requestedAt: uow.now, expiresAt: new Date(uow.now.getTime() + hours * 3_600_000), status: 'active' } })
  auditCreate(uow, actor, 'BreakGlassGrant', grant.id, 'break_glass.opened', { residentId: input.residentId, reason: input.reason, hours })
  return { grantId: grant.id, expiresAt: grant.expiresAt, reused: false }
}

/** The holder ends a grant early, or the sweep ends expired ones. */
export async function endBreakGlass(uow: UnitOfWork, actor: Actor, input: { grantId: string }) {
  const grant = await lockRow<{ id: string; status: string; version: number; userId: string | null }>(uow.tx, 'BreakGlassGrant', input.grantId)
  if (actor.kind === 'user' && grant.userId !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only the holder can end this grant.')
  await casUpdate(uow, { model: 'BreakGlassGrant', id: grant.id, version: grant.version, from: ['active'], to: 'ended', actor, eventType: 'break_glass.ended', data: { endedAt: uow.now } })
  return { grantId: grant.id, status: 'ended' }
}

export async function expireBreakGlass(uow: UnitOfWork, actor: Actor) {
  const due = await uow.tx.breakGlassGrant.findMany({ where: { status: 'active', expiresAt: { lte: uow.now } }, select: { id: true, version: true, expiresAt: true }, take: 500 })
  for (const grant of due) await casUpdate(uow, { model: 'BreakGlassGrant', id: grant.id, version: grant.version, from: ['active'], to: 'ended', actor, eventType: 'break_glass.expired', data: { endedAt: grant.expiresAt } })
  return { ended: due.length }
}

/** The privacy officer reviews an ended grant. Reviewing your own grant is refused. */
export async function reviewBreakGlass(uow: UnitOfWork, actor: Actor, input: { grantId: string; outcome: 'reviewed_ok' | 'reviewed_violation'; note: string; expectedVersion?: number | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Only a person can review break-glass.')
  if (input.outcome !== 'reviewed_ok' && input.outcome !== 'reviewed_violation') throw new DomainError(Codes.INVALID_INPUT, 'Choose an outcome.', { field: 'outcome' })
  if (!input.note?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Add a review note.', { field: 'note' })
  const grant = await lockRow<{ id: string; status: string; version: number; userId: string | null; expiresAt: Date | null }>(uow.tx, 'BreakGlassGrant', input.grantId)
  if (grant.userId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'Someone else must review your own break-glass use.')
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, 'The grant changed since you loaded it.', { currentStatus: grant.status, currentVersion: grant.version })
  // An active grant past expiry is ended first so the review sees the final record.
  const from = grant.status === 'active' && grant.expiresAt && grant.expiresAt.getTime() <= uow.now.getTime() ? 'active' : 'ended'
  await casUpdate(uow, { model: 'BreakGlassGrant', id: grant.id, version: grant.version, from: [from], to: input.outcome, actor, eventType: `break_glass.${input.outcome}`, reason: input.note.trim(), data: { reviewedById: actor.userId, reviewNote: input.note.trim(), ...(from === 'active' ? { endedAt: grant.expiresAt } : {}) } })
  return { grantId: grant.id, status: input.outcome }
}
