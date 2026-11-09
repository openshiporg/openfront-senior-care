import { auditCreate, casUpdate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { advisoryLock } from './db'
import { DomainError, Codes } from './errors'
import { nextReference, publicCode } from './sequence'
import { createPublicToken, hashPublicToken, publicTokenMatches, verifyPublicToken } from './publicToken'
import { endReservation, reservePlace } from './places'
import { LEAD_STATUSES } from '../models/sales'
import type { UnitOfWork } from './unitOfWork'
import { label } from '../../../lib/labels'

/**
 * Sales and front of house (STATE-MACHINES §1). Public calls (inquiry, tour request, tour
 * management) are rate-limited by the resolver and carry no session; they create rows server-side
 * and return only a public code. Staff transitions take a version for CAS.
 */

const SETTING_VALUES = ['nursing_facility', 'assisted_living', 'memory_care', 'independent_living']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

async function publishedCommunity(uow: UnitOfWork, slug: string) {
  const community = await uow.tx.community.findUnique({ where: { slug }, select: { id: true, status: true, synthetic: true, storefront: { select: { published: true, tourBookingEnabled: true, waitlistEnabled: true } } } })
  if (!community || community.status !== 'active' || !community.storefront?.published) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  return community
}

export type InquiryInput = {
  communitySlug: string
  contactName: string
  contactEmail?: string | null
  contactPhone?: string | null
  relationship?: string | null
  message?: string | null
  forWhomFirstName?: string | null
  forWhomLastName?: string | null
  desiredSetting?: string | null
  consentToContact: boolean
  /** Honeypot: real people leave it empty. */
  website?: string | null
  utm?: Record<string, string> | null
}

/** Public: creates Inquiry + Lead (+ Prospect when a person is named). Returns only a public code. */
export async function submitInquiry(uow: UnitOfWork, input: InquiryInput) {
  const community = await publishedCommunity(uow, input.communitySlug)
  if (clean(input.website, 200)) return { publicCode: publicCode('INQ') } // honeypot: look successful, store nothing
  const name = clean(input.contactName, 120)
  const email = clean(input.contactEmail, 200).toLowerCase()
  const phone = clean(input.contactPhone, 40)
  if (!name) throw new DomainError(Codes.INVALID_INPUT, 'Tell us your name.', { field: 'contactName' })
  if (!email && !phone) throw new DomainError(Codes.INVALID_INPUT, 'Leave an email address or a phone number.', { field: 'contactEmail' })
  if (email && !EMAIL.test(email)) throw new DomainError(Codes.INVALID_INPUT, 'That email address does not look right.', { field: 'contactEmail' })
  if (!input.consentToContact) throw new DomainError(Codes.INVALID_INPUT, 'Tick the box so the community may contact you.', { field: 'consentToContact' })
  const [firstName, ...rest] = name.split(/\s+/)
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, 'CON', uow.now), communityId: community.id, firstName, lastName: rest.join(' '), email, phone, consentToContact: true, synthetic: community.synthetic } })
  const lead = await uow.tx.lead.create({ data: { reference: await nextReference(uow.tx, 'LEAD', uow.now), communityId: community.id, primaryContactId: contact.id, status: 'new', nextActionAt: new Date(uow.now.getTime() + 4 * 3_600_000), synthetic: community.synthetic } })
  const forFirst = clean(input.forWhomFirstName, 80)
  if (forFirst) {
    await uow.tx.prospect.create({ data: { reference: await nextReference(uow.tx, 'PRO', uow.now), communityId: community.id, leadId: lead.id, firstName: forFirst, lastName: clean(input.forWhomLastName, 80), desiredSetting: SETTING_VALUES.includes(String(input.desiredSetting)) ? input.desiredSetting : null, synthetic: community.synthetic } })
  }
  const code = publicCode('INQ')
  const utm = Object.fromEntries(Object.entries(input.utm ?? {}).slice(0, 10).map(([key, value]) => [clean(key, 40), clean(value, 200)]))
  const inquiry = await uow.tx.inquiry.create({ data: { publicCode: code, communityId: community.id, source: 'website', contactName: name, contactEmail: email, contactPhone: phone, relationship: clean(input.relationship, 80), message: clean(input.message, 4000), consentToContact: true, utm: utm as never, leadId: lead.id } })
  uow.audit({ eventType: 'inquiry.received', entityType: 'Inquiry', entityId: inquiry.id, actorUserId: null, after: { publicCode: code, leadId: lead.id, communityId: community.id } })
  return { publicCode: code }
}

