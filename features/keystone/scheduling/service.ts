import { actorUserId, systemActor, type Actor } from '../lib/actor'
import { addDays, localDate, zonedInstant } from '../lib/calendar'
import { sha256 } from '../lib/canonical'
import { auditCreate, casUpdate, lockRow, transition } from '../lib/cas'
import { deriveCensusDay } from '../lib/censusDay'
import { createTask } from '../lib/clinical/common'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { assertCanDecide } from '../lib/separationOfDuties'
import { createPublicToken, hashPublicToken, publicTokenMatches, verifyPublicToken } from '../lib/publicToken'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { weekStartOf } from '../pbj/pbj'

/*
 * Phase 5 workforce depth. Shifts and assignments with a credential check at assignment, open-shift offers by link, credentials
 * and their verification evidence (OIG LEIE file, Nursys and background-check results entered by HR), agency invoices matched to
 * the shifts worked, the payroll export, and staffing days measured against the Ohio and operator targets.
 * Everything runs in the request that asks for it: there is no sender, timer or worker.
 */

export const ROLES = { scheduler: 'Scheduler', hr: 'Human Resources', director: 'Executive Director' } as const
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
const HOUR = 3_600_000
const MAX_MINUTES_IN_24H = 16 * 60
const OFFER_HOURS = 72
const EXCLUSION_KINDS = ['oig_exclusion', 'state_exclusion']
const ACTIVE_ASSIGNMENT = ['accepted', 'assigned', 'started']
const WORKED_ASSIGNMENT = ['assigned', 'started', 'completed']

/** What each shift role needs on file and verified before a person can be assigned. */
export const REQUIRED_CREDENTIALS: Record<string, readonly string[]> = {
  rn: ['rn_licence', 'cpr', 'background_check_state', 'oig_exclusion'],
  lpn: ['lpn_licence', 'cpr', 'background_check_state', 'oig_exclusion'],
  cna: ['cna_registry', 'cpr', 'background_check_state', 'oig_exclusion'],
  med_aide: ['med_aide_cert', 'cpr', 'background_check_state', 'oig_exclusion'],
  other: ['background_check_state', 'oig_exclusion'],
}
export const CREDENTIAL_LABEL: Record<string, string> = {
  rn_licence: 'RN licence', lpn_licence: 'LPN licence', cna_registry: 'CNA registry (state nurse aide registry)', med_aide_cert: 'medication aide certificate',
  cpr: 'CPR certification', tb_screen: 'TB screen', background_check_state: 'state background check', background_check_fbi: 'FBI background check',
  oig_exclusion: 'OIG exclusion check', state_exclusion: 'state exclusion check', dementia_training: 'dementia training', abuse_training: 'abuse prevention training', in_service_hours: 'in-service hours',
}
const REASON: Record<string, string> = {
  missing: 'not on file', pending_verification: 'not verified yet', expired: 'expired', revoked: 'revoked', suspended: 'suspended', expires_before_shift_ends: 'expires before the shift ends',
}
export const TRAINING_KINDS = ['in_service_hours', 'dementia_training', 'abuse_training']

export type CredentialGap = { kind: string; label: string; reason: string }
export type AssignCheck = { ok: boolean; gaps: CredentialGap[]; problems: string[]; checkedAt: string; role: string; excluded: boolean }

const hundredths = (text: string) => {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!m) throw new DomainError(Codes.INVALID_INPUT, 'Hours per resident day look like 2.50.', { field: 'value' })
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0)
}
const fromHundredths = (n: number) => `${Math.floor(n / 100)}.${String(n % 100).padStart(2, '0')}`

