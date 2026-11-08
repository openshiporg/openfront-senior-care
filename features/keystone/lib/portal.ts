import { auditCreate, casUpdate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextReference } from './sequence'
import { createPublicToken, hashPublicToken, publicTokenMatches, verifyPublicToken } from './publicToken'
import { AUTHORITY_BASES, MFA_SCOPES, PORTAL_SCOPES, SCOPE_AUTHORITY } from '../models/sales'
import type { UnitOfWork } from './unitOfWork'
import { label } from '../../../lib/labels'

/**
 * Family portal backend (STATE-MACHINES §14). APIs only; the portal UI waits for the owner's design
 * pick. Invitations are single-use signed tokens (only the hash is stored). A scope grant can't
 * exceed the representative's authority (SCOPE_AUTHORITY), needs a second person with
 * `canApprovePortalScopes` when it is above `updates`, and revoking bumps the account's session
 * epoch so open portal sessions stop working. Grants and revocations are human-only (never MCP).
 */

const INVITE_DAYS = 7
type Scope = (typeof PORTAL_SCOPES)[number]
type Authority = (typeof AUTHORITY_BASES)[number]

/** The strongest authority a representative's roles give for a scope, or null. */
export function authorityFor(roles: readonly string[], scope: Scope): Authority | null {
  const allowed = SCOPE_AUTHORITY[scope]
  for (const basis of allowed) if (roles.includes(basis)) return basis
  return null
}

export async function inviteRepresentative(uow: UnitOfWork, actor: Actor, input: { representativeId: string }) {
  const rep = await uow.tx.representative.findUnique({ where: { id: input.representativeId }, include: { contact: true, resident: { select: { id: true, communityId: true, status: true } }, portalAccount: true } })
  if (!rep || rep.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'Active representative not found.')
  if (!rep.contact?.email) throw new DomainError(Codes.GUARD_FAILED, 'The representative needs an email address for a portal invitation.', { field: 'email' })
  if (rep.resident?.status === 'deceased') throw new DomainError(Codes.GUARD_FAILED, 'The resident is recorded as deceased.')
  let account = rep.portalAccount
  if (account && (account.status === 'active' || account.status === 'suspended')) throw new DomainError(Codes.GUARD_FAILED, `This representative already has a ${account.status} portal account.`, { currentStatus: account.status })
  const expiresAt = new Date(uow.now.getTime() + INVITE_DAYS * 86_400_000)
  if (!account) {
    // One account per contact: a person who represents two residents gets one login.
    account = await uow.tx.portalAccount.findFirst({ where: { contactId: rep.contactId, status: { in: ['invited', 'active'] } } })
  }
  if (!account) {
    account = await uow.tx.portalAccount.create({ data: { reference: await nextReference(uow.tx, 'PRT', uow.now), contactId: rep.contactId, communityId: rep.resident?.communityId ?? null, status: 'invited', invitedById: actorUserId(actor), invitationExpiresAt: expiresAt, representatives: { connect: [{ id: rep.id }] } } })
    auditCreate(uow, actor, 'PortalAccount', account.id, 'portal.invited', { reference: account.reference, representativeId: rep.id })
  } else {
    await uow.tx.portalAccount.update({ where: { id: account.id }, data: { representatives: { connect: [{ id: rep.id }] } } })
    if (account.status === 'revoked') throw new DomainError(Codes.GUARD_FAILED, 'This portal account was revoked. Create a new representative contact to invite again.', { currentStatus: account.status })
  }
  const token = createPublicToken('portal-invite', account.id, expiresAt.getTime())
  await uow.tx.portalAccount.update({ where: { id: account.id }, data: { invitationTokenHash: hashPublicToken(token), invitationExpiresAt: expiresAt } })
  // The token travels only in the outbox message to the mailer; it is never returned to the caller.
  uow.emit({ topic: 'mail.portal_invitation', aggregateType: 'PortalAccount', aggregateId: account.id, payload: { accountId: account.id, contactId: rep.contactId, token, expiresAt }, dedupeKey: `mail.portal_invitation:${account.id}:${expiresAt.getTime()}` })
  return { accountId: account.id, reference: account.reference, expiresAt }
}

