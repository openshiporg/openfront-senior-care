import type { Permission } from '../access'
import { requirePermission, systemActor, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { type Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { auditCreate } from '../lib/cas'
import { sweepClocks } from '../lib/clocks'
import { admitResident, changeRoom, dischargeResident, endLeave, recordAdmissionAgreement, recordDeath, recordNotice, startLeave, type AdmitInput, type NoticeInput } from '../lib/census'
import { signOffCensusDay, snapshotCensusDay } from '../lib/censusDay'
import { markPlaceReady, recomputeAvailability, setPlaceService } from '../lib/places'
import { acceptPortalInvitation, grantPortalScope, inviteRepresentative, proposePortalScope } from '../lib/portal'
import { endBreakGlass, openBreakGlass, reviewBreakGlass } from '../lib/privacy'
import { addToWaitlist, logSalesActivity, moveLead, moveReferral, moveTour, offerWaitlistPlace, recordInquiry, recordReferral, requestTour, resolveWaitlistOffer, scheduleTour, submitInquiry } from '../lib/sales'
import { joinWaitlist, movePublishedPrice, openTourSlots, setStorefrontPublished } from '../lib/storefront'
import { COMMUNITY, ROLES, STAFF } from './operator'
import { UNUSABLE_PASSWORD_HASH, seedMeta } from './platform'
import { buildCensusPlan, planPrefix, type Json, type PlanStep, type Preset, type StepKind } from './censusPlan'

/**
 * Runs the census, sales and portal history of Maple Ridge (censusPlan.ts) through the real domain
 * commands. Every step is one idempotent command keyed by the step, dated at the moment it happened
 * (`CommandSpec.now`) and run by the fictional staff member who did it, with that person's role
 * permissions checked. A run stops at its time budget and the next run continues where it stopped,
 * so the onboarding button can load it in request-sized pieces; finished steps replay as no-ops.
 *
 * The history is anchored the first time it runs (stored as its own command receipt), so a resumed
 * or repeated run rebuilds the identical plan. Mail addressed to these fictional families is never
 * queued: the seed drops `mail.*` messages from its transactions.
 */

type Value = Record<string, unknown>

const PERMISSIONS: Record<StepKind, Permission[]> = {
  referral_sources: ['canManageSales'], storefront: ['canManageStorefront'], tour_slots: ['canManageSales'],
  inquiry_phone: ['canManageSales'], inquiry_web: [], waitlist_web: [], tour_request_web: [], activity: ['canManageSales'],
  tour_schedule: ['canManageSales'], tour_move: ['canManageSales'], lead_move: ['canManageSales'],
  referral: ['canAdmitDischarge'], referral_move: ['canAdmitDischarge'],
  waitlist_add: ['canManageSales'], waitlist_offer: ['canManageSales'], waitlist_resolve: ['canManageSales'],
  admit: ['canAdmitDischarge'], agreement: ['canAdmitDischarge', 'canManageRepresentatives'], notice: ['canAdmitDischarge', 'canRecordCensus', 'canManageRepresentatives'],
  room_change: ['canRecordCensus', 'canAdmitDischarge'], leave_start: ['canRecordCensus', 'canAdmitDischarge'], leave_end: ['canRecordCensus', 'canAdmitDischarge'],
  discharge: ['canAdmitDischarge'], death: ['canAdmitDischarge', 'canChartNursing'],
  place_ready: ['canManagePlaces', 'canRecordCensus'], place_service: ['canManagePlaces'],
  invite: ['canManageRepresentatives'], accept: [], scope_propose: ['canManageRepresentatives'], scope_grant: ['canApprovePortalScopes'],
  break_glass_open: ['canBreakGlass'], break_glass_end: ['canBreakGlass'], break_glass_review: ['canReviewBreakGlass'],
  snapshot: ['canRecordCensus'], sign_off: ['canRecordCensus'], clock_sweep: [], finish: ['canManageStorefront', 'canManagePlaces'],
}

const SERIALIZABLE = new Set<StepKind>(['admit', 'room_change', 'leave_start', 'leave_end', 'discharge', 'death', 'referral_move', 'waitlist_offer', 'sign_off', 'snapshot'])

export function seedActor(id: string): Actor {
  if (id.startsWith('system:')) return systemActor(id.slice('system:'.length))
  const person = STAFF.find(staff => staff.id === id)
  const role = person && ROLES.find(r => r.id === person.roleId)
  if (!person || !role) throw new Error(`Seed: unknown staff member ${id}`)
  return { kind: 'user', userId: person.id, name: person.name, permissions: new Set(role.permissions) }
}

const isRef = (value: unknown): value is { $ref: string; field: string } => typeof value === 'object' && value !== null && '$ref' in value && 'field' in value

function resolve(value: Json, results: Map<string, Value>): unknown {
  if (isRef(value)) {
    const found = results.get(value.$ref)?.[value.field]
    if (found === undefined || found === null) throw new Error(`Seed: ${value.$ref} has no ${value.field}`)
    return found
  }
  if (Array.isArray(value)) return value.map(item => resolve(item, results))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, results)]))
  return value
}

