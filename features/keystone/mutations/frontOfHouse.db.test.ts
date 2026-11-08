import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { verifyAuditChain } from '../lib/audit'
import { runInTransaction } from '../lib/unitOfWork'
import { inviteRepresentative, acceptPortalInvitation } from '../lib/portal'
import { portalCalendar, portalDocuments, portalResidents, portalUpdates } from '../lib/portalReads'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup } from './setup'
import { admitResidentMutation } from './census'
import {
  joinWaitlistMutation, moveLeadMutation, moveTourMutation, movePublishedPriceMutation, offerWaitlistPlaceMutation, openTourSlotsMutation,
  proposePortalScopeMutation, grantPortalScopeMutation, requestTourMutation, resolveWaitlistOfferMutation, setStorefrontPublishedMutation,
  storefrontCommunityQuery, submitInquiryMutation,
} from './frontOfHouse'

/**
 * Phase 1 exit gate (4) (BUILD-PLAN §1): a family finds the community on the public storefront,
 * books a tour, joins the waitlist; admissions completes the tour, offers an apartment, the family
 * accepts, and the resident is admitted on that reservation. The sales trail closes only at
 * admission. Then the representative is invited to the portal and reads only what was granted.
 * Every person is fictional.
 */

const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const HOUR = 3_600_000
const anonymous = (prisma: PrismaClient, address = '203.0.113.7') => ({ session: undefined, prisma, req: { headers: {}, socket: { remoteAddress: address } } }) as never