/** The invitee sets a password with the token. Creates a portal-kind user with no dashboard role. */
export async function acceptPortalInvitation(uow: UnitOfWork, input: { token: string; passwordHash: string }) {
  const payload = verifyPublicToken(input.token, 'portal-invite', undefined, uow.now.getTime())
  if (!payload) throw new DomainError(Codes.GUARD_FAILED, 'This invitation link is invalid or has expired.')
  const account = await lockRow<{ id: string; status: string; version: number; invitationTokenHash: string | null; contactId: string | null; userId: string | null }>(uow.tx, 'PortalAccount', payload.subjectId)
  if (account.status !== 'invited' || !publicTokenMatches(input.token, account.invitationTokenHash)) throw new DomainError(Codes.GUARD_FAILED, 'This invitation link was already used or replaced.')
  const contact = account.contactId ? await uow.tx.contact.findUnique({ where: { id: account.contactId }, select: { firstName: true, lastName: true, email: true } }) : null
  if (!contact?.email) throw new DomainError(Codes.GUARD_FAILED, 'The invitation has no email address.')
  const existing = await uow.tx.user.findUnique({ where: { email: contact.email } })
  if (existing && existing.kind !== 'portal') throw new DomainError(Codes.GUARD_FAILED, 'This email belongs to a staff account. Ask the community to invite a different address.')
  const portalRole = await uow.tx.role.findUnique({ where: { id: 'seed_role_portal' }, select: { id: true } })
  const user = existing ?? (await uow.tx.user.create({ data: { name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email, password: input.passwordHash, kind: 'portal', roleId: portalRole?.id ?? null, onboardingStatus: 'dismissed' } }))
  await uow.tx.portalAccount.updateMany({ where: { id: account.id, version: account.version, status: 'invited' }, data: { status: 'active', userId: user.id, acceptedAt: uow.now, invitationTokenHash: '', version: { increment: 1 } } })
  uow.audit({ eventType: 'portal.activated', entityType: 'PortalAccount', entityId: account.id, actorUserId: user.id, before: { status: 'invited' }, after: { status: 'active' } })
  return { accountId: account.id, status: 'active' }
}

/**
 * Proposes a scope for a representative's portal account. `updates` is granted at once; anything
 * else stays `proposed` until a second person with canApprovePortalScopes grants it.
 */