async function zoneOf(tx: Tx, communityId: string) {
  return (await tx.community.findUniqueOrThrow({ where: { id: communityId }, select: { timeZone: true } })).timeZone || 'America/New_York'
}
const fmt = (tz: string, d: Date) => d.toLocaleString('en-US', { timeZone: tz, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ---- Credential check ------------------------------------------------------------------------------------------- */

/** Can this person work this window in this role? Reads the credentials, the exclusion status and the agency contract. */
export async function checkAssignable(tx: Tx, staffMemberId: string, window: { role: string; startsAt: Date; endsAt: Date }, now: Date): Promise<AssignCheck> {
  const staff = await tx.staffMember.findUniqueOrThrow({ where: { id: staffMemberId }, include: { jobCode: true, agencyVendor: true } })
  const tz = await zoneOf(tx, staff.communityId!)
  const gaps: CredentialGap[] = []
  const problems: string[] = []
  const category = staff.jobCode?.category ?? 'other'
  if (staff.status !== 'active') problems.push(`${staff.name} is ${staff.status.replace('_', ' ')}.`)
  if (category !== window.role) problems.push(`${staff.name} is ${staff.jobCode?.title ?? 'not mapped to a job code'}, and this shift needs a ${window.role.toUpperCase()}.`)
  const lastDay = localDate(tz, new Date(window.endsAt.getTime() - 1))
  const creds = await tx.credential.findMany({ where: { staffMemberId, communityId: staff.communityId } })
  let excluded = false
  for (const kind of REQUIRED_CREDENTIALS[window.role] ?? REQUIRED_CREDENTIALS.other) {
    const ofKind = creds.filter(c => c.kind === kind)
    const usable = ofKind.find(c => ['verified', 'expiring'].includes(c.status) && (!c.expiresAt || iso(c.expiresAt) >= lastDay))
    if (usable) continue
    const worst = ofKind.find(c => ['revoked', 'suspended', 'expired'].includes(c.status)) ?? ofKind.find(c => ['verified', 'expiring'].includes(c.status)) ?? ofKind[0]
    const reason = !worst ? 'missing' : ['verified', 'expiring'].includes(worst.status) ? 'expires_before_shift_ends' : worst.status
    gaps.push({ kind, label: CREDENTIAL_LABEL[kind] ?? kind, reason })
  }
  for (const c of creds) if (EXCLUSION_KINDS.includes(c.kind) && c.status === 'revoked') excluded = true
  if (excluded && !gaps.some(g => EXCLUSION_KINDS.includes(g.kind))) gaps.push({ kind: 'oig_exclusion', label: CREDENTIAL_LABEL.oig_exclusion, reason: 'revoked' })
  if (staff.agency) {
    const v = staff.agencyVendor
    const shiftDay = localDate(tz, window.startsAt)
    if (!v || v.status !== 'active') problems.push(`${staff.name} is agency staff without an active agency contract.`)
    else if ((v.contractStart && iso(v.contractStart) > shiftDay) || (v.contractEnd && iso(v.contractEnd) < shiftDay)) problems.push(`${v.name}'s contract does not cover ${shiftDay}.`)
    else if (!rateFor(v.rateCard, window.role)) problems.push(`${v.name} has no contract rate for ${window.role.toUpperCase()} shifts.`)
  }
  return { ok: !gaps.length && !problems.length, gaps, problems, checkedAt: now.toISOString(), role: window.role, excluded }
}

const rateFor = (card: unknown, role: string): bigint | null => {
  const v = (card as Record<string, unknown> | null)?.[role]
  return typeof v === 'number' || typeof v === 'string' ? (/^\d+$/.test(String(v)) ? BigInt(String(v)) : null) : null
}

function refusal(name: string, check: AssignCheck) {
  const gaps = check.gaps.map(g => `${g.label} (${REASON[g.reason] ?? g.reason})`)
  const parts: string[] = []
  if (gaps.length) parts.push(`Missing credential: ${gaps.join(', ')}.`)
  parts.push(...check.problems)
  return `${name} can't be assigned. ${parts.join(' ')}`.trim()
}

/* ---- Shifts and assignments -------------------------------------------------------------------------------------- */

export async function createShift(uow: UnitOfWork, actor: Actor, input: { communityId: string; unitId?: string | null; role: string; date: string; startTime: string; endTime: string; required?: number; note?: string }) {
  if (!['rn', 'lpn', 'cna', 'med_aide', 'other'].includes(input.role)) throw new DomainError(Codes.INVALID_INPUT, 'Role must be rn, lpn, cna, med_aide or other.', { field: 'role' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{1,2}:\d{2}$/.test(input.startTime) || !/^\d{1,2}:\d{2}$/.test(input.endTime)) throw new DomainError(Codes.INVALID_INPUT, 'Give a date and start and end times like 07:00.', { field: 'date' })
  const tz = await zoneOf(uow.tx, input.communityId)
  const startsAt = zonedInstant(tz, input.date, input.startTime.padStart(5, '0'))
  let endsAt = zonedInstant(tz, input.date, input.endTime.padStart(5, '0'))
  if (endsAt <= startsAt) endsAt = zonedInstant(tz, addDays(input.date, 1), input.endTime.padStart(5, '0'))
  if ((endsAt.getTime() - startsAt.getTime()) / HOUR > 16) throw new DomainError(Codes.INVALID_INPUT, 'A shift is at most 16 hours.', { field: 'endTime' })
  const required = Math.max(1, Math.min(50, Number(input.required ?? 1) || 1))
  if (input.unitId && !(await uow.tx.unit.findFirst({ where: { id: input.unitId, communityId: input.communityId } }))) throw new DomainError(Codes.NOT_FOUND, 'Unit not found.')
  const row = await uow.tx.shift.create({ data: { communityId: input.communityId, unitId: input.unitId || null, role: input.role, startsAt, endsAt, required, note: input.note?.trim() ?? '', status: 'open' } })
  auditCreate(uow, actor, 'Shift', row.id, 'shift.created', { role: input.role, startsAt: startsAt.toISOString(), required })
  await projectStaffing(uow, actor, input.communityId, [localDate(tz, startsAt)])
  return { shiftId: row.id }
}

async function overlapProblem(tx: Tx, staffMemberId: string, startsAt: Date, endsAt: Date, tz: string, ignoreId?: string) {
  const clash = await tx.shiftAssignment.findFirst({ where: { staffMemberId, id: ignoreId ? { not: ignoreId } : undefined, status: { in: ACTIVE_ASSIGNMENT }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } })
  if (clash) return `Already assigned ${fmt(tz, clash.startsAt!)} to ${fmt(tz, clash.endsAt!)}.`
  const windowStart = new Date(endsAt.getTime() - 24 * HOUR)
  const near = await tx.shiftAssignment.findMany({ where: { staffMemberId, id: ignoreId ? { not: ignoreId } : undefined, status: { in: [...ACTIVE_ASSIGNMENT, 'completed'] }, startsAt: { lt: endsAt }, endsAt: { gt: windowStart } } })
  let minutes = (endsAt.getTime() - Math.max(startsAt.getTime(), windowStart.getTime())) / 60_000
  for (const a of near) minutes += (Math.min(a.endsAt!.getTime(), endsAt.getTime()) - Math.max(a.startsAt!.getTime(), windowStart.getTime())) / 60_000
  return minutes > MAX_MINUTES_IN_24H ? 'This would be more than 16 hours of work in 24 hours.' : null
}

/** Re-count the shift: open, filled, in progress or completed. */
async function refreshShift(uow: UnitOfWork, actor: Actor, shiftId: string) {
  const shift = await lockRow<{ id: string; status: string; required: number; version: number; communityId: string }>(uow.tx, 'Shift', shiftId)
  if (shift.status === 'cancelled') return shift.status
  const rows = await uow.tx.shiftAssignment.findMany({ where: { shiftId }, select: { status: true } })
  const live = rows.filter(r => WORKED_ASSIGNMENT.includes(r.status)).length
  const done = rows.filter(r => r.status === 'completed').length
  const started = rows.some(r => r.status === 'started')
  const to = done >= shift.required ? 'completed' : started || done > 0 ? 'in_progress' : live >= shift.required ? 'filled' : 'open'
  if (to !== shift.status) await casUpdate(uow, { model: 'Shift', id: shiftId, version: shift.version, from: [shift.status], to, actor, eventType: `shift.${to}` })
  return to
}

async function startAssignment(uow: UnitOfWork, actor: Actor, input: { shiftId: string; staffMemberId: string; status: 'offered' | 'assigned'; offerHours?: number }) {
  const shift = await lockRow<{ id: string; communityId: string; role: string; startsAt: Date; endsAt: Date; required: number; status: string }>(uow.tx, 'Shift', input.shiftId)
  const staff = await uow.tx.staffMember.findFirst({ where: { id: input.staffMemberId, communityId: shift.communityId }, include: { agencyVendor: true } })
  if (!staff) throw new DomainError(Codes.NOT_FOUND, 'Staff member not found.')
  if (shift.status === 'cancelled') throw new DomainError(Codes.GUARD_FAILED, 'This shift was cancelled.')
  if (shift.endsAt <= uow.now) throw new DomainError(Codes.GUARD_FAILED, 'This shift has already ended.')
  const rows = await uow.tx.shiftAssignment.findMany({ where: { shiftId: shift.id } })
  if (rows.some(r => r.staffMemberId === staff.id && ['offered', 'accepted', 'assigned', 'started', 'completed'].includes(r.status!))) throw new DomainError(Codes.GUARD_FAILED, `${staff.name} is already on this shift.`)
  if (input.status === 'assigned' && rows.filter(r => WORKED_ASSIGNMENT.includes(r.status!)).length >= shift.required) throw new DomainError(Codes.GUARD_FAILED, 'This shift is already filled.', { reason: 'filled' })
  const check = await checkAssignable(uow.tx, staff.id, { role: shift.role, startsAt: shift.startsAt, endsAt: shift.endsAt }, uow.now)
  if (!check.ok) throw new DomainError(Codes.GUARD_FAILED, refusal(staff.name, check), { reason: check.excluded ? 'excluded' : 'credentials', missing: check.gaps.map(g => g.kind), problems: check.problems })
  const tz = await zoneOf(uow.tx, shift.communityId)
  const problem = await overlapProblem(uow.tx, staff.id, shift.startsAt, shift.endsAt, tz)
  if (problem) throw new DomainError(Codes.GUARD_FAILED, `${staff.name} can't take this shift. ${problem}`, { reason: 'overlap' })
  const rate = staff.agency ? rateFor(staff.agencyVendor?.rateCard, shift.role) : null
  const row = await uow.tx.shiftAssignment.create({
    data: { communityId: shift.communityId, shiftId: shift.id, staffMemberId: staff.id, status: input.status, startsAt: shift.startsAt, endsAt: shift.endsAt, credentialCheck: check as never, agencyRateMinor: rate, decidedById: actorUserId(actor) },
  })
  let link: string | null = null
  if (input.status === 'offered') {
    const expires = Math.min(shift.startsAt.getTime(), uow.now.getTime() + (input.offerHours ?? OFFER_HOURS) * HOUR)
    const token = createPublicToken('shift-offer', row.id, expires)
    await uow.tx.shiftAssignment.update({ where: { id: row.id }, data: { offerTokenHash: hashPublicToken(token), offerExpiresAt: new Date(expires) } })
    link = `/shift-offer/${token}`
  }
  auditCreate(uow, actor, 'ShiftAssignment', row.id, input.status === 'offered' ? 'shift.offered' : 'shift.assigned', { staffMemberId: staff.id, shiftId: shift.id, check: { ok: true, checkedAt: check.checkedAt } })
  await refreshShift(uow, actor, shift.id)
  await projectStaffing(uow, actor, shift.communityId, [localDate(tz, shift.startsAt)])
  return { assignmentId: row.id, status: input.status, link, expiresAt: link ? iso(new Date(row.startsAt!)) : null }
}

export const assignStaff = (uow: UnitOfWork, actor: Actor, input: { shiftId: string; staffMemberId: string }) => startAssignment(uow, actor, { ...input, status: 'assigned' })
export const offerShift = (uow: UnitOfWork, actor: Actor, input: { shiftId: string; staffMemberId: string; hours?: number }) => startAssignment(uow, actor, { shiftId: input.shiftId, staffMemberId: input.staffMemberId, status: 'offered', offerHours: input.hours })

const MOVES: Record<string, string[]> = {
  offered: ['declined'], assigned: ['started', 'called_off', 'no_show', 'declined'], started: ['completed'], needs_coverage: ['declined'],
}

/** Scheduler moves: start (links the clock-in punch), complete, call off, no-show, withdraw. */
export async function moveAssignment(uow: UnitOfWork, actor: Actor, input: { assignmentId: string; to: string; reason?: string }) {
  const a = await lockRow<{ id: string; status: string; shiftId: string; staffMemberId: string; communityId: string; startsAt: Date; endsAt: Date; version: number }>(uow.tx, 'ShiftAssignment', input.assignmentId)
  if (!(MOVES[a.status] ?? []).includes(input.to)) throw new DomainError(Codes.INVALID_TRANSITION, `An assignment that is ${a.status.replace('_', ' ')} can't become ${input.to.replace('_', ' ')}.`)
  const data: Record<string, unknown> = { decidedById: actorUserId(actor) }
  if (input.to === 'started') {
    const punch = await uow.tx.timePunch.findFirst({ where: { staffMemberId: a.staffMemberId, kind: 'in', observedAt: { gte: new Date(a.startsAt.getTime() - 2 * HOUR), lte: a.endsAt } }, orderBy: { observedAt: 'asc' } })
    if (!punch) throw new DomainError(Codes.GUARD_FAILED, 'There is no clock-in punch for this person at this shift yet.', { reason: 'no_punch' })
    data.startPunchId = punch.id
  }
  if (['called_off', 'no_show'].includes(input.to)) {
    if (!input.reason?.trim() && input.to === 'called_off') throw new DomainError(Codes.INVALID_INPUT, 'Say why they called off.', { field: 'reason' })
    data.coverageReason = input.reason?.trim() ?? input.to
  }
  await casUpdate(uow, { model: 'ShiftAssignment', id: a.id, version: a.version, from: [a.status], to: input.to, actor, eventType: `shift.${input.to}`, reason: input.reason ?? null, data })
  await refreshShift(uow, actor, a.shiftId)
  const tz = await zoneOf(uow.tx, a.communityId)
  if (['called_off', 'no_show'].includes(input.to)) {
    const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: a.staffMemberId }, select: { name: true } })
    await createTask(uow, actor, { communityId: a.communityId, kind: 'general', title: `Cover the ${fmt(tz, a.startsAt)} shift: ${staff.name} ${input.to === 'no_show' ? 'did not show' : 'called off'}`, detail: input.reason ?? '', dedupeKey: `cover:${a.id}`, ownerRole: ROLES.scheduler, dueAt: new Date(Math.max(uow.now.getTime() + HOUR, a.startsAt.getTime() - 2 * HOUR)), subjectType: 'ShiftAssignment', subjectId: a.id })
  }
  await projectStaffing(uow, actor, a.communityId, [localDate(tz, a.startsAt)])
  return { assignmentId: a.id, status: input.to }
}

