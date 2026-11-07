import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, isStaff } from '../access'
import { choice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { SETTINGS } from './platform'
import { assignedFilter, scopedGoverned, scopedManaged } from './scope'
import { trackingFields } from './trackingFields'

/* Places & inventory (SCHEMA §2, STATE-MACHINES §2-3). Status fields change only through commands. */

export const BED_STATUSES = ['available', 'reserved', 'occupied', 'held', 'cleaning', 'out_of_service'] as const
export const APARTMENT_STATUSES = ['available', 'reserved', 'occupied', 'turnover', 'out_of_service'] as const

export const Building = list({
  access: scopedManaged('canAccessDashboard', 'canManagePlaces', ['community']),
  ui: { labelField: 'name' },
  fields: {
    community: relationship({ ref: 'Community.buildings' }),
    name: text({ validation: { isRequired: true } }),
    kind: choice(['nursing', 'residential', 'mixed'], 'mixed'),
    ...trackingFields,
  },
})

export const Unit = list({
  access: scopedManaged('canAccessDashboard', 'canManagePlaces', ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'community', 'setting', 'secured', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community.units' }),
    building: relationship({ ref: 'Building' }),
    name: text({ validation: { isRequired: true } }),
    code: text({ validation: { isRequired: true, match: { regex: /^[A-Z0-9-]{1,12}$/, explanation: 'Capital letters, digits and hyphens' } } }),
    setting: choice(SETTINGS, 'nursing_facility'),
    secured: checkbox({ defaultValue: false, ui: { description: 'A secured memory-care unit: placement needs a documented reason.' } }),
    specialty: choice(['none', 'short_stay_rehab', 'long_term', 'behavioural', 'ventilator', 'bariatric'], 'none'),
    rooms: relationship({ ref: 'Room.unit', many: true }),
    apartments: relationship({ ref: 'Apartment.unit', many: true }),
    status: choice(['active', 'closed'], 'active'),
    ...trackingFields,
  },
})

export const Room = list({
  access: scopedManaged('canAccessDashboard', 'canManagePlaces', ['unit', 'community']),
  ui: { labelField: 'number' },
  fields: {
    unit: relationship({ ref: 'Unit.rooms' }),
    number: text({ validation: { isRequired: true } }),
    kind: choice(['private', 'semi_private', 'ward'], 'semi_private'),
    isolationCapable: checkbox({ defaultValue: false }),
    privateBath: checkbox({ defaultValue: false }),
    genderPolicy: choice(['any', 'female', 'male'], 'any'),
    beds: relationship({ ref: 'Bed.room', many: true }),
    ...trackingFields,
  },
})

export const Bed = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManagePlaces'), update: anyOf('canManagePlaces'), delete: () => false },
    filter: { query: assignedFilter(['room', 'unit', 'community']), update: assignedFilter(['room', 'unit', 'community']) },
  },
  ui: { labelField: 'label', listView: { initialColumns: ['room', 'label', 'certification', 'status'] } },
  fields: {
    room: relationship({ ref: 'Room.beds' }),
    label: text({ validation: { isRequired: true } }),
    certification: choice(['dual', 'medicare', 'medicaid', 'private_only'], 'dual'),
    licensed: checkbox({ defaultValue: true }),
    features: json({ defaultValue: [] }),
    status: lifecycle(BED_STATUSES, 'available'),
    statusReason: systemText(),
    currentStay: relationship({ ref: 'Stay', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ApartmentType = list({
  access: scopedManaged('canAccessDashboard', ['canManagePlaces', 'canManageStorefront'], ['community']),
  ui: { labelField: 'name' },
  fields: {
    community: relationship({ ref: 'Community' }),
    name: text({ validation: { isRequired: true } }),
    setting: choice(SETTINGS, 'assisted_living'),
    squareFeet: integer(),
    bedrooms: integer({ defaultValue: 0 }),
    description: text({ ui: { displayMode: 'textarea' } }),
    floorPlan: relationship({ ref: 'Document' }),
    photos: relationship({ ref: 'Document', many: true }),
    publishedFromPriceMinor: minor({ description: 'Derived from the active rate schedule when prices are published.' }),
    ...trackingFields,
  },
})

export const Apartment = list({
  access: {
    operation: { query: isStaff, create: anyOf('canManagePlaces'), update: anyOf('canManagePlaces'), delete: () => false },
    filter: { query: assignedFilter(['unit', 'community']), update: assignedFilter(['unit', 'community']) },
  },
  ui: { labelField: 'number', listView: { initialColumns: ['unit', 'number', 'apartmentType', 'capacity', 'occupantCount', 'status'] } },
  fields: {
    unit: relationship({ ref: 'Unit.apartments' }),
    number: text({ validation: { isRequired: true } }),
    apartmentType: relationship({ ref: 'ApartmentType' }),
    capacity: integer({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 2 } }),
    allowsUnrelatedCompanion: checkbox({ defaultValue: false }),
    status: lifecycle(APARTMENT_STATUSES, 'available'),
    statusReason: systemText(),
    occupantCount: integer({ defaultValue: 0, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const PlaceReservation = list({
  access: scopedGoverned(['canAdmitDischarge', 'canManageSales', 'canReadSales'], ['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'bed', 'apartment', 'status', 'expiresAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...readOnly }),
    bed: relationship({ ref: 'Bed', ...readOnly }),
    apartment: relationship({ ref: 'Apartment', ...readOnly }),
    prospect: relationship({ ref: 'Prospect', ...readOnly }),
    referral: relationship({ ref: 'Referral', ...readOnly }),
    waitlistEntry: relationship({ ref: 'WaitlistEntry', ...readOnly }),
    purpose: systemText(),
    status: lifecycle(['active', 'consumed', 'released', 'expired']),
    expiresAt: timestamp({ ...readOnly }),
    consumedByStay: relationship({ ref: 'Stay', ...readOnly }),
    operationKeyHash: systemText({ indexed: 'unique' }),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * Who holds a bed over which interval (occupied or held). Written only by census commands; a
 * btree_gist exclusion constraint makes two overlapping claims on one bed impossible even if a
 * command had a bug (STATE-MACHINES §4, the GiST backstop). `endAt` empty = still claimed.
 */
export const BedOccupancy = list({
  access: {
    operation: { query: isStaff, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(['bed', 'room', 'unit', 'community']) },
  },
  ui: { listView: { initialColumns: ['bed', 'stay', 'startAt', 'endAt'] } },
  fields: {
    bed: relationship({ ref: 'Bed', ...readOnly }),
    stay: relationship({ ref: 'Stay', ...readOnly }),
    startAt: timestamp({ ...readOnly, validation: { isRequired: true } }),
    endAt: timestamp({ ...readOnly }),
    openedByEvent: relationship({ ref: 'CensusEvent', ...readOnly }),
    closedByEvent: relationship({ ref: 'CensusEvent', ...readOnly }),
  },
})

/**
 * A community's bed-hold policy. The values are configuration copied from the jurisdiction pack
 * (e.g. Ohio Adm. Code 5160-3-16.4) and the operator's private-pay contract; never code.
 */
export const BedHoldPolicy = list({
  access: scopedManaged('canAccessDashboard', 'canManageCompliance', ['community']),
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true } }),
    community: relationship({ ref: 'Community' }),
    jurisdictionPack: relationship({ ref: 'JurisdictionPack' }),
    medicaidHoldDaysPerYear: integer({ defaultValue: 30, ui: { description: 'Paid Medicaid leave days per calendar year (all leave kinds).' } }),
    medicaidHoldPaid: checkbox({ defaultValue: true }),
    medicaidHoldRateRule: json({ defaultValue: {}, ui: { description: 'Rate rule from the pack, e.g. 50% of the per diem when prior-year occupancy exceeded 95%, else 18%.' } }),
    therapeuticLeaveDaysPerYear: integer({ defaultValue: 30 }),
    privateHoldDailyRateMinor: minor({ description: 'Daily charge when a private-pay resident elects a hold.' }),
    noticeTemplate: relationship({ ref: 'DocumentTemplate' }),
    ruleRef: text(),
    verifyNote: text({ ui: { displayMode: 'textarea' } }),
    effectiveFrom: calendarDay(),
    effectiveTo: calendarDay(),
    ...trackingFields,
  },
})
