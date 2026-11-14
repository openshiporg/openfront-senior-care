import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, isStaff } from '../access'
import { choice, fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { PHI_LISTS, phiFields } from './phi'
import { SETTINGS } from './platform'
import { assignedFilter, scopedGoverned, scopedManaged } from './scope'
import { trackingFields } from './trackingFields'
import { label } from '../../../lib/labels'

/* Sales & front of house (SCHEMA §3). Public writes go through the rate-limited storefront mutations. */

const ro = readOnly
const sys = () => false
const opt = (values: readonly string[]) => ({ type: 'string' as const, options: values.map(value => ({ label: label(value), value })) })
const salesRead = ['canReadSales', 'canManageSales'] as const

export const LEAD_STATUSES = ['new', 'contacted', 'tour_scheduled', 'toured', 'assessment_scheduled', 'assessed', 'deposit_received', 'move_in_scheduled', 'moved_in', 'waitlisted', 'nurture', 'lost'] as const

export const Inquiry = list({
  access: scopedGoverned([...salesRead], ['community']),
  ui: { labelField: 'publicCode', listView: { initialColumns: ['publicCode', 'community', 'source', 'createdAt', 'lead'] } },
  fields: {
    publicCode: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    source: fixedChoice(['website', 'phone', 'walk_in', 'referral_agency', 'hospital', 'resident_referral', 'other']),
    ...phiFields('Inquiry', {
      contactName: ['dem', text, ro],
      contactEmail: ['dem', text, ro],
      contactPhone: ['dem', text, ro],
      relationship: ['dem', text, ro],
      message: ['dem', text, ro],
    }),
    consentToContact: checkbox({ defaultValue: false, ...ro }),
    utm: json({ ...ro }),
    lead: relationship({ ref: 'Lead', ...ro }),
    ...trackingFields,
  },
})

export const ReferralSource = list({
  access: scopedManaged([...salesRead], 'canManageSales', ['community']),
  ui: { labelField: 'name' },
  fields: {
    community: relationship({ ref: 'Community' }),
    name: text({ validation: { isRequired: true } }),
    kind: choice(['hospital', 'physician', 'placement_agency', 'ccrc', 'other'], 'hospital'),
    feeTerms: json({ defaultValue: {} }),
    contact: json({ defaultValue: {} }),
    ...trackingFields,
  },
})

export const Lead = list({
  access: scopedGoverned([...salesRead], ['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'community', 'status', 'owner', 'nextActionAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    owner: relationship({ ref: 'User', ...ro }),
    primaryContact: relationship({ ref: 'Contact', ...ro }),
    prospects: relationship({ ref: 'Prospect.lead', many: true, ...ro }),
    status: lifecycle(LEAD_STATUSES),
    lostReason: select({ ...opt(['chose_competitor', 'care_needs_exceed', 'cost', 'stayed_home', 'deceased', 'no_response', 'other']), ...ro }),
    nextActionAt: timestamp({ ...ro }),
    referralSource: relationship({ ref: 'ReferralSource', ...ro }),
    activities: relationship({ ref: 'SalesActivity.lead', many: true, ...ro }),
    tours: relationship({ ref: 'Tour.lead', many: true, ...ro }),
    synthetic: checkbox({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Prospect = list({
  access: scopedGoverned([...salesRead], ['community']),
  ui: { labelField: 'reference' },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    lead: relationship({ ref: 'Lead.prospects', ...ro }),
    ...phiFields('Prospect', {
      firstName: ['dem', text, ro],
      lastName: ['dem', text, ro],
      dateOfBirth: ['dem', calendarDay, ro],
      careNotes: ['clin', text, ro],
    }),
    desiredSetting: select({ ...opt(SETTINGS), ...ro }),
    desiredMoveIn: calendarDay({ ...ro }),
    convertedResident: relationship({ ref: 'Resident', ...ro }),
    synthetic: checkbox({ defaultValue: false, ...ro }),
    ...trackingFields,
  },
})

export const Referral = list({
  access: scopedGoverned([...salesRead, 'canAdmitDischarge'], ['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'community', 'source', 'status', 'responseDueAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    source: relationship({ ref: 'ReferralSource', ...ro }),
    receivedAt: timestamp({ ...ro }),
    prospect: relationship({ ref: 'Prospect', ...ro }),
    packet: relationship({ ref: 'Document', many: true, ...ro }),
    expectedPayer: select({ ...opt(['medicare_a', 'medicare_advantage', 'medicaid', 'medicaid_pending', 'private_pay', 'commercial', 'hospice', 'other']), ...ro }),
    ...phiFields('Referral', {
      clinicalSummary: ['clin', text, ro],
    }),
    pasrrLevel1: relationship({ ref: 'Document', ...ro }),
    pasrrLevel2Required: checkbox({ defaultValue: false, ...ro }),
    status: lifecycle(['received', 'clinical_review', 'payer_check', 'accepted', 'declined', 'admitted', 'withdrawn']),
    declineReason: select({ ...opt(['no_bed', 'clinical_needs', 'payer', 'pasrr', 'family_choice', 'other']), ...ro }),
    responseDueAt: timestamp({ ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

export const TourSlot = list({
  access: scopedManaged([...salesRead], 'canManageSales', ['community']),
  ui: { labelField: 'startsAt', listView: { initialColumns: ['community', 'startsAt', 'endsAt', 'capacity', 'host'] } },
  fields: {
    community: relationship({ ref: 'Community' }),
    startsAt: timestamp({ validation: { isRequired: true } }),
    endsAt: timestamp({ validation: { isRequired: true } }),
    capacity: integer({ defaultValue: 2, validation: { isRequired: true, min: 1, max: 20 } }),
    kind: choice(['in_person', 'virtual', 'either'], 'either'),
    host: relationship({ ref: 'User' }),
    tours: relationship({ ref: 'Tour.slot', many: true, ...ro }),
    ...trackingFields,
  },
})

export const Tour = list({
  access: scopedGoverned([...salesRead], ['community']),
  ui: { labelField: 'publicCode', listView: { initialColumns: ['publicCode', 'slot', 'lead', 'kind', 'status'] } },
  fields: {
    publicCode: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    slot: relationship({ ref: 'TourSlot.tours', ...ro }),
    lead: relationship({ ref: 'Lead.tours', ...ro }),
    kind: fixedChoice(['in_person', 'virtual']),
    status: lifecycle(['requested', 'confirmed', 'completed', 'no_show', 'cancelled']),
    guestTokenHash: text({ access: { read: sys, create: sys, update: sys }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    holdExpiresAt: timestamp({ ...ro }),
    ...phiFields('Tour', { notes: ['dem', text, ro] }),
    version: versionField(),
    ...trackingFields,
  },
})

export const WaitlistEntry = list({
  access: scopedGoverned([...salesRead], ['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'community', 'setting', 'apartmentType', 'priority', 'status', 'offerExpiresAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    prospect: relationship({ ref: 'Prospect', ...ro }),
    lead: relationship({ ref: 'Lead', ...ro }),
    apartmentType: relationship({ ref: 'ApartmentType', ...ro }),
    setting: select({ ...opt(SETTINGS), ...ro }),
    priority: integer({ defaultValue: 100, ...ro }),
    priorityReason: select({ ...opt(['internal_transfer', 'continuing_care', 'date_order', 'other']), defaultValue: 'date_order', ...ro }),
    status: lifecycle(['active', 'offered', 'accepted', 'declined', 'expired', 'converted', 'withdrawn']),
    offeredReservation: relationship({ ref: 'PlaceReservation', ...ro }),
    offerExpiresAt: timestamp({ ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

export const SalesActivity = list({
  access: scopedGoverned([...salesRead], ['lead', 'community']),
  fields: {
    lead: relationship({ ref: 'Lead.activities', ...ro }),
    kind: fixedChoice(['call', 'email', 'text', 'tour', 'assessment', 'note']),
    at: timestamp({ ...ro, defaultValue: { kind: 'now' } }),
    by: relationship({ ref: 'User', ...ro }),
    ...phiFields('SalesActivity', { summary: ['dem', text, ro] }),
    ...trackingFields,
  },
})

/* Storefront backend (SCHEMA §3.1-3.3, 3.12). Public reads go through the storefront queries only. */

export const StorefrontSite = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManageStorefront'), update: anyOf('canManageStorefront'), delete: sys },
    filter: { query: assignedFilter(['community']), update: assignedFilter(['community']) },
  },
  ui: { labelField: 'heroTitle' },
  fields: {
    community: relationship({ ref: 'Community.storefront' }),
    published: checkbox({ defaultValue: false }),
    heroTitle: text({ validation: { isRequired: true } }),
    heroBody: text({ ui: { displayMode: 'textarea' } }),
    amenities: json({ defaultValue: [] }),
    diningCopy: text({ ui: { displayMode: 'textarea' } }),
    activitiesCopy: text({ ui: { displayMode: 'textarea' } }),
    careLevelsCopy: text({ ui: { displayMode: 'textarea' } }),
    gallery: relationship({ ref: 'Document', many: true }),
    staffBios: relationship({ ref: 'StaffBio.site', many: true }),
    faq: json({ defaultValue: [] }),
    showCmsRatings: checkbox({ defaultValue: false }),
    acceptedPayers: json({ defaultValue: [] }),
    seo: json({ defaultValue: {} }),
    tourBookingEnabled: checkbox({ defaultValue: true }),
    waitlistEnabled: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const StaffBio = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManageStorefront'), update: anyOf('canManageStorefront'), delete: anyOf('canManageStorefront') },
    filter: { query: assignedFilter(['site', 'community']) },
  },
  ui: { labelField: 'name' },
  fields: {
    site: relationship({ ref: 'StorefrontSite.staffBios' }),
    name: text({ validation: { isRequired: true } }),
    title: text(),
    bio: text({ ui: { displayMode: 'textarea' } }),
    photo: relationship({ ref: 'Document' }),
    sortOrder: integer({ defaultValue: 0 }),
    consentDocument: relationship({ ref: 'Document', ui: { description: 'The staff member agreed to appear on the public site.' } }),
    ...trackingFields,
  },
})

export const PublishedPrice = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManageStorefront'), update: anyOf('canManageStorefront'), delete: sys },
    filter: { query: assignedFilter(['community']), update: assignedFilter(['community']) },
  },
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'community', 'fromMinor', 'toMinor', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community' }),
    apartmentType: relationship({ ref: 'ApartmentType' }),
    setting: select({ ...opt(SETTINGS) }),
    label: text({ validation: { isRequired: true } }),
    fromMinor: minor({ required: true, description: 'Starting monthly (or daily for nursing) price in cents.' }),
    toMinor: minor(),
    period: choice(['month', 'day'], 'month'),
    communityFeeMinor: minor(),
    disclaimer: text({ ui: { displayMode: 'textarea' } }),
    status: lifecycle(['draft', 'published', 'retired'], 'draft'),
    publishedAt: timestamp({ ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

/** Derived counts only. Never linked to a resident (DOMAIN I-PR4). */
export const AvailabilitySnapshot = list({
  access: { operation: { query: isStaff, create: sys, update: sys, delete: sys } },
  ui: { listView: { initialColumns: ['community', 'apartmentType', 'setting', 'availableCount', 'computedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    apartmentType: relationship({ ref: 'ApartmentType', ...ro }),
    setting: systemText(),
    snapshotKey: systemText({ indexed: 'unique', required: true }),
    availableCount: integer({ defaultValue: 0, ...ro }),
    waitlistOpen: checkbox({ defaultValue: true, ...ro }),
    computedAt: timestamp({ ...ro }),
  },
})

export const JobPosting = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManageStorefront', 'canManagePeople'), update: anyOf('canManageStorefront', 'canManagePeople'), delete: sys },
    filter: { query: assignedFilter(['community']) },
  },
  ui: { labelField: 'title' },
  fields: {
    community: relationship({ ref: 'Community' }),
    title: text({ validation: { isRequired: true } }),
    role: text(),
    employmentType: choice(['full_time', 'part_time', 'prn', 'contract'], 'full_time'),
    payRange: json({ defaultValue: {} }),
    body: text({ ui: { displayMode: 'textarea' } }),
    status: choice(['draft', 'published', 'closed'], 'draft'),
    ...trackingFields,
  },
})

/* Family portal backend (SCHEMA §13.6-13.7, STATE-MACHINES §14). APIs only. */

export const PORTAL_SCOPES = ['updates', 'photos', 'care_summary', 'calendar', 'menus', 'messages', 'statements', 'payments', 'trust_balance', 'documents', 'visit_booking'] as const

/** Which representative authority may grant which scope (SM§14.2). Guardian authority follows the court order. */
export const AUTHORITY_BASES = ['self', 'healthcare_poa', 'financial_responsible', 'guardian'] as const
export const SCOPE_AUTHORITY: Record<(typeof PORTAL_SCOPES)[number], readonly (typeof AUTHORITY_BASES)[number][]> = {
  updates: ['self', 'healthcare_poa', 'financial_responsible', 'guardian'],
  photos: ['self', 'healthcare_poa', 'guardian'],
  calendar: ['self', 'healthcare_poa', 'financial_responsible', 'guardian'],
  menus: ['self', 'healthcare_poa', 'financial_responsible', 'guardian'],
  visit_booking: ['self', 'healthcare_poa', 'financial_responsible', 'guardian'],
  care_summary: ['self', 'healthcare_poa', 'guardian'],
  messages: ['self', 'healthcare_poa', 'guardian'],
  documents: ['self', 'healthcare_poa', 'guardian'],
  statements: ['self', 'financial_responsible', 'guardian'],
  payments: ['self', 'financial_responsible', 'guardian'],
  trust_balance: ['self', 'financial_responsible', 'guardian'],
}
/** Scopes that need portal MFA (SM§14.1: clinical and trust). */
export const MFA_SCOPES: ReadonlySet<string> = new Set(['care_summary', 'messages', 'documents', 'trust_balance', 'statements', 'payments'])

export const PortalAccount = list({
  access: { operation: { query: anyOf('canManageRepresentatives', 'canApprovePortalScopes'), create: sys, update: sys, delete: sys } },
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'contact', 'status', 'mfaEnrolled', 'invitationExpiresAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    user: relationship({ ref: 'User.portalAccount', ...ro }),
    contact: relationship({ ref: 'Contact', ...ro }),
    community: relationship({ ref: 'Community', ...ro }),
    representatives: relationship({ ref: 'Representative.portalAccount', many: true, ...ro }),
    status: lifecycle(['invited', 'active', 'suspended', 'revoked']),
    invitedBy: relationship({ ref: 'User', ...ro }),
    invitationTokenHash: text({ access: { read: sys, create: sys, update: sys }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    invitationExpiresAt: timestamp({ ...ro }),
    acceptedAt: timestamp({ ...ro }),
    mfaEnrolled: checkbox({ defaultValue: false, ...ro }),
    mfaSecretSealed: text({ access: { read: sys, create: sys, update: sys }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    mfaEnrolledAt: timestamp({ ...ro }),
    mfaLastStep: integer({ ...ro, ui: { ...ro.ui, createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }),
    sessionEpoch: integer({ defaultValue: 0, ...ro, ui: { ...ro.ui, description: 'Bumped on revocation so existing portal sessions stop working.' } }),
    grants: relationship({ ref: 'PortalScopeGrant.account', many: true, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PortalScopeGrant = list({
  access: { operation: { query: anyOf('canManageRepresentatives', 'canApprovePortalScopes'), create: sys, update: sys, delete: sys } },
  ui: { labelField: 'scope', listView: { initialColumns: ['account', 'resident', 'scope', 'status', 'grantedAt'] } },
  fields: {
    account: relationship({ ref: 'PortalAccount.grants', ...ro }),
    resident: relationship({ ref: 'Resident', ...ro }),
    representative: relationship({ ref: 'Representative', ...ro }),
    scope: fixedChoice(PORTAL_SCOPES),
    authorityBasis: fixedChoice(AUTHORITY_BASES),
    consentDocument: relationship({ ref: 'Document', ...ro }),
    status: lifecycle(['proposed', 'granted', 'revoked']),
    proposedBy: relationship({ ref: 'User', ...ro }),
    grantedBy: relationship({ ref: 'User', ...ro }),
    grantedAt: timestamp({ ...ro }),
    revokedAt: timestamp({ ...ro }),
    revokeReason: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

PHI_LISTS.add('Inquiry')
PHI_LISTS.add('Prospect')
PHI_LISTS.add('Referral')
PHI_LISTS.add('PortalScopeGrant')