export async function cancelShift(uow: UnitOfWork, actor: Actor, input: { shiftId: string; reason: string }) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the shift is cancelled.', { field: 'reason' })
  const s = await transition(uow, { model: 'Shift', id: input.shiftId, from: ['open', 'filled'], to: 'cancelled', actor, eventType: 'shift.cancelled', reason: input.reason.trim() })
  const open = await uow.tx.shiftAssignment.findMany({ where: { shiftId: input.shiftId, status: { in: ['offered', 'accepted', 'assigned', 'needs_coverage'] } } })
  for (const a of open) await casUpdate(uow, { model: 'ShiftAssignment', id: a.id, version: a.version, from: [a.status!], to: 'declined', actor, eventType: 'shift.declined', reason: 'Shift cancelled', data: { offerTokenHash: '' } })
  const tz = await zoneOf(uow.tx, s.communityId as string)
  await projectStaffing(uow, actor, s.communityId as string, [localDate(tz, s.startsAt as Date)])
  return { shiftId: input.shiftId, status: 'cancelled' }
}

/* ---- Open-shift offers (public link) ----------------------------------------------------------------------------- */

export type OfferView = { valid: true; staffName: string; role: string; unit: string; startsAt: string; endsAt: string; timeZone: string; community: string; status: string; expiresAt: string } | { valid: false; message: string }

const BAD_LINK = 'This link is not valid, or it has expired.'

async function offerFor(tx: Tx, token: string) {
  const payload = verifyPublicToken(token, 'shift-offer')
  if (!payload) return null
  const a = await tx.shiftAssignment.findUnique({ where: { id: payload.subjectId }, include: { shift: { include: { unit: true } }, staffMember: true, community: true } })
  if (!a || !publicTokenMatches(token, a.offerTokenHash)) return null
  return a
}

export async function viewOffer(tx: Tx, token: string): Promise<OfferView> {
  const a = await offerFor(tx, token)
  if (!a) return { valid: false, message: BAD_LINK }
  return { valid: true, staffName: a.staffMember?.name ?? '', role: a.shift?.role ?? '', unit: a.shift?.unit?.name ?? '', startsAt: a.startsAt!.toISOString(), endsAt: a.endsAt!.toISOString(), timeZone: a.community?.timeZone ?? 'America/New_York', community: a.community?.name ?? '', status: a.status!, expiresAt: a.offerExpiresAt?.toISOString() ?? '' }
}

