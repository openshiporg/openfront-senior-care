import { list } from '@keystone-6/core'
import { bigInt, calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { fixedChoice, lifecycle, systemText, versionField } from './domainFields'
import { ro } from './residentAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Phase 5 workforce depth (SCHEMA §9): shifts and assignments with a credential check, open-shift offers, agency vendors and
 * invoices, credentials with their verifications, staffing targets and days, and the payroll export.
 * Every row is written by a server command; nothing here is edited through the generated API.
 */

export const CREDENTIAL_KINDS = ['rn_licence', 'lpn_licence', 'cna_registry', 'med_aide_cert', 'cpr', 'tb_screen', 'background_check_state', 'background_check_fbi', 'oig_exclusion', 'state_exclusion', 'dementia_training', 'abuse_training', 'in_service_hours'] as const
export const CREDENTIAL_STATUSES = ['pending_verification', 'verified', 'expiring', 'expired', 'revoked', 'suspended'] as const
export const ASSIGNMENT_STATUSES = ['offered', 'accepted', 'assigned', 'started', 'completed', 'declined', 'called_off', 'no_show', 'needs_coverage'] as const
export const STAFFING_METRICS = ['total_nurse_hprd', 'rn_hprd', 'cna_hprd', 'direct_care_hprd'] as const

const SCHEDULE: Permission[] = ['canManageSchedule', 'canReadWorkforce', 'canManageTimecards']
const CREDENTIALS: Permission[] = ['canManageCredentials', 'canReadWorkforce', 'canManageSchedule']
const scoped = (read: Permission[]) => scopedGoverned(read, ['community'])
const community = () => relationship({ ref: 'Community', ...ro })
const day = () => calendarDay({ ...ro })
const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const money = () => bigInt({ ...ro })

export const AgencyVendor = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'status', 'contractStart', 'contractEnd'] } },
  fields: {
    community: community(),
    name: systemText({ required: true, indexed: true }),
    status: lifecycle(['active', 'suspended', 'terminated'], 'active'),
    contractStart: day(),
    contractEnd: day(),
    /** { rn: 6800, lpn: 5200, cna: 3400 }: contract rate per hour in cents, by role category. */
    rateCard: json({ ...ro, defaultValue: {} }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AgencyInvoice = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'invoiceNumber', listView: { initialColumns: ['invoiceNumber', 'vendor', 'amountMinor', 'status'] } },
  fields: {
    community: community(),
    vendor: relationship({ ref: 'AgencyVendor', ...ro }),
    invoiceNumber: systemText({ required: true, indexed: true }),
    periodStart: day(),
    periodEnd: day(),
    invoicedMinutes: integer({ ...ro, defaultValue: 0 }),
    amountMinor: money(),
    /** What the shifts worked in the period come to at the contract rate. */
    expectedMinutes: integer({ ...ro, defaultValue: 0 }),
    expectedAmountMinor: money(),
    variance: json({ ...ro }),
    status: lifecycle(['received', 'matched', 'disputed', 'approved'], 'received'),
    receivedBy: by(),
    approvedBy: by(),
    approvalNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const Credential = list({
  access: scoped(CREDENTIALS),
  ui: { labelField: 'kind', listView: { initialColumns: ['staffMember', 'kind', 'status', 'expiresAt'] } },
  fields: {
    community: community(),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    kind: fixedChoice(CREDENTIAL_KINDS),
    jurisdiction: systemText(),
    number: systemText(),
    issuedAt: day(),
    expiresAt: day(),
    status: lifecycle(CREDENTIAL_STATUSES, 'pending_verification'),
    /** The certificate or report on file (file name or document reference). */
    document: systemText(),
    /** Training records: hours completed (in-service, dementia, abuse), in minutes. */
    minutesCompleted: integer({ ...ro, defaultValue: 0 }),
    completedOn: day(),
    version: versionField(),
    ...trackingFields,
  },
})

/** Append-only evidence: where a credential was checked, when, by whom, and what it said. */
export const CredentialVerification = list({
  access: scoped(['canManageCredentials']),
  ui: { labelField: 'result', listView: { initialColumns: ['credential', 'source', 'result', 'verifiedAt'] } },
  fields: {
    community: community(),
    credential: relationship({ ref: 'Credential', ...ro }),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    source: fixedChoice(['nursys', 'state_registry', 'background_vendor', 'oig_leie_file', 'manual']),
    /** The source's own version, e.g. the LEIE month (2026-11). */
    sourceVersion: systemText(),
    result: fixedChoice(['clear', 'match', 'mismatch', 'error']),
    verifiedAt: when(),
    verifiedBy: by(),
    evidence: json({ ...ro, defaultValue: {} }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})

/** One monthly OIG LEIE file uploaded by HR. The same file twice is refused. */
export const LeieImport = list({
  access: scoped(['canManageCredentials']),
  ui: { labelField: 'month', listView: { initialColumns: ['month', 'rows', 'checked', 'matches', 'createdAt'] } },
  fields: {
    community: community(),
    month: systemText({ required: true }),
    fileHash: systemText({ required: true, indexed: true }),
    rows: integer({ ...ro, defaultValue: 0 }),
    checked: integer({ ...ro, defaultValue: 0 }),
    matches: integer({ ...ro, defaultValue: 0 }),
    uploadedBy: by(),
    ...trackingFields,
  },
})

export const Shift = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'role', listView: { initialColumns: ['unit', 'role', 'startsAt', 'endsAt', 'required', 'status'] } },
  fields: {
    community: community(),
    unit: relationship({ ref: 'Unit', ...ro }),
    /** The job-code category the shift needs: rn, lpn, cna, med_aide, or other. */
    role: fixedChoice(['rn', 'lpn', 'cna', 'med_aide', 'other']),
    startsAt: timestamp({ ...ro, validation: { isRequired: true } }),
    endsAt: timestamp({ ...ro, validation: { isRequired: true } }),
    required: integer({ ...ro, defaultValue: 1 }),
    status: lifecycle(['open', 'filled', 'in_progress', 'completed', 'cancelled'], 'open'),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const ShiftAssignment = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'status', listView: { initialColumns: ['shift', 'staffMember', 'status', 'startsAt'] } },
  fields: {
    community: community(),
    shift: relationship({ ref: 'Shift', ...ro }),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    status: lifecycle(ASSIGNMENT_STATUSES, 'offered'),
    /** Copied from the shift so the database can refuse two overlapping active assignments for one person. */
    startsAt: timestamp({ ...ro, validation: { isRequired: true } }),
    endsAt: timestamp({ ...ro, validation: { isRequired: true } }),
    /** What the credential check saw when the person was assigned. */
    credentialCheck: json({ ...ro }),
    agencyRateMinor: money(),
    /** SHA-256 of the offer link's token; the link itself is shown once to the scheduler. */
    offerTokenHash: systemText({ indexed: true }),
    offerExpiresAt: when(),
    startPunch: relationship({ ref: 'TimePunch', ...ro }),
    coverageReason: systemText(),
    decidedBy: by(),
    version: versionField(),
    ...trackingFields,
  },
})

export const StaffingTarget = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'metric', listView: { initialColumns: ['metric', 'value', 'source', 'status', 'ruleRef'] } },
  fields: {
    community: community(),
    unit: relationship({ ref: 'Unit', ...ro }),
    source: fixedChoice(['jurisdiction_pack', 'operator_policy']),
    metric: fixedChoice(STAFFING_METRICS),
    /** Hours per resident day, as text with two decimals (no floating point). */
    value: systemText({ required: true }),
    effectiveFrom: day(),
    effectiveTo: day(),
    /** repealed targets stay as history and never raise a breach. */
    status: lifecycle(['active', 'repealed', 'retired'], 'active'),
    ruleRef: systemText(),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const StaffingDay = list({
  access: scoped(SCHEDULE),
  ui: { labelField: 'date', listView: { initialColumns: ['date', 'census', 'status'] } },
  fields: {
    community: community(),
    date: day(),
    census: integer({ ...ro, defaultValue: 0 }),
    /** { rn: minutes, lpn: minutes, cna: minutes, med_aide: minutes } scheduled and worked for the day. */
    minutes: json({ ...ro, defaultValue: {} }),
    /** { metric: '3.42' } hours per resident day. */
    hprd: json({ ...ro, defaultValue: {} }),
    breaches: json({ ...ro, defaultValue: [] }),
    status: lifecycle(['met', 'breached'], 'met'),
    computedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})

export const PayrollExport = list({
  access: scoped(['canApproveTimecards', 'canManageTimecards']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'periodStart', 'periodEnd', 'rows', 'status'] } },
  fields: {
    community: community(),
    reference: systemText({ required: true, indexed: 'unique' }),
    periodStart: day(),
    periodEnd: day(),
    rows: integer({ ...ro, defaultValue: 0 }),
    totalMinutes: integer({ ...ro, defaultValue: 0 }),
    csv: text({ ...ro, access: { read: () => false, create: () => false, update: () => false }, graphql: { omit: true } }),
    csvHash: systemText(),
    /** A locked period is final: its approved timecards are exported and cannot be reopened. */
    locked: checkbox({ defaultValue: true, ...ro }),
    status: lifecycle(['locked', 'delivered'], 'locked'),
    exportedBy: by(),
    deliveredAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
