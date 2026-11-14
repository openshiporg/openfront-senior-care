import { cache } from 'react'
import { storefrontGraphQL, type Result } from './graphql'
import { keystoneContext } from '@/features/keystone/context'
import { Codes } from '@/features/keystone/lib/errors'

/** What the public `storefrontCommunity` read returns: copy, published prices, availability counts and open tour times. */
export type TourSlot = { id: string; startsAt: string; endsAt: string; kind: 'in_person' | 'virtual' | 'either'; open: number }
export type Price = { id: string; label: string; setting: string | null; apartmentTypeId: string | null; fromMinor: string; toMinor: string | null; period: string; communityFeeMinor: string | null; disclaimer: string | null }
export type ApartmentType = { id: string; name: string; setting: string | null; squareFeet: number | null; bedrooms: number | null; description: string | null }
export type Availability = { apartmentTypeId: string | null; setting: string | null; availableCount: number; waitlistOpen: boolean; computedAt: string }
export type Site = {
  community: { name: string; slug: string; address: string; city: string; region: string; postalCode: string; phone: string; settingsOffered: string[]; timeZone: string }
  site: {
    heroTitle: string; heroBody: string; amenities: string[]; diningCopy: string; activitiesCopy: string; careLevelsCopy: string
    faq: { q: string; a: string }[]; acceptedPayers: string[]; seo: { title?: string; description?: string }
    tourBookingEnabled: boolean; waitlistEnabled: boolean
  }
  apartmentTypes: ApartmentType[]
  prices: Price[]
  availability: Availability[]
  tourSlots: TourSlot[]
  team: { name: string; title: string; bio: string }[]
  jobs: { id: string; title: string; role: string | null; employmentType: string | null; payRange: string | null; body: string | null }[]
}

type Json = Record<string, unknown>
const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const record = (value: unknown): Json | null => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null)

/**
 * One community's published site, read once per request. Null means there is no such published site
 * (the page answers "not found"); a read that failed for any other reason throws, so the visitor is
 * asked to try again instead of being told the community does not exist.
 */
export const getSite = cache(async (slug: string): Promise<Site | null> => {
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/i.test(slug)) return null
  const result = await storefrontGraphQL<{ storefrontCommunity: unknown }>(`query Site($slug: String!) { storefrontCommunity(slug: $slug) }`, { slug })
  if (!result.ok) {
    if (result.code === Codes.NOT_FOUND) return null
    throw new Error(`The community site could not be read (${result.code ?? 'request failed'}).`)
  }
  const raw = record(result.data?.storefrontCommunity)
  const community = record(raw?.community)
  const site = record(raw?.site)
  if (!raw || !community || !site) return null
  const seo = record(site.seo) ?? {}
  return {
    community: {
      name: text(community.name), slug: text(community.slug), address: text(community.address), city: text(community.city), region: text(community.region),
      postalCode: text(community.postalCode), phone: text(community.phone), settingsOffered: list<string>(community.settingsOffered), timeZone: text(community.timeZone) || 'America/New_York',
    },
    site: {
      heroTitle: text(site.heroTitle), heroBody: text(site.heroBody), amenities: list<string>(site.amenities), diningCopy: text(site.diningCopy), activitiesCopy: text(site.activitiesCopy),
      careLevelsCopy: text(site.careLevelsCopy), faq: list<{ q: string; a: string }>(site.faq).filter(item => item?.q && item?.a), acceptedPayers: list<string>(site.acceptedPayers),
      seo: { title: text(seo.title) || undefined, description: text(seo.description) || undefined }, tourBookingEnabled: Boolean(site.tourBookingEnabled), waitlistEnabled: Boolean(site.waitlistEnabled),
    },
    apartmentTypes: list<ApartmentType>(raw.apartmentTypes),
    prices: list<Price>(raw.prices),
    availability: list<Availability>(raw.availability),
    tourSlots: list<TourSlot>(raw.tourSlots),
    team: list<{ name: string; title: string; bio: string }>(raw.team),
    jobs: list<Site['jobs'][number]>(raw.jobs),
  }
})

/** Every community whose site is published: only the name, the address line and the slug that the site itself shows. */
export const publishedCommunities = cache(async (): Promise<{ slug: string; name: string; city: string; region: string }[]> => {
  const rows = await keystoneContext.prisma.community.findMany({
    where: { status: 'active', storefront: { is: { published: true } } },
    orderBy: { name: 'asc' },
    select: { slug: true, name: true, city: true, region: true },
  })
  return rows.map(row => ({ slug: text(row.slug), name: text(row.name), city: text(row.city), region: text(row.region) }))
})

const cheapest = (prices: Price[]) => [...prices].sort((a, b) => (BigInt(a.fromMinor) < BigInt(b.fromMinor) ? -1 : BigInt(a.fromMinor) > BigInt(b.fromMinor) ? 1 : 0))[0] ?? null