/** Staff: record an inquiry taken by phone or in person. */
export async function recordInquiry(uow: UnitOfWork, actor: Actor, input: Omit<InquiryInput, 'communitySlug' | 'website'> & { communityId: string; source: string; referralSourceId?: string | null }) {
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { slug: true, synthetic: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  const sources = ['phone', 'walk_in', 'referral_agency', 'hospital', 'resident_referral', 'other']
  if (!sources.includes(input.source)) throw new DomainError(Codes.INVALID_INPUT, 'Choose where the inquiry came from.', { field: 'source' })
  const name = clean(input.contactName, 120)
  if (!name) throw new DomainError(Codes.INVALID_INPUT, 'Enter the caller\'s name.', { field: 'contactName' })
  const [firstName, ...rest] = name.split(/\s+/)
  const synthetic = community.synthetic
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, 'CON', uow.now), communityId: input.communityId, firstName, lastName: rest.join(' '), email: clean(input.contactEmail, 200).toLowerCase(), phone: clean(input.contactPhone, 40), consentToContact: Boolean(input.consentToContact), synthetic } })
  if (input.referralSourceId) {
    const source = await uow.tx.referralSource.findUnique({ where: { id: input.referralSourceId }, select: { communityId: true } })
    if (!source || source.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, 'Referral source not found.', { field: 'referralSourceId' })
  }
  const lead = await uow.tx.lead.create({ data: { reference: await nextReference(uow.tx, 'LEAD', uow.now), communityId: input.communityId, primaryContactId: contact.id, ownerId: actorUserId(actor), status: 'contacted', referralSourceId: input.referralSourceId ?? null, nextActionAt: new Date(uow.now.getTime() + 24 * 3_600_000), synthetic } })
  const forFirst = clean(input.forWhomFirstName, 80)
  let prospectId: string | null = null
  if (forFirst) {
    const prospect = await uow.tx.prospect.create({ data: { reference: await nextReference(uow.tx, 'PRO', uow.now), communityId: input.communityId, leadId: lead.id, firstName: forFirst, lastName: clean(input.forWhomLastName, 80), desiredSetting: SETTING_VALUES.includes(String(input.desiredSetting)) ? input.desiredSetting : null, synthetic } })
    prospectId = prospect.id
  }
  const code = publicCode('INQ')
  const inquiry = await uow.tx.inquiry.create({ data: { publicCode: code, communityId: input.communityId, source: input.source, contactName: name, contactEmail: clean(input.contactEmail, 200), contactPhone: clean(input.contactPhone, 40), relationship: clean(input.relationship, 80), message: clean(input.message, 4000), consentToContact: Boolean(input.consentToContact), leadId: lead.id } })
  auditCreate(uow, actor, 'Inquiry', inquiry.id, 'inquiry.recorded', { publicCode: code, leadId: lead.id, source: input.source, prospectId })
  return { inquiryId: inquiry.id, leadId: lead.id, prospectId, publicCode: code }
}

/** Lead transitions guarded by evidence (SM§1.1). `moved_in` happens only through admission. */
const LEAD_EDGES: Record<string, readonly string[]> = {
  contacted: ['new', 'nurture'],
  tour_scheduled: ['new', 'contacted', 'toured', 'nurture', 'waitlisted'],
  toured: ['tour_scheduled'],
  assessment_scheduled: ['toured', 'contacted'],
  assessed: ['assessment_scheduled'],
  deposit_received: ['assessed'],
  move_in_scheduled: ['deposit_received', 'assessed', 'waitlisted'],
  waitlisted: ['new', 'contacted', 'toured', 'assessed', 'deposit_received', 'nurture'],
  nurture: ['new', 'contacted', 'toured', 'assessed', 'waitlisted'],
  lost: LEAD_STATUSES.filter(status => status !== 'moved_in' && status !== 'lost'),
}

