import { list } from '@keystone-6/core'
import { bigInt, calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { permissions } from '../access'
import { tierAllows } from './phi'
import { fixedChoice, lifecycle, systemText, versionField } from './domainFields'
import { phiFields } from './phi'
import { phiList, residentList, ro } from './residentAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/* Rates, billing periods, charges, statements, payments, deposits and Medicaid liability (SCHEMA §10, STATE-MACHINES §12).
   Every row is written by a server command. Charges, allocations and webhook events are append-only (migration guards). */

export const RATE_KINDS = ['apartment_rent', 'room_daily', 'care_level', 'second_person', 'med_management', 'community_fee', 'bed_hold_daily', 'ancillary'] as const
export const CHARGE_KINDS = ['rent', 'second_person', 'room_board', 'care_level', 'per_diem_claim', 'coinsurance', 'patient_liability', 'ancillary', 'bed_hold', 'community_fee', 'late_fee', 'adjustment', 'deposit_application'] as const
export const PAYMENT_METHODS = ['card', 'ach', 'check', 'cash', 'deposit', 'credit', 'other'] as const
export const DEPOSIT_KINDS = ['security', 'pet', 'reservation', 'community_fee', 'other'] as const

const BILLING_READ: Permission[] = ['canReadBilling']
const RATES_READ: Permission[] = ['canReadBilling', 'canManageRates']
const PAYMENTS_READ: Permission[] = ['canReadBilling', 'canManagePayments', 'canPostPayments']

const community = () => relationship({ ref: 'Community', ...ro })
const resident = () => relationship({ ref: 'Resident', ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const when = () => timestamp({ ...ro })
const day = () => calendarDay({ ...ro })
const money = (required = true) => bigInt({ validation: { isRequired: required }, ...ro })
/** A financial amount: unreadable, unfilterable and unsortable without the financial tier (no inference through `where`). */
const finOk = ({ session }: { session?: any }) => tierAllows(session, 'fin')
const fin = { validation: { isRequired: true }, isFilterable: finOk, isOrderable: finOk, ...ro }
const scoped = (read: Permission[]) => residentList(['community'], ['resident'], read)

export const CareLevel = list({
  access: scopedGoverned(RATES_READ, ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'minPoints', 'maxPoints', 'status'] } },
  fields: {
    community: community(),
    code: text({ validation: { isRequired: true } }),
    name: text({ validation: { isRequired: true } }),
    setting: fixedChoice(['assisted_living', 'memory_care']),
    minPoints: integer({ ...ro, validation: { isRequired: true } }),
    maxPoints: integer({ ...ro, validation: { isRequired: true } }),
    status: lifecycle(['active', 'retired'], 'active'),
    version: versionField(),
    ...trackingFields,
  },
})

/** draft → published (maker-checker, action rate.publish) → retired. Lines freeze when published. */
export const RateSchedule = list({
  access: scopedGoverned(RATES_READ, ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'setting', 'effectiveFrom', 'status'] } },
  fields: {
    community: community(),
    name: text({ validation: { isRequired: true } }),
    setting: fixedChoice(['assisted_living', 'memory_care', 'independent_living', 'nursing_facility']),
    effectiveFrom: day(),
    noticeDays: integer({ ...ro, defaultValue: 30, validation: { isRequired: true } }),
    status: lifecycle(['draft', 'published', 'retired'], 'draft'),
    publishedAt: when(),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    lines: relationship({ ref: 'RateLine.schedule', many: true, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})

export const RateLine = list({
  access: scopedGoverned(RATES_READ, ['schedule', 'community']),
  ui: { labelField: 'kind', listView: { initialColumns: ['schedule', 'kind', 'apartmentType', 'careLevel', 'amountMinor', 'per'] } },
  fields: {
    schedule: relationship({ ref: 'RateSchedule.lines', ...ro }),
    kind: fixedChoice(RATE_KINDS),
    apartmentType: relationship({ ref: 'ApartmentType', ...ro }),
    careLevel: relationship({ ref: 'CareLevel', ...ro }),
    amountMinor: money(),
    per: fixedChoice(['month', 'day', 'each']),
    proration: fixedChoice(['actual_days_in_month', 'thirty_day_month', 'daily']),
    ...trackingFields,
  },
})

export const ChargeItem = list({
  access: scopedGoverned(RATES_READ, ['community']),
  ui: { labelField: 'name' },
  fields: {
    community: community(),
    code: text({ validation: { isRequired: true } }),
    name: text({ validation: { isRequired: true } }),
    kind: fixedChoice(['ancillary', 'community_fee', 'late_fee']),
    unitPriceMinor: money(),
    status: lifecycle(['active', 'retired'], 'active'),
    ...trackingFields,
  },
})

/** Assisted-living and memory-care care level from assessment points. An increase needs notice first. */
export const CareLevelAssignment = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'points', listView: { initialColumns: ['resident', 'careLevel', 'points', 'effectiveFrom', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    stay: relationship({ ref: 'Stay', ...ro }),
    careLevel: relationship({ ref: 'CareLevel', ...ro }),
    points: integer({ ...ro, validation: { isRequired: true } }),
    effectiveFrom: day(),
    noticeDeliveredOn: day(),
    /** 'points' (from the assessment) or 'manual' (with a reason). Append-only: a correction supersedes the row. */
    source: systemText(),
    reason: systemText(),
    status: lifecycle(['active', 'superseded'], 'active'),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('CareLevelAssignment')

/** One per community per month. Closing derives and freezes the charges and issues the statements. */
export const BillingPeriod = list({
  access: scopedGoverned(BILLING_READ, ['community']),
  ui: { labelField: 'month', listView: { initialColumns: ['month', 'status', 'statementCount', 'closedAt'] } },
  fields: {
    community: community(),
    month: day(),
    status: lifecycle(['open', 'closed'], 'open'),
    derivationHash: systemText(),
    statementCount: integer({ ...ro, defaultValue: 0 }),
    closedAt: when(),
    closedBy: by(),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * Derived, supersedable charge lines. Unchanged rows are never touched; a changed row is superseded by a new one
 * and a removed row is voided. After a close, the difference is posted as an adjustment in the next open period.
 */
export const Charge = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'description', listView: { initialColumns: ['date', 'resident', 'kind', 'amountMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    stay: relationship({ ref: 'Stay', ...ro }),
    period: relationship({ ref: 'BillingPeriod', ...ro }),
    date: day(),
    kind: fixedChoice(CHARGE_KINDS),
    responsibility: fixedChoice(['resident', 'payer']),
    payerKey: text({ ...ro, isIndexed: true, validation: { isRequired: true } }),
    payer: relationship({ ref: 'Payer', ...ro }),
    description: systemText(),
    ...phiFields('Charge', { amountMinor: ['fin', bigInt, fin] }),
    source: fixedChoice(['derived', 'manual']),
    status: lifecycle(['open', 'posted', 'superseded', 'voided'], 'open'),
    supersededBy: relationship({ ref: 'Charge', ...ro }),
    adjustsCharge: relationship({ ref: 'Charge', ...ro }),
    derivation: json({ ...ro }),
    derivationHash: systemText(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
phiList('Charge')

/** The issued bill for one resident and month. Its lines are a frozen snapshot; later corrections appear on the next statement. */
export const Statement = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'number', listView: { initialColumns: ['number', 'resident', 'period', 'totalMinor', 'paidMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    period: relationship({ ref: 'BillingPeriod', ...ro }),
    number: systemText({ indexed: 'unique', required: true }),
    status: lifecycle(['issued', 'paid', 'void'], 'issued'),
    issuedAt: when(),
    dueOn: day(),
    ...phiFields('Statement', {
      totalMinor: ['fin', bigInt, fin],
      paidMinor: ['fin', bigInt, { ...fin, defaultValue: 0n }],
      /** Posted adjustments and write-offs (BalanceAdjustment); the balance is total − paid − adjusted. */
      adjustedMinor: ['fin', bigInt, { ...fin, defaultValue: 0n }],
      lines: ['fin', json, { ...ro }],
    }),
    chargeHash: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Statement')

const canSeeTokens = ({ session }: { session?: any }) => permissions.canManagePayments({ session })
/** A stored Stripe test payment method. Staff charge it with a button; nothing charges on a schedule. */
export const PaymentMethodToken = list({
  access: scoped(PAYMENTS_READ),
  ui: { labelField: 'last4' },
  fields: {
    community: community(),
    resident: resident(),
    provider: systemText(),
    brand: systemText(),
    last4: systemText(),
    token: text({ access: { read: canSeeTokens, create: () => false, update: () => false }, isFilterable: canSeeTokens, isOrderable: canSeeTokens, ui: ro.ui }),
    autopay: checkbox({ defaultValue: false, ...ro }),
    status: lifecycle(['active', 'removed'], 'active'),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('PaymentMethodToken')

/** pending → succeeded | failed; unknown (a timeout or idempotency_error) → succeeded | failed. One open payment per statement (DB unique index). */
export const Payment = list({
  access: scoped(PAYMENTS_READ),
  ui: { labelField: 'idempotencyKey', listView: { initialColumns: ['resident', 'statement', 'method', 'amountMinor', 'status', 'settledAt'] } },
  fields: {
    community: community(),
    resident: resident(),
    statement: relationship({ ref: 'Statement', ...ro }),
    method: fixedChoice(PAYMENT_METHODS),
    status: lifecycle(['pending', 'unknown', 'succeeded', 'failed'], 'pending'),
    ...phiFields('Payment', { amountMinor: ['fin', bigInt, fin] }),
    currency: systemText(),
    idempotencyKey: systemText({ indexed: 'unique', required: true }),
    providerRef: systemText({ indexed: true }),
    token: relationship({ ref: 'PaymentMethodToken', ...ro }),
    reference: systemText(),
    failureCode: systemText(),
    autopay: checkbox({ defaultValue: false, ...ro }),
    initiatedBy: by(),
    initiatedAt: when(),
    settledAt: when(),
    lastCheckedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Payment')

/** Where a payment landed. Append-only; one per payment. */
export const PaymentAllocation = list({
  access: scoped(PAYMENTS_READ),
  fields: {
    community: community(),
    resident: resident(),
    payment: relationship({ ref: 'Payment', ...ro }),
    statement: relationship({ ref: 'Statement', ...ro }),
    ...phiFields('PaymentAllocation', { amountMinor: ['fin', bigInt, fin] }),
    appliedAt: when(),
  },
})
phiList('PaymentAllocation')

/** Webhook deliveries by provider event id (unique), so a replay changes nothing. */
export const PaymentEvent = list({
  access: scopedGoverned(['canManagePayments'], ['community']),
  fields: {
    community: community(),
    providerEventId: systemText({ indexed: 'unique', required: true }),
    type: systemText(),
    payment: relationship({ ref: 'Payment', ...ro }),
    outcome: systemText(),
    receivedAt: when(),
  },
})

/** A refund never reopens a paid statement's balance: it is its own row. */
export const Refund = list({
  access: scoped(PAYMENTS_READ),
  ui: { labelField: 'reason', listView: { initialColumns: ['resident', 'payment', 'amountMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    payment: relationship({ ref: 'Payment', ...ro }),
    deposit: relationship({ ref: 'Deposit', ...ro }),
    credit: relationship({ ref: 'ResidentCredit', ...ro }),
    ...phiFields('Refund', { amountMinor: ['fin', bigInt, fin] }),
    reason: systemText({ required: true }),
    status: lifecycle(['requested', 'pending_approval', 'issued', 'rejected'], 'requested'),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    refundRef: systemText(),
    requestedBy: by(),
    issuedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Refund')

export const Deposit = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'kind', listView: { initialColumns: ['resident', 'kind', 'amountMinor', 'status', 'receivedOn'] } },
  fields: {
    community: community(),
    resident: resident(),
    kind: fixedChoice(DEPOSIT_KINDS),
    ...phiFields('Deposit', { amountMinor: ['fin', bigInt, fin] }),
    method: fixedChoice(PAYMENT_METHODS),
    status: lifecycle(['held', 'applied', 'refunded', 'forfeited'], 'held'),
    receivedOn: day(),
    appliedPayment: relationship({ ref: 'Payment', ...ro }),
    resolvedAt: when(),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('Deposit')

/** Monthly patient liability for a Medicaid resident. A correction is a new row; the old one becomes superseded. */
export const MedicaidLiability = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'month', listView: { initialColumns: ['resident', 'month', 'liabilityMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    stay: relationship({ ref: 'Stay', ...ro }),
    month: day(),
    ...phiFields('MedicaidLiability', { liabilityMinor: ['fin', bigInt, fin] }),
    status: lifecycle(['expected', 'determined', 'appealed', 'superseded'], 'expected'),
    noticeReceivedOn: day(),
    infoRequestedOn: day(),
    infoRespondedOn: day(),
    appealFiledOn: day(),
    supersededBy: relationship({ ref: 'MedicaidLiability', ...ro }),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('MedicaidLiability')

/** Money received that no statement balance could take (a card settling after a check paid the bill). It is shown on the statement and resident screens and is applied to a later statement or refunded; never silent. */
export const ResidentCredit = list({
  access: scoped(PAYMENTS_READ),
  ui: { labelField: 'status', listView: { initialColumns: ['resident', 'payment', 'amountMinor', 'remainingMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    payment: relationship({ ref: 'Payment', ...ro }),
    ...phiFields('ResidentCredit', { amountMinor: ['fin', bigInt, fin], remainingMinor: ['fin', bigInt, fin] }),
    status: lifecycle(['open', 'closed'], 'open'),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('ResidentCredit')

/** A manual adjustment or write-off of part of a statement's balance. At or above the operator threshold it waits for a second person with canApproveWriteOffs. Never edited: a correction supersedes it. */
export const BalanceAdjustment = list({
  access: scoped(BILLING_READ),
  ui: { labelField: 'kind', listView: { initialColumns: ['resident', 'statement', 'kind', 'amountMinor', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    statement: relationship({ ref: 'Statement', ...ro }),
    kind: fixedChoice(['adjustment', 'write_off']),
    ...phiFields('BalanceAdjustment', { amountMinor: ['fin', bigInt, fin] }),
    reason: systemText({ required: true }),
    status: lifecycle(['pending_approval', 'posted', 'rejected', 'superseded'], 'pending_approval'),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    supersedes: relationship({ ref: 'BalanceAdjustment', ...ro }),
    requestedBy: by(),
    postedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('BalanceAdjustment')