const str = (v: unknown) => v as string
const opt = (v: unknown) => (v == null ? null : (v as string))
const time = (v: unknown) => new Date(v as string)

async function version(uow: UnitOfWork, model: 'lead' | 'tour' | 'referral' | 'waitlistEntry', id: string) {
  const row = await (uow.tx[model] as unknown as { findUniqueOrThrow(args: unknown): Promise<{ version: number }> }).findUniqueOrThrow({ where: { id }, select: { version: true } })
  return row.version
}

async function representativeOf(uow: UnitOfWork, residentId: string, priority: number) {
  const rep = await uow.tx.representative.findFirst({ where: { residentId, self: false, status: 'active', contactPriority: priority }, select: { id: true } })
  if (!rep) throw new Error(`Seed: resident ${residentId} has no representative at priority ${priority}`)
  return rep.id
}

/* ------------------------------------------------- storefront and sources */

const REFERRAL_SOURCES = [
  { id: 'seed_referral_source_scioto_ridge', name: 'Scioto Ridge Medical Center (fictional) · case management', kind: 'hospital', contact: { name: 'Allison Mercer, RN, discharge planner', phone: '(614) 555-0171' } },
  { id: 'seed_referral_source_alum_creek', name: 'Alum Creek Regional Hospital (fictional) · transitions of care', kind: 'hospital', contact: { name: 'Derek Fontaine, MSW', phone: '(614) 555-0172' } },
  { id: 'seed_referral_source_buckeye_placement', name: 'Buckeye Senior Placement (fictional)', kind: 'placement_agency', contact: { name: 'Corinne Abernathy', phone: '(614) 555-0173' } },
  { id: 'seed_referral_source_okafor_im', name: 'Okafor Internal Medicine (fictional)', kind: 'physician', contact: { name: 'Dr. Chinedu Okafor', phone: '(614) 555-0174' } },
]

const STOREFRONT_ID = 'seed_storefront_maple_ridge'

// Prices in cents. Nursing day rates are the private-pay rate; Medicare and Medicaid pay their own.
const PRICES = [
  { id: 'seed_price_studio', apartmentTypeId: 'seed_apt_studio', setting: 'assisted_living', label: 'Assisted living studio', fromMinor: 498_000n, toMinor: 612_000n, period: 'month', communityFeeMinor: 250_000n },
  { id: 'seed_price_one_bed', apartmentTypeId: 'seed_apt_one_bed', setting: 'assisted_living', label: 'Assisted living one bedroom', fromMinor: 596_000n, toMinor: 734_000n, period: 'month', communityFeeMinor: 250_000n },
  { id: 'seed_price_companion', apartmentTypeId: 'seed_apt_companion', setting: 'assisted_living', label: 'Companion suite (second person)', fromMinor: 185_000n, toMinor: null, period: 'month', communityFeeMinor: null },
  { id: 'seed_price_mc_suite', apartmentTypeId: 'seed_apt_mc_suite', setting: 'memory_care', label: 'Memory care suite', fromMinor: 742_000n, toMinor: 896_000n, period: 'month', communityFeeMinor: 300_000n },
  { id: 'seed_price_il_one', apartmentTypeId: 'seed_apt_il_one', setting: 'independent_living', label: 'Independent one bedroom', fromMinor: 368_000n, toMinor: 412_000n, period: 'month', communityFeeMinor: 200_000n },
  { id: 'seed_price_nf_semi', apartmentTypeId: null, setting: 'nursing_facility', label: 'Nursing care, semi-private room', fromMinor: 36_500n, toMinor: null, period: 'day', communityFeeMinor: null },
  { id: 'seed_price_nf_private', apartmentTypeId: null, setting: 'nursing_facility', label: 'Nursing care, private room', fromMinor: 41_500n, toMinor: null, period: 'day', communityFeeMinor: null },
]