export async function moveLead(uow: UnitOfWork, actor: Actor, input: { leadId: string; to: string; lostReason?: string | null; note?: string | null; expectedVersion: number }) {
  const from = LEAD_EDGES[input.to]
  if (!from) throw new DomainError(Codes.INVALID_INPUT, input.to === 'moved_in' ? 'A lead moves in when the resident is admitted.' : 'Unknown lead status.', { field: 'to' })
  const lead = await lockRow<{ id: string; status: string; version: number }>(uow.tx, 'Lead', input.leadId)
  const evidence: Record<string, () => Promise<boolean>> = {
    contacted: async () => (await uow.tx.salesActivity.count({ where: { leadId: lead.id, kind: { in: ['call', 'email', 'text', 'note'] } } })) > 0,
    tour_scheduled: async () => (await uow.tx.tour.count({ where: { leadId: lead.id, status: 'confirmed' } })) > 0,
    toured: async () => (await uow.tx.tour.count({ where: { leadId: lead.id, status: 'completed' } })) > 0,
    move_in_scheduled: async () => (await uow.tx.placeReservation.count({ where: { status: 'active', prospect: { leadId: lead.id } } })) > 0,
    waitlisted: async () => (await uow.tx.waitlistEntry.count({ where: { leadId: lead.id, status: { in: ['active', 'offered'] } } })) > 0,
  }
  if (evidence[input.to] && !(await evidence[input.to]())) {
    const need: Record<string, string> = { contacted: 'Log a call, email, text or note first.', tour_scheduled: 'Confirm a tour first.', toured: 'Mark the tour completed first.', move_in_scheduled: 'Reserve an apartment or bed first.', waitlisted: 'Add a waitlist entry first.' }
    throw new DomainError(Codes.GUARD_FAILED, need[input.to], { reason: 'evidence' })
  }
  if (input.to === 'lost' && !input.lostReason) throw new DomainError(Codes.INVALID_INPUT, 'Choose why the lead was lost.', { field: 'lostReason' })
  const row = await casUpdate(uow, { model: 'Lead', id: lead.id, version: input.expectedVersion, from, to: input.to, actor, eventType: `lead.${input.to}`, reason: input.note ?? null, data: input.to === 'lost' ? { lostReason: input.lostReason } : {} })
  if (input.to === 'lost') {
    const holds = await uow.tx.placeReservation.findMany({ where: { status: 'active', prospect: { leadId: lead.id } }, select: { id: true } })
    for (const hold of holds) await endReservation(uow, actor, { reservationId: hold.id, to: 'released', reason: 'lead lost' })
    const entries = await uow.tx.waitlistEntry.findMany({ where: { leadId: lead.id, status: { in: ['active', 'offered'] } }, select: { id: true, version: true, status: true } })
    for (const entry of entries) await casUpdate(uow, { model: 'WaitlistEntry', id: entry.id, version: entry.version, from: [entry.status], to: 'withdrawn', actor, eventType: 'waitlist.withdrawn', reason: 'lead lost' })
  }
  return { leadId: lead.id, status: input.to, version: (row as { version?: number })?.version ?? input.expectedVersion + 1 }
}

export async function logSalesActivity(uow: UnitOfWork, actor: Actor, input: { leadId: string; kind: string; summary: string; at?: Date | null }) {
  if (!['call', 'email', 'text', 'tour', 'assessment', 'note'].includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown activity.', { field: 'kind' })
  if (!clean(input.summary, 4000)) throw new DomainError(Codes.INVALID_INPUT, 'Add a summary.', { field: 'summary' })
  const lead = await uow.tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true } })
  if (!lead) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
  const row = await uow.tx.salesActivity.create({ data: { leadId: lead.id, kind: input.kind, at: input.at ?? uow.now, byId: actorUserId(actor), summary: clean(input.summary, 4000) } })
  auditCreate(uow, actor, 'SalesActivity', row.id, 'sales_activity.logged', { leadId: lead.id, kind: input.kind })
  return { activityId: row.id }
}

/* ------------------------------------------------------------------- tours */

const TOUR_HOLD_MINUTES = 30

