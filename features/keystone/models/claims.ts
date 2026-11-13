import { list } from '@keystone-6/core'
import { bigInt, calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { fixedChoice, lifecycle, systemText, versionField } from './domainFields'
import { phiGatedFields as phiFields } from './phi'
import { phiList, residentList, ro } from './residentAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/*
 * Phase 4b claims (SCHEMA §10.10-10.13, STATE-MACHINES §12.7-12.9). Every row is written by a server command.
 * The 837I is a file staff download and upload; nothing is "sent" or "accepted" without a response file a person uploads.
 */

const CLAIM_READ: Permission[] = ['canReadBilling', 'canManageClaims']

const rl = () => residentList(['community'], ['resident'], CLAIM_READ)
const community = () => relationship({ ref: 'Community', ...ro })
const day = () => calendarDay({ ...ro })
const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const money = (required = false) => ({ validation: { isRequired: required }, ...ro })

export const CLAIM_STATUSES = ['draft', 'validated', 'released', 'submitted', 'accepted', 'rejected', 'paid', 'partially_paid', 'denied', 'appealed', 'finalised', 'cancelled'] as const
export const DENIAL_STATUSES = ['open', 'working', 'appealed', 'resolved', 'written_off'] as const

export const Claim = list({
  access: rl(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'typeOfBill', 'periodFrom', 'periodTo', 'status'] } },
  fields: {
    community: community(),
    resident: relationship({ ref: 'Resident', ...ro }),
    stay: relationship({ ref: 'Stay', ...ro }),
    payer: relationship({ ref: 'Payer', ...ro }),
    coverage: relationship({ ref: 'CoveragePeriod', ...ro }),
    reference: systemText({ indexed: 'unique', required: true }),
    periodFrom: day(),
    periodTo: day(),
    typeOfBill: systemText(),
    frequencyCode: systemText(),
    occurrenceCodes: json({ ...ro, defaultValue: [] }),
    occurrenceSpans: json({ ...ro, defaultValue: [] }),
    valueCodes: json({ ...ro, defaultValue: [] }),
    conditionCodes: json({ ...ro, defaultValue: [] }),
    ...phiFields('Claim', {
      diagnoses: ['clin', json, { ...ro, defaultValue: {} }],
      totalChargesMinor: ['fin', bigInt, money(true)],
      paidMinor: ['fin', bigInt, { ...money(), defaultValue: 0n }],
      exportText: ['ident', text, { ...ro, access: { read: () => false, create: () => false, update: () => false }, graphql: { omit: true } }],
      denial: ['fin', json, ro],
    }),
    status: lifecycle(CLAIM_STATUSES, 'draft'),
    previousClaim: relationship({ ref: 'Claim', ...ro }),
    scrubberResult: json({ ...ro }),
    exportHash: systemText(),
    exportedAt: when(),
    exportedBy: by(),
    uploadedAt: when(),
    uploadedBy: by(),
    validatedBy: by(),
    releasedBy: by(),
    payerClaimNumber: systemText(),
    attendingNpi: systemText(),
    attendingName: systemText(),
    ackStatus: fixedChoice(['none', 'accepted_999', 'rejected_999', 'accepted_277ca', 'rejected_277ca']),
    denialStatus: fixedChoice(['none', ...DENIAL_STATUSES]),
    lines: relationship({ ref: 'ClaimLine.claim', many: true, ...ro }),
    postings: relationship({ ref: 'RemittancePosting.claim', many: true, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Claim')

export const ClaimLine = list({
  access: rl(),
  ui: { labelField: 'revenueCode', listView: { initialColumns: ['claim', 'revenueCode', 'hippsCode', 'serviceFrom', 'units'] } },
  fields: {
    community: community(),
    resident: relationship({ ref: 'Resident', ...ro }),
    claim: relationship({ ref: 'Claim.lines', ...ro }),
    lineNumber: integer({ ...ro, validation: { isRequired: true } }),
    revenueCode: systemText({ required: true }),
    hippsCode: systemText(),
    serviceFrom: day(),
    serviceTo: day(),
    units: integer({ ...ro, validation: { isRequired: true } }),
    ...phiFields('ClaimLine', {
      chargeMinor: ['fin', bigInt, money(true)],
      paidMinor: ['fin', bigInt, { ...money(), defaultValue: 0n }],
    }),
    chargeIds: json({ ...ro, defaultValue: [] }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
phiList('ClaimLine')

/** An 835 the business office uploaded. Idempotent on (payer, trace). */
export const Remittance = list({
  access: scopedGoverned(CLAIM_READ, ['community']),
  ui: { labelField: 'traceNumber', listView: { initialColumns: ['traceNumber', 'payer', 'paymentDate', 'totalPaidMinor', 'status'] } },
  fields: {
    community: community(),
    payer: relationship({ ref: 'Payer', ...ro }),
    traceNumber: systemText({ required: true, indexed: true }),
    paymentDate: day(),
    totalPaidMinor: bigInt({ ...ro, validation: { isRequired: true }, isFilterable: false, isOrderable: false }),
    fileHash: systemText({ required: true }),
    rawText: text({ ...ro, access: { read: () => false, create: () => false, update: () => false }, graphql: { omit: true } }),
    status: lifecycle(['imported', 'matched', 'posted'], 'imported'),
    exceptions: json({ ...ro, defaultValue: [] }),
    claimCount: integer({ ...ro, defaultValue: 0 }),
    importedBy: by(),
    postedBy: by(),
    postedAt: when(),
    postings: relationship({ ref: 'RemittancePosting.remittance', many: true, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

/** Append-only (migration guard). One per claim per remittance; a correction is a reversing posting on a later remittance. */
export const RemittancePosting = list({
  access: rl(),
  ui: { labelField: 'id', listView: { initialColumns: ['remittance', 'claim', 'paidMinor', 'createdAt'] } },
  fields: {
    community: community(),
    resident: relationship({ ref: 'Resident', ...ro }),
    remittance: relationship({ ref: 'Remittance.postings', ...ro }),
    claim: relationship({ ref: 'Claim.postings', ...ro }),
    ...phiFields('RemittancePosting', {
      paidMinor: ['fin', bigInt, money(true)],
      contractualMinor: ['fin', bigInt, { ...money(), defaultValue: 0n }],
      patientResponsibilityMinor: ['fin', bigInt, { ...money(), defaultValue: 0n }],
      otherMinor: ['fin', bigInt, { ...money(), defaultValue: 0n }],
      adjustments: ['fin', json, { ...ro, defaultValue: [] }],
    }),
    chargeIds: json({ ...ro, defaultValue: [] }),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
phiList('RemittancePosting')

/** A vendor invoice for a service that Part A consolidated billing bundles into the stay's claim. */
export const AncillaryInvoice = list({
  access: rl(),
  ui: { labelField: 'invoiceNumber', listView: { initialColumns: ['invoiceNumber', 'vendor', 'resident', 'amountMinor', 'status'] } },
  fields: {
    community: community(),
    resident: relationship({ ref: 'Resident', ...ro }),
    stay: relationship({ ref: 'Stay', ...ro }),
    vendor: systemText({ required: true, indexed: true }),
    invoiceNumber: systemText({ required: true }),
    invoiceDate: day(),
    serviceDate: day(),
    category: fixedChoice(['therapy', 'laboratory', 'radiology', 'pharmacy', 'transport', 'dialysis', 'other']),
    description: systemText(),
    ...phiFields('AncillaryInvoice', { amountMinor: ['fin', bigInt, money(true)] }),
    /** True when the stay is under Part A on the service date: the vendor is paid by the SNF, not billed to Medicare. */
    consolidatedBilling: checkbox({ defaultValue: false, ...ro }),
    claim: relationship({ ref: 'Claim', ...ro }),
    status: lifecycle(['received', 'matched', 'approved', 'paid'], 'received'),
    receivedBy: by(),
    approvedBy: by(),
    paidAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('AncillaryInvoice')
