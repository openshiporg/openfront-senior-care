import { list } from '@keystone-6/core'
import { calendarDay, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { isStaff } from '../access'
import { factor, fixedChoice, lifecycle, rate, systemText, versionField } from './domainFields'
import { phiGatedFields as phiFields } from './phi'
import { opt, phiList, residentList, ro } from './residentAccess'
import { trackingFields } from './trackingFields'

/*
 * Phase 4a: MDS 3.0, PDPM and Medicare Part A depth (SCHEMA §5.3-§5.8, §6; STATE-MACHINES §5.5, §6.1-§6.4).
 * Every row is written by a server command; nothing here is edited through the generic API.
 */

const MDS_READ: Permission[] = ['canReadClinical', 'canManageAssessments']
const PDPM_READ: Permission[] = ['canReadClinical', 'canManageAssessments', 'canReadBilling']
const SUBMIT_READ: Permission[] = ['canSubmitRegulatory', 'canManageAssessments']
const COVERAGE_READ: Permission[] = ['canReadBilling', 'canManageBilling', 'canManageAssessments']

const rl = (read: Permission[]) => residentList(['community'], ['resident'], read)
const scope = () => ({
  resident: relationship({ ref: 'Resident', ...ro }),
  community: relationship({ ref: 'Community', ...ro }),
  stay: relationship({ ref: 'Stay', ...ro }),
})
const day = () => calendarDay({ ...ro })
const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const staffRead = { operation: { query: isStaff, create: () => false, update: () => false, delete: () => false } }

export const MDS_KINDS = [
  'obra_admission', 'obra_quarterly', 'obra_annual', 'obra_significant_change', 'pps_5day', 'ipa',
  'discharge_return_anticipated', 'discharge_return_not_anticipated', 'pps_discharge', 'entry', 'death_in_facility',
] as const

/** One MDS 3.0 record (an assessment or tracking record). Items follow the item set in force on its ARD. */
export const MdsAssessment = list({
  access: rl(MDS_READ),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'kind', 'resident', 'ardDate', 'status', 'hipps'] } },
  fields: {
    ...scope(),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(MDS_KINDS),
    ardDate: calendarDay({ ...ro, validation: { isRequired: true } }),
    itemSet: relationship({ ref: 'AssessmentTemplate', ...ro }),
    itemSetVersion: systemText(),
    ...phiFields('MdsAssessment', {
      items: ['clin', json, ro],
      caaTriggers: ['clin', json, ro],
      editResults: ['clin', json, ro],
      hipps: ['fin', text, ro],
    }),
    signatures: json({ ...ro, defaultValue: [], ui: { ...ro.ui, description: 'Section signatures (Z0400): who attested which sections and when. Append-only.' } }),
    status: lifecycle(['in_progress', 'completed', 'exported', 'accepted', 'rejected', 'superseded', 'entered_in_error'], 'in_progress'),
    completedAt: when(),
    completedBy: by(),
    correctionOf: relationship({ ref: 'MdsAssessment', ...ro }),
    correctionNumber: integer({ defaultValue: 0, ...ro }),
    correctionReason: systemText(),
    submission: relationship({ ref: 'MdsSubmission.assessments', ...ro }),
    acceptedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('MdsAssessment')

/** The PDPM result for one assessment: immutable; a correction writes a new one and supersedes this (STATE-MACHINES §6.3). */
export const PdpmClassification = list({
  access: rl(PDPM_READ),
  ui: { labelField: 'hipps', listView: { initialColumns: ['hipps', 'resident', 'effectiveFrom', 'status'] } },
  fields: {
    ...scope(),
    assessment: relationship({ ref: 'MdsAssessment', ...ro }),
    mappingVersion: relationship({ ref: 'PdpmMappingVersion', ...ro }),
    indicator: fixedChoice(['five_day', 'ipa', 'obra']),
    effectiveFrom: calendarDay({ ...ro, validation: { isRequired: true } }),
    ...phiFields('PdpmClassification', {
      hipps: ['fin', text, ro],
      groups: ['clin', json, ro],
      cmi: ['fin', json, ro],
      functionScores: ['clin', json, ro],
    }),
    inputHash: systemText(),
    status: lifecycle(['current', 'superseded'], 'current'),
    supersededBy: relationship({ ref: 'PdpmClassification', ...ro }),
    ...trackingFields,
  },
})
phiList('PdpmClassification')

/** A submission batch for iQIES: the file is made by the export button, uploaded by a person, and the FVR is pasted back. */
export const MdsSubmission = list({
  access: residentList(['community'], [], SUBMIT_READ),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'status', 'recordCount', 'generatedAt', 'fvrParsedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    reference: systemText({ indexed: 'unique', required: true }),
    assessments: relationship({ ref: 'MdsAssessment.submission', many: true, ...ro }),
    recordCount: integer({ defaultValue: 0, ...ro }),
    ...phiFields('MdsSubmission', { payload: ['clin', json, ro], fvr: ['clin', json, ro] }),
    fileHash: systemText(),
    fileName: systemText(),
    status: lifecycle(['generated', 'uploaded', 'accepted', 'partially_accepted', 'rejected'], 'generated'),
    generatedAt: when(),
    generatedBy: by(),
    uploadedAt: when(),
    uploadedBy: by(),
    fvrParsedAt: when(),
    fvrSummary: json({ ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('MdsSubmission')

/** A PDPM table release (CMS fiscal year). Rows are reference data; a new FY ships as a new version. */
export const PdpmMappingVersion = list({
  access: staffRead,
  ui: { labelField: 'code', listView: { initialColumns: ['code', 'effectiveFrom', 'effectiveTo', 'status'] } },
  fields: {
    code: systemText({ indexed: 'unique', required: true }),
    effectiveFrom: day(),
    effectiveTo: day(),
    tables: json({ ...ro, ui: { ...ro.ui, description: 'CMIs, group tables and NTA points as decimal strings.' } }),
    sourceNote: systemText(),
    verifyNote: systemText(),
    status: lifecycle(['active', 'retired'], 'active'),
    ...trackingFields,
  },
})

/** A published rate: PDPM component base rates (urban/rural), wage indexes by CBSA, the SNF coinsurance amount. */
export const ReferenceRate = list({
  access: staffRead,
  ui: { labelField: 'component', listView: { initialColumns: ['component', 'geography', 'rate', 'effectiveFrom', 'effectiveTo'] } },
  fields: {
    mappingVersion: relationship({ ref: 'PdpmMappingVersion', ...ro }),
    component: fixedChoice(['pt', 'ot', 'slp', 'nursing', 'nta', 'non_case_mix', 'wage_index', 'snf_coinsurance']),
    geography: systemText({ required: true }),
    rate: rate({ required: true }),
    laborShare: factor(),
    effectiveFrom: day(),
    effectiveTo: day(),
    sourceNote: systemText(),
    verifyNote: systemText(),
    ...trackingFields,
  },
})

/** Days a resident already used in the current benefit period elsewhere (HETS, CWF, hospital record or the resident's own report). */
export const PriorSnfDaysObservation = list({
  access: rl(COVERAGE_READ),
  ui: { listView: { initialColumns: ['resident', 'source', 'daysUsed', 'asOf'] } },
  fields: {
    resident: relationship({ ref: 'Resident', ...ro }),
    community: relationship({ ref: 'Community', ...ro }),
    source: fixedChoice(['hets', 'cwf_manual', 'hospital_record', 'resident_report']),
    ...phiFields('PriorSnfDaysObservation', { daysUsed: ['fin', integer, { ...ro, validation: { isRequired: true } }] }),
    asOf: day(),
    spellStart: day(),
    document: relationship({ ref: 'Document', ...ro }),
    note: systemText(),
    recordedBy: by(),
    ...trackingFields,
  },
})
phiList('PriorSnfDaysObservation')

/** The benefit-period count as last derived (refreshed by the billing derivation and the Recount button; the derivation is the source). */
export const BenefitPeriodCounter = list({
  access: rl(COVERAGE_READ),
  ui: { listView: { initialColumns: ['resident', 'spellStart', 'fullDaysUsed', 'coinsuranceDaysUsed', 'computedAt'] } },
  fields: {
    resident: relationship({ ref: 'Resident', ...ro }),
    community: relationship({ ref: 'Community', ...ro }),
    spellStart: day(),
    spellEnd: day(),
    ...phiFields('BenefitPeriodCounter', {
      fullDaysUsed: ['fin', integer, { ...ro, defaultValue: 0 }],
      coinsuranceDaysUsed: ['fin', integer, { ...ro, defaultValue: 0 }],
      priorDaysUsed: ['fin', integer, { ...ro, defaultValue: 0 }],
    }),
    lastCoveredDay: day(),
    derivedFromHash: systemText(),
    computedAt: when(),
    ...trackingFields,
  },
})
phiList('BenefitPeriodCounter')

/** A Medicare Advantage (or other managed payer) authorisation and its concurrent reviews. */
export const Authorisation = list({
  access: rl(COVERAGE_READ),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'payer', 'authFrom', 'authTo', 'status'] } },
  fields: {
    ...scope(),
    reference: systemText({ indexed: 'unique', required: true }),
    coverage: relationship({ ref: 'CoveragePeriod', ...ro }),
    payer: relationship({ ref: 'Payer', ...ro }),
    ...phiFields('Authorisation', { payerAuthNumber: ['ident', text, ro], levelOfCare: ['fin', text, ro] }),
    requestedOn: day(),
    authFrom: day(),
    authTo: day(),
    reviewIntervalDays: integer({ defaultValue: 7, ...ro }),
    status: lifecycle(['requested', 'approved', 'denied', 'ended'], 'requested'),
    reviews: relationship({ ref: 'ConcurrentReview.authorisation', many: true, ...ro }),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Authorisation')

export const ConcurrentReview = list({
  access: rl(COVERAGE_READ),
  ui: { listView: { initialColumns: ['authorisation', 'reviewedOn', 'outcome', 'newAuthTo'] } },
  fields: {
    resident: relationship({ ref: 'Resident', ...ro }),
    community: relationship({ ref: 'Community', ...ro }),
    authorisation: relationship({ ref: 'Authorisation.reviews', ...ro }),
    reviewedOn: day(),
    outcome: fixedChoice(['continued', 'extended', 'last_covered_day_set', 'denied']),
    newAuthTo: day(),
    reviewer: systemText(),
    ...phiFields('ConcurrentReview', { note: ['clin', text, ro] }),
    recordedBy: by(),
    ...trackingFields,
  },
})
phiList('ConcurrentReview')

/** Coverage additions for Medicare A depth and hospice (spread into CoveragePeriod). */
export const coverageDepthFields = {
  skilledCertSignedAt: calendarDay({ ...ro }),
  skilledCertBy: systemText(),
  qualifyingStayHospital: systemText(),
  qualifyingStayEvidence: relationship({ ref: 'Document', ...ro }),
  qualifyingStayEvidenceNote: systemText(),
  lastCoveredDay: calendarDay({ ...ro }),
  hospiceAgency: systemText(),
  hospiceElectionOn: calendarDay({ ...ro }),
  hospiceRoomBoardBps: integer({ ...ro, ui: { ...ro.ui, description: 'Share of the Medicaid room-and-board rate the hospice passes through, in basis points (9500 = 95%).' } }),
  endOverrideReason: select({ ...opt(['resident_refused_notice', 'death', 'emergency_transfer', 'other']), ...ro }),
}