async function loadStorefront(uow: UnitOfWork, actor: Actor) {
  const community = await uow.tx.community.findUniqueOrThrow({ where: { id: COMMUNITY.id }, select: { storefrontId: true } })
  let created = 0
  if (!community.storefrontId) {
    await uow.tx.storefrontSite.create({
      data: {
        id: STOREFRONT_ID,
        heroTitle: 'Care that feels like home, on Columbus\'s east side',
        heroBody: 'Maple Ridge Senior Living offers independent living, assisted living, a secured memory care neighborhood and a Medicare- and Medicaid-certified nursing and rehabilitation center on one campus, so residents can stay as their needs change.',
        amenities: ['Restaurant-style dining with three meals a day', 'Therapy gym with physical, occupational and speech therapy', 'Courtyard gardens and walking paths', 'Chapel and weekly services', 'Salon and barber', 'Scheduled transportation to appointments', 'Housekeeping and linen service', 'Library and computer lounge'] as never,
        diningCopy: 'Our chef plans seasonal menus with the residents\' food committee. Therapeutic and texture-modified diets are prepared in the same kitchen, and families are welcome at Sunday brunch.',
        activitiesCopy: 'Seven days of programs: exercise classes, music and art, outings, faith services and intergenerational visits with the elementary school next door.',
        careLevelsCopy: 'Independent living with services on request; assisted living with help for bathing, dressing and medications; memory care in the secured Harbor neighborhood; and 24-hour skilled nursing with short-term rehabilitation in Birch.',
        faq: [
          { q: 'Do you accept Medicare and Medicaid?', a: 'Our nursing center accepts Medicare Part A, Medicare Advantage plans we contract with, and Ohio Medicaid. Assisted living, memory care and independent living are private pay or long-term care insurance.' },
          { q: 'Can couples live together?', a: 'Yes. Companion suites in assisted living are designed for two, and spouses in different levels of care are on the same campus.' },
          { q: 'How quickly can someone move in after a hospital stay?', a: 'Our admissions team answers hospital referrals within four hours, seven days a week, and can often admit the same day.' },
        ] as never,
        acceptedPayers: ['Medicare Part A', 'Medicare Advantage (selected plans)', 'Ohio Medicaid', 'Long-term care insurance', 'Private pay'] as never,
        seo: { title: 'Maple Ridge Senior Living · Columbus, OH', description: 'Independent living, assisted living, memory care and skilled nursing in Columbus, Ohio.' } as never,
        tourBookingEnabled: true,
        waitlistEnabled: true,
      },
    })
    await uow.tx.community.update({ where: { id: COMMUNITY.id }, data: { storefrontId: STOREFRONT_ID } })
    auditCreate(uow, actor, 'StorefrontSite', STOREFRONT_ID, 'storefront.created', { communityId: COMMUNITY.id }, seedMeta)
    created += 1
  }
  const existing = new Set((await uow.tx.publishedPrice.findMany({ where: { id: { in: PRICES.map(p => p.id) } }, select: { id: true } })).map(p => p.id))
  const fresh = PRICES.filter(price => !existing.has(price.id))
  if (fresh.length) {
    await uow.tx.publishedPrice.createMany({ data: fresh.map(price => ({ ...price, communityId: COMMUNITY.id, disclaimer: 'Starting prices; the monthly fee depends on the apartment and the care assessment. Medicare and Medicaid residents pay what their coverage sets.', status: 'draft' })) })
    for (const price of fresh) {
      auditCreate(uow, actor, 'PublishedPrice', price.id, 'published_price.created', { label: price.label }, seedMeta)
      await movePublishedPrice(uow, actor, { priceId: price.id, to: 'published', expectedVersion: 0 })
    }
    for (const price of fresh) if (price.apartmentTypeId) await uow.tx.apartmentType.update({ where: { id: price.apartmentTypeId }, data: { publishedFromPriceMinor: price.fromMinor } })
  }
  await setStorefrontPublished(uow, actor, { communityId: COMMUNITY.id, published: true })
  return { storefront: created, prices: fresh.length }
}

/* ---------------------------------------------------------------- execute */