async function slotHasRoom(uow: UnitOfWork, slotId: string) {
  await advisoryLock(uow.tx, `tour_slot:${slotId}`)
  const slot = await uow.tx.tourSlot.findUnique({ where: { id: slotId }, select: { id: true, communityId: true, startsAt: true, capacity: true, kind: true } })
  if (!slot) throw new DomainError(Codes.NOT_FOUND, 'Tour time not found.')
  if (slot.startsAt.getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, 'That tour time has passed.')
  const taken = await uow.tx.tour.count({ where: { slotId, OR: [{ status: 'confirmed' }, { status: 'requested', holdExpiresAt: { gt: uow.now } }] } })
  if (taken >= slot.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, 'That tour time is full. Choose another.')
  return slot
}

/** Public: request a tour for a slot. Returns the public code and a manage token (shown once). */
export async function requestTour(uow: UnitOfWork, input: { communitySlug: string; slotId: string; kind: 'in_person' | 'virtual'; contactName: string; contactEmail: string; contactPhone?: string | null; notes?: string | null; consentToContact: boolean }) {
  const community = await publishedCommunity(uow, input.communitySlug)
  if (!community.storefront?.tourBookingEnabled) throw new DomainError(Codes.GUARD_FAILED, 'Tours are booked by phone at this community.')
  const slot = await slotHasRoom(uow, input.slotId)
  if (slot.communityId !== community.id) throw new DomainError(Codes.NOT_FOUND, 'Tour time not found.')
  if (input.kind !== 'in_person' && input.kind !== 'virtual') throw new DomainError(Codes.INVALID_INPUT, 'Choose in person or virtual.', { field: 'kind' })
  if (slot.kind !== 'either' && slot.kind !== input.kind) throw new DomainError(Codes.INVALID_INPUT, `This time is for ${label(slot.kind).toLowerCase()} tours.`, { field: 'kind' })
  const { publicCode: inquiryCode } = await submitInquiry(uow, { communitySlug: input.communitySlug, contactName: input.contactName, contactEmail: input.contactEmail, contactPhone: input.contactPhone, message: input.notes, consentToContact: input.consentToContact })
  const inquiry = await uow.tx.inquiry.findUnique({ where: { publicCode: inquiryCode }, select: { leadId: true } })
  const code = publicCode('TOUR')
  const tour = await uow.tx.tour.create({ data: { publicCode: code, communityId: community.id, slotId: slot.id, leadId: inquiry?.leadId ?? null, kind: input.kind, status: 'requested', holdExpiresAt: new Date(uow.now.getTime() + TOUR_HOLD_MINUTES * 60_000), notes: clean(input.notes, 2000) } })
  const token = createPublicToken('tour-manage', tour.id, slot.startsAt.getTime() + 86_400_000)
  await uow.tx.tour.update({ where: { id: tour.id }, data: { guestTokenHash: hashPublicToken(token) } })
  uow.audit({ eventType: 'tour.requested', entityType: 'Tour', entityId: tour.id, actorUserId: null, after: { publicCode: code, slotId: slot.id } })
  return { publicCode: code, manageToken: token, holdExpiresAt: tour.holdExpiresAt }
}

/** Staff: book a tour for a lead (by phone or in person). Confirmed at once; the lead moves to tour_scheduled. */
export async function scheduleTour(uow: UnitOfWork, actor: Actor, input: { leadId: string; slotId: string; kind: 'in_person' | 'virtual'; notes?: string | null }) {
  const lead = await uow.tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true, communityId: true, status: true, version: true } })
  if (!lead) throw new DomainError(Codes.NOT_FOUND, 'Lead not found.')
  if (lead.status === 'lost' || lead.status === 'moved_in') throw new DomainError(Codes.GUARD_FAILED, `This lead is ${label(lead.status).toLowerCase()}.`, { currentStatus: lead.status })
  if (input.kind !== 'in_person' && input.kind !== 'virtual') throw new DomainError(Codes.INVALID_INPUT, 'Choose in person or virtual.', { field: 'kind' })
  const slot = await slotHasRoom(uow, input.slotId)
  if (slot.communityId !== lead.communityId) throw new DomainError(Codes.NOT_FOUND, 'Tour time not found.')
  if (slot.kind !== 'either' && slot.kind !== input.kind) throw new DomainError(Codes.INVALID_INPUT, `This time is for ${label(slot.kind).toLowerCase()} tours.`, { field: 'kind' })
  const tour = await uow.tx.tour.create({ data: { publicCode: publicCode('TOUR'), communityId: slot.communityId, slotId: slot.id, leadId: lead.id, kind: input.kind, status: 'confirmed', notes: clean(input.notes, 2000) } })
  auditCreate(uow, actor, 'Tour', tour.id, 'tour.scheduled', { slotId: slot.id, leadId: lead.id, kind: input.kind })
  if (LEAD_EDGES.tour_scheduled.includes(lead.status)) await casUpdate(uow, { model: 'Lead', id: lead.id, version: lead.version, from: [lead.status], to: 'tour_scheduled', actor, eventType: 'lead.tour_scheduled', metadata: { tourId: tour.id } })
  return { tourId: tour.id, publicCode: tour.publicCode, startsAt: slot.startsAt }
}