export async function proposePortalScope(uow: UnitOfWork, actor: Actor, input: { representativeId: string; scope: Scope; consentDocumentId?: string | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Portal scopes are granted by people only.')
  if (!(PORTAL_SCOPES as readonly string[]).includes(input.scope)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown portal scope.', { field: 'scope' })
  const rep = await uow.tx.representative.findUnique({ where: { id: input.representativeId }, select: { id: true, residentId: true, roles: true, self: true, status: true, portalAccountId: true } })
  if (!rep || rep.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'Active representative not found.')
  if (!rep.portalAccountId) throw new DomainError(Codes.GUARD_FAILED, 'Invite the representative to the portal first.')
  const roles = [...(Array.isArray(rep.roles) ? (rep.roles as string[]) : []), ...(rep.self ? ['self'] : [])]
  const basis = authorityFor(roles, input.scope)
  if (!basis) throw new DomainError(Codes.GUARD_FAILED, `This representative's authority (${roles.map(r => label(r).toLowerCase()).join(', ') || 'none'}) does not cover ${label(input.scope).toLowerCase()}.`, { reason: 'authority' })
  const existing = await uow.tx.portalScopeGrant.findFirst({ where: { accountId: rep.portalAccountId, residentId: rep.residentId, scope: input.scope, status: { in: ['proposed', 'granted'] } }, select: { id: true, status: true } })
  if (existing) return { grantId: existing.id, status: existing.status, mfaRequired: MFA_SCOPES.has(input.scope) }
  const immediate = input.scope === 'updates'
  const grant = await uow.tx.portalScopeGrant.create({ data: { accountId: rep.portalAccountId, residentId: rep.residentId, representativeId: rep.id, scope: input.scope, authorityBasis: basis, consentDocumentId: input.consentDocumentId ?? null, status: immediate ? 'granted' : 'proposed', proposedById: actor.userId, ...(immediate ? { grantedById: actor.userId, grantedAt: uow.now } : {}) } })
  auditCreate(uow, actor, 'PortalScopeGrant', grant.id, immediate ? 'portal.scope_granted' : 'portal.scope_proposed', { scope: input.scope, authorityBasis: basis, representativeId: rep.id })
  return { grantId: grant.id, status: grant.status, mfaRequired: MFA_SCOPES.has(input.scope) }
}

/** proposed → granted by a different person with canApprovePortalScopes. */
export async function grantPortalScope(uow: UnitOfWork, actor: Actor, input: { grantId: string; expectedVersion?: number | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Portal scopes are granted by people only.')
  const grant = await lockRow<{ id: string; status: string; version: number; proposedById: string | null; scope: string }>(uow.tx, 'PortalScopeGrant', input.grantId)
  if (grant.proposedById === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, 'Someone other than the proposer must grant this scope.')
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, 'The grant changed since you loaded it.', { currentStatus: grant.status, currentVersion: grant.version })
  await casUpdate(uow, { model: 'PortalScopeGrant', id: grant.id, version: grant.version, from: ['proposed'], to: 'granted', actor, eventType: 'portal.scope_granted', approverId: actor.userId, data: { grantedById: actor.userId, grantedAt: uow.now } })
  return { grantId: grant.id, status: 'granted' }
}

/** granted/proposed → revoked; bumps the account session epoch so open sessions end now. */
export async function revokePortalScope(uow: UnitOfWork, actor: Actor, input: { grantId: string; reason: string; expectedVersion?: number | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Portal scopes are revoked by people only.')
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the scope is revoked.', { field: 'reason' })
  const grant = await lockRow<{ id: string; status: string; version: number; accountId: string | null }>(uow.tx, 'PortalScopeGrant', input.grantId)
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, 'The grant changed since you loaded it.', { currentStatus: grant.status, currentVersion: grant.version })
  await casUpdate(uow, { model: 'PortalScopeGrant', id: grant.id, version: grant.version, from: ['proposed', 'granted'], to: 'revoked', actor, eventType: 'portal.scope_revoked', reason: input.reason.trim(), data: { revokedAt: uow.now, revokeReason: input.reason.trim() } })
  if (grant.accountId) await uow.tx.portalAccount.update({ where: { id: grant.accountId }, data: { sessionEpoch: { increment: 1 }, version: { increment: 1 } } })
  return { grantId: grant.id, status: 'revoked' }
}

/** Suspend, reinstate or revoke a portal account (revoking ends every scope). */
export async function setPortalAccountStatus(uow: UnitOfWork, actor: Actor, input: { accountId: string; to: 'suspended' | 'active' | 'revoked'; reason: string; expectedVersion?: number | null }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Portal accounts are managed by people only.')
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why.', { field: 'reason' })
  const from = input.to === 'suspended' ? ['active'] : input.to === 'active' ? ['suspended'] : ['invited', 'active', 'suspended']
  const account = await lockRow<{ id: string; status: string; version: number }>(uow.tx, 'PortalAccount', input.accountId)
  if (input.expectedVersion != null && input.expectedVersion !== account.version) throw new DomainError(Codes.STALE_STATE, 'The account changed since you loaded it.', { currentStatus: account.status, currentVersion: account.version })
  await casUpdate(uow, { model: 'PortalAccount', id: account.id, version: account.version, from, to: input.to, actor, eventType: `portal.${input.to}`, reason: input.reason.trim(), data: { sessionEpoch: { increment: 1 }, ...(input.to === 'revoked' ? { invitationTokenHash: '' } : {}) } })
  if (input.to === 'revoked') {
    const grants = await uow.tx.portalScopeGrant.findMany({ where: { accountId: account.id, status: { in: ['proposed', 'granted'] } }, select: { id: true, version: true, status: true } })
    for (const grant of grants) await casUpdate(uow, { model: 'PortalScopeGrant', id: grant.id, version: grant.version, from: [grant.status], to: 'revoked', actor, eventType: 'portal.scope_revoked', reason: 'account revoked', data: { revokedAt: uow.now, revokeReason: 'account revoked' } })
  }
  return { accountId: account.id, status: input.to }
}
