import { type Db } from './db'
import { type ClaimedMessage, type OutboxHandlers } from './outbox'
import { recomputeAvailability } from './places'
import { runInTransaction } from './unitOfWork'
import { label } from '../../../lib/labels'

/**
 * What happens after commit for every outbox topic (INTEGRATIONS §1: transition → outbox → leased
 * worker → idempotent apply). Each handler is idempotent on the message: in-app notifications are
 * keyed by `dedupe:<dedupeKey>:<userId>`, recounts are upserts, and an
 * email that went out is never sent again. Notification payloads hold references and plain wording,
 * never PHI (SCHEMA §13.8).
 *
 * Email goes through `sendMail`. Without SMTP settings the message is recorded as a `failed`
 * NotificationDelivery and the outbox row is still acknowledged, so a missing mail server never
 * blocks the queue; synthetic recipients are never mailed (SM§0 rule 11).
 */

type Mailer = (message: { to: string; subject: string; text: string }) => Promise<{ messageId: string }>
/** `portalAcceptUrl`: the family portal page that takes `?token=` (PORTAL_ACCEPT_URL). Unset → invitations are recorded, not sent. */
export type HandlerOptions = { sendMail?: Mailer | null; portalAcceptUrl?: string | null; unavailable?: string }

type Audience = { communityId: string | null; permission?: string; roleName?: string | null }

/** Active staff assigned to the community (or operator-wide) who hold the permission or the named role. */
async function recipients(db: Db, audience: Audience) {
  const where: Record<string, unknown> = { kind: 'staff', OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] }
  const role: Record<string, unknown> = {}
  if (audience.permission) role[audience.permission] = true
  if (audience.roleName) role.name = audience.roleName
  if (Object.keys(role).length) where.role = role
  const users = await db.user.findMany({ where: where as never, select: { id: true, role: { select: { canManageOperator: true } }, assignments: { where: { status: 'active' }, select: { communityId: true } } } })
  return users.filter(user => !audience.communityId || user.role?.canManageOperator || user.assignments.some(a => a.communityId === audience.communityId)).map(user => user.id)
}

/** One in-app notification per recipient per message, whatever the number of redeliveries. */
async function notify(db: Db, message: ClaimedMessage, audience: Audience, template: string, payloadRef: Record<string, unknown>) {
  let ids = await recipients(db, audience)
  // Nobody holds the named role here: fall back to whoever holds the permission.
  if (!ids.length && audience.roleName && audience.permission) ids = await recipients(db, { ...audience, roleName: null })
  for (const userId of ids) {
    const key = `dedupe:${message.dedupeKey}:${userId}`
    const exists = await db.notification.findFirst({ where: { recipientId: userId, payloadRef: { path: ['key'], equals: key } }, select: { id: true } })
    if (exists) continue
    await db.notification.create({ data: { recipientId: userId, channel: 'in_app', template, status: 'sent', sentAt: new Date(), payloadRef: { key, topic: message.topic, ...payloadRef } as never } })
  }
  return ids.length
}

const communityOfStay = async (db: Db, stayId: string) => (await db.stay.findUnique({ where: { id: stayId }, select: { communityId: true } }))?.communityId ?? null
const stayId = (message: ClaimedMessage) => String((message.payload as { stayId?: string } | null)?.stayId ?? message.aggregateId)
const field = (message: ClaimedMessage, key: string) => (message.payload as Record<string, unknown> | null)?.[key]

/** Records each email attempt; never throws for a missing mail server. */
async function deliverEmail(db: Db, message: ClaimedMessage, options: HandlerOptions, input: { to: string; synthetic: boolean; subject: string; text: string; template: string; payloadRef: Record<string, unknown> }) {
  // Redelivery after a send that worked but was not acknowledged: never mail the family twice.
  const key = `dedupe:${message.dedupeKey}:email`
  const previous = await db.notification.findFirst({ where: { channel: 'email', payloadRef: { path: ['key'], equals: key } }, select: { id: true, status: true } })
  if (previous?.status === 'sent') return
  const notification = previous ?? await db.notification.create({ data: { channel: 'email', template: input.template, status: 'pending', payloadRef: { key, ...input.payloadRef } as never } })
  const attempt = previous ? (await db.notificationDelivery.count({ where: { notificationId: notification.id } })) + 1 : 1
  const outcome = async (status: 'sent' | 'failed', providerMessageId = '') => {
    await db.notificationDelivery.create({ data: { notificationId: notification.id, attempt, outcome: status, providerMessageId } })
    await db.notification.update({ where: { id: notification.id }, data: { status, sentAt: status === 'sent' ? new Date() : null } })
  }
  if (input.synthetic) return outcome('failed', 'synthetic recipient: not mailed')
  if (!options.sendMail) return outcome('failed', options.unavailable ?? 'mail server not configured')
  const sent = await options.sendMail({ to: input.to, subject: input.subject, text: input.text })
  return outcome('sent', sent.messageId.slice(0, 200))
}