/** Public: cancel with the manage token. */
export async function cancelTourWithToken(uow: UnitOfWork, input: { token: string; reason?: string | null }) {
  const payload = verifyPublicToken(input.token, 'tour-manage', undefined, uow.now.getTime())
  if (!payload) throw new DomainError(Codes.GUARD_FAILED, 'This link is invalid or has expired.')
  const tour = await lockRow<{ id: string; status: string; version: number; guestTokenHash: string | null }>(uow.tx, 'Tour', payload.subjectId)
  if (!publicTokenMatches(input.token, tour.guestTokenHash)) throw new DomainError(Codes.GUARD_FAILED, 'This link is invalid or has expired.')
  await casUpdate(uow, { model: 'Tour', id: tour.id, version: tour.version, from: ['requested', 'confirmed'], to: 'cancelled', actor: { kind: 'system', name: 'guest' }, eventType: 'tour.cancelled_by_guest', reason: clean(input.reason, 500) || null })
  return { status: 'cancelled' }
}

/** Staff: confirm / complete / no-show / cancel. Confirming re-checks slot capacity. */
export async function moveTour(uow: UnitOfWork, actor: Actor, input: { tourId: string; to: 'confirmed' | 'completed' | 'no_show' | 'cancelled'; reason?: string | null; expectedVersion: number }) {
  const edges: Record<string, string[]> = { confirmed: ['requested'], completed: ['confirmed'], no_show: ['confirmed'], cancelled: ['requested', 'confirmed'] }
  if (!edges[input.to]) throw new DomainError(Codes.INVALID_INPUT, 'Unknown tour status.', { field: 'to' })
  const tour = await lockRow<{ id: string; status: string; version: number; slotId: string | null; leadId: string | null }>(uow.tx, 'Tour', input.tourId)
  if (input.to === 'confirmed' && tour.slotId) {
    await advisoryLock(uow.tx, `tour_slot:${tour.slotId}`)
    const slot = await uow.tx.tourSlot.findUnique({ where: { id: tour.slotId }, select: { capacity: true } })
    const confirmed = await uow.tx.tour.count({ where: { slotId: tour.slotId, status: 'confirmed' } })
    if (slot && confirmed >= slot.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, 'That tour time is full.')
  }
  await casUpdate(uow, { model: 'Tour', id: tour.id, version: input.expectedVersion, from: edges[input.to], to: input.to, actor, eventType: `tour.${input.to}`, reason: input.reason ?? null, data: { holdExpiresAt: null } })
  if (tour.leadId && (input.to === 'confirmed' || input.to === 'completed')) {
    const lead = await uow.tx.lead.findUnique({ where: { id: tour.leadId }, select: { status: true, version: true } })
    const target = input.to === 'confirmed' ? 'tour_scheduled' : 'toured'
    if (lead && LEAD_EDGES[target].includes(lead.status)) await casUpdate(uow, { model: 'Lead', id: tour.leadId, version: lead.version, from: [lead.status], to: target, actor, eventType: `lead.${target}`, metadata: { tourId: tour.id } })
  }
  return { tourId: tour.id, status: input.to }
}

/* ---------------------------------------------------------------- referrals */

const REFERRAL_EDGES: Record<string, string[]> = { clinical_review: ['received'], payer_check: ['clinical_review'], accepted: ['payer_check'], declined: ['received', 'clinical_review', 'payer_check'], withdrawn: ['received', 'clinical_review', 'payer_check', 'accepted'] }

