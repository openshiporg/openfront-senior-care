import { auditCreate, casUpdate, lockRow } from './cas'
import { type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextReference, publicCode } from './sequence'
import { submitInquiry, type InquiryInput } from './sales'
import { SETTINGS } from '../models/platform'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/**
 * Storefront backend (SCHEMA §3.1-3.3, §3.12). APIs only: the public site UI waits for the owner's
 * design pick. Public reads return marketing copy, published prices, availability COUNTS and open
 * tour times; never a resident, a bed, an apartment number or a staff member without consent.
 */

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

async function publishedSite(tx: Tx, slug: string) {
  const community = await tx.community.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true, addressLine1: true, addressLine2: true, city: true, region: true, postalCode: true, phone: true, settingsOffered: true, timeZone: true, storefront: true },
  })
  if (!community || community.status !== 'active' || !community.storefront?.published) throw new DomainError(Codes.NOT_FOUND, 'Community not found.')
  return community
}

/** Public: everything the community's site needs in one read. */
export async function storefrontCommunity(tx: Tx, slug: string, now = new Date()) {
  const community = await publishedSite(tx, clean(slug, 120))
  const site = community.storefront!
  const [prices, availability, slots, bios, jobs, types] = await Promise.all([
    tx.publishedPrice.findMany({ where: { communityId: community.id, status: 'published' }, orderBy: [{ setting: 'asc' }, { fromMinor: 'asc' }], select: { id: true, label: true, setting: true, apartmentTypeId: true, fromMinor: true, toMinor: true, period: true, communityFeeMinor: true, disclaimer: true } }),
    tx.availabilitySnapshot.findMany({ where: { communityId: community.id }, select: { apartmentTypeId: true, setting: true, availableCount: true, waitlistOpen: true, computedAt: true } }),
    site.tourBookingEnabled ? tx.tourSlot.findMany({ where: { communityId: community.id, startsAt: { gt: now, lt: new Date(now.getTime() + 21 * 86_400_000) } }, orderBy: { startsAt: 'asc' }, take: 60, select: { id: true, startsAt: true, endsAt: true, kind: true, capacity: true, tours: { where: { OR: [{ status: 'confirmed' }, { status: 'requested', holdExpiresAt: { gt: now } }] }, select: { id: true } } } }) : Promise.resolve([]),
    tx.staffBio.findMany({ where: { siteId: site.id, consentDocumentId: { not: null } }, orderBy: { sortOrder: 'asc' }, select: { name: true, title: true, bio: true } }),
    tx.jobPosting.findMany({ where: { communityId: community.id, status: 'published' }, select: { id: true, title: true, role: true, employmentType: true, payRange: true, body: true } }),
    tx.apartmentType.findMany({ where: { communityId: community.id }, select: { id: true, name: true, setting: true, squareFeet: true, bedrooms: true, description: true } }),
  ])
  return {
    community: { name: community.name, slug: community.slug, address: [community.addressLine1, community.addressLine2].filter(Boolean).join(', '), city: community.city, region: community.region, postalCode: community.postalCode, phone: community.phone, settingsOffered: community.settingsOffered, timeZone: community.timeZone },
    site: { heroTitle: site.heroTitle, heroBody: site.heroBody, amenities: site.amenities, diningCopy: site.diningCopy, activitiesCopy: site.activitiesCopy, careLevelsCopy: site.careLevelsCopy, faq: site.faq, acceptedPayers: site.acceptedPayers, seo: site.seo, tourBookingEnabled: site.tourBookingEnabled, waitlistEnabled: site.waitlistEnabled },
    apartmentTypes: types,
    prices: prices.map(price => ({ ...price, fromMinor: price.fromMinor.toString(), toMinor: price.toMinor?.toString() ?? null, communityFeeMinor: price.communityFeeMinor?.toString() ?? null })),
    availability,
    tourSlots: slots.map(slot => ({ id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, kind: slot.kind, open: Math.max(0, slot.capacity - slot.tours.length) })).filter(slot => slot.open > 0),
    team: bios,
    jobs,
  }
}