const TASKS: Record<string, { template: string; permission: string; text: string }> = {
  'task.sales_callback': { template: 'sales.callback_due', permission: 'canManageSales', text: 'A new inquiry is waiting for a call back.' },
  'task.referral_response': { template: 'sales.referral_response_due', permission: 'canAdmitDischarge', text: 'A referral is waiting for an answer.' },
  'task.room_change_notice': { template: 'census.room_change_notice_due', permission: 'canManageRepresentatives', text: 'Give the room-change notice to the resident and representative.' },
  'task.transfer_packet': { template: 'census.transfer_packet_due', permission: 'canRecordCensus', text: 'Send the transfer packet and bed-hold notice with the hospital transfer.' },
  'task.family_notification': { template: 'census.family_notification_due', permission: 'canManageRepresentatives', text: 'Notify the family and representatives.' },
}

export function outboxHandlers(db: Db, options: HandlerOptions = {}): OutboxHandlers {
  const handlers: OutboxHandlers = {
    /** Public availability counts follow every place change. */
    'availability.changed': async message => {
      const placeId = String(field(message, 'bedId') ?? field(message, 'apartmentId') ?? field(message, 'placeId') ?? message.aggregateId)
      const place = message.aggregateType === 'Bed'
        ? await db.bed.findUnique({ where: { id: placeId }, select: { room: { select: { unit: { select: { communityId: true } } } } } }).then(row => row?.room?.unit?.communityId)
        : await db.apartment.findUnique({ where: { id: placeId }, select: { unit: { select: { communityId: true } } } }).then(row => row?.unit?.communityId)
      if (!place) return
      await runInTransaction(db, uow => recomputeAvailability(uow, place))
    },
    'housekeeping.turnover': async message => {
      const isBed = message.aggregateType === 'Bed'
      const communityId = isBed
        ? (await db.bed.findUnique({ where: { id: message.aggregateId }, select: { room: { select: { unit: { select: { communityId: true } } } } } }))?.room?.unit?.communityId ?? null
        : (await db.apartment.findUnique({ where: { id: message.aggregateId }, select: { unit: { select: { communityId: true } } } }))?.unit?.communityId ?? null
      await notify(db, message, { communityId, permission: 'canManagePlaces' }, isBed ? 'housekeeping.bed_turnover' : 'housekeeping.apartment_turnover', { model: message.aggregateType, id: message.aggregateId, text: isBed ? 'A bed needs cleaning before the next admission.' : 'An apartment needs turnover before the next move-in.' })
    },
    /**
     * Admission: ask Social Services to invite the representatives. Inviting stays a person's act
     * (portal.invite is human-only): someone checks the authority documents before a family login exists.
     */
    'portal.invite_representatives': async message => {
      const id = stayId(message)
      const stay = await db.stay.findUnique({ where: { id }, select: { status: true, residentId: true, communityId: true } })
      if (!stay?.residentId || stay.status !== 'admitted') return
      const waiting = await db.representative.count({ where: { residentId: stay.residentId, status: 'active', self: false, portalAccountId: null, contact: { email: { not: '' } } } })
      if (!waiting) return
      await notify(db, message, { communityId: stay.communityId, permission: 'canManageRepresentatives', roleName: 'Social Services' }, 'portal.invite_due', { model: 'Resident', id: stay.residentId, text: `New admission: ${waiting === 1 ? 'one representative is' : `${waiting} representatives are`} ready for a family portal invitation.` })
    },
    /** Discharge or death: the stay ended; tell the social worker to review the family's portal access. */
    'portal.stay_ended': async message => {
      const communityId = await communityOfStay(db, stayId(message))
      await notify(db, message, { communityId, permission: 'canManageRepresentatives' }, 'portal.review_access', { model: 'Stay', id: stayId(message), text: 'A stay ended. Review the family portal access.' })
    },
    'mail.portal_invitation': async message => {
      const accountId = String(field(message, 'accountId') ?? message.aggregateId)
      const token = String(field(message, 'token') ?? '')
      const account = await db.portalAccount.findUnique({ where: { id: accountId }, select: { status: true, contact: { select: { email: true, firstName: true, synthetic: true } }, community: { select: { name: true } } } })
      if (!account?.contact?.email || account.status !== 'invited' || !token) return
      // No family portal page to link to yet: record the attempt as failed; staff re-invite once it is live.
      const link = options.portalAcceptUrl ? `${options.portalAcceptUrl}${options.portalAcceptUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : null
      await deliverEmail(db, message, link ? options : { ...options, sendMail: null, unavailable: 'portal accept page not configured' }, {
        to: account.contact.email, synthetic: account.contact.synthetic, template: 'mail.portal_invitation', payloadRef: { model: 'PortalAccount', id: accountId },
        subject: `Your invitation from ${account.community?.name ?? 'your community'}`,
        text: `Hello ${account.contact.firstName},\n\n${account.community?.name ?? 'The community'} has invited you to its family portal. Open this link to set your password:\n\n${link ?? ''}\n\nThe link expires in 7 days.`,
      })
      // The invitation token lived only to reach the mailer; it does not stay in the outbox.
      const { token: _token, ...rest } = (message.payload ?? {}) as Record<string, unknown>
      await db.outboxEvent.update({ where: { id: message.id }, data: { payload: { ...rest, tokenRemoved: true } as never } })
    },
    'mail.tour_requested': async message => tourMail(message, 'requested'),
    'mail.tour_confirmed': async message => tourMail(message, 'confirmed'),
    'notify.approval': async message => {
      const request = await db.approvalRequest.findUnique({ where: { id: message.aggregateId }, select: { communityId: true, status: true } })
      if (!request || request.status !== 'pending') return
      const permission = String(field(message, 'requiredPermission') ?? '')
      await notify(db, message, { communityId: request.communityId, permission: permission || undefined }, 'approval.waiting', { model: 'ApprovalRequest', id: message.aggregateId, text: `An approval is waiting: ${label(String(field(message, 'action') ?? 'change'))}.` })
    },
    'clock.overdue': async message => {
      const communityId = (field(message, 'communityId') as string | null) ?? null
      const roleName = (field(message, 'ownerRole') as string | null) || null
      await notify(db, message, { communityId, permission: 'canReadCompliance', roleName }, 'compliance.overdue', { model: 'ComplianceClock', id: message.aggregateId, text: 'A compliance deadline is overdue.' })
    },
    'privacy.break_glass_opened': async message => {
      const grant = await db.breakGlassGrant.findUnique({ where: { id: message.aggregateId }, select: { resident: { select: { communityId: true } } } })
      await notify(db, message, { communityId: grant?.resident?.communityId ?? null, permission: 'canReviewBreakGlass' }, 'privacy.break_glass_opened', { model: 'BreakGlassGrant', id: message.aggregateId, text: 'Someone used break-glass access. Review it.' })
    },
    'privacy.break_glass_violation': async message => {
      await notify(db, message, { communityId: null, permission: 'canManageOperator' }, 'privacy.break_glass_violation', { model: 'BreakGlassGrant', id: message.aggregateId, text: 'A break-glass review found a violation.' })
    },
  }
  for (const [topic, task] of Object.entries(TASKS)) {
    handlers[topic] = async message => {
      const communityId = (field(message, 'communityId') as string | null) ?? (message.aggregateType === 'Stay' ? await communityOfStay(db, stayId(message)) : null)
      await notify(db, message, { communityId, permission: task.permission }, task.template, { model: message.aggregateType, id: message.aggregateId, text: task.text })
    }
  }
  // Facts other services may subscribe to later; nothing more to do in-app, so they are acknowledged.
  for (const topic of ['clock.opened', 'census.admission', 'census.readmission', 'census.room_change', 'census.leave_start', 'census.hold_release', 'census.leave_end', 'census.coverage_change', 'census.discharge', 'census.death', 'census.correction', 'census.signed_off']) {
    handlers[topic] = async () => undefined
  }
  return handlers

  async function tourMail(message: ClaimedMessage, kind: 'requested' | 'confirmed') {
    const tour = await db.tour.findUnique({ where: { id: message.aggregateId }, select: { status: true, publicCode: true, slot: { select: { startsAt: true } }, community: { select: { name: true, timeZone: true, phone: true, synthetic: true } }, lead: { select: { primaryContact: { select: { email: true, firstName: true, synthetic: true } } } } } })
    const contact = tour?.lead?.primaryContact
    if (!tour || !contact?.email || !tour.slot) return
    if (kind === 'requested' ? tour.status !== 'requested' : tour.status !== 'confirmed') return
    const at = tour.slot.startsAt.toLocaleString('en-US', { timeZone: tour.community?.timeZone ?? 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
    const name = tour.community?.name ?? 'the community'
    await deliverEmail(db, message, options, {
      to: contact.email, synthetic: contact.synthetic || Boolean(tour.community?.synthetic), template: `mail.tour_${kind}`, payloadRef: { model: 'Tour', id: message.aggregateId },
      subject: kind === 'requested' ? `We received your tour request for ${at}` : `Your tour of ${name} is confirmed for ${at}`,
      text: kind === 'requested'
        ? `Hello ${contact.firstName},\n\nThanks for asking to visit ${name}. We'll confirm your tour for ${at} shortly. Your reference is ${tour.publicCode}.${tour.community?.phone ? `\n\nQuestions? Call us at ${tour.community.phone}.` : ''}`
        : `Hello ${contact.firstName},\n\nYour tour of ${name} is confirmed for ${at}. Your reference is ${tour.publicCode}.${tour.community?.phone ? `\n\nQuestions? Call us at ${tour.community.phone}.` : ''}`,
    })
  }
}