export async function moveReferral(uow: UnitOfWork, actor: Actor, input: { referralId: string; to: string; declineReason?: string | null; bedId?: string | null; reservationHours?: number | null; expectedVersion: number; idempotencyKey: string }) {
  const from = REFERRAL_EDGES[input.to]
  if (!from) throw new DomainError(Codes.INVALID_INPUT, input.to === 'admitted' ? 'A referral is admitted by the admission command.' : 'Unknown referral status.', { field: 'to' })
  const referral = await lockRow<{ id: string; status: string; version: number; prospectId: string | null; pasrrLevel1Id: string | null; expectedPayer: string | null }>(uow.tx, 'Referral', input.referralId)
  if (input.to === 'declined' && !input.declineReason) throw new DomainError(Codes.INVALID_INPUT, 'Choose why the referral is declined.', { field: 'declineReason' })
  let reservation: { reservationId: string } | null = null
  if (input.to === 'accepted') {
    if (!input.bedId) throw new DomainError(Codes.GUARD_FAILED, 'Choose the bed to hold for this referral.', { field: 'bedId' })
    if (!referral.pasrrLevel1Id && ['medicaid', 'medicaid_pending'].includes(String(referral.expectedPayer))) throw new DomainError(Codes.GUARD_FAILED, 'Attach the PASRR Level I screen before accepting a Medicaid referral.', { field: 'pasrrLevel1' })
    reservation = await reservePlace(uow, actor, { bedId: input.bedId, hours: input.reservationHours ?? 48, purpose: 'referral', referralId: referral.id, prospectId: referral.prospectId, idempotencyKey: input.idempotencyKey })
  }
  if (input.to === 'withdrawn' || input.to === 'declined') {
    const holds = await uow.tx.placeReservation.findMany({ where: { referralId: referral.id, status: 'active' }, select: { id: true } })
    for (const hold of holds) await endReservation(uow, actor, { reservationId: hold.id, to: 'released', reason: `referral ${input.to}` })
  }
  await casUpdate(uow, { model: 'Referral', id: referral.id, version: input.expectedVersion, from, to: input.to, actor, eventType: `referral.${input.to}`, data: input.to === 'declined' ? { declineReason: input.declineReason } : {} })
  return { referralId: referral.id, status: input.to, reservationId: reservation?.reservationId ?? null }
}

const EXPECTED_PAYERS = ['medicare_a', 'medicare_advantage', 'medicaid', 'medicaid_pending', 'private_pay', 'commercial', 'hospice', 'other']

/**
 * Staff: record a referral received from a hospital, physician or placement agency (by phone, fax or
 * the referral portal). Creates the Prospect and the Referral with its response deadline; the
 * deadline is the operator's referral response window (hospitals place with whoever answers first).
 */