/** The staff member opens the copied link and answers. Handled in the request: no sender, no account. */
export async function answerOffer(uow: UnitOfWork, input: { token: string; answer: 'accept' | 'decline' }) {
  const found = await offerFor(uow.tx, input.token)
  if (!found) throw new DomainError(Codes.INVALID_INPUT, BAD_LINK)
  const actor = systemActor('shift-offer-link')
  const a = await lockRow<{ id: string; status: string; shiftId: string; staffMemberId: string; communityId: string; version: number; offerExpiresAt: Date | null }>(uow.tx, 'ShiftAssignment', found.id)
  if (a.status !== 'offered') throw new DomainError(Codes.GUARD_FAILED, a.status === 'assigned' ? 'You already accepted this shift.' : 'This offer is no longer open.')
  if (a.offerExpiresAt && a.offerExpiresAt <= uow.now) throw new DomainError(Codes.GUARD_FAILED, BAD_LINK)
  if (input.answer === 'decline') {
    await casUpdate(uow, { model: 'ShiftAssignment', id: a.id, version: a.version, from: ['offered'], to: 'declined', actor, eventType: 'shift.offer_declined', data: { offerTokenHash: '' }, metadata: { staffMemberId: a.staffMemberId } })
    return { status: 'declined' }
  }
  const shift = await lockRow<{ id: string; status: string; role: string; startsAt: Date; endsAt: Date; required: number; communityId: string }>(uow.tx, 'Shift', a.shiftId)
  if (shift.status === 'cancelled') throw new DomainError(Codes.GUARD_FAILED, 'This shift was cancelled.')
  if (shift.startsAt <= uow.now) throw new DomainError(Codes.GUARD_FAILED, 'This shift has already started.')
  const filled = await uow.tx.shiftAssignment.count({ where: { shiftId: shift.id, status: { in: WORKED_ASSIGNMENT } } })
  if (filled >= shift.required) throw new DomainError(Codes.GUARD_FAILED, 'Someone else already took this shift.', { reason: 'filled' })
  const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: a.staffMemberId } })
  const check = await checkAssignable(uow.tx, staff.id, { role: shift.role, startsAt: shift.startsAt, endsAt: shift.endsAt }, uow.now)
  if (!check.ok) throw new DomainError(Codes.GUARD_FAILED, `You can't take this shift yet. ${check.gaps.length ? `Missing credential: ${check.gaps.map(g => `${g.label} (${REASON[g.reason] ?? g.reason})`).join(', ')}. Contact HR.` : check.problems.join(' ')}`, { reason: 'credentials', missing: check.gaps.map(g => g.kind) })
  const tz = await zoneOf(uow.tx, shift.communityId)
  const problem = await overlapProblem(uow.tx, staff.id, shift.startsAt, shift.endsAt, tz, a.id)
  if (problem) throw new DomainError(Codes.GUARD_FAILED, `You can't take this shift. ${problem}`, { reason: 'overlap' })
  await casUpdate(uow, { model: 'ShiftAssignment', id: a.id, version: a.version, from: ['offered'], to: 'assigned', actor, eventType: 'shift.offer_accepted', data: { credentialCheck: check as never, offerTokenHash: '' }, metadata: { staffMemberId: staff.id } })
  await refreshShift(uow, actor, shift.id)
  await projectStaffing(uow, actor, shift.communityId, [localDate(tz, shift.startsAt)])
  return { status: 'assigned' }
}

/* ---- Credentials ------------------------------------------------------------------------------------------------- */

export async function saveCredential(uow: UnitOfWork, actor: Actor, input: { staffMemberId: string; kind: string; jurisdiction?: string; number?: string; issuedAt?: string | null; expiresAt?: string | null; document?: string }) {
  if (!CREDENTIAL_LABEL[input.kind]) throw new DomainError(Codes.INVALID_INPUT, 'Unknown credential kind.', { field: 'kind' })
  if (TRAINING_KINDS.includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Record training with Record training.', { field: 'kind' })
  const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: input.staffMemberId } })
  const data = { jurisdiction: input.jurisdiction?.trim() ?? '', number: input.number?.trim() ?? '', issuedAt: input.issuedAt ? day(input.issuedAt) : null, expiresAt: input.expiresAt ? day(input.expiresAt) : null, document: input.document?.trim() ?? '' }
  const existing = await uow.tx.credential.findFirst({ where: { staffMemberId: staff.id, kind: input.kind, status: { in: ['pending_verification', 'verified', 'expiring'] } }, orderBy: { createdAt: 'desc' } })
  if (existing) {
    await uow.tx.credential.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Credential', existing.id, 'credential.updated', { kind: input.kind })
    return { credentialId: existing.id, created: false }
  }
  const row = await uow.tx.credential.create({ data: { communityId: staff.communityId, staffMemberId: staff.id, kind: input.kind, status: 'pending_verification', ...data } })
  auditCreate(uow, actor, 'Credential', row.id, 'credential.created', { kind: input.kind, staff: staff.employeeId })
  return { credentialId: row.id, created: true }
}

const SOURCES = ['nursys', 'state_registry', 'background_vendor', 'manual']
const RESULTS = ['clear', 'match', 'mismatch', 'error']

/**
 * HR enters what a source said (Nursys lookup, state registry, background-check vendor result, a manual primary-source check).
 * Verified needs evidence: the source, the time, the person and a reference (confirmation number or document).
 * An adverse result on an exclusion or background check revokes; a mismatch suspends; an error changes nothing.
 */
