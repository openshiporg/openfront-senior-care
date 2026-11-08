import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { isStaff, type Session } from '../access'
import { choice, fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { breakGlassResidents, PHI_LISTS, phiFields } from './phi'
import { SETTINGS } from './platform'
import { assignedCommunities, communityWhere } from './scope'
import { trackingFields } from './trackingFields'
import { label } from '../../../lib/labels'

/* Residents & census (SCHEMA §4). Rows are created and changed by census commands only. */

const sys = () => false
const ro = readOnly
const opt = (values: readonly string[]) => ({ type: 'string' as const, options: values.map(value => ({ label: label(value), value })) })

/** Rows of residents in the caller's assigned communities, plus residents under an active break-glass grant. */
const residentScope = (path: readonly string[], residentPath: readonly string[]) => async ({ session, context }: { session?: Session; context: any }) => {
  const scope = await assignedCommunities(session, context)
  if (scope === 'all') return true
  const glass = [...(await breakGlassResidents(session, context))]
  const own = communityWhere(path, scope)
  if (!glass.length) return own
  let glassWhere: Record<string, unknown> = { id: { in: glass } }
  for (const key of [...residentPath].reverse()) glassWhere = { [key]: glassWhere }
  return { OR: [own, glassWhere] }
}

/** `path` reaches Community; `residentPath` reaches Resident (empty for the Resident list itself). */
const residentList = (path: readonly string[], residentPath: readonly string[] = ['resident']) => ({
  operation: { query: isStaff, create: sys, update: sys, delete: sys },
  filter: { query: residentScope(path, residentPath) },
})

const phiList = (key: string) => {
  PHI_LISTS.add(key)
  return key
}

export const CODE_STATUSES = ['full_code', 'dnr', 'dnr_cc', 'dnr_cca', 'comfort'] as const

export const Resident = list({
  access: residentList(['community'], []),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'lastName', 'firstName', 'community', 'status'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro, ui: { ...ro.ui, description: 'The community of the current (or last) stay.' } }),
    ...phiFields('Resident', {
      firstName: ['dem', text, { ...ro, validation: { isRequired: true } }],
      middleName: ['dem', text, ro],
      lastName: ['dem', text, { ...ro, validation: { isRequired: true } }],
      preferredName: ['dem', text, ro],
      dateOfBirth: ['dem', calendarDay, ro],
      sex: ['dem', select, { ...opt(['female', 'male', 'unknown']), ...ro }],
      genderIdentity: ['dem', text, ro],
      pronouns: ['dem', text, ro],
      primaryLanguage: ['dem', text, ro],
      interpreterNeeded: ['dem', checkbox, { defaultValue: false, ...ro }],
      maritalStatus: ['dem', text, ro],
      religion: ['dem', text, ro],
      veteran: ['dem', checkbox, { defaultValue: false, ...ro }],
      codeStatus: ['clin', select, { ...opt(CODE_STATUSES), ...ro, ui: { ...ro.ui, description: 'Projection of the active code-status order or verified directive. Ohio DNR Comfort Care codes (verify).' } }],
      capacityStatus: ['sens', select, { ...opt(['has_capacity', 'lacks_capacity', 'fluctuating', 'unknown']), defaultValue: 'unknown', ...ro }],
      fallRisk: ['clin', text, ro],
      elopementRisk: ['clin', text, ro],
    }),
    status: lifecycle(['prospective', 'current', 'former', 'deceased'], 'current'),
    identifiers: relationship({ ref: 'ResidentIdentifier.resident', many: true, ...ro }),
    representatives: relationship({ ref: 'Representative.resident', many: true, ...ro }),
    advanceDirectives: relationship({ ref: 'AdvanceDirective.resident', many: true, ...ro }),
    allergies: relationship({ ref: 'Allergy.resident', many: true, ...ro }),
    diagnoses: relationship({ ref: 'Diagnosis.resident', many: true, ...ro }),
    stays: relationship({ ref: 'Stay.resident', many: true, ...ro }),
    currentStay: relationship({ ref: 'Stay', ...ro }),
    synthetic: checkbox({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Resident')

/** Identifiers are encrypted at rest; lookups use an HMAC of the normalised value (SCHEMA G12). */
export const ResidentIdentifier = list({
  access: residentList(['resident', 'community']),
  ui: { labelField: 'display' },
  fields: {
    resident: relationship({ ref: 'Resident.identifiers', ...ro }),
    kind: fixedChoice(['mrn', 'medicare_mbi', 'medicaid_id', 'ma_member_id', 'ssn_last4', 'incumbent_ehr_id', 'pharmacy_patient_id', 'other']),
    issuer: systemText({ required: true }),
    ...phiFields('ResidentIdentifier', {
      display: ['ident', text, ro],
      valueEncrypted: ['ident', text, { access: { create: sys, update: sys }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } } }],
    }),
    valueHash: text({ access: { read: sys, create: sys, update: sys }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' } }, validation: { isRequired: true } }),
    effectiveFrom: calendarDay({ ...ro }),
    effectiveTo: calendarDay({ ...ro }),
    ...trackingFields,
  },
})

/** Non-resident people: lead contacts, representatives and family. Association with a resident makes them PHI. */
export const Contact = list({
  access: {
    operation: { query: isStaff, create: sys, update: sys, delete: sys },
    filter: { query: async ({ session, context }: { session?: Session; context: any }) => {
      const scope = await assignedCommunities(session, context)
      if (scope === 'all') return true
      return { OR: [{ community: { id: { in: scope } } }] }
    } },
  },
  ui: { labelField: 'reference' },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    community: relationship({ ref: 'Community', ...ro }),
    ...phiFields('Contact', {
      firstName: ['dem', text, { ...ro, validation: { isRequired: true } }],
      lastName: ['dem', text, ro],
      email: ['dem', text, ro],
      phone: ['dem', text, ro],
      address: ['dem', json, ro],
      preferredChannel: ['dem', select, { ...opt(['phone', 'email', 'text', 'mail', 'portal']), defaultValue: 'phone', ...ro }],
    }),
    consentToContact: checkbox({ defaultValue: false, ...ro }),
    synthetic: checkbox({ defaultValue: false, ...ro }),
    ...trackingFields,
  },
})
phiList('Contact')

export const REPRESENTATIVE_ROLES = ['self', 'healthcare_poa', 'financial_responsible', 'guardian', 'family', 'emergency_contact', 'hospice_contact', 'personal_representative_hipaa'] as const

export const Representative = list({
  access: residentList(['resident', 'community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'contact', 'roles', 'contactPriority'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    resident: relationship({ ref: 'Resident.representatives', ...ro }),
    contact: relationship({ ref: 'Contact', ...ro }),
    self: checkbox({ defaultValue: false, ...ro }),
    roles: json({ ...ro, defaultValue: [] }),
    authorityDocument: relationship({ ref: 'Document', ...ro }),
    authorityVerifiedBy: relationship({ ref: 'User', ...ro }),
    authorityVerifiedAt: timestamp({ ...ro }),
    effectiveFrom: calendarDay({ ...ro }),
    effectiveTo: calendarDay({ ...ro }),
    contactPriority: integer({ defaultValue: 1, ...ro }),
    portalAccount: relationship({ ref: 'PortalAccount.representatives', ...ro }),
    status: lifecycle(['active', 'ended']),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Representative')

export const AdvanceDirective = list({
  access: residentList(['resident', 'community']),
  fields: {
    resident: relationship({ ref: 'Resident.advanceDirectives', ...ro }),
    ...phiFields('AdvanceDirective', {
      kind: ['clin', select, { ...opt(['living_will', 'healthcare_poa', 'polst', 'dnr', 'ohio_dnr_cc', 'ohio_dnr_cca', 'other']), validation: { isRequired: true }, ...ro }],
      note: ['clin', text, ro],
    }),
    document: relationship({ ref: 'Document', ...ro }),
    effectiveAt: timestamp({ ...ro }),
    revokedAt: timestamp({ ...ro }),
    verifiedBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})
phiList('AdvanceDirective')

export const Allergy = list({
  access: residentList(['resident', 'community']),
  fields: {
    resident: relationship({ ref: 'Resident.allergies', ...ro }),
    ...phiFields('Allergy', {
      substance: ['clin', text, { ...ro, validation: { isRequired: true } }],
      reaction: ['clin', text, ro],
      severity: ['clin', select, { ...opt(['mild', 'moderate', 'severe', 'unknown']), defaultValue: 'unknown', ...ro }],
    }),
    status: lifecycle(['active', 'inactive', 'entered_in_error']),
    recordedBy: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})
phiList('Allergy')

export const Diagnosis = list({
  access: residentList(['resident', 'community']),
  fields: {
    resident: relationship({ ref: 'Resident.diagnoses', ...ro }),
    ...phiFields('Diagnosis', {
      icd10: ['clin', text, { ...ro, validation: { isRequired: true } }],
      description: ['clin', text, ro],
      rank: ['clin', select, { ...opt(['primary', 'admitting', 'secondary']), defaultValue: 'secondary', ...ro }],
    }),
    onsetDate: calendarDay({ ...ro }),
    resolvedDate: calendarDay({ ...ro }),
    status: lifecycle(['active', 'resolved', 'entered_in_error']),
    ...trackingFields,
  },
})
phiList('Diagnosis')

export const PreAdmissionScreen = list({
  access: residentList(['resident', 'community']),
  fields: {
    resident: relationship({ ref: 'Resident', ...ro }),
    prospect: relationship({ ref: 'Prospect', ...ro }),
    kind: fixedChoice(['pasrr_level1', 'pasrr_level2', 'al_physician_report', 'al_resident_assessment', 'tb_screen']),
    ...phiFields('PreAdmissionScreen', {
      result: ['clin', text, ro],
    }),
    document: relationship({ ref: 'Document', ...ro }),
    completedAt: timestamp({ ...ro }),
    expiresAt: timestamp({ ...ro }),
    ...trackingFields,
  },
})
phiList('PreAdmissionScreen')

export const ADMISSION_SOURCES = ['acute_hospital', 'community_home', 'another_nursing_facility', 'assisted_living', 'psychiatric_hospital', 'irf', 'ltch', 'hospice', 'other'] as const
export const DISCHARGE_DISPOSITIONS = ['community_home', 'acute_hospital', 'another_nursing_facility', 'assisted_living', 'psychiatric_hospital', 'irf', 'ltch', 'hospice', 'deceased', 'other'] as const

export const Stay = list({
  access: residentList(['community']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'setting', 'status', 'presence', 'admittedAt'] } },
  fields: {
    reference: systemText({ indexed: 'unique', required: true }),
    resident: relationship({ ref: 'Resident.stays', ...ro }),
    community: relationship({ ref: 'Community', ...ro }),
    setting: fixedChoice(SETTINGS),
    status: lifecycle(['pre_admit', 'admitted', 'discharged', 'deceased'], 'pre_admit'),
    presence: lifecycle(['not_admitted', 'in_house', 'on_leave_hold', 'on_leave_no_hold', 'gone'], 'not_admitted'),
    admittedAt: timestamp({ ...ro }),
    dischargedAt: timestamp({ ...ro }),
    admissionSource: select({ ...opt(ADMISSION_SOURCES), ...ro }),
    dischargeDisposition: select({ ...opt(DISCHARGE_DISPOSITIONS), ...ro }),
    priorStay: relationship({ ref: 'Stay', ...ro }),
    currentBed: relationship({ ref: 'Bed', ...ro }),
    currentApartment: relationship({ ref: 'Apartment', ...ro }),
    heldBed: relationship({ ref: 'Bed', ...ro }),
    agreement: relationship({ ref: 'Document', ...ro }),
    events: relationship({ ref: 'CensusEvent.stay', many: true, ...ro }),
    coverage: relationship({ ref: 'CoveragePeriod.stay', many: true, ...ro }),
    leaveDaysUsedThisYear: integer({ defaultValue: 0, ...ro }),
    projection: json({ ...ro, ui: { ...ro.ui, description: 'The census fold (lib/censusProjection.ts); a rebuild from CensusEvents must match projectionHash.' } }),
    placementReason: systemText(),
    initialPayerKind: systemText(),
    projectionVersion: integer({ defaultValue: 0, ...ro }),
    projectionHash: systemText(),
    lastEventHash: systemText(),
    synthetic: checkbox({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Stay')

export const CENSUS_EVENT_KINDS = ['admission', 'readmission', 'room_change', 'leave_start', 'hold_release', 'leave_end', 'coverage_change', 'discharge', 'death', 'correction'] as const

/** Append-only (database triggers refuse UPDATE/DELETE/TRUNCATE). The projection is rebuilt from these rows. */
export const CensusEvent = list({
  access: residentList(['stay', 'community'], ['stay', 'resident']),
  ui: { labelField: 'kind', listView: { initialColumns: ['stay', 'seq', 'kind', 'effectiveAt', 'recordedAt', 'actor'], initialSort: { field: 'recordedAt', direction: 'DESC' } } },
  fields: {
    stay: relationship({ ref: 'Stay.events', ...ro }),
    seq: integer({ ...ro, validation: { isRequired: true } }),
    kind: fixedChoice(CENSUS_EVENT_KINDS),
    effectiveAt: timestamp({ ...ro, validation: { isRequired: true } }),
    observedAt: timestamp({ ...ro }),
    recordedAt: timestamp({ ...ro, defaultValue: { kind: 'now' } }),
    fromBed: relationship({ ref: 'Bed', ...ro }),
    toBed: relationship({ ref: 'Bed', ...ro }),
    fromApartment: relationship({ ref: 'Apartment', ...ro }),
    toApartment: relationship({ ref: 'Apartment', ...ro }),
    leaveKind: select({ ...opt(['hospital', 'therapeutic', 'other']), ...ro }),
    coverage: relationship({ ref: 'CoveragePeriod', ...ro }),
    holdElected: checkbox({ defaultValue: false, ...ro }),
    holdPaidBy: select({ ...opt(['medicaid', 'private', 'none']), ...ro }),
    dischargeDisposition: select({ ...opt(DISCHARGE_DISPOSITIONS), ...ro }),
    initiatedBy: select({ ...opt(['resident', 'facility']), ...ro }),
    voidsEvent: relationship({ ref: 'CensusEvent', ...ro }),
    correctionReason: systemText(),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    notices: relationship({ ref: 'NoticeDelivery.censusEvent', many: true, ...ro }),
    detail: json({ ...ro }),
    actor: relationship({ ref: 'User', ...ro }),
    actorAgent: relationship({ ref: 'AgentIdentity', ...ro }),
    idempotencyKey: systemText({ indexed: 'unique', required: true }),
    prevHash: systemText({ required: true }),
    hash: systemText({ required: true }),
  },
})
phiList('CensusEvent')

/** Snapshot per stay per day per run. The current row has `supersededBy` empty. */
export const CensusDay = list({
  access: residentList(['community'], ['stay', 'resident']),
  ui: { listView: { initialColumns: ['date', 'stay', 'presence', 'unit', 'billableForPayer'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    stay: relationship({ ref: 'Stay', ...ro }),
    date: calendarDay({ ...ro, validation: { isRequired: true } }),
    setting: systemText(),
    bed: relationship({ ref: 'Bed', ...ro }),
    apartment: relationship({ ref: 'Apartment', ...ro }),
    unit: relationship({ ref: 'Unit', ...ro }),
    presence: systemText({ required: true }),
    primaryCoverage: relationship({ ref: 'CoveragePeriod', ...ro }),
    payerKind: systemText(),
    billableForPayer: checkbox({ defaultValue: true, ...ro }),
    snapshotRun: relationship({ ref: 'JobRun', ...ro }),
    supersededBy: relationship({ ref: 'CensusDay', ...ro }),
  },
})
phiList('CensusDay')

/**
 * The daily census sign-off (BUILD-PLAN §2 `/census/midnight`). Once a community-local date is
 * signed off it is closed: a late census event dated on or before it needs a maker-checker
 * correction (STATE-MACHINES §4.3). Phase 3 adds closed BillingPeriods to the same check.
 */
export const CensusSignoff = list({
  access: {
    operation: { query: isStaff, create: sys, update: sys, delete: sys },
    filter: { query: async ({ session, context }: { session?: Session; context: any }) => {
      const scope = await assignedCommunities(session, context)
      return scope === 'all' ? true : communityWhere(['community'], scope)
    } },
  },
  ui: { listView: { initialColumns: ['date', 'community', 'unit', 'signedBy', 'signedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    unit: relationship({ ref: 'Unit', ...ro, ui: { ...ro.ui, description: 'Empty = the whole community.' } }),
    date: calendarDay({ ...ro, validation: { isRequired: true } }),
    totals: json({ ...ro }),
    run: relationship({ ref: 'JobRun', ...ro }),
    signedBy: relationship({ ref: 'User', ...ro }),
    signedAt: timestamp({ ...ro }),
    note: systemText(),
  },
})

/** Evidence that a notice reached the resident or representative (bed-hold, transfer/discharge, …). */
export const NoticeDelivery = list({
  access: residentList(['resident', 'community']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'resident', 'method', 'deliveredAt', 'acknowledgement', 'copyToOmbudsmanAt'] } },
  fields: {
    kind: fixedChoice(['bed_hold_policy', 'bed_hold_at_transfer', 'transfer_discharge', 'room_change', 'rate_change', 'nomnc', 'snfabn', 'denc', 'trust_quarterly', 'ssi_threshold', 'privacy_practices', 'other']),
    subjectType: systemText(),
    subjectId: systemText({ indexed: true }),
    resident: relationship({ ref: 'Resident', ...ro }),
    censusEvent: relationship({ ref: 'CensusEvent.notices', ...ro }),
    recipientRepresentative: relationship({ ref: 'Representative', ...ro }),
    method: select({ ...opt(['in_person', 'mail', 'email', 'portal', 'phone_then_mail']), validation: { isRequired: true }, ...ro }),
    deliveredAt: timestamp({ ...ro }),
    deliveredBy: relationship({ ref: 'User', ...ro }),
    document: relationship({ ref: 'Document', ...ro }),
    acknowledgement: select({ ...opt(['signed', 'refused_witnessed', 'not_required']), defaultValue: 'not_required', ...ro }),
    witness: relationship({ ref: 'User', ...ro }),
    copyToOmbudsmanAt: timestamp({ ...ro }),
    note: systemText(),
    ...trackingFields,
  },
})
phiList('NoticeDelivery')

/* Coverage skeleton (SCHEMA §5.1, §5.3). Billing derivation arrives in phase 3. */

export const PAYER_KINDS = ['medicare_a', 'medicare_advantage', 'medicaid_ffs', 'medicaid_mco', 'private_pay', 'commercial', 'ltc_insurance', 'va', 'hospice_agency', 'other'] as const

export const Payer = list({
  access: {
    operation: { query: isStaff, create: (a: any) => a.session?.data?.role?.canManageBilling === true, update: (a: any) => a.session?.data?.role?.canManageBilling === true, delete: sys },
  },
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true } }),
    kind: choice(PAYER_KINDS, 'private_pay'),
    payerId: text(),
    dayCountingRule: choice(['count_admit_not_discharge', 'count_both', 'count_neither'], 'count_admit_not_discharge'),
    timelyFilingDays: integer(),
    claimFormat: choice(['837i', 'invoice', 'none'], 'invoice'),
    contact: json({ defaultValue: {} }),
    ...trackingFields,
  },
})

export const CoveragePeriod = list({
  access: residentList(['stay', 'community'], ['stay', 'resident']),
  ui: { listView: { initialColumns: ['stay', 'payer', 'rank', 'startDate', 'endDate', 'status'] } },
  fields: {
    stay: relationship({ ref: 'Stay.coverage', ...ro }),
    payer: relationship({ ref: 'Payer', ...ro }),
    rank: fixedChoice(['primary', 'secondary', 'tertiary']),
    startDate: calendarDay({ ...ro, validation: { isRequired: true } }),
    endDate: calendarDay({ ...ro }),
    status: lifecycle(['pending', 'active', 'ending', 'ended', 'denied', 'retro_approved'], 'active'),
    ...phiFields('CoveragePeriod', {
      levelCode: ['fin', text, ro],
      memberReference: ['ident', text, ro],
    }),
    qualifyingStayFrom: calendarDay({ ...ro }),
    qualifyingStayTo: calendarDay({ ...ro }),
    endReason: select({ ...opt(['skilled_need_ended', 'benefit_exhausted', 'discharge', 'payer_change', 'death', 'other']), ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('CoveragePeriod')
