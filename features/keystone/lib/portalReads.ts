import { createHash } from 'node:crypto'
import { DomainError, Codes } from './errors'
import { localDate } from './calendar'
import { MFA_SCOPES, PORTAL_SCOPES } from '../models/sales'
import { phiReferenceSecret, referenceToken } from '../security/phiReadAudit'
import type { Tx } from './db'

/**
 * Family portal reads (STATE-MACHINES §14, phase 1 scopes: updates, calendar, documents). APIs only.
 * A portal user reads a resident only through a GRANTED scope on their own ACTIVE account; MFA
 * scopes need an enrolled account. Every read that returns resident data writes a PhiReadAudit
 * row with purpose `family_access` (fail closed: no audit, no data). Staff sessions are refused.
 */

type Scope = (typeof PORTAL_SCOPES)[number]

export type PortalPrincipal = { userId: string; kind: string | null | undefined }

/** The portal account behind a session, or a refusal that reveals nothing. */
export async function portalAccountFor(tx: Tx, principal: PortalPrincipal) {
  if (principal.kind !== 'portal') throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to the family portal.')
  const account = await tx.portalAccount.findFirst({ where: { userId: principal.userId }, select: { id: true, status: true, mfaEnrolled: true, sessionEpoch: true } })
  if (!account || account.status !== 'active') throw new DomainError(Codes.NOT_AUTHORIZED, 'This portal account is not active.')
  return account
}

/** Which residents and scopes the account may read. */
export async function portalResidents(tx: Tx, principal: PortalPrincipal) {
  const account = await portalAccountFor(tx, principal)
  const grants = await tx.portalScopeGrant.findMany({ where: { accountId: account.id, status: 'granted' }, select: { residentId: true, scope: true, resident: { select: { id: true, firstName: true, preferredName: true, status: true, community: { select: { name: true, slug: true } } } } } })
  const byResident = new Map<string, { residentId: string; name: string; community: string; scopes: string[] }>()
  for (const grant of grants) {
    if (!grant.resident || !grant.residentId) continue
    const row = byResident.get(grant.residentId) ?? { residentId: grant.residentId, name: grant.resident.preferredName || grant.resident.firstName, community: grant.resident.community?.name ?? '', scopes: [] }
    row.scopes.push(grant.scope)
    byResident.set(grant.residentId, row)
  }
  // Names are resident data: each listed resident gets an audit row like any other portal read.
  for (const residentId of byResident.keys()) await auditPortalRead(tx, principal, 'portalMe', residentId, ['Resident.firstName', 'Resident.community'], 1)
  return { mfaEnrolled: account.mfaEnrolled, residents: [...byResident.values()] }
}

async function requireScope(tx: Tx, principal: PortalPrincipal, residentId: string, scope: Scope) {
  const account = await portalAccountFor(tx, principal)
  const grant = await tx.portalScopeGrant.findFirst({ where: { accountId: account.id, residentId, scope, status: 'granted' }, select: { id: true } })
  // Not granted and not found look the same: a portal user can't probe for residents.
  if (!grant) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (MFA_SCOPES.has(scope) && !account.mfaEnrolled) throw new DomainError(Codes.GUARD_FAILED, 'Turn on two-step sign-in to see this.', { reason: 'mfa_required' })
  return account
}

async function auditPortalRead(tx: Tx, principal: PortalPrincipal, operationName: string, residentId: string, fields: string[], count: number) {
  const secret = phiReferenceSecret()
  if (secret.length < 32) throw new DomainError(Codes.GUARD_FAILED, 'Protected data auditing is unavailable.')
  const reference = referenceToken(secret, 'Resident', residentId)
  await tx.phiReadAudit.create({
    data: {
      occurredAt: new Date(), actorReference: referenceToken(secret, 'principal', `user:${principal.userId}`), actorKind: 'portal',
      operationType: 'query', operationName, rootFields: [operationName], selectedFields: fields,
      selectionDigest: createHash('sha256').update(`${operationName}:${fields.join(',')}`).digest('hex'),
      resultReferenceDigest: createHash('sha256').update(reference).digest('hex'), resourceReferences: [reference],
      purpose: 'family_access', breakGlass: false, resultCount: count, success: true,
    },
  })
}