export async function verifyCredential(uow: UnitOfWork, actor: Actor, input: { credentialId: string; source: string; result: string; reference: string; note?: string; sourceVersion?: string }) {
  if (!SOURCES.includes(input.source)) throw new DomainError(Codes.INVALID_INPUT, 'Source must be Nursys, state registry, background vendor or manual.', { field: 'source' })
  if (!RESULTS.includes(input.result)) throw new DomainError(Codes.INVALID_INPUT, 'Result must be clear, match, mismatch or error.', { field: 'result' })
  if (!input.reference?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the confirmation number or document reference. A verification needs evidence.', { field: 'reference' })
  const cred = await uow.tx.credential.findUniqueOrThrow({ where: { id: input.credentialId } })
  await recordVerification(uow, actor, cred, { source: input.source, result: input.result, evidence: { reference: input.reference.trim(), note: input.note?.trim() ?? '' }, sourceVersion: input.sourceVersion ?? '' })
  return { credentialId: cred.id, result: input.result }
}

type CredRow = { id: string; communityId: string | null; staffMemberId: string | null; kind: string | null; status: string | null; version: number }

async function recordVerification(uow: UnitOfWork, actor: Actor, cred: CredRow, v: { source: string; result: string; evidence: Record<string, unknown>; sourceVersion: string }) {
  await uow.tx.credentialVerification.create({ data: { communityId: cred.communityId, credentialId: cred.id, staffMemberId: cred.staffMemberId, source: v.source, sourceVersion: v.sourceVersion, result: v.result, verifiedAt: uow.now, verifiedById: actorUserId(actor), evidence: v.evidence as never } })
  const to = v.result === 'clear' ? 'verified' : v.result === 'match' ? 'revoked' : v.result === 'mismatch' ? 'suspended' : null
  if (!to || to === cred.status) return
  await casUpdate(uow, { model: 'Credential', id: cred.id, version: cred.version, from: [cred.status!], to, actor, eventType: `credential.${to}`, metadata: { source: v.source, sourceVersion: v.sourceVersion } })
  if (to !== 'verified') await reevaluateFuture(uow, actor, cred.staffMemberId!, `${CREDENTIAL_LABEL[cred.kind!] ?? cred.kind} ${to}`)
}

/** A credential lapsed or was revoked: every future assignment is checked again and the failing ones need coverage (I-W1). */
export async function reevaluateFuture(uow: UnitOfWork, actor: Actor, staffMemberId: string, why: string) {
  const future = await uow.tx.shiftAssignment.findMany({ where: { staffMemberId, status: { in: ['offered', 'accepted', 'assigned'] }, startsAt: { gt: uow.now } }, include: { shift: true, staffMember: { select: { name: true } } } })
  let moved = 0
  for (const a of future) {
    const check = await checkAssignable(uow.tx, staffMemberId, { role: a.shift!.role!, startsAt: a.startsAt!, endsAt: a.endsAt! }, uow.now)
    if (check.ok) continue
    const tz = await zoneOf(uow.tx, a.communityId!)
    await casUpdate(uow, { model: 'ShiftAssignment', id: a.id, version: a.version, from: [a.status!], to: 'needs_coverage', actor, eventType: 'shift.needs_coverage', reason: why, data: { coverageReason: why, offerTokenHash: '', credentialCheck: check as never } })
    await refreshShift(uow, actor, a.shiftId!)
    await createTask(uow, actor, { communityId: a.communityId!, kind: 'escalation', title: `Cover the ${fmt(tz, a.startsAt!)} ${a.shift!.role!.toUpperCase()} shift: ${a.staffMember?.name} can no longer work it`, detail: `${why}. ${refusal(a.staffMember?.name ?? 'This person', check)}`, dedupeKey: `needs-coverage:${a.id}`, ownerRole: ROLES.scheduler, dueAt: new Date(Math.max(uow.now.getTime() + HOUR, a.startsAt!.getTime() - 2 * HOUR)), subjectType: 'ShiftAssignment', subjectId: a.id })
    await projectStaffing(uow, actor, a.communityId!, [localDate(tz, a.startsAt!)])
    moved += 1
  }
  return moved
}

export async function recordTraining(uow: UnitOfWork, actor: Actor, input: { staffMemberId: string; kind: string; minutes: number; completedOn: string; reference: string }) {
  if (!TRAINING_KINDS.includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Training is in-service hours, dementia training or abuse prevention training.', { field: 'kind' })
  const minutes = Math.round(Number(input.minutes))
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) throw new DomainError(Codes.INVALID_INPUT, 'Enter the minutes completed, up to 24 hours.', { field: 'minutes' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.completedOn) || input.completedOn > iso(uow.now)) throw new DomainError(Codes.INVALID_INPUT, 'Give the date it was completed (not in the future).', { field: 'completedOn' })
  if (!input.reference?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the sign-in sheet or certificate reference.', { field: 'reference' })
  const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: input.staffMemberId } })
  const row = await uow.tx.credential.create({ data: { communityId: staff.communityId, staffMemberId: staff.id, kind: input.kind, status: 'pending_verification', minutesCompleted: minutes, completedOn: day(input.completedOn), document: input.reference.trim() } })
  auditCreate(uow, actor, 'Credential', row.id, 'training.recorded', { kind: input.kind, minutes, completedOn: input.completedOn })
  await recordVerification(uow, actor, { ...row, version: 0 } as CredRow, { source: 'manual', result: 'clear', evidence: { reference: input.reference.trim() }, sourceVersion: '' })
  return { credentialId: row.id }
}

/** Expiry, run on the request that touches it: past the date is expired; inside 30 days is expiring (HR task). */
export async function sweepCredentialExpiry(uow: UnitOfWork, actor: Actor) {
  const today = day(iso(uow.now))
  const soon = day(addDays(iso(uow.now), 30))
  const lapsed = await uow.tx.credential.findMany({ where: { status: { in: ['verified', 'expiring'] }, expiresAt: { lt: today } }, include: { staffMember: { select: { name: true } } } })
  for (const c of lapsed) {
    await casUpdate(uow, { model: 'Credential', id: c.id, version: c.version, from: [c.status!], to: 'expired', actor, eventType: 'credential.expired' })
    await reevaluateFuture(uow, actor, c.staffMemberId!, `${CREDENTIAL_LABEL[c.kind!] ?? c.kind} expired`)
    await createTask(uow, actor, { communityId: c.communityId!, kind: 'general', title: `${c.staffMember?.name}: ${CREDENTIAL_LABEL[c.kind!] ?? c.kind} expired`, dedupeKey: `cred-expired:${c.id}`, ownerRole: ROLES.hr, subjectType: 'Credential', subjectId: c.id })
  }
  const expiring = await uow.tx.credential.findMany({ where: { status: 'verified', expiresAt: { gte: today, lt: soon } }, include: { staffMember: { select: { name: true } } } })
  for (const c of expiring) {
    await casUpdate(uow, { model: 'Credential', id: c.id, version: c.version, from: ['verified'], to: 'expiring', actor, eventType: 'credential.expiring' })
    await createTask(uow, actor, { communityId: c.communityId!, kind: 'general', title: `${c.staffMember?.name}: ${CREDENTIAL_LABEL[c.kind!] ?? c.kind} expires ${iso(c.expiresAt)}`, dedupeKey: `cred-expiring:${c.id}`, ownerRole: ROLES.hr, dueAt: c.expiresAt, subjectType: 'Credential', subjectId: c.id })
  }
  return { expired: lapsed.length, expiring: expiring.length }
}

/* ---- OIG LEIE monthly file --------------------------------------------------------------------------------------- */

function csvFields(line: string) {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1 } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const nameKey = (last: string, first: string) => `${last.toLowerCase().replace(/[^a-z]/g, '')}|${first.toLowerCase().replace(/[^a-z]/g, '')}`
/** "Patrick Oyelaran, RN" → first Patrick, last Oyelaran. */
export function splitStaffName(name: string) {
  const parts = name.replace(/,.*$/, '').replace(/\b(jr|sr|ii|iii|iv)\.?$/i, '').trim().split(/\s+/)
  return { first: parts[0] ?? '', last: parts.length > 1 ? parts[parts.length - 1] : '' }
}

/**
 * HR uploads the monthly LEIE file (oig.hhs.gov/exclusions). Every active person in the community is checked by name.
 * A match revokes their exclusion credential, blocks scheduling, moves their future shifts to needs coverage and raises an
 * HR task and an Executive Director task. A name match is a lead, not proof: HR confirms identity on the OIG site.
 */