async function execute(uow: UnitOfWork, actor: Actor, step: PlanStep, results: Map<string, Value>): Promise<Value> {
  const i = resolve(step.input, results) as Record<string, any>
  const communityId = COMMUNITY.id
  switch (step.kind) {
    case 'referral_sources': {
      const existing = new Set((await uow.tx.referralSource.findMany({ where: { id: { in: REFERRAL_SOURCES.map(s => s.id) } }, select: { id: true } })).map(s => s.id))
      const fresh = REFERRAL_SOURCES.filter(s => !existing.has(s.id))
      if (fresh.length) await uow.tx.referralSource.createMany({ data: fresh.map(s => ({ ...s, communityId, contact: s.contact as never, feeTerms: {} as never })) })
      for (const s of fresh) auditCreate(uow, actor, 'ReferralSource', s.id, 'referral_source.created', { name: s.name, kind: s.kind }, seedMeta)
      return { created: fresh.length }
    }
    case 'storefront':
      return loadStorefront(uow, actor)
    case 'tour_slots':
      return openTourSlots(uow, actor, { communityId, slots: (i.slots as any[]).map(slot => ({ ...slot, startsAt: time(slot.startsAt) })) })
    case 'inquiry_phone':
      return recordInquiry(uow, actor, { communityId, ...(i as any) })
    case 'inquiry_web':
      return submitInquiry(uow, i as any)
    case 'waitlist_web': {
      const { publicCode } = await joinWaitlist(uow, i as any)
      const inquiry = await uow.tx.inquiry.findUniqueOrThrow({ where: { publicCode }, select: { leadId: true } })
      const entry = await uow.tx.waitlistEntry.findFirstOrThrow({ where: { leadId: inquiry.leadId }, select: { id: true } })
      return { publicCode, leadId: inquiry.leadId, waitlistEntryId: entry.id }
    }
    case 'activity':
      return logSalesActivity(uow, actor, { leadId: str(i.lead), kind: i.kind, summary: i.summary, at: time(i.at) })
    case 'tour_schedule': {
      const slot = await uow.tx.tourSlot.findFirstOrThrow({ where: { communityId, startsAt: time(i.slotStartsAt) }, select: { id: true } })
      return scheduleTour(uow, actor, { leadId: str(i.lead), slotId: slot.id, kind: i.kind, notes: i.notes })
    }
    case 'tour_request_web': {
      const slot = await uow.tx.tourSlot.findFirstOrThrow({ where: { communityId, startsAt: time(i.slotStartsAt) }, select: { id: true } })
      const { slotStartsAt: _, ...rest } = i
      // The manage token belongs to the guest's email; it is never stored in a receipt.
      const { publicCode } = await requestTour(uow, { ...(rest as any), slotId: slot.id })
      const tour = await uow.tx.tour.findUniqueOrThrow({ where: { publicCode }, select: { id: true } })
      return { tourId: tour.id, publicCode }
    }
    case 'tour_move':
      return moveTour(uow, actor, { tourId: str(i.tour), to: i.to, reason: i.reason, expectedVersion: await version(uow, 'tour', str(i.tour)) })
    case 'lead_move':
      return moveLead(uow, actor, { leadId: str(i.lead), to: i.to, lostReason: i.lostReason, note: i.note, expectedVersion: await version(uow, 'lead', str(i.lead)) })
    case 'referral':
      return recordReferral(uow, actor, { communityId, ...(i as any), receivedAt: time(i.receivedAt) })
    case 'referral_move':
      return moveReferral(uow, actor, { referralId: str(i.referral), to: i.to, declineReason: opt(i.declineReason), bedId: opt(i.bedId), reservationHours: i.reservationHours ?? null, expectedVersion: await version(uow, 'referral', str(i.referral)), idempotencyKey: step.key })
    case 'waitlist_add':
      return addToWaitlist(uow, actor, { communityId, leadId: str(i.lead), prospectId: opt(i.prospect), apartmentTypeId: opt(i.apartmentTypeId), setting: i.setting, priorityReason: i.priorityReason })
    case 'waitlist_offer':
      return offerWaitlistPlace(uow, actor, { waitlistEntryId: str(i.entry), apartmentId: opt(i.apartmentId), bedId: opt(i.bedId), hours: i.hours, expectedVersion: await version(uow, 'waitlistEntry', str(i.entry)), idempotencyKey: step.key })
    case 'waitlist_resolve':
      return resolveWaitlistOffer(uow, actor, { waitlistEntryId: str(i.entry), to: i.to, expectedVersion: await version(uow, 'waitlistEntry', str(i.entry)) })
    case 'admit': {
      const { agreementSignedAt, ...input } = i
      const admitted = await admitResident(uow, actor, { ...(input as AdmitInput), communityId, effectiveAt: time(input.effectiveAt), idempotencyKey: step.key, synthetic: true })
      if (agreementSignedAt) await recordAdmissionAgreement(uow, actor, { stayId: admitted.stayId, signedAt: agreementSignedAt, signedByRepresentativeId: await firstRepresentative(uow, admitted.residentId), note: 'Signed at admission.' })
      return admitted
    }
    case 'agreement':
      return recordAdmissionAgreement(uow, actor, { stayId: str(i.stay), signedAt: i.signedAt, signedByRepresentativeId: await firstRepresentative(uow, str(i.resident)), note: i.note })
    case 'notice': {
      const { stay, censusEvent, ...rest } = i
      return recordNotice(uow, actor, { ...(rest as Omit<NoticeInput, 'stayId'>), stayId: str(stay), censusEventId: opt(censusEvent) })
    }
    case 'room_change':
      return changeRoom(uow, actor, { stayId: str(i.stay), toBedId: opt(i.toBedId), effectiveAt: time(i.effectiveAt), reason: i.reason, idempotencyKey: step.key })
    case 'leave_start':
      return startLeave(uow, actor, { stayId: str(i.stay), leaveKind: i.leaveKind, holdElected: i.holdElected, holdPaidBy: i.holdPaidBy, facilityInitiated: i.facilityInitiated, effectiveAt: time(i.effectiveAt), destination: i.destination, noticeAtTransfer: i.noticeAtTransfer, idempotencyKey: step.key })
    case 'leave_end':
      return endLeave(uow, actor, { stayId: str(i.stay), effectiveAt: time(i.effectiveAt), toBedId: opt(i.toBedId), idempotencyKey: step.key })
    case 'discharge':
      return dischargeResident(uow, actor, { stayId: str(i.stay), disposition: i.disposition, initiatedBy: i.initiatedBy, effectiveAt: time(i.effectiveAt), noticeException: i.noticeException ?? null, idempotencyKey: step.key })
    case 'death':
      return recordDeath(uow, actor, { stayId: str(i.stay), effectiveAt: time(i.effectiveAt), pronouncedBy: i.pronouncedBy, idempotencyKey: step.key })
    case 'place_ready':
      return markPlaceReady(uow, actor, { bedId: opt(i.bedId), apartmentId: opt(i.apartmentId), note: i.note })
    case 'place_service':
      return setPlaceService(uow, actor, { bedId: opt(i.bedId), apartmentId: opt(i.apartmentId), inService: i.inService, reason: i.reason })
    case 'invite': {
      const representativeId = await representativeOf(uow, str(i.resident), i.priority)
      const invited = await inviteRepresentative(uow, actor, { representativeId })
      return { accountId: invited.accountId, reference: invited.reference, representativeId }
    }
    case 'accept': {
      // The family member follows the emailed link: the invitation is re-sent at that moment (its
      // token lives only in the mail message) and accepted with the token from that message.
      const rep = await uow.tx.representative.findFirstOrThrow({ where: { portalAccountId: str(i.account) }, select: { id: true } })
      await inviteRepresentative(uow, seedActor('seed_user_brooks'), { representativeId: rep.id })
      const message = uow.outbox.find(m => m.topic === 'mail.portal_invitation' && m.aggregateId === i.account)
      const token = (message?.payload as { token?: string } | undefined)?.token
      if (!token) throw new Error('Seed: the invitation message carried no token')
      return acceptPortalInvitation(uow, { token, passwordHash: UNUSABLE_PASSWORD_HASH })
    }
    case 'scope_propose': {
      const representativeId = await representativeOf(uow, str(i.resident), i.priority)
      const grantIds: string[] = []
      for (const scope of i.scopes as string[]) {
        const proposed = await proposePortalScope(uow, actor, { representativeId, scope: scope as never })
        if (proposed.status === 'proposed') grantIds.push(proposed.grantId)
      }
      return { grantIds }
    }
    case 'scope_grant': {
      for (const grantId of i.proposals as string[]) await grantPortalScope(uow, actor, { grantId })
      return { granted: (i.proposals as string[]).length }
    }
    case 'break_glass_open':
      return openBreakGlass(uow, actor, { residentId: str(i.resident), reason: i.reason, note: i.note, hours: i.hours })
    case 'break_glass_end':
      return endBreakGlass(uow, actor, { grantId: str(i.grant) })
    case 'break_glass_review':
      return reviewBreakGlass(uow, actor, { grantId: str(i.grant), outcome: i.outcome, note: i.note })
    case 'snapshot':
      return snapshotCensusDay(uow, actor, { communityId, date: i.date })
    case 'sign_off':
      return signOffCensusDay(uow, actor, { communityId, date: i.date, note: i.note })
    case 'clock_sweep':
      return sweepClocks(uow, actor)
    case 'finish':
      return { snapshots: (await recomputeAvailability(uow, communityId)).length }
  }
}