describe.skipIf(!hasTestDatabase)('storefront to admission (database)', () => {
  let prisma: PrismaClient
  let admissions: Ctx, social: Ctx, director: Ctx
  let slug = ''

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    process.env.RATE_LIMIT_SECRET ||= 'test-only-rate-limit-secret-0123456789abcdef'
    for (const name of ['TOUR_MANAGE_SECRET', 'WAITLIST_OFFER_SECRET', 'PORTAL_INVITE_SECRET', 'SESSION_SECRET']) process.env[name] ||= `test-only-${name.toLowerCase()}-0123456789abcdef0123`
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@ridgelineseniorcommunities.com`, password: 'x'.repeat(60) } })
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, ctx(prisma, owner.id, ALL_DEFAULT))
    admissions = ctx(prisma, 'seed_user_patel', roleOf('seed_role_admissions'))
    social = ctx(prisma, 'seed_user_brooks', roleOf('seed_role_social_services'))
    director = ctx(prisma, 'seed_user_castellanos', roleOf('seed_role_executive_director'))
    slug = (await prisma.community.findUniqueOrThrow({ where: { id: COMMUNITY.id }, select: { slug: true } })).slug
  }, 300_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('publishes the storefront only with copy and a price, and only by a person', async () => {
    await prisma.storefrontSite.create({ data: { id: 'test_site', heroTitle: '', heroBody: '', tourBookingEnabled: true, waitlistEnabled: true } })
    await prisma.community.update({ where: { id: COMMUNITY.id }, data: { storefrontId: 'test_site' } })
    // Hidden until published: the public read says not found.
    await expect(storefrontCommunityQuery(null, { slug }, anonymous(prisma))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(setStorefrontPublishedMutation(null, { communityId: COMMUNITY.id, published: true, idempotencyKey: uniqueKey('pub') }, director)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await prisma.storefrontSite.update({ where: { id: 'test_site' }, data: { heroTitle: 'Maple Ridge Senior Living', heroBody: 'Assisted living, memory care and skilled nursing on one campus.' } })
    await expect(setStorefrontPublishedMutation(null, { communityId: COMMUNITY.id, published: true, idempotencyKey: uniqueKey('pub') }, director)).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'no_prices' } })
    await prisma.publishedPrice.create({ data: { id: 'test_price_one_bed', communityId: COMMUNITY.id, apartmentTypeId: 'seed_apt_one_bed', setting: 'assisted_living', label: 'Assisted living one bedroom', fromMinor: 596_000n, period: 'month', status: 'draft' } })
    // An MCP session of the same person can't move a price or publish.
    const viaMcp = { ...director, session: { ...(director.session as object), mcp: { clientId: 'c', scopes: [] } } }
    await expect(movePublishedPriceMutation(null, { priceId: 'test_price_one_bed', to: 'published', expectedVersion: 0, idempotencyKey: uniqueKey('price') }, viaMcp as never)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(movePublishedPriceMutation(null, { priceId: 'test_price_one_bed', to: 'published', expectedVersion: 7, idempotencyKey: uniqueKey('price') }, director)).rejects.toMatchObject({ code: 'STALE_STATE' })
    await movePublishedPriceMutation(null, { priceId: 'test_price_one_bed', to: 'published', expectedVersion: 0, idempotencyKey: uniqueKey('price') }, director)
    await setStorefrontPublishedMutation(null, { communityId: COMMUNITY.id, published: true, idempotencyKey: uniqueKey('pub') }, director)
    const page = await storefrontCommunityQuery(null, { slug }, anonymous(prisma)) as any
    expect(page.prices.map((p: any) => p.fromMinor)).toEqual(['596000'])
    // The public page never names residents, rooms or apartments.
    expect(JSON.stringify(page)).not.toMatch(/seed_room_|seed_apt_mea|Resident/)
  })

  let leadId = ''
  let prospectId = ''
  let entryId = ''

  it('takes a tour request and a waitlist request from the public site', async () => {
    const startsAt = new Date(Date.now() + 2 * 24 * HOUR)
    startsAt.setUTCMinutes(0, 0, 0)
    await openTourSlotsMutation(null, { communityId: COMMUNITY.id, slots: [{ startsAt: startsAt.toISOString(), minutes: 45, capacity: 1, kind: 'in_person' }], idempotencyKey: uniqueKey('slots') }, admissions)
    const slot = await prisma.tourSlot.findFirstOrThrow({ where: { communityId: COMMUNITY.id, startsAt } })
    // Honeypot: looks successful, stores nothing.
    const before = await prisma.lead.count()
    const bot = await submitInquiryMutation(null, { input: { communitySlug: slug, contactName: 'Bot', contactEmail: 'bot@gmail.com', consentToContact: true, website: 'http://spam' } }, anonymous(prisma)) as any
    expect(bot.publicCode).toMatch(/^INQ/)
    expect(await prisma.lead.count()).toBe(before)
    await expect(submitInquiryMutation(null, { input: { communitySlug: slug, contactName: 'Janet Whitfield', contactEmail: 'janet.whitfield@gmail.com', consentToContact: false } }, anonymous(prisma))).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const tour = await requestTourMutation(null, { input: { communitySlug: slug, slotId: slot.id, kind: 'in_person', contactName: 'Janet Whitfield', contactEmail: 'janet.whitfield@gmail.com', contactPhone: '(614) 555-0161', notes: 'For my mother, Agnes.', consentToContact: true } }, anonymous(prisma)) as any
    expect(tour.manageToken).toEqual(expect.any(String))
    const tourRow = await prisma.tour.findUniqueOrThrow({ where: { publicCode: tour.publicCode } })
    expect(tourRow.status).toBe('requested')
    expect(tourRow.guestTokenHash).not.toContain(tour.manageToken)
    // The slot holds one: a second family can't take it while the request is held.
    await expect(requestTourMutation(null, { input: { communitySlug: slug, slotId: slot.id, kind: 'in_person', contactName: 'Other Family', contactEmail: 'other.family@yahoo.com', consentToContact: true } }, anonymous(prisma, '198.51.100.4'))).rejects.toMatchObject({ code: 'PLACE_UNAVAILABLE' })

    await moveTourMutation(null, { tourId: tourRow.id, to: 'confirmed', expectedVersion: tourRow.version, idempotencyKey: uniqueKey('tour') }, admissions)
    const confirmed = await prisma.tour.findUniqueOrThrow({ where: { id: tourRow.id } })
    await moveTourMutation(null, { tourId: tourRow.id, to: 'completed', expectedVersion: confirmed.version, idempotencyKey: uniqueKey('tour') }, admissions)
    const tourLead = await prisma.lead.findUniqueOrThrow({ where: { id: tourRow.leadId! } })
    expect(tourLead.status).toBe('toured')

    const joined = await joinWaitlistMutation(null, { input: { communitySlug: slug, contactName: 'Janet Whitfield', contactEmail: 'janet.whitfield@gmail.com', relationship: 'Daughter', forWhomFirstName: 'Agnes', forWhomLastName: 'Whitfield', setting: 'assisted_living', apartmentTypeId: 'seed_apt_one_bed', consentToContact: true } }, anonymous(prisma)) as any
    const inquiry = await prisma.inquiry.findUniqueOrThrow({ where: { publicCode: joined.publicCode } })
    leadId = inquiry.leadId!
    const entry = await prisma.waitlistEntry.findFirstOrThrow({ where: { leadId } })
    entryId = entry.id
    prospectId = entry.prospectId!
    expect(entry.status).toBe('active')
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('waitlisted')
    // A lead can't be marked moved in by hand.
    await expect(moveLeadMutation(null, { leadId, to: 'moved_in', expectedVersion: 1, idempotencyKey: uniqueKey('lead') }, admissions)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  let reservationId = ''
  let apartmentId = ''

  it('offers an apartment, the family accepts, and admission closes the sales trail', async () => {
    const apartment = await prisma.apartment.findFirstOrThrow({ where: { apartmentTypeId: 'seed_apt_one_bed', status: 'available' }, orderBy: { id: 'asc' } })
    apartmentId = apartment.id
    const entry = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } })
    // An MCP session can't make the offer (human-only).
    const viaMcp = { ...admissions, session: { ...(admissions.session as object), mcp: { clientId: 'c', scopes: [] } } }
    await expect(offerWaitlistPlaceMutation(null, { waitlistEntryId: entryId, apartmentId, hours: 72, expectedVersion: entry.version, idempotencyKey: uniqueKey('offer') }, viaMcp as never)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const offer = await offerWaitlistPlaceMutation(null, { waitlistEntryId: entryId, apartmentId, hours: 72, expectedVersion: entry.version, idempotencyKey: uniqueKey('offer') }, admissions) as any
    reservationId = offer.reservationId
    expect((await prisma.apartment.findUniqueOrThrow({ where: { id: apartmentId } })).status).toBe('reserved')
    // Someone else can't be admitted into the held apartment.
    const otherAdmit = { communityId: COMMUNITY.id, resident: { firstName: 'Mildred', lastName: 'Okafor', dateOfBirth: '1939-05-02', sex: 'female' }, representatives: [], selfRepresented: true, apartmentId, payerId: 'seed_payer_private', admissionSource: 'community_home', effectiveAt: new Date().toISOString(), notices: [] }
    await expect(admitResidentMutation(null, { input: otherAdmit as never, idempotencyKey: uniqueKey('adm') }, admissions)).rejects.toMatchObject({ code: 'PLACE_UNAVAILABLE' })

    const offered = await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } })
    await expect(resolveWaitlistOfferMutation(null, { waitlistEntryId: entryId, to: 'expired', expectedVersion: offered.version, idempotencyKey: uniqueKey('wl') }, admissions)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await resolveWaitlistOfferMutation(null, { waitlistEntryId: entryId, to: 'accepted', expectedVersion: offered.version, idempotencyKey: uniqueKey('wl') }, admissions)
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    await moveLeadMutation(null, { leadId, to: 'move_in_scheduled', expectedVersion: lead.version, idempotencyKey: uniqueKey('lead') }, admissions)

    const admitted = await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, prospectId, reservationId, apartmentId,
        resident: { firstName: 'Agnes', lastName: 'Whitfield', dateOfBirth: '1940-02-11', sex: 'female' },
        representatives: [{ firstName: 'Janet', lastName: 'Whitfield', email: 'janet.whitfield@gmail.com', phone: '(614) 555-0161', roles: ['healthcare_poa', 'financial_responsible'], contactPriority: 1 }],
        payerId: 'seed_payer_private', admissionSource: 'community_home', effectiveAt: new Date().toISOString(),
        notices: [{ kind: 'privacy_practices', method: 'in_person', deliveredAt: new Date().toISOString(), acknowledgement: 'signed' }],
      } as never,
      idempotencyKey: uniqueKey('adm'),
    }, admissions) as any
    expect((await prisma.apartment.findUniqueOrThrow({ where: { id: apartmentId } })).status).toBe('occupied')
    expect((await prisma.placeReservation.findUniqueOrThrow({ where: { id: reservationId } })).consumedByStayId).toBe(admitted.stayId)
    expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { id: entryId } })).status).toBe('converted')
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status).toBe('moved_in')
    expect((await prisma.prospect.findUniqueOrThrow({ where: { id: prospectId } })).convertedResidentId).toBe(admitted.residentId)
    expect(await verifyAuditChain(prisma as never)).toMatchObject({ ok: true })
  })

  it('invites the representative and serves only the granted portal scopes', async () => {
    const resident = await prisma.resident.findFirstOrThrow({ where: { firstName: 'Agnes', lastName: 'Whitfield' } })
    const rep = await prisma.representative.findFirstOrThrow({ where: { residentId: resident.id, self: false } })
    // Invitation and acceptance (the token travels only in the mail message).
    let token = ''
    await runInTransaction(prisma as never, async uow => {
      await inviteRepresentative(uow, { kind: 'user', userId: 'seed_user_brooks', name: 'Brooks', permissions: new Set(roleOf('seed_role_social_services')) }, { representativeId: rep.id })
      token = (uow.outbox.find(m => m.topic === 'mail.portal_invitation')?.payload as { token: string }).token
    })
    await runInTransaction(prisma as never, uow => acceptPortalInvitation(uow, { token, passwordHash: '$2a$10$' + 'x'.repeat(53) }))
    await expect(runInTransaction(prisma as never, uow => acceptPortalInvitation(uow, { token, passwordHash: '$2a$10$' + 'x'.repeat(53) }))).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const account = await prisma.portalAccount.findFirstOrThrow({ where: { representatives: { some: { id: rep.id } } } })
    const principal = { userId: account.userId!, kind: 'portal' }

    // updates is granted at once; documents waits for a second person.
    await proposePortalScopeMutation(null, { representativeId: rep.id, scope: 'updates', idempotencyKey: uniqueKey('scope') }, social)
    const docs = await proposePortalScopeMutation(null, { representativeId: rep.id, scope: 'documents', idempotencyKey: uniqueKey('scope') }, social) as any
    expect(docs.status).toBe('proposed')
    await expect(grantPortalScopeMutation(null, { grantId: docs.grantId, idempotencyKey: uniqueKey('grant') }, social)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })

    const read = <T>(work: (tx: any) => Promise<T>) => prisma.$transaction(work)
    const me = await read(tx => portalResidents(tx, principal))
    expect(me.residents).toEqual([expect.objectContaining({ residentId: resident.id, scopes: ['updates'] })])
    const updates = await read(tx => portalUpdates(tx, principal, resident.id))
    expect(updates).toMatchObject({ name: 'Agnes', setting: 'assisted_living', whereabouts: 'at_community' })
    expect(JSON.stringify(updates)).not.toMatch(/MEA|apartment|room/i)
    // Not granted yet: indistinguishable from not found.
    await expect(read(tx => portalDocuments(tx, principal, resident.id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(read(tx => portalCalendar(tx, principal, resident.id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // Another resident: not found either.
    const other = await prisma.resident.create({ data: { reference: uniqueKey('RES'), communityId: COMMUNITY.id, firstName: 'Other', lastName: 'Person', status: 'admitted', synthetic: true } })
    await expect(read(tx => portalUpdates(tx, principal, other.id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    // A staff session is refused outright.
    await expect(read(tx => portalUpdates(tx, { userId: 'seed_user_brooks', kind: 'staff' }, resident.id))).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })

    const ferreira = ctx(prisma, 'seed_user_brooks_peer', roleOf('seed_role_social_services'))
    await prisma.user.create({ data: { id: 'seed_user_brooks_peer', name: 'Peer', email: 'peer.socialwork@mapleridgeseniorliving.com', password: 'x'.repeat(60) } })
    await prisma.staffAssignment.create({ data: { userId: 'seed_user_brooks_peer', communityId: COMMUNITY.id, status: 'active' } })
    await grantPortalScopeMutation(null, { grantId: docs.grantId, idempotencyKey: uniqueKey('grant') }, ferreira)
    // Documents need two-step sign-in on the account.
    await expect(read(tx => portalDocuments(tx, principal, resident.id))).rejects.toMatchObject({ code: 'GUARD_FAILED', details: { reason: 'mfa_required' } })
    await prisma.portalAccount.update({ where: { id: account.id }, data: { mfaEnrolled: true } })
    const documents = await read(tx => portalDocuments(tx, principal, resident.id))
    expect(documents.notices.map((n: any) => n.kind)).toContain('privacy_practices')
    // Every portal read is audited with family_access.
    expect(await prisma.phiReadAudit.count({ where: { purpose: 'family_access', actorKind: 'portal' } })).toBeGreaterThanOrEqual(3)
  })
})
