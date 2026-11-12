import { endReservation, markPlaceReady, recomputeAvailability, reservePlace, setPlaceService, type ReserveInput } from '../lib/places'
import { addToWaitlist, cancelTourWithToken, logSalesActivity, moveLead, moveReferral, moveTour, offerWaitlistPlace, recordInquiry, recordReferral, requestTour, scheduleTour, resolveWaitlistOffer, submitInquiry, type InquiryInput } from '../lib/sales'
import { joinWaitlist, movePublishedPrice, openTourSlots, setStorefrontPublished, storefrontCommunity } from '../lib/storefront'
import { portalCalendar, portalDocuments, portalResidents, portalStatements, portalTrustBalance, portalUpdates } from '../lib/portalReads'
import { date } from './run'
import { acceptPortalInvitation, grantPortalScope, inviteRepresentative, proposePortalScope, revokePortalScope, setPortalAccountStatus } from '../lib/portal'
import { endBreakGlass, openBreakGlass, reviewBreakGlass } from '../lib/privacy'
import { enforceRateLimit } from '../lib/publicRateLimit'
import { runInTransaction } from '../lib/unitOfWork'
import { DomainError, Codes } from '../lib/errors'
import { communityOf, runDomain } from './run'
import { actorFor } from './actorFor'
import { advanceTimedStates } from '../lib/maintenance'

type Ctx = { session: any; prisma: any; req?: any }

/* ---------------------------------------------------------------- places */

export const reservePlaceMutation = (_: unknown, args: Omit<ReserveInput, 'idempotencyKey'> & { idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'place.reserve', permissions: ['canAdmitDischarge', 'canManageSales'], community: tx => communityOf.place(tx, args) }, (uow, actor) => reservePlace(uow, actor, args))

export const releaseReservation = (_: unknown, args: { reservationId: string; reason?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'place.release', permissions: ['canAdmitDischarge', 'canManageSales'], community: tx => communityOf.reservation(tx, args.reservationId) }, (uow, actor) => endReservation(uow, actor, { ...args, to: 'released' }))

export const markPlaceReadyMutation = (_: unknown, args: { bedId?: string | null; apartmentId?: string | null; note?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'place.ready', permissions: ['canManagePlaces', 'canRecordCensus'], community: tx => communityOf.place(tx, args) }, (uow, actor) => markPlaceReady(uow, actor, args))

export const setPlaceServiceMutation = (_: unknown, args: { bedId?: string | null; apartmentId?: string | null; inService: boolean; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'place.service', permissions: ['canManagePlaces'], community: tx => communityOf.place(tx, args) }, (uow, actor) => setPlaceService(uow, actor, args))

export const recomputeAvailabilityMutation = (_: unknown, args: { communityId: string; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'place.availability', permissions: ['canManageStorefront', 'canManagePlaces'], community: async () => args.communityId }, uow => recomputeAvailability(uow, args.communityId).then(snapshots => ({ snapshots })))

/** The staff Refresh button: settles every clock, hold, offer and census day that has come due. */
export const refreshTimedStatesMutation = async (_: unknown, _args: { idempotencyKey?: string }, context: Ctx) => {
  await actorFor(context)
  const result = await advanceTimedStates(context.prisma, { force: true })
  return { refreshed: result !== null, errors: result ? Number(result.errors) : 0 }
}

/* ----------------------------------------------------------------- sales */

/** Public calls carry no session: rate-limited per address and per community, then one transaction. */
async function publicCall<T>(context: Ctx, bucket: string, limit: number, work: Parameters<typeof runInTransaction<T>>[1]) {
  await enforceRateLimit(context, bucket, limit, 60 * 60_000)
  return runInTransaction(context.prisma, work)
}

export const submitInquiryMutation = (_: unknown, args: { input: InquiryInput }, context: Ctx) =>
  publicCall(context, `inquiry:${args.input?.communitySlug ?? ''}`, 10, uow => submitInquiry(uow, args.input))

export const requestTourMutation = (_: unknown, args: { input: Parameters<typeof requestTour>[1] }, context: Ctx) =>
  publicCall(context, `tour:${args.input?.communitySlug ?? ''}`, 6, uow => requestTour(uow, args.input))

export const joinWaitlistMutation = (_: unknown, args: { input: Parameters<typeof joinWaitlist>[1] }, context: Ctx) =>
  publicCall(context, `waitlist:${args.input?.communitySlug ?? ''}`, 6, uow => joinWaitlist(uow, args.input))

/** Public read: the community's published storefront. Rate limited like the writes. */
export const storefrontCommunityQuery = async (_: unknown, args: { slug: string }, context: Ctx) => {
  await enforceRateLimit(context, 'storefront-read', 300, 60 * 60_000)
  await advanceTimedStates(context.prisma)
  return storefrontCommunity(context.prisma, args.slug)
}