export async function recordReferral(uow: UnitOfWork, actor: Actor, input: { communityId: string; sourceId?: string | null; firstName: string; lastName: string; dateOfBirth?: string | null; desiredSetting?: string | null; expectedPayer: string; clinicalSummary?: string | null; pasrrLevel1?: { completedAt: string; result: string } | null; pasrrLevel2Required?: boolean; responseHours?: number | null; receivedAt?: Date | null }) {
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { id: true, synthetic: true } })
  if (!community) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  const firstName = clean(input.firstName, 80)
  const lastName = clean(input.lastName, 80)
  if (!firstName || !lastName) throw new DomainError(Codes.INVALID_INPUT, 'Enter the person\'s first and last name.', { field: 'firstName' })
  if (!EXPECTED_PAYERS.includes(input.expectedPayer)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the expected payer.', { field: 'expectedPayer' })
  if (input.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateOfBirth)) throw new DomainError(Codes.INVALID_INPUT, 'Date of birth must be YYYY-MM-DD.', { field: 'dateOfBirth' })
  if (input.sourceId) {
    const source = await uow.tx.referralSource.findUnique({ where: { id: input.sourceId }, select: { communityId: true } })
    if (!source || source.communityId !== community.id) throw new DomainError(Codes.NOT_FOUND, 'Referral source not found.', { field: 'sourceId' })
  }
  const receivedAt = input.receivedAt ?? uow.now
  if (receivedAt.getTime() > uow.now.getTime() + 5 * 60_000) throw new DomainError(Codes.INVALID_INPUT, 'The referral cannot be received in the future.', { field: 'receivedAt' })
  const hours = Math.min(Math.max(input.responseHours ?? 4, 1), 72)
  const prospect = await uow.tx.prospect.create({ data: { reference: await nextReference(uow.tx, 'PRO', uow.now), communityId: community.id, firstName, lastName, dateOfBirth: input.dateOfBirth ? new Date(`${input.dateOfBirth}T00:00:00Z`) : null, desiredSetting: SETTING_VALUES.includes(String(input.desiredSetting)) ? input.desiredSetting : 'nursing_facility', synthetic: community.synthetic } })
  // The hospital's Level I PASRR screen travels with the referral packet (42 CFR 483.106).
  let pasrrLevel1Id: string | null = null
  if (input.pasrrLevel1) {
    const completedAt = new Date(input.pasrrLevel1.completedAt)
    if (Number.isNaN(completedAt.getTime()) || completedAt.getTime() > uow.now.getTime() + 5 * 60_000) throw new DomainError(Codes.INVALID_INPUT, 'Enter when the Level I screen was completed.', { field: 'pasrrLevel1' })
    const doc = await uow.tx.document.create({ data: { title: 'PASRR Level I screen', kind: 'pasrr', communityId: community.id, phiTier: 'clin', status: 'final' } })
    await uow.tx.preAdmissionScreen.create({ data: { prospectId: prospect.id, kind: 'pasrr_level1', result: clean(input.pasrrLevel1.result, 500), completedAt, documentId: doc.id } })
    auditCreate(uow, actor, 'Document', doc.id, 'pre_admission_screen.received', { kind: 'pasrr_level1', prospectId: prospect.id })
    pasrrLevel1Id = doc.id
  }
  const referral = await uow.tx.referral.create({
    data: { reference: await nextReference(uow.tx, 'REF', uow.now), communityId: community.id, sourceId: input.sourceId ?? null, receivedAt, prospectId: prospect.id, expectedPayer: input.expectedPayer, pasrrLevel1Id, clinicalSummary: clean(input.clinicalSummary, 8000), pasrrLevel2Required: Boolean(input.pasrrLevel2Required), status: 'received', responseDueAt: new Date(receivedAt.getTime() + hours * 3_600_000) },
  })
  auditCreate(uow, actor, 'Referral', referral.id, 'referral.received', { reference: referral.reference, sourceId: input.sourceId ?? null, expectedPayer: input.expectedPayer, responseDueAt: referral.responseDueAt })
  return { referralId: referral.id, reference: referral.reference, prospectId: prospect.id, responseDueAt: referral.responseDueAt }
}

/* ----------------------------------------------------------------- waitlist */

