import { label } from '../../../lib/labels'
import { list } from '@keystone-6/core'
import { bigInt, calendarDay, checkbox, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { fixedChoice, lifecycle, systemText, versionField } from './domainFields'
import { phiFields, tierAllows } from './phi'
import { phiList, residentList, ro } from './residentAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/* Resident trust funds (SCHEMA §11, STATE-MACHINES §13). Money is BigInt minor units. TrustLedgerLine is append-only and every
   transaction balances (debits = credits); a correction is a reversing transaction. Reads need canReadTrust (a billing role does not see balances). */

export const TRUST_BUCKETS = ['bank_control', 'client_liability', 'bank_fee', 'suspense'] as const
export const TRUST_TX_KINDS = ['deposit', 'withdrawal', 'interest', 'bank_fee', 'reversal', 'conveyance'] as const

const TRUST_READ: Permission[] = ['canReadTrust']
const community = () => relationship({ ref: 'Community', ...ro })
const resident = () => relationship({ ref: 'Resident', ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const when = () => timestamp({ ...ro })
const day = () => calendarDay({ ...ro })
const finOk = ({ session }: { session?: any }) => tierAllows(session, 'fin')
const fin = { validation: { isRequired: true }, isFilterable: finOk, isOrderable: finOk, ...ro }
const scoped = () => residentList(['community'], ['resident'], TRUST_READ)

export const TrustAccount = list({
  access: scopedGoverned(TRUST_READ, ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'bankName', 'status'] } },
  fields: {
    community: community(),
    name: text({ validation: { isRequired: true } }),
    bankName: systemText(),
    last4: systemText(),
    status: lifecycle(['active', 'closed'], 'active'),
    version: versionField(),
    ...trackingFields,
  },
})

/** One resident's share of a trust account. The balance is the sum of its lines; there is no stored balance to drift. */
export const ResidentTrustLedger = list({
  access: scoped(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'account', 'status', 'closedOn', 'conveyedOn'] } },
  fields: {
    community: community(),
    resident: resident(),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    reference: systemText({ indexed: 'unique', required: true }),
    status: lifecycle(['open', 'closed', 'conveyed'], 'open'),
    closedOn: day(),
    closedReason: select({ type: 'string', options: ['discharge', 'death', 'transfer'].map(value => ({ label: label(value), value })), ...ro }),
    conveyedOn: day(),
    conveyedTo: systemText(),
    consentOnFile: checkbox({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('ResidentTrustLedger')

/** A deposit or withdrawal. Over the operator threshold a withdrawal needs a second person, who is never the preparer. */
export const TrustTransaction = list({
  access: scoped(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'resident', 'kind', 'amountMinor', 'status', 'preparedBy', 'signedBy'] } },
  fields: {
    community: community(),
    resident: resident(),
    ledger: relationship({ ref: 'ResidentTrustLedger', ...ro }),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(TRUST_TX_KINDS),
    ...phiFields('TrustTransaction', { amountMinor: ['fin', bigInt, fin] }),
    purpose: systemText(),
    status: lifecycle(['pending_signature', 'posted', 'rejected'], 'posted'),
    preparedBy: by(),
    signedBy: by(),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    reverses: relationship({ ref: 'TrustTransaction', ...ro }),
    effectiveOn: day(),
    postedAt: when(),
    lines: relationship({ ref: 'TrustLedgerLine.transaction', many: true, ...ro }),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('TrustTransaction')

export const TrustLedgerLine = list({
  access: scoped(),
  ui: { labelField: 'bucket', listView: { initialColumns: ['transaction', 'bucket', 'side', 'amountMinor', 'effectiveOn'] } },
  fields: {
    community: community(),
    resident: resident(),
    transaction: relationship({ ref: 'TrustTransaction.lines', ...ro }),
    ledger: relationship({ ref: 'ResidentTrustLedger', ...ro }),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    bucket: fixedChoice(TRUST_BUCKETS),
    side: fixedChoice(['debit', 'credit']),
    ...phiFields('TrustLedgerLine', { amountMinor: ['fin', bigInt, fin] }),
    effectiveOn: day(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
phiList('TrustLedgerLine')

/** Three-way tie: bank statement, the account's bank-control balance and the sum of resident ledgers. */
export const TrustReconciliation = list({
  access: scopedGoverned(TRUST_READ, ['community']),
  ui: { labelField: 'month', listView: { initialColumns: ['account', 'month', 'status', 'bankBalanceMinor', 'bookBalanceMinor', 'residentTotalMinor'] } },
  fields: {
    community: community(),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    month: day(),
    bankBalanceMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    bookBalanceMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    residentTotalMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    differenceMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    status: lifecycle(['tied', 'untied', 'signed'], 'untied'),
    detail: json({ ...ro }),
    preparedBy: by(),
    signedBy: by(),
    signedAt: when(),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * The resident's (or representative's) written authorisation for the facility to handle their funds (SCHEMA §11.3, SM §13.1). A
 * withdrawal needs an active authorisation that covers withdrawals, within its per-withdrawal limit when one is set. An authorisation
 * with no limit, or a limit over the pack threshold, waits for a second person with canApproveTrust before it is active.
 */
export const TrustAuthorisation = list({
  access: scoped(),
  ui: { labelField: 'signedOn', listView: { initialColumns: ['resident', 'representative', 'signedOn', 'status'] } },
  fields: {
    community: community(),
    resident: resident(),
    ledger: relationship({ ref: 'ResidentTrustLedger', ...ro }),
    representative: relationship({ ref: 'Representative', ...ro }),
    signedOn: day(),
    kinds: json({ ...ro, defaultValue: [] }),
    ...phiFields('TrustAuthorisation', { perWithdrawalLimitMinor: ['fin', bigInt, { isFilterable: finOk, isOrderable: finOk, ...ro }] }),
    document: relationship({ ref: 'Document', ...ro }),
    status: lifecycle(['pending_approval', 'active', 'rejected', 'revoked'], 'pending_approval'),
    approval: relationship({ ref: 'ApprovalRequest', ...ro }),
    revokedReason: systemText(),
    recordedBy: by(),
    version: versionField(),
    ...trackingFields,
  },
})
phiList('TrustAuthorisation')

/** A quarterly statement of one resident's funds (SCHEMA §11.5), made by a staff button and frozen. Its PDF is built on request. */
export const TrustStatement = list({
  access: scoped(),
  ui: { labelField: 'quarter', listView: { initialColumns: ['resident', 'quarter', 'openingMinor', 'closingMinor', 'generatedAt'] } },
  fields: {
    community: community(),
    resident: resident(),
    ledger: relationship({ ref: 'ResidentTrustLedger', ...ro }),
    quarter: day(),
    ...phiFields('TrustStatement', {
      openingMinor: ['fin', bigInt, fin],
      inMinor: ['fin', bigInt, fin],
      outMinor: ['fin', bigInt, fin],
      closingMinor: ['fin', bigInt, fin],
      lines: ['fin', json, { ...ro }],
    }),
    generatedBy: by(),
    generatedAt: when(),
  },
})
phiList('TrustStatement')

/** The surety bond that assures the security of residents' funds (42 CFR 483.10(f)(10)(vi)). Recording a new one replaces the active one. */
export const SuretyBond = list({
  access: scopedGoverned(TRUST_READ, ['community']),
  ui: { labelField: 'bondNumber', listView: { initialColumns: ['account', 'carrier', 'bondNumber', 'amountMinor', 'expiresOn', 'status'] } },
  fields: {
    community: community(),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    carrier: systemText({ required: true }),
    bondNumber: systemText({ required: true }),
    amountMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    effectiveFrom: day(),
    expiresOn: day(),
    status: lifecycle(['active', 'replaced'], 'active'),
    replacedBy: relationship({ ref: 'SuretyBond', ...ro }),
    recordedBy: by(),
    version: versionField(),
    ...trackingFields,
  },
})

/** One month's bank interest shared across resident ledgers by average daily balance, largest remainder (SM §13.3). Once per account and month. */
export const InterestAllocationRun = list({
  access: scopedGoverned(TRUST_READ, ['community']),
  ui: { labelField: 'month', listView: { initialColumns: ['account', 'month', 'interestMinor', 'method'] } },
  fields: {
    community: community(),
    account: relationship({ ref: 'TrustAccount', ...ro }),
    month: day(),
    interestMinor: bigInt({ ...ro, validation: { isRequired: true } }),
    method: systemText(),
    residualRule: systemText(),
    allocations: json({ ...ro }),
    postedBy: by(),
    createdAt: timestamp({ defaultValue: { kind: 'now' }, ...ro }),
  },
})