/** `updates`: where the resident is now (community and setting, never the room) and recent moves. */
export async function portalUpdates(tx: Tx, principal: PortalPrincipal, residentId: string) {
  await requireScope(tx, principal, residentId, 'updates')
  const resident = await tx.resident.findUnique({ where: { id: residentId }, select: { preferredName: true, firstName: true, status: true, currentStay: { select: { setting: true, presence: true, admittedAt: true, community: { select: { name: true, phone: true } } } } } })
  if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const stay = resident.currentStay
  // Presence is shared as "at the community" or "away"; the reason for an absence (hospital) is clinical and needs care_summary.
  const result = {
    name: resident.preferredName || resident.firstName,
    status: resident.status,
    community: stay?.community?.name ?? null,
    communityPhone: stay?.community?.phone ?? null,
    setting: stay?.setting ?? null,
    whereabouts: !stay ? null : stay.presence === 'in_house' ? 'at_community' : stay.presence?.startsWith('on_leave') ? 'away' : null,
    since: stay?.admittedAt ?? null,
  }
  await auditPortalRead(tx, principal, 'portalUpdates', residentId, ['Resident.firstName', 'Stay.setting', 'Stay.presence'], 1)
  return result
}

/** `calendar`: community-wide tour and event times for the coming weeks (no other residents). */
export async function portalCalendar(tx: Tx, principal: PortalPrincipal, residentId: string, now = new Date()) {
  await requireScope(tx, principal, residentId, 'calendar')
  const resident = await tx.resident.findUnique({ where: { id: residentId }, select: { community: { select: { id: true, timeZone: true, holidayCalendarId: true } } } })
  const community = resident?.community
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const today = localDate(community.timeZone, now)
  const holidays = community.holidayCalendarId ? await tx.holidayDate.findMany({ where: { calendarId: community.holidayCalendarId, date: { gte: new Date(`${today}T00:00:00Z`), lt: new Date(now.getTime() + 60 * 86_400_000) } }, orderBy: { date: 'asc' }, select: { date: true, name: true } }) : []
  await auditPortalRead(tx, principal, 'portalCalendar', residentId, ['Resident.community'], holidays.length)
  return { timeZone: community.timeZone, from: today, holidays: holidays.map(h => ({ date: h.date.toISOString().slice(0, 10), name: h.name })) }
}

/** `documents`: signed documents for the resident that families may see (agreements, notices). */
export async function portalDocuments(tx: Tx, principal: PortalPrincipal, residentId: string) {
  await requireScope(tx, principal, residentId, 'documents')
  const docs = await tx.document.findMany({ where: { residentId, status: { in: ['signed', 'final'] }, kind: { in: ['admission_agreement', 'residency_agreement', 'notice', 'bed_hold_policy'] } }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, kind: true, signedAt: true, createdAt: true } })
  const notices = await tx.noticeDelivery.findMany({ where: { residentId }, orderBy: { deliveredAt: 'desc' }, take: 100, select: { id: true, kind: true, method: true, deliveredAt: true, acknowledgement: true } })
  await auditPortalRead(tx, principal, 'portalDocuments', residentId, ['Document.title', 'NoticeDelivery.kind'], docs.length + notices.length)
  return { documents: docs, notices }
}

/** Statements for a resident the account holds the `statements` scope for. Amounts are integer minor units as strings. */
export async function portalStatements(tx: Tx, principal: PortalPrincipal, residentId: string) {
  await requireScope(tx, principal, residentId, 'statements')
  const rows = await tx.statement.findMany({ where: { residentId }, orderBy: { issuedAt: 'desc' }, take: 24, select: { id: true, number: true, status: true, totalMinor: true, paidMinor: true, dueOn: true, issuedAt: true, lines: true } })
  await auditPortalRead(tx, principal, 'portalStatements', residentId, ['Statement.number', 'Statement.totalMinor', 'Statement.lines'], rows.length)
  return {
    statements: rows.map(row => ({
      id: row.id, number: row.number, status: row.status, totalMinor: String(row.totalMinor ?? 0n), paidMinor: String(row.paidMinor ?? 0n),
      balanceMinor: String((row.totalMinor ?? 0n) - (row.paidMinor ?? 0n)), dueOn: row.dueOn ? row.dueOn.toISOString().slice(0, 10) : null, issuedAt: row.issuedAt, lines: row.lines,
    })),
  }
}

/** The resident's funds balance (client-liability credits less debits) for a `trust_balance` grant. Read only. */
export async function portalTrustBalance(tx: Tx, principal: PortalPrincipal, residentId: string) {
  await requireScope(tx, principal, residentId, 'trust_balance')
  const ledger = await tx.residentTrustLedger.findFirst({ where: { residentId }, select: { id: true, status: true } })
  let balance = 0n
  if (ledger) {
    const lines = await tx.trustLedgerLine.findMany({ where: { ledgerId: ledger.id, bucket: 'client_liability' }, select: { side: true, amountMinor: true } })
    for (const line of lines) balance += line.side === 'credit' ? (line.amountMinor ?? 0n) : -(line.amountMinor ?? 0n)
  }
  await auditPortalRead(tx, principal, 'portalTrustBalance', residentId, ['ResidentTrustLedger.balance'], 1)
  return { hasLedger: Boolean(ledger), status: ledger?.status ?? null, balanceMinor: balance.toString() }
}