export async function addToWaitlist(uow: UnitOfWork, actor: Actor, input: { communityId: string; leadId?: string | null; prospectId?: string | null; apartmentTypeId?: string | null; setting: string; priorityReason?: string | null }) {
  if (!input.leadId && !input.prospectId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the lead or prospect.', { field: 'leadId' })
  const priority = { internal_transfer: 10, continuing_care: 20, date_order: 100, other: 100 }[input.priorityReason ?? 'date_order'] ?? 100
  const entry = await uow.tx.waitlistEntry.create({ data: { reference: await nextReference(uow.tx, 'WL', uow.now), communityId: input.communityId, leadId: input.leadId ?? null, prospectId: input.prospectId ?? null, apartmentTypeId: input.apartmentTypeId ?? null, setting: input.setting, priority, priorityReason: input.priorityReason ?? 'date_order', status: 'active' } })
  auditCreate(uow, actor, 'WaitlistEntry', entry.id, 'waitlist.added', { reference: entry.reference, setting: input.setting, priority })
  return { waitlistEntryId: entry.id, reference: entry.reference }
}

/** active → offered: holds a specific apartment or bed for `hours`. A human chooses who is offered (no auto-assignment). */
export async function offerWaitlistPlace(uow: UnitOfWork, actor: Actor, input: { waitlistEntryId: string; apartmentId?: string | null; bedId?: string | null; hours: number; expectedVersion: number; idempotencyKey: string }) {
  const entry = await lockRow<{ id: string; status: string; version: number; prospectId: string | null }>(uow.tx, 'WaitlistEntry', input.waitlistEntryId)
  const hold = await reservePlace(uow, actor, { apartmentId: input.apartmentId, bedId: input.bedId, hours: input.hours, purpose: 'waitlist_offer', waitlistEntryId: entry.id, prospectId: entry.prospectId, idempotencyKey: input.idempotencyKey })
  await casUpdate(uow, { model: 'WaitlistEntry', id: entry.id, version: input.expectedVersion, from: ['active'], to: 'offered', actor, eventType: 'waitlist.offered', data: { offeredReservationId: hold.reservationId, offerExpiresAt: hold.expiresAt } })
  return { waitlistEntryId: entry.id, reservationId: hold.reservationId, offerExpiresAt: hold.expiresAt }
}

/** offered → accepted / declined / expired (declined and expired release the hold). */
export async function resolveWaitlistOffer(uow: UnitOfWork, actor: Actor, input: { waitlistEntryId: string; to: 'accepted' | 'declined' | 'expired'; expectedVersion: number }) {
  if (!['accepted', 'declined', 'expired'].includes(input.to)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown outcome.', { field: 'to' })
  const entry = await lockRow<{ id: string; status: string; version: number; offeredReservationId: string | null; offerExpiresAt: Date | null }>(uow.tx, 'WaitlistEntry', input.waitlistEntryId)
  if (input.to === 'expired' && entry.offerExpiresAt && entry.offerExpiresAt.getTime() > uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, 'The offer has not expired yet.')
  if (input.to !== 'accepted' && entry.offeredReservationId) {
    const reservation = await uow.tx.placeReservation.findUnique({ where: { id: entry.offeredReservationId }, select: { status: true } })
    if (reservation?.status === 'active') await endReservation(uow, actor, { reservationId: entry.offeredReservationId, to: 'released', reason: `offer ${input.to}` })
  }
  await casUpdate(uow, { model: 'WaitlistEntry', id: entry.id, version: input.expectedVersion, from: ['offered'], to: input.to, actor, eventType: `waitlist.${input.to}` })
  return { waitlistEntryId: entry.id, status: input.to }
}

/**
 * The offer-expiry job: offered → expired for every offer past its deadline, which also releases the
 * held apartment or bed. Each entry is locked and re-checked, so a family accepting at the same
 * moment wins or loses cleanly.
 */
export async function expireWaitlistOffers(uow: UnitOfWork, actor: Actor) {
  const due = await uow.tx.waitlistEntry.findMany({ where: { status: 'offered', offerExpiresAt: { lt: uow.now } }, select: { id: true }, take: 200, orderBy: { offerExpiresAt: 'asc' } })
  let expired = 0
  for (const row of due) {
    const entry = await lockRow<{ id: string; status: string; version: number }>(uow.tx, 'WaitlistEntry', row.id)
    if (entry.status !== 'offered') continue
    await resolveWaitlistOffer(uow, actor, { waitlistEntryId: entry.id, to: 'expired', expectedVersion: entry.version })
    expired += 1
  }
  return { expired }
}

/**
 * The tour-hold job: a web tour request that nobody confirmed before its hold ran out is cancelled,
 * so the seat goes back on the storefront. Staff-booked tours are confirmed at once and never held.
 */
export async function expireTourHolds(uow: UnitOfWork, actor: Actor) {
  const due = await uow.tx.tour.findMany({ where: { status: 'requested', holdExpiresAt: { lt: uow.now } }, select: { id: true }, take: 200, orderBy: { holdExpiresAt: 'asc' } })
  let cancelled = 0
  for (const row of due) {
    const tour = await lockRow<{ id: string; status: string; version: number }>(uow.tx, 'Tour', row.id)
    if (tour.status !== 'requested') continue
    await casUpdate(uow, { model: 'Tour', id: tour.id, version: tour.version, from: ['requested'], to: 'cancelled', actor, eventType: 'tour.hold_expired', reason: 'Not confirmed before the hold ran out', data: { holdExpiresAt: null } })
    cancelled += 1
  }
  return { cancelled }
}