/** A price for living there carries a range or a one-time community fee; a flat extra (a second person in a companion suite, say) carries neither. */
const isResidency = (price: Price) => price.toMinor !== null || price.communityFeeMinor !== null

/** The "from" price that stands for a setting or an apartment: the lowest price for living there, so a flat extra never poses as the cost of moving in. When no price is marked that way, it is simply the lowest one. */
export function startingPrice(prices: Price[]): Price | null {
  const residency = prices.filter(isResidency)
  return cheapest(residency.length ? residency : prices)
}

/** Prices for living there first, flat extras after them; the published order is kept inside each group. */
export const residencyFirst = (prices: Price[]) => [...prices].sort((a, b) => Number(isResidency(b)) - Number(isResidency(a)))

/** The price the home page leads with: the starting price of the most independent setting that has one. */
export function leadPrice(site: Site): Price | null {
  const order = ['independent_living', 'assisted_living', 'memory_care', 'nursing_facility']
  const settings = [...new Set(site.prices.map(price => price.setting ?? ''))].sort((a, b) => (order.indexOf(a) < 0 ? order.length : order.indexOf(a)) - (order.indexOf(b) < 0 ? order.length : order.indexOf(b)))
  for (const setting of settings) {
    const price = startingPrice(site.prices.filter(row => (row.setting ?? '') === setting))
    if (price) return price
  }
  return null
}

/** Open tour times for a kind: a time marked "either" serves both. */
export function slotsFor(slots: TourSlot[], kind: 'in_person' | 'virtual') {
  return slots.filter(slot => slot.kind === 'either' || slot.kind === kind)
}

/* ------------------------------------------------------------------ family portal */

export type PortalResident = { residentId: string; name: string; community: string; scopes: string[] }

async function portalRead<T>(field: string, residentId?: string): Promise<Result<T>> {
  const result = residentId
    ? await storefrontGraphQL<Record<string, T>>(`query Portal($residentId: ID!) { ${field}(residentId: $residentId) }`, { residentId })
    : await storefrontGraphQL<Record<string, T>>(`query Portal { ${field} }`)
  return result.ok ? { ok: true, data: result.data[field] } : result
}

/** The signed-in family member's residents and what they may see, or null when nobody is signed in to the portal. */
export const portalMe = cache(async (): Promise<{ mfaEnrolled: boolean; residents: PortalResident[] } | null> => {
  const read = await portalRead<{ mfaEnrolled: boolean; residents: PortalResident[] }>('portalMe')
  return read.ok && read.data ? { mfaEnrolled: Boolean(read.data.mfaEnrolled), residents: list<PortalResident>(read.data.residents) } : null
})

/** True when the request carries any signed-in session (staff or family). */
export const isSignedIn = cache(async (): Promise<boolean> => {
  const result = await storefrontGraphQL<{ authenticatedItem: { id: string } | null }>(`query Me { authenticatedItem { ... on User { id } } }`)
  return Boolean(result.ok && result.data?.authenticatedItem?.id)
})

export type PortalUpdates = { name: string; status: string; community: string | null; communityPhone: string | null; setting: string | null; whereabouts: 'at_community' | 'away' | null; since: string | null }
export type PortalCalendar = { timeZone: string; from: string; holidays: { date: string; name: string }[] }
export type PortalDocuments = { documents: { id: string; title: string; kind: string; signedAt: string | null; createdAt: string }[]; notices: { id: string; kind: string; method: string | null; deliveredAt: string | null; acknowledgement: string | null }[] }
export type PortalStatements = { statements: { id: string; number: string; status: string; totalMinor: string; paidMinor: string; balanceMinor: string; dueOn: string | null; issuedAt: string | null; lines: { description: string; days?: number; amountMinor: string }[] | null }[] }
export type PortalTrust = { hasLedger: boolean; status: string | null; balanceMinor: string }
export type PortalPayments = {
  payments: { id: string; reference: string; method: string; status: string; amountMinor: string; initiatedAt: string | null; settledAt: string | null; statement: { id: string; number: string } | null }[]
  methods: { id: string; provider: string; brand: string | null; last4: string | null; autopay: boolean }[]
  plans: { id: string; reference: string; totalMinor: string; statement: { id: string; number: string } | null; instalments: { id: string; number: number; dueOn: string | null; amountMinor: string; paymentStatus: string | null }[] }[]
}

export const portalUpdates = (residentId: string) => portalRead<PortalUpdates>('portalUpdates', residentId)
export const portalCalendar = (residentId: string) => portalRead<PortalCalendar>('portalCalendar', residentId)
export const portalDocuments = (residentId: string) => portalRead<PortalDocuments>('portalDocuments', residentId)
export const portalStatements = (residentId: string) => portalRead<PortalStatements>('portalStatements', residentId)
export const portalTrustBalance = (residentId: string) => portalRead<PortalTrust>('portalTrustBalance', residentId)
export const portalPayments = (residentId: string) => portalRead<PortalPayments>('portalPayments', residentId)