/** Public: join the waitlist for a setting or apartment type. Creates the inquiry, lead, prospect and entry. */
export async function joinWaitlist(uow: UnitOfWork, input: InquiryInput & { apartmentTypeId?: string | null; setting: string; desiredMoveIn?: string | null }) {
  const community = await publishedSite(uow.tx, clean(input.communitySlug, 120))
  if (!community.storefront?.waitlistEnabled) throw new DomainError(Codes.GUARD_FAILED, 'Call the community to join the waitlist.')
  if (!(SETTINGS as readonly string[]).includes(input.setting)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the type of care.', { field: 'setting' })
  if (input.apartmentTypeId) {
    const type = await uow.tx.apartmentType.findUnique({ where: { id: input.apartmentTypeId }, select: { communityId: true, setting: true } })
    if (!type || type.communityId !== community.id) throw new DomainError(Codes.NOT_FOUND, 'Apartment type not found.', { field: 'apartmentTypeId' })
  }
  if (input.desiredMoveIn && !/^\d{4}-\d{2}-\d{2}$/.test(input.desiredMoveIn)) throw new DomainError(Codes.INVALID_INPUT, 'Move-in date must be YYYY-MM-DD.', { field: 'desiredMoveIn' })
  if (clean(input.website, 200)) return { publicCode: publicCode('WL') } // honeypot
  const { publicCode: inquiryCode } = await submitInquiry(uow, { ...input, desiredSetting: input.setting, forWhomFirstName: input.forWhomFirstName || input.contactName?.split(/\s+/)[0] })
  const inquiry = await uow.tx.inquiry.findUnique({ where: { publicCode: inquiryCode }, select: { leadId: true } })
  if (!inquiry?.leadId) return { publicCode: inquiryCode }
  const prospect = await uow.tx.prospect.findFirst({ where: { leadId: inquiry.leadId }, select: { id: true } })
  if (prospect && input.desiredMoveIn) await uow.tx.prospect.update({ where: { id: prospect.id }, data: { desiredMoveIn: new Date(`${input.desiredMoveIn}T00:00:00Z`) } })
  const entry = await uow.tx.waitlistEntry.create({ data: { reference: await nextReference(uow.tx, 'WL', uow.now), communityId: community.id, leadId: inquiry.leadId, prospectId: prospect?.id ?? null, apartmentTypeId: input.apartmentTypeId ?? null, setting: input.setting, priority: 100, priorityReason: 'date_order', status: 'active' } })
  uow.audit({ eventType: 'waitlist.joined_online', entityType: 'WaitlistEntry', entityId: entry.id, actorUserId: null, after: { reference: entry.reference, setting: input.setting, leadId: inquiry.leadId } })
  // The lead moves to waitlisted with the entry as its evidence.
  const lead = await uow.tx.lead.findUnique({ where: { id: inquiry.leadId }, select: { version: true, status: true } })
  if (lead) await casUpdate(uow, { model: 'Lead', id: inquiry.leadId, version: lead.version, from: [lead.status], to: 'waitlisted', actor: { kind: 'system', name: 'storefront' }, eventType: 'lead.waitlisted', metadata: { waitlistEntryId: entry.id } })
  return { publicCode: inquiryCode }
}

/* ------------------------------------------------------------- staff side */

/** Staff: publish or unpublish the site. Publishing needs the copy a family reads first. */
export async function setStorefrontPublished(uow: UnitOfWork, actor: Actor, input: { communityId: string; published: boolean }) {
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { storefront: true } })
  const site = community?.storefront
  if (!site) throw new DomainError(Codes.NOT_FOUND, 'Create the storefront first.')
  if (input.published) {
    if (!site.heroTitle.trim() || !site.heroBody.trim()) throw new DomainError(Codes.GUARD_FAILED, 'Add the headline and introduction before publishing.', { field: 'heroTitle' })
    const prices = await uow.tx.publishedPrice.count({ where: { communityId: input.communityId, status: 'published' } })
    if (!prices) throw new DomainError(Codes.GUARD_FAILED, 'Publish at least one starting price before the site goes live.', { reason: 'no_prices' })
  }
  await uow.tx.storefrontSite.update({ where: { id: site.id }, data: { published: input.published } })
  uow.audit({ eventType: input.published ? 'storefront.published' : 'storefront.unpublished', entityType: 'StorefrontSite', entityId: site.id, actorUserId: actor.kind === 'user' ? actor.userId : null, before: { published: site.published }, after: { published: input.published } })
  return { siteId: site.id, published: input.published }
}

/** Staff: draft → published → retired. A published price needs a range that makes sense. */
export async function movePublishedPrice(uow: UnitOfWork, actor: Actor, input: { priceId: string; to: 'published' | 'retired'; expectedVersion: number }) {
  const price = await lockRow<{ id: string; status: string; version: number; fromMinor: bigint; toMinor: bigint | null; label: string }>(uow.tx, 'PublishedPrice', input.priceId)
  if (input.to === 'published') {
    if (price.fromMinor <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'A published price must be more than zero.', { field: 'fromMinor' })
    if (price.toMinor !== null && price.toMinor < price.fromMinor) throw new DomainError(Codes.GUARD_FAILED, 'The upper price is below the starting price.', { field: 'toMinor' })
  }
  const from = input.to === 'published' ? ['draft'] : ['published']
  await casUpdate(uow, { model: 'PublishedPrice', id: price.id, version: input.expectedVersion, from, to: input.to, actor, eventType: `published_price.${input.to}`, data: input.to === 'published' ? { publishedAt: uow.now } : {} })
  return { priceId: price.id, status: input.to }
}

/** Staff: open tour times for a day (deterministic per day/time, so re-running adds nothing). */
export async function openTourSlots(uow: UnitOfWork, actor: Actor, input: { communityId: string; slots: { startsAt: Date; minutes: number; capacity: number; kind: 'in_person' | 'virtual' | 'either'; hostId?: string | null }[] }) {
  if (!input.slots.length || input.slots.length > 60) throw new DomainError(Codes.INVALID_INPUT, 'Open 1 to 60 tour times at once.', { field: 'slots' })
  let created = 0
  for (const slot of input.slots) {
    if (slot.startsAt.getTime() <= uow.now.getTime()) throw new DomainError(Codes.INVALID_INPUT, 'Tour times must be in the future.', { field: 'startsAt' })
    if (slot.minutes < 15 || slot.minutes > 180 || slot.capacity < 1 || slot.capacity > 20) throw new DomainError(Codes.INVALID_INPUT, 'A tour is 15 to 180 minutes for 1 to 20 parties.', { field: 'minutes' })
    const exists = await uow.tx.tourSlot.findFirst({ where: { communityId: input.communityId, startsAt: slot.startsAt }, select: { id: true } })
    if (exists) continue
    const row = await uow.tx.tourSlot.create({ data: { communityId: input.communityId, startsAt: slot.startsAt, endsAt: new Date(slot.startsAt.getTime() + slot.minutes * 60_000), capacity: slot.capacity, kind: slot.kind, hostId: slot.hostId ?? null } })
    auditCreate(uow, actor, 'TourSlot', row.id, 'tour_slot.opened', { startsAt: slot.startsAt, capacity: slot.capacity })
    created += 1
  }
  return { created }
}