export async function importLeie(uow: UnitOfWork, actor: Actor, input: { communityId: string; month: string; text: string }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new DomainError(Codes.INVALID_INPUT, 'The month looks like 2026-11.', { field: 'month' })
  const lines = input.text.split(/\r?\n/)
  if (!/^"?LASTNAME"?\s*,\s*"?FIRSTNAME/i.test(lines[0] ?? '')) throw new DomainError(Codes.INVALID_INPUT, 'This is not an OIG LEIE file. The first line must start LASTNAME,FIRSTNAME.', { field: 'file' })
  const fileHash = sha256(input.text)
  if (await uow.tx.leieImport.findFirst({ where: { communityId: input.communityId, OR: [{ fileHash }, { month: input.month }] } })) throw new DomainError(Codes.GUARD_FAILED, 'This LEIE file or month was already imported for this community.', { reason: 'duplicate' })
  const staff = await uow.tx.staffMember.findMany({ where: { communityId: input.communityId, status: { in: ['active', 'on_leave'] } } })
  const byName = new Map<string, typeof staff>()
  for (const s of staff) { const n = splitStaffName(s.name); const k = nameKey(n.last, n.first); byName.set(k, [...(byName.get(k) ?? []), s]) }
  const hits = new Map<string, { s: (typeof staff)[number]; evidence: Record<string, unknown> }>()
  let rows = 0
  for (const line of lines.slice(1)) {
    if (!line) continue
    rows += 1
    const comma = line.indexOf(',')
    if (comma < 0) continue
    const f = csvFields(line)
    const matches = byName.get(nameKey(f[0] ?? '', f[1] ?? ''))
    if (!matches) continue
    const reinstated = (f[15] ?? '').trim() && !/^0+$/.test((f[15] ?? '').trim())
    if (reinstated) continue
    for (const s of matches) hits.set(s.id, { s, evidence: { matchBasis: 'name', lastName: f[0], firstName: f[1], exclusionType: f[13] ?? '', exclusionDate: f[14] ?? '', state: f[11] ?? '', note: 'Name match only. Confirm identity on the OIG site before acting on employment.' } })
  }
  const imp = await uow.tx.leieImport.create({ data: { communityId: input.communityId, month: input.month, fileHash, rows, checked: staff.length, matches: hits.size, uploadedById: actorUserId(actor) } })
  const reference = `LEIE ${input.month}`
  for (const s of staff) {
    const hit = hits.get(s.id)
    let cred = await uow.tx.credential.findFirst({ where: { staffMemberId: s.id, kind: 'oig_exclusion' }, orderBy: { createdAt: 'desc' } })
    if (!cred) cred = await uow.tx.credential.create({ data: { communityId: input.communityId, staffMemberId: s.id, kind: 'oig_exclusion', status: 'pending_verification', jurisdiction: 'US', document: reference } })
    await recordVerification(uow, actor, cred as CredRow, { source: 'oig_leie_file', result: hit ? 'match' : 'clear', evidence: hit ? hit.evidence : { reference }, sourceVersion: input.month })
    if (hit) {
      await createTask(uow, actor, { communityId: input.communityId, kind: 'escalation', title: `OIG exclusion list match: ${s.name}`, detail: `${s.name} matches an entry in the ${input.month} LEIE file (${String(hit.evidence.exclusionType)}). They are blocked from scheduling. Confirm identity on the OIG site, then remove them from the schedule or clear the match with evidence.`, dedupeKey: `leie:${input.month}:${s.id}:hr`, ownerRole: ROLES.hr, dueAt: new Date(uow.now.getTime() + 4 * HOUR), subjectType: 'StaffMember', subjectId: s.id })
      await createTask(uow, actor, { communityId: input.communityId, kind: 'escalation', title: `OIG exclusion list match: ${s.name}`, detail: `HR was alerted. ${s.name} cannot be scheduled while the match stands.`, dedupeKey: `leie:${input.month}:${s.id}:admin`, ownerRole: ROLES.director, dueAt: new Date(uow.now.getTime() + 4 * HOUR), subjectType: 'StaffMember', subjectId: s.id })
    }
  }
  auditCreate(uow, actor, 'LeieImport', imp.id, 'leie.imported', { month: input.month, rows, checked: staff.length, matches: hits.size })
  return { importId: imp.id, month: input.month, rows, checked: staff.length, matches: [...hits.values()].map(h => ({ staffMemberId: h.s.id, name: h.s.name })) }
}

/* ---- Agency vendors and invoices --------------------------------------------------------------------------------- */

export async function saveAgencyVendor(uow: UnitOfWork, actor: Actor, input: { communityId: string; name: string; contractStart?: string | null; contractEnd?: string | null; rates: Record<string, string> }) {
  if (!input.name?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'A vendor needs a name.', { field: 'name' })
  const card: Record<string, string> = {}
  for (const [role, cents] of Object.entries(input.rates ?? {})) {
    if (!['rn', 'lpn', 'cna', 'med_aide'].includes(role)) throw new DomainError(Codes.INVALID_INPUT, 'Rates are for rn, lpn, cna or med_aide.', { field: 'rates' })
    if (cents === '' || cents == null) continue
    if (!/^\d{1,7}$/.test(String(cents))) throw new DomainError(Codes.INVALID_INPUT, `The ${role} rate is whole cents per hour.`, { field: 'rates' })
    card[role] = String(cents)
  }
  const existing = await uow.tx.agencyVendor.findFirst({ where: { communityId: input.communityId, name: input.name.trim() } })
  const data = { contractStart: input.contractStart ? day(input.contractStart) : null, contractEnd: input.contractEnd ? day(input.contractEnd) : null, rateCard: card as never }
  const row = existing ? await uow.tx.agencyVendor.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } }) : await uow.tx.agencyVendor.create({ data: { communityId: input.communityId, name: input.name.trim(), status: 'active', ...data } })
  auditCreate(uow, actor, 'AgencyVendor', row.id, existing ? 'agency.vendor_updated' : 'agency.vendor_created', { name: row.name, rateCard: card })
  return { vendorId: row.id }
}

