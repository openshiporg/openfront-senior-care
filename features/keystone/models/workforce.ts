import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { fixedChoice, lifecycle, systemText, versionField } from './domainFields'
import { ro } from './residentAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Phase 4b workforce for Payroll-Based Journal and the NHSN weekly export (SCHEMA §10.12-10.13).
 * Punches are append-only; a correction is a request another person approves. Every row is written by a server command.
 */

const READ: Permission[] = ['canReadWorkforce', 'canManageTimecards', 'canApproveTimecards']
const REG_READ: Permission[] = ['canSubmitRegulatory', 'canReadWorkforce']
const scoped = (read: Permission[]) => scopedGoverned(read, ['community'])
const community = () => relationship({ ref: 'Community', ...ro })
const day = () => calendarDay({ ...ro })
const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })

export const JobCode = list({
  access: scoped([...READ, 'canSubmitRegulatory']),
  ui: { labelField: 'title', listView: { initialColumns: ['code', 'title', 'pbjJobTitleCode', 'countsTowardNursing'] } },
  fields: {
    community: community(),
    code: systemText({ required: true, indexed: true }),
    title: systemText({ required: true }),
    /** CMS PBJ jobTitleCode 1-40; blank means unmapped and blocks the quarter. */
    pbjJobTitleCode: systemText(),
    countsTowardNursing: checkbox({ defaultValue: false, ...ro }),
    /** The shift role this job fills: rn, lpn, cna, med_aide or other (Phase 5). */
    category: lifecycle(['rn', 'lpn', 'cna', 'med_aide', 'other'], 'other'),
    status: lifecycle(['active', 'retired'], 'active'),
    ...trackingFields,
  },
})

export const StaffMember = list({
  access: scoped(READ),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'employeeId', 'jobCode', 'payType', 'status'] } },
  fields: {
    community: community(),
    user: relationship({ ref: 'User', ...ro }),
    name: systemText({ required: true }),
    /** The employee id sent in the PBJ file: an internal number, never a Social Security number. */
    employeeId: systemText({ required: true, indexed: true }),
    jobCode: relationship({ ref: 'JobCode', ...ro }),
    payType: fixedChoice(['exempt', 'non_exempt', 'contract']),
    agency: checkbox({ defaultValue: false, ...ro }),
    agencyVendor: relationship({ ref: 'AgencyVendor', ...ro }),
    hireDate: day(),
    terminationDate: day(),
    status: lifecycle(['active', 'on_leave', 'terminated'], 'active'),
    version: versionField(),
    ...trackingFields,
  },
})

export const TimePunch = list({
  access: scoped(READ),
  ui: { labelField: 'kind', listView: { initialColumns: ['staffMember', 'kind', 'observedAt', 'source'] } },
  fields: {
    community: community(),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    kind: fixedChoice(['in', 'out', 'break_start', 'break_end']),
    observedAt: timestamp({ ...ro, validation: { isRequired: true } }),
    source: fixedChoice(['kiosk', 'mobile', 'geofence', 'import', 'correction']),
    /** Same import file imported twice posts each punch once. */
    punchHash: systemText({ required: true, indexed: 'unique' }),
    batch: systemText(),
    correction: relationship({ ref: 'TimeCorrection', ...ro }),
    recordedBy: by(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})

export const TimeCorrection = list({
  access: scoped(READ),
  ui: { labelField: 'reason', listView: { initialColumns: ['staffMember', 'kind', 'observedAt', 'status'] } },
  fields: {
    community: community(),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    kind: fixedChoice(['in', 'out', 'break_start', 'break_end']),
    observedAt: timestamp({ ...ro, validation: { isRequired: true } }),
    reason: systemText({ required: true }),
    status: lifecycle(['requested', 'approved', 'rejected'], 'requested'),
    requestedBy: by(),
    decidedBy: by(),
    decidedAt: when(),
    decisionNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

/** One week (Monday to Sunday) for one person: open, submitted, approved (feeds PBJ), exported. */
export const Timecard = list({
  access: scoped(READ),
  ui: { labelField: 'weekStart', listView: { initialColumns: ['staffMember', 'weekStart', 'totalMinutes', 'status'] } },
  fields: {
    community: community(),
    staffMember: relationship({ ref: 'StaffMember', ...ro }),
    weekStart: day(),
    /** { 'yyyy-mm-dd': minutes } worked after unpaid break deductions. */
    dayMinutes: json({ ...ro, defaultValue: {} }),
    totalMinutes: integer({ ...ro, defaultValue: 0 }),
    issues: json({ ...ro, defaultValue: [] }),
    status: lifecycle(['open', 'submitted', 'approved', 'exported'], 'open'),
    submittedBy: by(),
    approvedBy: by(),
    approvedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})

export const PbjQuarter = list({
  access: scoped(REG_READ),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'status', 'dueOn'] } },
  fields: {
    community: community(),
    reference: systemText({ required: true, indexed: 'unique' }),
    federalFiscalYear: integer({ ...ro, validation: { isRequired: true } }),
    quarter: integer({ ...ro, validation: { isRequired: true } }),
    startDate: day(),
    endDate: day(),
    /** 45 days after the quarter ends (CMS PBJ submission deadline). */
    dueOn: day(),
    status: lifecycle(['open', 'validating', 'ready', 'exported', 'submitted', 'accepted', 'rejected'], 'open'),
    validation: json({ ...ro }),
    xml: text({ ...ro, access: { read: () => false, create: () => false, update: () => false }, graphql: { omit: true } }),
    xmlHash: systemText(),
    exportedAt: when(),
    exportedBy: by(),
    submittedAt: when(),
    reportNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

/** The weekly respiratory pathogen and vaccination summary the infection preventionist uploads to NHSN. */
export const NhsnExport = list({
  access: scoped(REG_READ),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'weekStart', 'weekEnd', 'status'] } },
  fields: {
    community: community(),
    reference: systemText({ required: true, indexed: 'unique' }),
    weekStart: day(),
    weekEnd: day(),
    counts: json({ ...ro }),
    problems: json({ ...ro, defaultValue: [] }),
    csv: text({ ...ro, access: { read: () => false, create: () => false, update: () => false }, graphql: { omit: true } }),
    csvHash: systemText(),
    templateNote: systemText(),
    status: lifecycle(['generated', 'uploaded', 'confirmed'], 'generated'),
    generatedBy: by(),
    uploadedAt: when(),
    confirmation: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