export const cancelTourByToken = (_: unknown, args: { token: string; reason?: string | null }, context: Ctx) =>
  publicCall(context, 'tour-manage', 20, uow => cancelTourWithToken(uow, args))

export const acceptPortalInvitationMutation = async (_: unknown, args: { token: string; password: string }, context: Ctx & { sudo?: () => any }) => {
  if (typeof args.password !== 'string' || args.password.length < 12) throw new DomainError(Codes.INVALID_INPUT, 'Use at least 12 characters.', { field: 'password' })
  // @ts-expect-error bcryptjs ships no types; Keystone's password field uses the same library.
  const { hash } = await import('bcryptjs')
  const passwordHash = await hash(args.password, 10)
  return publicCall(context, 'portal-invite', 10, uow => acceptPortalInvitation(uow, { token: args.token, passwordHash }))
}

export const recordInquiryMutation = (_: unknown, args: { input: Parameters<typeof recordInquiry>[2]; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.inquiry', permissions: ['canManageSales'], community: async () => args.input.communityId }, (uow, actor) => recordInquiry(uow, actor, args.input))

export const moveLeadMutation = (_: unknown, args: { leadId: string; to: string; lostReason?: string | null; note?: string | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.lead', permissions: ['canManageSales'], community: tx => communityOf.lead(tx, args.leadId) }, (uow, actor) => moveLead(uow, actor, args))

export const logSalesActivityMutation = (_: unknown, args: { leadId: string; kind: string; summary: string; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.activity', permissions: ['canManageSales'], community: tx => communityOf.lead(tx, args.leadId) }, (uow, actor) => logSalesActivity(uow, actor, args))

export const moveTourMutation = (_: unknown, args: { tourId: string; to: 'confirmed' | 'completed' | 'no_show' | 'cancelled'; reason?: string | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.tour', permissions: ['canManageSales'], community: tx => communityOf.tour(tx, args.tourId) }, (uow, actor) => moveTour(uow, actor, args))

export const moveReferralMutation = (_: unknown, args: { referralId: string; to: string; declineReason?: string | null; bedId?: string | null; reservationHours?: number | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.referral', permissions: ['canAdmitDischarge'], community: tx => communityOf.referral(tx, args.referralId) }, (uow, actor) => moveReferral(uow, actor, args))

export const recordReferralMutation = (_: unknown, args: { input: Omit<Parameters<typeof recordReferral>[2], 'receivedAt'> & { receivedAt?: string | null }; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.referral_received', permissions: ['canAdmitDischarge', 'canManageSales'], community: async () => args.input.communityId }, (uow, actor) =>
    recordReferral(uow, actor, { ...args.input, receivedAt: args.input.receivedAt ? date(args.input.receivedAt, 'receivedAt') : null }))

export const scheduleTourMutation = (_: unknown, args: { leadId: string; slotId: string; kind: 'in_person' | 'virtual'; notes?: string | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.tour_scheduled', permissions: ['canManageSales'], community: async tx => (await tx.lead.findUnique({ where: { id: args.leadId }, select: { communityId: true } }))?.communityId ?? null }, (uow, actor) => scheduleTour(uow, actor, args))

export const openTourSlotsMutation = (_: unknown, args: { communityId: string; slots: { startsAt: string; minutes: number; capacity: number; kind: 'in_person' | 'virtual' | 'either'; hostId?: string | null }[]; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.tour_slots', permissions: ['canManageSales'], community: async () => args.communityId }, (uow, actor) =>
    openTourSlots(uow, actor, { communityId: args.communityId, slots: (args.slots ?? []).map(slot => ({ ...slot, startsAt: date(slot.startsAt, 'startsAt') })) }))

export const setStorefrontPublishedMutation = (_: unknown, args: { communityId: string; published: boolean; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'storefront.publish', permissions: ['canManageStorefront'], humanOnly: true, community: async () => args.communityId }, (uow, actor) => setStorefrontPublished(uow, actor, args))

export const movePublishedPriceMutation = (_: unknown, args: { priceId: string; to: 'published' | 'retired'; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'storefront.price', permissions: ['canManageStorefront'], humanOnly: true, community: async tx => (await tx.publishedPrice.findUnique({ where: { id: args.priceId }, select: { communityId: true } }))?.communityId ?? null }, (uow, actor) => movePublishedPrice(uow, actor, args))

export const addToWaitlistMutation = (_: unknown, args: Parameters<typeof addToWaitlist>[2] & { idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.waitlist_add', permissions: ['canManageSales'], community: async () => args.communityId }, (uow, actor) => addToWaitlist(uow, actor, args))

export const offerWaitlistPlaceMutation = (_: unknown, args: { waitlistEntryId: string; apartmentId?: string | null; bedId?: string | null; hours: number; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.waitlist_offer', permissions: ['canManageSales'], humanOnly: true, community: tx => communityOf.waitlist(tx, args.waitlistEntryId) }, (uow, actor) => offerWaitlistPlace(uow, actor, args))

export const resolveWaitlistOfferMutation = (_: unknown, args: { waitlistEntryId: string; to: 'accepted' | 'declined' | 'expired'; expectedVersion: number; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'sales.waitlist_resolve', permissions: ['canManageSales'], community: tx => communityOf.waitlist(tx, args.waitlistEntryId) }, (uow, actor) => resolveWaitlistOffer(uow, actor, args))

/* ---------------------------------------------------------------- portal */

export const invitePortalRepresentative = (_: unknown, args: { representativeId: string; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'portal.invite', permissions: ['canManageRepresentatives'], humanOnly: true, community: tx => communityOf.representative(tx, args.representativeId) }, (uow, actor) => inviteRepresentative(uow, actor, args))

export const proposePortalScopeMutation = (_: unknown, args: { representativeId: string; scope: any; consentDocumentId?: string | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'portal.scope_propose', permissions: ['canManageRepresentatives'], humanOnly: true, community: tx => communityOf.representative(tx, args.representativeId) }, (uow, actor) => proposePortalScope(uow, actor, args))

export const grantPortalScopeMutation = (_: unknown, args: { grantId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'portal.scope_grant', permissions: ['canApprovePortalScopes'], humanOnly: true, community: tx => communityOf.portalGrant(tx, args.grantId) }, (uow, actor) => grantPortalScope(uow, actor, args))

export const revokePortalScopeMutation = (_: unknown, args: { grantId: string; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'portal.scope_revoke', permissions: ['canManageRepresentatives', 'canApprovePortalScopes'], humanOnly: true, community: tx => communityOf.portalGrant(tx, args.grantId) }, (uow, actor) => revokePortalScope(uow, actor, args))

export const setPortalAccountStatusMutation = (_: unknown, args: { accountId: string; to: 'suspended' | 'active' | 'revoked'; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'portal.account_status', permissions: ['canManageRepresentatives'], humanOnly: true, community: tx => communityOf.portalAccount(tx, args.accountId) }, (uow, actor) => setPortalAccountStatus(uow, actor, args))

/* --------------------------------------------------------------- privacy */

export const openBreakGlassMutation = (_: unknown, args: { residentId: string; reason: any; note: string; hours?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'privacy.break_glass_open', permissions: ['canBreakGlass'], humanOnly: true }, (uow, actor) => openBreakGlass(uow, actor, args))

export const endBreakGlassMutation = (_: unknown, args: { grantId: string; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'privacy.break_glass_end', permissions: ['canBreakGlass'], humanOnly: true }, (uow, actor) => endBreakGlass(uow, actor, args))

export const reviewBreakGlassMutation = (_: unknown, args: { grantId: string; outcome: 'reviewed_ok' | 'reviewed_violation'; note: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) =>
  runDomain(context, args, { name: 'privacy.break_glass_review', permissions: ['canReviewBreakGlass'], humanOnly: true }, (uow, actor) => reviewBreakGlass(uow, actor, args))

/* ------------------------------------------------------- portal reads */

const portalPrincipal = (context: Ctx) => {
  const session = context.session as { itemId?: string; data?: { kind?: string | null } } | null
  if (!session?.itemId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to the family portal.')
  return { userId: session.itemId, kind: session.data?.kind }
}
const portalRead = <T>(context: Ctx, work: (tx: any) => Promise<T>) => context.prisma.$transaction(work, { timeout: 15_000 })

export const portalMeQuery = (_: unknown, __: unknown, context: Ctx) => portalRead(context, tx => portalResidents(tx, portalPrincipal(context)))
export const portalUpdatesQuery = (_: unknown, args: { residentId: string }, context: Ctx) => portalRead(context, tx => portalUpdates(tx, portalPrincipal(context), args.residentId))
export const portalCalendarQuery = (_: unknown, args: { residentId: string }, context: Ctx) => portalRead(context, tx => portalCalendar(tx, portalPrincipal(context), args.residentId))
export const portalStatementsQuery = (_: unknown, args: { residentId: string }, context: Ctx) => portalRead(context, tx => portalStatements(tx, portalPrincipal(context), args.residentId))
export const portalTrustBalanceQuery = (_: unknown, args: { residentId: string }, context: Ctx) => portalRead(context, tx => portalTrustBalance(tx, portalPrincipal(context), args.residentId))
export const portalDocumentsQuery = (_: unknown, args: { residentId: string }, context: Ctx) => portalRead(context, tx => portalDocuments(tx, portalPrincipal(context), args.residentId))