async function firstRepresentative(uow: UnitOfWork, residentId: string) {
  const rep = await uow.tx.representative.findFirst({ where: { residentId, self: false, status: 'active' }, orderBy: { contactPriority: 'asc' }, select: { id: true } })
  return rep?.id ?? null
}

/* ------------------------------------------------------------------ runner */

const COUNTED: Partial<Record<StepKind, string>> = {
  admit: 'residents', room_change: 'roomChanges', leave_start: 'leaves', discharge: 'discharges', death: 'deaths', notice: 'notices', agreement: 'agreements',
  inquiry_phone: 'leads', inquiry_web: 'leads', waitlist_web: 'leads', tour_schedule: 'tours', tour_request_web: 'tours', referral: 'referrals', waitlist_add: 'waitlistEntries',
  invite: 'portalInvitations', scope_grant: 'portalGrants', sign_off: 'censusSignoffs', break_glass_open: 'breakGlassUses',
}

export type CensusSeedProgress = { preset: Preset; anchor: string; total: number; done: number; finished: boolean; created: Record<string, number> }

/**
 * Runs steps until the plan is done or `budgetMs` has passed. Safe to call repeatedly and
 * concurrently: each step is a command, so a step another call already ran replays.
 */
export async function runCensusSeed(db: Db, options: { preset?: Preset; budgetMs?: number; anchor?: Date; requestId?: string | null; onStep?: (step: PlanStep, ms: number) => void } = {}): Promise<CensusSeedProgress> {
  const preset = options.preset ?? 'full'
  const prefix = planPrefix(preset)
  const started = Date.now()
  const community = await db.community.findUnique({ where: { id: COMMUNITY.id }, select: { id: true, timeZone: true } })
  if (!community) throw new DomainError(Codes.GUARD_FAILED, 'Load the operator, community and places first.')
  // The anchor is fixed by the first run, so every later run rebuilds the same plan.
  const anchorRun = await command(db, { name: 'seed.census_anchor', actor: systemActor('seed'), idempotencyKey: `${prefix}:anchor`, params: {}, now: options.anchor }, async uow => ({ anchor: uow.now.toISOString() }))
  const anchor = new Date(anchorRun.value.anchor)
  const { steps } = buildCensusPlan({ anchor, preset, timeZone: community.timeZone })
  const receipts = await db.commandReceipt.findMany({ where: { idempotencyKey: { startsWith: `${prefix}:` } }, select: { idempotencyKey: true, responseBody: true } })
  const results = new Map<string, Value>(receipts.map(r => [r.idempotencyKey, (r.responseBody ?? {}) as Value]))
  const created: Record<string, number> = {}
  let done = steps.filter(step => results.has(step.key)).length
  let ran = 0
  for (const step of steps) {
    if (results.has(step.key)) continue
    // Always make progress: at least one step per call, then stop at the budget.
    if (ran > 0 && options.budgetMs !== undefined && Date.now() - started > options.budgetMs) break
    ran += 1
    const actor = seedActor(step.actor)
    if (PERMISSIONS[step.kind].length) requirePermission(actor, ...PERMISSIONS[step.kind])
    const t0 = Date.now()
    const run = await command(db, { name: `seed.${step.kind}`, actor, idempotencyKey: step.key, params: { step: step.key }, now: new Date(step.at), serializable: SERIALIZABLE.has(step.kind), requestId: options.requestId ?? null }, async uow => {
      const value = await execute(uow, actor, step, results)
      // Fictional families get no mail: drop every mail message this step queued.
      for (let k = uow.outbox.length - 1; k >= 0; k -= 1) if (uow.outbox[k].topic.startsWith('mail.')) uow.outbox.splice(k, 1)
      return value
    })
    results.set(step.key, (run.value ?? {}) as Value)
    done += 1
    const counted = COUNTED[step.kind]
    if (counted && !run.replay) created[counted] = (created[counted] ?? 0) + 1
    options.onStep?.(step, Date.now() - t0)
  }
  return { preset, anchor: anchor.toISOString(), total: steps.length, done, finished: done === steps.length, created }
}
