import type { Permission } from '../access'
import { requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { type Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { actorFor } from './actorFor'
import { requireKey } from './op'
import { mcpSessionMarker } from '../mcp-oauth/session'

/**
 * The shape of every domain mutation (STATE-MACHINES §0): who is acting, the permission, the
 * community the target belongs to (the actor must be assigned there unless they administer the
 * operator), then one idempotent command. Census and money commands pass `serializable`.
 */

export async function assertCommunityAccess(tx: Tx, actor: Actor, communityId: string | null | undefined) {
  if (actor.kind === 'system') return
  if (!communityId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (actor.kind === 'user' && actor.permissions.has('canManageOperator')) return
  const userId = actor.kind === 'user' ? actor.userId : actor.ownerUserId
  if (!userId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Not assigned to this community.')
  const assigned = await tx.staffAssignment.count({ where: { userId, communityId, status: 'active', OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] } })
  // A missing or unassigned community reads the same: no existence leak across communities.
  if (!assigned) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
}

export const communityOf = {
  stay: async (tx: Tx, id: string) => (await tx.stay.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  resident: async (tx: Tx, id: string) => (await tx.resident.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  representative: async (tx: Tx, id: string) => (await tx.representative.findUnique({ where: { id }, select: { resident: { select: { communityId: true } } } }))?.resident?.communityId ?? null,
  bed: async (tx: Tx, id: string) => (await tx.bed.findUnique({ where: { id }, select: { room: { select: { unit: { select: { communityId: true } } } } } }))?.room?.unit?.communityId ?? null,
  apartment: async (tx: Tx, id: string) => (await tx.apartment.findUnique({ where: { id }, select: { unit: { select: { communityId: true } } } }))?.unit?.communityId ?? null,
  place: async (tx: Tx, target: { bedId?: string | null; apartmentId?: string | null }) => (target.bedId ? communityOf.bed(tx, target.bedId) : target.apartmentId ? communityOf.apartment(tx, target.apartmentId) : null),
  reservation: async (tx: Tx, id: string) => (await tx.placeReservation.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  lead: async (tx: Tx, id: string) => (await tx.lead.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  tour: async (tx: Tx, id: string) => (await tx.tour.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  referral: async (tx: Tx, id: string) => (await tx.referral.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  waitlist: async (tx: Tx, id: string) => (await tx.waitlistEntry.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  portalAccount: async (tx: Tx, id: string) => (await tx.portalAccount.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  portalGrant: async (tx: Tx, id: string) => (await tx.portalScopeGrant.findUnique({ where: { id }, select: { resident: { select: { communityId: true } } } }))?.resident?.communityId ?? null,
}

/** Human-only actions refuse agents and any MCP-token session, even a person's own (INTEGRATIONS §7.2). */
export function assertHuman(context: { session: unknown }, actor: Actor, humanOnly = true) {
  if (!humanOnly) return
  if (actor.kind !== 'user' || mcpSessionMarker(context.session)) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only a person signed in to the dashboard can do this.')
}

export type RunSpec = {
  name: string
  permissions: Permission[]
  serializable?: boolean
  /** Resolves the community of the target inside the transaction; null skips (operator-wide). */
  community?: (tx: Tx) => Promise<string | null>
  /** Human-only commands refuse agents outright (INTEGRATIONS §7.2). */
  humanOnly?: boolean
}

export async function runDomain<T>(context: { session: unknown; prisma: any }, args: { idempotencyKey?: string | null } & Record<string, unknown>, spec: RunSpec, work: (uow: UnitOfWork, actor: Actor) => Promise<T>) {
  const actor = await actorFor(context)
  assertHuman(context, actor, spec.humanOnly)
  requirePermission(actor, ...spec.permissions)
  const { idempotencyKey, ...params } = args
  const result = await command(context.prisma, { name: spec.name, actor, idempotencyKey: requireKey(idempotencyKey), params, serializable: spec.serializable }, async uow => {
    if (spec.community) await assertCommunityAccess(uow.tx, actor, await spec.community(uow.tx))
    return work(uow, actor)
  })
  return { replay: result.replay, ...(result.value as T & object) }
}

export const date = (value: unknown, field: string) => {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ''))
  if (Number.isNaN(parsed.getTime())) throw new DomainError(Codes.INVALID_INPUT, `${field} is not a valid time.`, { field })
  return parsed
}
export const optionalDate = (value: unknown, field: string) => (value == null || value === '' ? null : date(value, field))