/** Receive an invoice and match it to the agency shifts in the period at the contract rate. */
export async function receiveAgencyInvoice(uow: UnitOfWork, actor: Actor, input: { vendorId: string; invoiceNumber: string; periodStart: string; periodEnd: string; invoicedMinutes: number; amountMinor: bigint }) {
  const vendor = await uow.tx.agencyVendor.findUniqueOrThrow({ where: { id: input.vendorId } })
  if (!input.invoiceNumber?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the invoice number.', { field: 'invoiceNumber' })
  if (!(input.periodStart <= input.periodEnd)) throw new DomainError(Codes.INVALID_INPUT, 'The period ends before it starts.', { field: 'periodEnd' })
  const minutesIn = Math.round(Number(input.invoicedMinutes))
  if (!Number.isFinite(minutesIn) || minutesIn < 0) throw new DomainError(Codes.INVALID_INPUT, 'Enter the hours invoiced.', { field: 'invoicedMinutes' })
  if (await uow.tx.agencyInvoice.findFirst({ where: { vendorId: vendor.id, invoiceNumber: input.invoiceNumber.trim() } })) throw new DomainError(Codes.GUARD_FAILED, 'This invoice number was already received from this vendor.', { reason: 'duplicate' })
  const tz = await zoneOf(uow.tx, vendor.communityId!)
  const from = zonedInstant(tz, input.periodStart, '00:00')
  const to = zonedInstant(tz, addDays(input.periodEnd, 1), '00:00')
  const worked = await uow.tx.shiftAssignment.findMany({ where: { status: { in: WORKED_ASSIGNMENT }, startsAt: { gte: from, lt: to }, staffMember: { agencyVendorId: vendor.id } }, select: { startsAt: true, endsAt: true, agencyRateMinor: true } })
  let expectedMinutes = 0
  let expected = 0n
  for (const w of worked) {
    const m = Math.round((w.endsAt!.getTime() - w.startsAt!.getTime()) / 60_000)
    expectedMinutes += m
    expected += (BigInt(m) * (w.agencyRateMinor ?? 0n) + 30n) / 60n
  }
  const matched = expectedMinutes === minutesIn && expected === input.amountMinor
  const variance = { minutes: minutesIn - expectedMinutes, amountMinor: (input.amountMinor - expected).toString(), shifts: worked.length }
  const row = await uow.tx.agencyInvoice.create({ data: { communityId: vendor.communityId, vendorId: vendor.id, invoiceNumber: input.invoiceNumber.trim(), periodStart: day(input.periodStart), periodEnd: day(input.periodEnd), invoicedMinutes: minutesIn, amountMinor: input.amountMinor, expectedMinutes, expectedAmountMinor: expected, variance: variance as never, status: matched ? 'matched' : 'disputed', receivedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'AgencyInvoice', row.id, matched ? 'agency.invoice_matched' : 'agency.invoice_disputed', { invoiceNumber: row.invoiceNumber, variance })
  return { invoiceId: row.id, status: row.status, expectedMinutes, expectedAmountMinor: expected.toString(), variance }
}

export async function approveAgencyInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; note?: string }) {
  await transition(uow, {
    model: 'AgencyInvoice', id: input.invoiceId, from: ['matched', 'disputed'], to: 'approved', actor, eventType: 'agency.invoice_approved', reason: input.note ?? null,
    data: { approvedById: actorUserId(actor), approvalNote: input.note?.trim() ?? '' },
    guard: r => {
      assertCanDecide(actor, r.receivedById as string | null)
      if (r.status === 'disputed' && !input.note?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'This invoice does not match the shifts worked. Say why it is being approved.', { field: 'note' })
    },
  })
  return { invoiceId: input.invoiceId, status: 'approved' }
}

/* ---- Payroll export ---------------------------------------------------------------------------------------------- */

const safeCell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
const cell = (v: string | number) => { const s = safeCell(String(v)); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }

/**
 * Lock a pay period: whole Monday-to-Sunday weeks, every timecard with hours approved. The CSV is the export; the weeks become
 * exported and cannot be reopened, and the period cannot be exported twice.
 */
export async function exportPayroll(uow: UnitOfWork, actor: Actor, input: { communityId: string; periodStart: string; periodEnd: string }) {
  const { periodStart, periodEnd } = input
  if (weekStartOf(periodStart) !== periodStart) throw new DomainError(Codes.INVALID_INPUT, 'A pay period starts on a Monday.', { field: 'periodStart' })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || new Date(`${periodEnd}T00:00:00Z`).getUTCDay() !== 0) throw new DomainError(Codes.INVALID_INPUT, 'A pay period ends on a Sunday.', { field: 'periodEnd' })
  if (periodEnd < periodStart) throw new DomainError(Codes.INVALID_INPUT, 'The period ends before it starts.', { field: 'periodEnd' })
  if (periodEnd >= localDate(await zoneOf(uow.tx, input.communityId), uow.now)) throw new DomainError(Codes.GUARD_FAILED, 'The period has not ended yet.', { reason: 'open_period' })
  if (await uow.tx.payrollExport.findFirst({ where: { communityId: input.communityId, periodStart: { lte: day(periodEnd) }, periodEnd: { gte: day(periodStart) } } })) throw new DomainError(Codes.GUARD_FAILED, 'This pay period (or part of it) is already locked and exported.', { reason: 'locked' })
  const cards = await uow.tx.timecard.findMany({ where: { communityId: input.communityId, weekStart: { gte: day(periodStart), lte: day(periodEnd) } }, include: { staffMember: { include: { jobCode: true } } }, orderBy: [{ weekStart: 'asc' }] })
  const waiting = cards.filter(c => c.status !== 'approved' && c.status !== 'exported' && (c.totalMinutes ?? 0) > 0)
  if (waiting.length) throw new DomainError(Codes.GUARD_FAILED, `${waiting.length} timecard(s) with hours are not approved yet (${waiting[0].staffMember?.name}, week of ${iso(waiting[0].weekStart)}). Approve them first.`, { reason: 'unapproved', count: waiting.length })
  const approved = cards.filter(c => ['approved', 'exported'].includes(c.status) && (c.totalMinutes ?? 0) > 0)
  if (!approved.length) throw new DomainError(Codes.GUARD_FAILED, 'There are no approved hours in this period.', { reason: 'empty' })
  const out = ['employee_id,name,job_code,pay_type,week_start,date,minutes,hours']
  let total = 0
  let rows = 0
  for (const c of approved) {
    const s = c.staffMember!
    for (const [date, minutes] of Object.entries((c.dayMinutes ?? {}) as Record<string, number>).sort()) {
      if (date < periodStart || date > periodEnd || !minutes) continue
      out.push([s.employeeId, s.name, s.jobCode?.code ?? '', s.payType, iso(c.weekStart), date, minutes, `${Math.floor(minutes / 60)}.${String(Math.round(((minutes % 60) * 100) / 60)).padStart(2, '0')}`].map(cell).join(','))
      total += minutes
      rows += 1
    }
  }
  const csv = `${out.join('\n')}\n`
  const reference = await nextReference(uow.tx, 'PAY', uow.now)
  const row = await uow.tx.payrollExport.create({ data: { communityId: input.communityId, reference, periodStart: day(periodStart), periodEnd: day(periodEnd), rows, totalMinutes: total, csv, csvHash: sha256(csv), locked: true, status: 'locked', exportedById: actorUserId(actor) } })
  await uow.tx.timecard.updateMany({ where: { id: { in: approved.map(c => c.id) }, status: 'approved' }, data: { status: 'exported', version: { increment: 1 } } })
  auditCreate(uow, actor, 'PayrollExport', row.id, 'payroll.exported', { reference, periodStart, periodEnd, rows, totalMinutes: total, timecards: approved.length })
  return { exportId: row.id, reference, rows, totalMinutes: total, timecards: approved.length }
}

export async function payrollFile(db: { payrollExport: { findUnique(a: unknown): Promise<{ csv: string; reference: string; communityId: string | null } | null> } }, id: string) {
  const row = await db.payrollExport.findUnique({ where: { id }, select: { csv: true, reference: true, communityId: true } })
  if (!row?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Payroll export not found.')
  return { csv: row.csv, fileName: `${row.reference}.csv`, communityId: row.communityId }
}

/* ---- Staffing targets and days ----------------------------------------------------------------------------------- */

export async function saveStaffingTarget(uow: UnitOfWork, actor: Actor, input: { communityId: string; metric: string; value: string; effectiveFrom: string; note?: string }) {
  if (!['total_nurse_hprd', 'rn_hprd', 'cna_hprd', 'direct_care_hprd'].includes(input.metric)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a staffing measure.', { field: 'metric' })
  hundredths(input.value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) throw new DomainError(Codes.INVALID_INPUT, 'Give the date it takes effect.', { field: 'effectiveFrom' })
  const prior = await uow.tx.staffingTarget.findMany({ where: { communityId: input.communityId, source: 'operator_policy', metric: input.metric, status: 'active', effectiveTo: null } })
  for (const p of prior) await casUpdate(uow, { model: 'StaffingTarget', id: p.id, version: p.version, from: ['active'], to: 'retired', actor, eventType: 'staffing.target_retired', data: { effectiveTo: day(addDays(input.effectiveFrom, -1)) } })
  const row = await uow.tx.staffingTarget.create({ data: { communityId: input.communityId, source: 'operator_policy', metric: input.metric, value: fromHundredths(hundredths(input.value)), effectiveFrom: day(input.effectiveFrom), status: 'active', ruleRef: 'Operator staffing policy', note: input.note?.trim() ?? '' } })
  auditCreate(uow, actor, 'StaffingTarget', row.id, 'staffing.target_set', { metric: input.metric, value: row.value })
  return { targetId: row.id }
}

type Breach = { metric: string; target: string; actual: string; source: string; ruleRef: string }

/** Updates the StaffingDay from the schedule and the census; raises a Finding and a Scheduler task for a day below target. */
export async function computeStaffingDay(uow: UnitOfWork, actor: Actor, input: { communityId: string; date: string; raise: boolean }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new DomainError(Codes.INVALID_INPUT, 'Date must be YYYY-MM-DD.', { field: 'date' })
  const tz = await zoneOf(uow.tx, input.communityId)
  const from = zonedInstant(tz, input.date, '00:00')
  const to = zonedInstant(tz, addDays(input.date, 1), '00:00')
  const census = (await deriveCensusDay(uow.tx, input.communityId, input.date)).rows.filter(r => r.setting === 'nursing_facility' && r.presence === 'in_house').length
  const assignments = await uow.tx.shiftAssignment.findMany({ where: { communityId: input.communityId, status: { in: WORKED_ASSIGNMENT }, startsAt: { lt: to }, endsAt: { gt: from } }, select: { startsAt: true, endsAt: true, shift: { select: { role: true } } } })
  const minutes: Record<string, number> = { rn: 0, lpn: 0, cna: 0, med_aide: 0 }
  for (const a of assignments) {
    const role = a.shift?.role ?? 'other'
    if (!(role in minutes)) continue
    minutes[role] += Math.max(0, Math.round((Math.min(a.endsAt!.getTime(), to.getTime()) - Math.max(a.startsAt!.getTime(), from.getTime())) / 60_000))
  }
  const aide = minutes.cna + minutes.med_aide
  const total = minutes.rn + minutes.lpn + aide
  const perDay = (m: number) => (census > 0 ? Math.floor((m * 100) / (60 * census)) : 0)
  const actual: Record<string, number> = { total_nurse_hprd: perDay(total), rn_hprd: perDay(minutes.rn), cna_hprd: perDay(aide), direct_care_hprd: perDay(total) }
  const targets = await uow.tx.staffingTarget.findMany({ where: { communityId: input.communityId, unitId: null, status: 'active', effectiveFrom: { lte: day(input.date) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day(input.date) } }] } })
  const breaches: Breach[] = census > 0 ? targets.filter(t => actual[t.metric!] < hundredths(t.value!)).map(t => ({ metric: t.metric!, target: t.value!, actual: fromHundredths(actual[t.metric!]), source: t.source!, ruleRef: t.ruleRef ?? '' })) : []
  const hprd = Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, fromHundredths(v)]))
  const status = breaches.length ? 'breached' : 'met'
  const existing = await uow.tx.staffingDay.findFirst({ where: { communityId: input.communityId, date: day(input.date) } })
  const data = { census, minutes: minutes as never, hprd: hprd as never, breaches: breaches as never, computedAt: uow.now }
  const row = existing
    ? await uow.tx.staffingDay.update({ where: { id: existing.id }, data: { ...data, status, version: { increment: 1 } } })
    : await uow.tx.staffingDay.create({ data: { communityId: input.communityId, date: day(input.date), status, ...data } })
  const dedupeKey = `staffing:${input.communityId}:${input.date}`
  if (input.raise && breaches.length) {
    const detail = breaches.map(b => `${label(b.metric)}: ${b.actual} against ${b.target} (${b.source === 'jurisdiction_pack' ? 'Ohio' : 'operator policy'}${b.ruleRef ? `, ${b.ruleRef}` : ''})`).join('; ')
    const worst = breaches.find(b => b.source === 'jurisdiction_pack') ?? breaches[0]
    const title = `Staffing below target on ${input.date}: ${label(worst.metric)} ${worst.actual} against ${worst.target} (${worst.source === 'jurisdiction_pack' ? 'Ohio' : 'operator policy'}), census ${census}`
    const taskDetail = `Date ${input.date}. Census ${census} residents. ${detail}. Add or fill shifts for that day, then recompute on the Schedule page.`
    let finding = await uow.tx.finding.findUnique({ where: { dedupeKey } })
    if (!finding) {
      finding = await uow.tx.finding.create({ data: { communityId: input.communityId, workflowCode: 'STAFFING_BELOW_TARGET', dedupeKey, title, detail, severity: 'warning', status: 'open' } })
      await uow.tx.evidenceRef.create({ data: { communityId: input.communityId, findingId: finding.id, recordType: 'StaffingDay', recordId: row.id, quote: detail.slice(0, 600), role: 'cause' } })
      auditCreate(uow, actor, 'Finding', finding.id, 'finding.opened', { workflow: 'STAFFING_BELOW_TARGET', date: input.date })
    } else if (finding.status !== 'open' || finding.detail !== detail) {
      finding = await uow.tx.finding.update({ where: { id: finding.id }, data: { status: 'open', detail, resolvedAt: null, version: { increment: 1 } } })
    }
    const { task } = await createTask(uow, actor, { communityId: input.communityId, kind: 'finding', title, detail: taskDetail, dedupeKey: `finding:${dedupeKey}`, ownerRole: ROLES.scheduler, dueAt: new Date(Math.min(from.getTime() - 2 * HOUR, uow.now.getTime() + 8 * HOUR) > uow.now.getTime() ? Math.min(from.getTime() - 2 * HOUR, uow.now.getTime() + 8 * HOUR) : uow.now.getTime() + 2 * HOUR), subjectType: 'Finding', subjectId: finding.id, createdByWorkflow: 'STAFFING_BELOW_TARGET' })
    if (task.status === 'open' && (task.title !== title || task.detail !== taskDetail)) await uow.tx.task.update({ where: { id: task.id }, data: { title, detail: taskDetail } })
    if (finding.taskId !== task.id) await uow.tx.finding.update({ where: { id: finding.id }, data: { taskId: task.id } })
  } else if (!breaches.length) {
    const open = await uow.tx.finding.findUnique({ where: { dedupeKey } })
    if (open && open.status === 'open') {
      await uow.tx.finding.update({ where: { id: open.id }, data: { status: 'resolved_by_evidence', resolvedAt: uow.now, resolutionNote: `Staffing now meets every target (${Object.entries(hprd).map(([k, v]) => `${label(k)} ${v}`).join(', ')}).`, version: { increment: 1 } } })
      auditCreate(uow, actor, 'Finding', open.id, 'finding.resolved_by_evidence', { date: input.date })
    }
  }
  return { staffingDayId: row.id, date: input.date, census, hprd, status, breaches }
}

const label = (metric: string) => ({ total_nurse_hprd: 'Total nurse HPRD', rn_hprd: 'RN HPRD', cna_hprd: 'Aide HPRD', direct_care_hprd: 'Direct care HPRD' } as Record<string, string>)[metric] ?? metric

/** After any scheduling change, refresh the day. A Finding is raised only for a day inside 48 hours (a far-off day is still being built). */
async function projectStaffing(uow: UnitOfWork, actor: Actor, communityId: string, dates: string[]) {
  const tz = await zoneOf(uow.tx, communityId)
  const horizon = addDays(localDate(tz, uow.now), 1)
  for (const date of new Set(dates)) await computeStaffingDay(uow, actor, { communityId, date, raise: date <= horizon })
}

export async function computeStaffingRange(uow: UnitOfWork, actor: Actor, input: { communityId: string; from: string; days: number }) {
  const days = Math.max(1, Math.min(14, Number(input.days) || 1))
  const out = []
  for (let i = 0; i < days; i += 1) out.push(await computeStaffingDay(uow, actor, { communityId: input.communityId, date: addDays(input.from, i), raise: true }))
  return { days: out.map(d => ({ date: d.date, status: d.status, census: d.census, hprd: d.hprd, breaches: d.breaches })) }
}
