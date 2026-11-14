import type { Permission } from '../access'
import type { Actor } from '../lib/actor'
import { delegateOf, type Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { adjustClosedPeriod, closePeriod, runDerivation } from '../billing/period'
import * as pay from '../billing/payments'
import * as rates from '../billing/rates'
import * as medicaid from '../billing/medicaid'
import * as adjustments from '../billing/adjustments'
import { assignCareLevel } from '../billing/careLevel'
import * as trust from '../trust/service'
import * as trustMore from '../trust/more'
import * as plans from '../billing/plans'
import * as mcdApp from '../billing/medicaidApplication'
import { minorOf } from '../lib/money'
import * as mds from '../mds/service'
import * as cov from '../coverage/service'
import * as claims from '../claims/service'
import * as pbj from '../pbj/service'
import * as sched from '../scheduling/service'
import { actorFor } from './actorFor'
import { assertCommunityAccess, assertHuman, authorize, runDomain } from './run'
import { requireKey } from './op'
import { cardConfigured, readCardSetup, startCardSetup } from '../../integrations/payment'
import { command } from '../lib/command'
import { auditCreate } from '../lib/cas'

/**
 * The Phase 3 command surface: private pay, deposits, statements, resident trust and Medicaid liability. Every entry checks
 * its permission and the actor's community assignment before it runs. Money arrives as text and is parsed to BigInt here.
 * Month-end close, derivation and autopay are staff buttons: nothing here runs on a timer.
 */

type Input = Record<string, any>
type Handler = {
  permissions: Permission[]
  community: (tx: Tx, input: Input) => Promise<string | null>
  run: (uow: UnitOfWork, actor: Actor, input: Input) => Promise<unknown>
  serializable?: boolean
  /** Network work that cannot sit inside the database transaction (a processor call): it commits its own steps. */
  external?: (db: any, actor: Actor, input: Input) => Promise<unknown>
}

const money = (value: unknown, field: string) => {
  try {
    return minorOf(value)
  } catch {
    throw new DomainError(Codes.INVALID_INPUT, `The ${field} must be a whole number of cents.`, { field })
  }
}
const byCommunity = async (_tx: Tx, i: Input) => (i.communityId ? String(i.communityId) : null)
const byRecord = (model: string, field: string) => async (tx: Tx, i: Input) => {
  const id = i[field]
  if (typeof id !== 'string' || !id) return null
  const row = (await delegateOf(tx, model).findUnique({ where: { id }, select: { communityId: true } })) as { communityId: string | null } | null
  return row?.communityId ?? null
}
const byLedger = byRecord('ResidentTrustLedger', 'ledgerId')
const byStatement = byRecord('Statement', 'statementId')

const BILLING: Permission[] = ['canManageBilling']
const RATES: Permission[] = ['canManageRates']
const PAYMENTS: Permission[] = ['canPostPayments', 'canManagePayments']
const ADJUST: Permission[] = ['canManageBilling']
const TRUST_OP: Permission[] = ['canOperateTrust']
const TRUST_SIGN: Permission[] = ['canApproveTrust']
const MDS: Permission[] = ['canManageAssessments']
const MDS_SUBMIT: Permission[] = ['canSubmitRegulatory']
const COVERAGE: Permission[] = ['canManageBilling', 'canManageAssessments']
const CLAIMS: Permission[] = ['canManageClaims']
const CLAIM_RELEASE: Permission[] = ['canReleaseClaims']
const POSTING: Permission[] = ['canPostPayments']
const TIME: Permission[] = ['canManageTimecards']
const TIME_APPROVE: Permission[] = ['canApproveTimecards']
const PEOPLE: Permission[] = ['canManagePeople']
const REGULATORY: Permission[] = ['canSubmitRegulatory']
const SCHEDULE: Permission[] = ['canManageSchedule']
const CREDENTIALS: Permission[] = ['canManageCredentials']
const bigint = (v: unknown, f: string) => money(v, f)
const byMds = byRecord('MdsAssessment', 'assessmentId')
const byCoverage = async (tx: Tx, i: Input) => {
  const id = i.coverageId
  if (typeof id !== 'string' || !id) return null
  const row = await tx.coveragePeriod.findUnique({ where: { id }, select: { stay: { select: { communityId: true } } } })
  return row?.stay?.communityId ?? null
}

export const HANDLERS: Record<string, Handler> = {
  // Billing periods
  'billing.derive': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => runDerivation(u, a, { communityId: i.communityId, month: i.month }) },
  'billing.close': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => closePeriod(u, a, { communityId: i.communityId, month: i.month }) },
  'billing.adjust_closed': { permissions: BILLING, community: byCommunity, serializable: true, run: (u, a, i) => adjustClosedPeriod(u, a, { communityId: i.communityId, month: i.month }) },

  // Rates
  'rate.create': { permissions: RATES, community: byCommunity, run: (u, a, i) => rates.createSchedule(u, a, i as never) },
  'rate.add_line': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.addRateLine(u, a, { scheduleId: i.scheduleId, kind: i.kind, per: i.per, proration: i.proration, apartmentTypeId: i.apartmentTypeId, careLevelId: i.careLevelId, amountMinor: money(i.amountMinor, 'rate') }) },
  'rate.request_publish': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.requestPublish(u, a, { scheduleId: i.scheduleId }) },
  'rate.notice_delivered': { permissions: RATES, community: byRecord('RateSchedule', 'scheduleId'), run: (u, a, i) => rates.recordRateNoticeDelivery(u, a, { scheduleId: i.scheduleId, residentId: i.residentId, method: i.method, deliveredAt: new Date(i.deliveredAt) }) },

  // Payments recorded by hand, deposits and refunds
  'payment.record': { permissions: PAYMENTS, community: byStatement, serializable: true, run: (u, a, i) => pay.recordHandPayment(u, a, { statementId: i.statementId, method: i.method, amountMinor: money(i.amountMinor, 'amount'), reference: i.reference }) },
  'deposit.receive': {
    permissions: PAYMENTS, community: byCommunity,
    run: async (u, a, i) => {
      const amount = money(i.amountMinor, 'amount')
      if (amount <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The deposit must be more than zero.', { field: 'amount' })
      const created = await u.tx.deposit.create({ data: { communityId: i.communityId, residentId: i.residentId, kind: i.kind, amountMinor: amount, method: i.method, status: 'held', receivedOn: new Date(`${String(i.receivedOn).slice(0, 10)}T00:00:00Z`), note: i.note ?? '' } })
      u.audit({ eventType: 'deposit.received', entityType: 'Deposit', entityId: created.id, after: { kind: i.kind, amountMinor: amount.toString() } })
      return { depositId: created.id }
    },
  },
  'deposit.apply': { permissions: PAYMENTS, community: byRecord('Deposit', 'depositId'), serializable: true, run: (u, a, i) => pay.applyDeposit(u, a, { depositId: i.depositId, statementId: i.statementId }) },
  'deposit.forfeit': { permissions: ['canIssueRefunds'], community: byRecord('Deposit', 'depositId'), serializable: true, run: (u, a, i) => pay.requestForfeit(u, a, { depositId: i.depositId, reason: String(i.reason ?? '') }) },
  'credit.apply': { permissions: PAYMENTS, community: byRecord('ResidentCredit', 'creditId'), serializable: true, run: (u, a, i) => pay.applyCredit(u, a, { creditId: i.creditId, statementId: i.statementId }) },
  'adjustment.create': { permissions: ADJUST, community: byStatement, serializable: true, run: (u, a, i) => adjustments.requestBalanceChange(u, a, { kind: 'adjustment', statementId: i.statementId, amountMinor: money(i.amountMinor, 'amount'), reason: String(i.reason ?? ''), supersedesId: i.supersedesId }) },
  'writeoff.create': { permissions: ADJUST, community: byStatement, serializable: true, run: (u, a, i) => adjustments.requestBalanceChange(u, a, { kind: 'write_off', statementId: i.statementId, amountMinor: money(i.amountMinor, 'amount'), reason: String(i.reason ?? ''), supersedesId: i.supersedesId }) },
  'care_level.assign': { permissions: BILLING, community: byRecord('Stay', 'stayId'), serializable: true, run: (u, a, i) => assignCareLevel(u, a, { stayId: i.stayId, points: i.points === undefined || i.points === null ? null : Number(i.points), careLevelId: i.careLevelId, effectiveFrom: i.effectiveFrom, noticeDeliveredOn: i.noticeDeliveredOn, reason: i.reason }) },
  'refund.request': { permissions: ['canIssueRefunds', 'canManagePayments'], community: async (tx, i) => (i.paymentId ? byRecord('Payment', 'paymentId')(tx, i) : i.creditId ? byRecord('ResidentCredit', 'creditId')(tx, i) : byRecord('Deposit', 'depositId')(tx, i)), serializable: true, run: (u, a, i) => pay.requestRefund(u, a, { paymentId: i.paymentId, depositId: i.depositId, creditId: i.creditId, amountMinor: money(i.amountMinor, 'amount'), reason: String(i.reason ?? '') }) },

  // Card and ACH (Stripe test), each running its own committed steps
  'payment.charge': {
    permissions: ['canManagePayments'], community: byStatement, run: async () => ({}),
    external: (db, a, i) => pay.chargeStatement(db, a, { statementId: i.statementId, method: i.method === 'ach' ? 'ach' : 'card', amountMinor: money(i.amountMinor, 'amount'), tokenId: i.tokenId, idempotencyKey: String(i.__key) }),
  },
  // Keep a card on file for a resident: card.setup makes the Stripe customer + SetupIntent, the browser confirms it with Stripe Elements,
  // card.save reads it back from Stripe and stores the payment method id (never the number)
  'card.setup': {
    permissions: ['canManagePayments'], community: byRecord('Resident', 'residentId'), run: async () => ({}),
    external: async (db, _a, i) => {
      const resident = await db.resident.findUnique({ where: { id: String(i.residentId ?? '') }, select: { id: true, firstName: true, lastName: true } })
      if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
      const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? ''
      if (!cardConfigured() || !publishableKey) throw new DomainError(Codes.GUARD_FAILED, 'Card payments are not set up on this server. Record the payment by hand.', { reason: 'no_processor' })
      const started = await startCardSetup({ idempotencyKey: String(i.__key), name: `${resident.firstName} ${resident.lastName}`.trim() || 'Resident account', metadata: { resident: resident.id } })
      if (!started.ok) throw new DomainError(Codes.GUARD_FAILED, started.message, { reason: 'card_not_started' })
      return { clientSecret: started.clientSecret, setupIntentId: started.setupIntentId, publishableKey }
    },
  },
  'card.save': {
    permissions: ['canManagePayments'], community: byRecord('Resident', 'residentId'), run: async () => ({}),
    external: async (db, a, i) => {
      const resident = await db.resident.findUnique({ where: { id: String(i.residentId ?? '') }, select: { id: true, communityId: true } })
      if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
      const card = await readCardSetup(String(i.setupIntentId ?? ''), { resident: resident.id })
      if (!card.ok) throw new DomainError(Codes.GUARD_FAILED, card.message, { reason: 'card_not_saved' })
      const autopay = i.autopay === true || i.autopay === 'true'
      const done = await command(db, { name: 'card.save', actor: a, idempotencyKey: String(i.__key), params: { residentId: resident.id, paymentMethod: card.paymentMethod, autopay } }, async uow => {
        const token = await uow.tx.paymentMethodToken.create({ data: { communityId: resident.communityId, residentId: resident.id, provider: 'card', brand: card.brand, last4: card.last4, token: card.paymentMethod, autopay, status: 'active' } })
        auditCreate(uow, a, 'PaymentMethodToken', token.id, 'payment_method.saved', { brand: card.brand, last4: card.last4, autopay })
        return { tokenId: token.id, brand: card.brand, last4: card.last4 }
      })
      return done.value
    },
  },
  'payment.check_status': { permissions: ['canManagePayments'], community: byRecord('Payment', 'paymentId'), run: async () => ({}), external: (db, a, i) => pay.checkPaymentStatus(db, a, i.paymentId) },
  'refund.issue': { permissions: ['canIssueRefunds'], community: byRecord('Refund', 'refundId'), run: async () => ({}), external: (db, a, i) => pay.issueRefund(db, a, i.refundId) },
  // Payment plans: charging an instalment and retrying a declined one are separate staff buttons; nothing charges on its own
  'plan.create': { permissions: ['canManagePayments'], community: byStatement, serializable: true, run: (u, a, i) => plans.createPlan(u, a, { statementId: i.statementId, instalments: Number(i.instalments), firstDueOn: String(i.firstDueOn ?? '') }) },
  'plan.cancel': { permissions: ['canManagePayments'], community: byRecord('PaymentPlan', 'planId'), run: (u, a, i) => plans.cancelPlan(u, a, { planId: i.planId, reason: String(i.reason ?? '') }) },
  'plan.charge_instalment': { permissions: ['canManagePayments'], community: byRecord('PaymentPlanInstalment', 'instalmentId'), run: async () => ({}), external: (db, a, i) => plans.chargeInstalment(db, a, { instalmentId: i.instalmentId, tokenId: i.tokenId ?? null, retry: false, idempotencyKey: String(i.__key) }) },
  'plan.retry_instalment': { permissions: ['canManagePayments'], community: byRecord('PaymentPlanInstalment', 'instalmentId'), run: async () => ({}), external: (db, a, i) => plans.chargeInstalment(db, a, { instalmentId: i.instalmentId, tokenId: i.tokenId ?? null, retry: true, idempotencyKey: String(i.__key) }) },
  'billing.autopay': { permissions: ['canManagePayments'], community: byRecord('BillingPeriod', 'periodId'), run: async () => ({}), external: (db, a, i) => pay.chargeAutopayForPeriod(db, a, { periodId: i.periodId }) },

  // Medicaid liability
  'medicaid.record': { permissions: BILLING, community: byRecord('Stay', 'stayId'), run: (u, a, i) => medicaid.recordLiability(u, a, { stayId: i.stayId, month: i.month, liabilityMinor: money(i.liabilityMinor, 'liability'), noticeReceivedOn: i.noticeReceivedOn, note: i.note }) },
  'medicaid.info_request': { permissions: BILLING, community: byRecord('MedicaidLiability', 'liabilityId'), run: (u, a, i) => medicaid.recordInfoRequest(u, a, { liabilityId: i.liabilityId, kind: i.kind, on: i.on }) },
  'medicaid.appeal': { permissions: BILLING, community: byRecord('MedicaidLiability', 'liabilityId'), run: (u, a, i) => medicaid.fileAppeal(u, a, { liabilityId: i.liabilityId, filedOn: i.filedOn }) },

  // Medicaid applications and the patient liability schedule (with the personal needs allowance)
  'medicaid_app.start': { permissions: BILLING, community: byRecord('Stay', 'stayId'), run: (u, a, i) => mcdApp.startApplication(u, a, { stayId: i.stayId, requestedFrom: i.requestedFrom, state: i.state, caseworker: i.caseworker, note: i.note }) },
  'medicaid_app.advance': { permissions: BILLING, community: byRecord('MedicaidApplication', 'applicationId'), run: (u, a, i) => mcdApp.advanceApplication(u, a, { applicationId: i.applicationId, step: i.step, on: i.on, dueOn: i.dueOn, effectiveOn: i.effectiveOn, note: i.note }) },
  'liability_schedule.record': {
    permissions: BILLING, community: byRecord('Resident', 'residentId'), serializable: true,
    run: (u, a, i) => mcdApp.recordSchedule(u, a, { residentId: i.residentId, stayId: i.stayId || null, applicationId: i.applicationId || null, monthlyAmountMinor: money(i.monthlyAmountMinor, 'liability'), personalNeedsAllowanceMinor: money(i.personalNeedsAllowanceMinor ?? 0, 'personal needs allowance'), effectiveFrom: i.effectiveFrom, note: i.note }),
  },

  // Phase 4a: MDS 3.0 and PDPM (STATE-MACHINES §6.1-§6.4)
  'mds.load_reference': { permissions: MDS, community: async () => null, run: (u, a) => mds.loadMdsReference(u, a) },
  'mds.open': { permissions: MDS, community: byRecord('Stay', 'stayId'), run: (u, a, i) => mds.openMds(u, a, { stayId: i.stayId, kind: i.kind, ardDate: i.ardDate }) },
  'mds.save_items': { permissions: MDS, community: byMds, run: (u, a, i) => mds.saveMdsItems(u, a, { assessmentId: i.assessmentId, items: i.items ?? Object.fromEntries(Object.entries(i).filter(([k]) => /^[A-Z][A-Z0-9_]+$/.test(k))), expectedVersion: i.expectedVersion }) },
  'mds.sign_sections': { permissions: MDS, community: byMds, run: (u, a, i) => mds.signMdsSections(u, a, { assessmentId: i.assessmentId, sections: i.sections, title: i.title, name: i.name }) },
  'mds.complete': { permissions: MDS, community: byMds, serializable: true, run: (u, a, i) => mds.completeMds(u, a, { assessmentId: i.assessmentId, completedOn: i.completedOn, aids: i.aids === true || i.aids === 'true' }) },
  'mds.correct': { permissions: MDS, community: byMds, run: (u, a, i) => mds.correctMds(u, a, { assessmentId: i.assessmentId, reason: i.reason }) },
  'mds.entered_in_error': { permissions: MDS, community: byMds, run: (u, a, i) => mds.markMdsInError(u, a, { assessmentId: i.assessmentId, reason: i.reason }) },
  'mds.export': { permissions: MDS_SUBMIT, community: byCommunity, serializable: true, run: (u, a, i) => mds.exportMds(u, a, { communityId: i.communityId, assessmentIds: i.assessmentIds }) },
  'mds.mark_uploaded': { permissions: MDS_SUBMIT, community: byRecord('MdsSubmission', 'submissionId'), run: (u, a, i) => mds.markUploaded(u, a, { submissionId: i.submissionId }) },
  'mds.record_fvr': { permissions: MDS_SUBMIT, community: byRecord('MdsSubmission', 'submissionId'), serializable: true, run: (u, a, i) => mds.recordFvr(u, a, { submissionId: i.submissionId, text: i.text }) },

  // Phase 4a: Medicare Part A depth, hospice and Medicare Advantage (STATE-MACHINES §5.5)
  'coverage.change_payer': { permissions: ['canManageBilling'], community: byRecord('Stay', 'stayId'), serializable: true, run: (u, a, i) => cov.changePayer(u, a, i as never) },
  'coverage.qualifying_stay': { permissions: COVERAGE, community: byCoverage, run: (u, a, i) => cov.recordQualifyingStay(u, a, { coverageId: i.coverageId, from: i.from, to: i.to, hospital: i.hospital, evidenceNote: i.evidenceNote, documentTitle: i.documentTitle }) },
  'coverage.skilled_cert': { permissions: COVERAGE, community: byCoverage, run: (u, a, i) => cov.recordSkilledCert(u, a, { coverageId: i.coverageId, signedOn: i.signedOn, signedBy: i.signedBy }) },
  'coverage.prior_days': { permissions: COVERAGE, community: byRecord('Resident', 'residentId'), run: (u, a, i) => cov.recordPriorDays(u, a, { residentId: i.residentId, source: i.source, daysUsed: i.daysUsed, asOf: i.asOf, spellStart: i.spellStart, note: i.note }) },
  'coverage.last_covered_day': { permissions: COVERAGE, community: byCoverage, run: (u, a, i) => cov.setLastCoveredDay(u, a, { coverageId: i.coverageId, lastCoveredDay: i.lastCoveredDay, reason: i.reason }) },
  'coverage.notice': { permissions: COVERAGE, community: byCoverage, run: (u, a, i) => cov.recordCoverageNotice(u, a, { coverageId: i.coverageId, kind: i.kind, deliveredOn: i.deliveredOn, method: i.method, acknowledgement: i.acknowledgement, recipientRepresentativeId: i.recipientRepresentativeId, note: i.note }) },
  'coverage.hospice_revoke': { permissions: ['canManageBilling'], community: byCoverage, serializable: true, run: (u, a, i) => cov.revokeHospice(u, a, { coverageId: i.coverageId, revokedOn: i.revokedOn, nextPayerId: i.nextPayerId, memberReference: i.memberReference }) },
  'coverage.benefit_recount': { permissions: COVERAGE, community: byRecord('Resident', 'residentId'), run: (u, a, i) => cov.recountBenefitPeriod(u, a, { residentId: i.residentId }) },
  'authorisation.request': { permissions: COVERAGE, community: byCoverage, run: (u, a, i) => cov.requestAuthorisation(u, a, { coverageId: i.coverageId, requestedOn: i.requestedOn, levelOfCare: i.levelOfCare, payerAuthNumber: i.payerAuthNumber, reviewIntervalDays: i.reviewIntervalDays, note: i.note }) },
  'authorisation.decide': { permissions: COVERAGE, community: byRecord('Authorisation', 'authorisationId'), run: (u, a, i) => cov.decideAuthorisation(u, a, { authorisationId: i.authorisationId, decision: i.decision, authFrom: i.authFrom, authTo: i.authTo, payerAuthNumber: i.payerAuthNumber }) },
  'authorisation.review': { permissions: COVERAGE, community: byRecord('Authorisation', 'authorisationId'), run: (u, a, i) => cov.recordReview(u, a, { authorisationId: i.authorisationId, reviewedOn: i.reviewedOn, outcome: i.outcome, newAuthTo: i.newAuthTo, reviewer: i.reviewer, note: i.note }) },

  // Resident trust
  'trust.authorisation_record': {
    permissions: TRUST_OP, community: byLedger,
    run: (u, a, i) => trustMore.recordAuthorisation(u, a, { ledgerId: i.ledgerId, representativeId: i.representativeId || null, signedOn: i.signedOn, kinds: Array.isArray(i.kinds) ? i.kinds : String(i.kinds ?? '').split(',').map(k => k.trim()).filter(Boolean), perWithdrawalLimitMinor: i.perWithdrawalLimitMinor === undefined || i.perWithdrawalLimitMinor === null || i.perWithdrawalLimitMinor === '' ? null : money(i.perWithdrawalLimitMinor, 'limit'), documentId: i.documentId || null }),
  },
  'trust.authorisation_revoke': { permissions: TRUST_OP, community: byRecord('TrustAuthorisation', 'authorisationId'), run: (u, a, i) => trustMore.revokeAuthorisation(u, a, { authorisationId: i.authorisationId, reason: String(i.reason ?? '') }) },
  'trust.allocate_interest': { permissions: TRUST_OP, community: byRecord('TrustAccount', 'accountId'), serializable: true, run: (u, a, i) => trustMore.allocateAccountInterest(u, a, { accountId: i.accountId, month: i.month, interestMinor: money(i.interestMinor, 'interest') }) },
  'trust.quarterly_statements': { permissions: TRUST_OP, community: byRecord('TrustAccount', 'accountId'), run: (u, a, i) => trustMore.generateQuarterForAccount(u, a, { accountId: i.accountId, quarter: i.quarter }) },
  'trust.record_bond': { permissions: TRUST_SIGN, community: byRecord('TrustAccount', 'accountId'), run: (u, a, i) => trustMore.recordSuretyBond(u, a, { accountId: i.accountId, carrier: String(i.carrier ?? ''), bondNumber: String(i.bondNumber ?? ''), amountMinor: money(i.amountMinor, 'bond amount'), effectiveFrom: i.effectiveFrom, expiresOn: i.expiresOn }) },
  'trust.open_ledger': { permissions: TRUST_OP, community: byCommunity, run: (u, a, i) => trust.openLedger(u, a, { communityId: i.communityId, residentId: i.residentId, accountId: i.accountId, consentOnFile: i.consentOnFile === true }) },
  'trust.deposit': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.recordDeposit(u, a, { ledgerId: i.ledgerId, amountMinor: money(i.amountMinor, 'amount'), purpose: i.purpose, effectiveOn: i.effectiveOn }) },
  'trust.withdraw': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.prepareWithdrawal(u, a, { ledgerId: i.ledgerId, amountMinor: money(i.amountMinor, 'amount'), purpose: String(i.purpose ?? ''), effectiveOn: i.effectiveOn }) },
  'trust.sign': { permissions: TRUST_SIGN, community: byRecord('TrustTransaction', 'transactionId'), serializable: true, run: (u, a, i) => trust.signWithdrawal(u, a, { transactionId: i.transactionId }) },
  'trust.reject': { permissions: TRUST_SIGN, community: byRecord('TrustTransaction', 'transactionId'), run: (u, a, i) => trust.rejectWithdrawal(u, a, { transactionId: i.transactionId, reason: String(i.reason ?? '') }) },
  'trust.reverse': { permissions: TRUST_OP, community: byRecord('TrustTransaction', 'transactionId'), serializable: true, run: (u, a, i) => trust.reverseTransaction(u, a, { transactionId: i.transactionId, reason: String(i.reason ?? '') }) },
  'trust.close_ledger': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.closeLedger(u, a, { ledgerId: i.ledgerId, reason: i.reason, closedOn: i.closedOn }) },
  'trust.convey': { permissions: TRUST_OP, community: byLedger, serializable: true, run: (u, a, i) => trust.conveyBalance(u, a, { ledgerId: i.ledgerId, conveyedTo: String(i.conveyedTo ?? ''), effectiveOn: i.effectiveOn }) },
  'trust.reconcile': { permissions: TRUST_OP, community: byRecord('TrustAccount', 'accountId'), serializable: true, run: (u, a, i) => trust.prepareReconciliation(u, a, { accountId: i.accountId, month: i.month, bankBalanceMinor: money(i.bankBalanceMinor, 'bank balance') }) },
  'trust.sign_reconciliation': { permissions: TRUST_SIGN, community: byRecord('TrustReconciliation', 'reconciliationId'), run: (u, a, i) => trust.signReconciliation(u, a, { reconciliationId: i.reconciliationId }) },
  // Claims (Phase 4b). Nothing is transmitted: the 837I is a file a person uploads, and every response is a file a person uploads back.
  'claim.billing_profile': { permissions: CLAIMS, community: byCommunity, run: (u, a, i) => claims.saveBillingProfile(u, a, { communityId: i.communityId, npi: i.npi, taxId: i.taxId, taxonomy: i.taxonomy, zip4: i.zip4, ccn: i.ccn, payerId: i.payerId, electronicPayerId: i.electronicPayerId }) },
  'claim.create_month': { permissions: CLAIMS, community: byCommunity, serializable: true, run: (u, a, i) => claims.createClaimsForMonth(u, a, { communityId: i.communityId, month: String(i.month ?? '') }) },
  'claim.set_clinical': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.setClaimClinical(u, a, { claimId: i.claimId, attendingNpi: i.attendingNpi, attendingName: i.attendingName, principal: i.principal, other: i.other }) },
  'claim.validate': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.validateClaim(u, a, { claimId: i.claimId }) },
  'claim.release': { permissions: CLAIM_RELEASE, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.releaseClaim(u, a, { claimId: i.claimId }) },
  'claim.export': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.exportClaim(u, a, { claimId: i.claimId }) },
  'claim.mark_submitted': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.markSubmitted(u, a, { claimId: i.claimId, exportHash: String(i.exportHash ?? '') }) },
  'claim.cancel': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.cancelClaim(u, a, { claimId: i.claimId, reason: String(i.reason ?? '') }) },
  'claim.upload_ack': { permissions: CLAIMS, community: byCommunity, run: (u, a, i) => claims.recordAcknowledgement(u, a, { communityId: i.communityId, text: String(i.text ?? ''), claimId: i.claimId || null }) },
  'claim.work_denial': { permissions: CLAIMS, community: byRecord('Claim', 'claimId'), run: (u, a, i) => claims.workDenial(u, a, { claimId: i.claimId, to: String(i.to ?? ''), note: String(i.note ?? '') }) },
  'remittance.import': { permissions: POSTING, community: byCommunity, serializable: true, run: (u, a, i) => claims.importRemittance(u, a, { communityId: i.communityId, payerId: String(i.payerId ?? ''), text: String(i.text ?? '') }) },
  'remittance.post': { permissions: POSTING, community: byRecord('Remittance', 'remittanceId'), serializable: true, run: (u, a, i) => claims.postRemittance(u, a, { remittanceId: i.remittanceId }) },
  'ancillary.receive': { permissions: CLAIMS, community: byCommunity, run: (u, a, i) => claims.receiveInvoice(u, a, { communityId: i.communityId, stayId: i.stayId, vendor: String(i.vendor ?? ''), invoiceNumber: String(i.invoiceNumber ?? ''), invoiceDate: i.invoiceDate, serviceDate: i.serviceDate, category: String(i.category ?? 'other'), description: i.description, amountMinor: bigint(i.amountMinor, 'amount') }) },
  'ancillary.match': { permissions: CLAIMS, community: byRecord('AncillaryInvoice', 'invoiceId'), run: (u, a, i) => claims.matchInvoice(u, a, { invoiceId: i.invoiceId }) },
  'ancillary.approve': { permissions: CLAIM_RELEASE, community: byRecord('AncillaryInvoice', 'invoiceId'), run: (u, a, i) => claims.approveInvoice(u, a, { invoiceId: i.invoiceId }) },
  'ancillary.pay': { permissions: POSTING, community: byRecord('AncillaryInvoice', 'invoiceId'), run: (u, a, i) => claims.payInvoice(u, a, { invoiceId: i.invoiceId }) },

  // Workforce, PBJ and NHSN (Phase 4b)
  'workforce.job_code': { permissions: PEOPLE, community: byCommunity, run: (u, a, i) => pbj.saveJobCode(u, a, { communityId: i.communityId, code: String(i.code ?? ''), title: String(i.title ?? ''), pbjJobTitleCode: i.pbjJobTitleCode || null, countsTowardNursing: Boolean(i.countsTowardNursing), category: i.category || null }) },
  'workforce.staff': { permissions: PEOPLE, community: byCommunity, run: (u, a, i) => pbj.saveStaffMember(u, a, { communityId: i.communityId, employeeId: String(i.employeeId ?? ''), name: String(i.name ?? ''), jobCodeId: i.jobCodeId, payType: String(i.payType ?? ''), agency: Boolean(i.agency), agencyVendorId: i.agencyVendorId || null, hireDate: i.hireDate || null, terminationDate: i.terminationDate || null, userId: i.userId || null }) },
  'workforce.import_punches': { permissions: TIME, community: byCommunity, run: (u, a, i) => pbj.importPunches(u, a, { communityId: i.communityId, csv: String(i.csv ?? '') }) },
  'workforce.request_correction': { permissions: TIME, community: byRecord('StaffMember', 'staffMemberId'), run: (u, a, i) => pbj.requestCorrection(u, a, { staffMemberId: i.staffMemberId, kind: String(i.kind ?? ''), observedAt: String(i.observedAt ?? ''), reason: String(i.reason ?? '') }) },
  'workforce.decide_correction': { permissions: TIME_APPROVE, community: byRecord('TimeCorrection', 'correctionId'), run: (u, a, i) => pbj.decideCorrection(u, a, { correctionId: i.correctionId, decision: i.decision, note: i.note }) },
  'timecard.build': { permissions: TIME, community: byRecord('StaffMember', 'staffMemberId'), run: (u, a, i) => pbj.buildTimecard(u, a, { staffMemberId: i.staffMemberId, weekStart: String(i.weekStart ?? '') }) },
  'timecard.submit': { permissions: TIME, community: byRecord('Timecard', 'timecardId'), run: (u, a, i) => pbj.submitTimecard(u, a, { timecardId: i.timecardId }) },
  'timecard.approve': { permissions: TIME_APPROVE, community: byRecord('Timecard', 'timecardId'), run: (u, a, i) => pbj.approveTimecard(u, a, { timecardId: i.timecardId }) },
  'timecard.reopen': { permissions: TIME_APPROVE, community: byRecord('Timecard', 'timecardId'), run: (u, a, i) => pbj.reopenTimecard(u, a, { timecardId: i.timecardId, reason: String(i.reason ?? '') }) },
  'pbj.open_quarter': { permissions: REGULATORY, community: byCommunity, run: (u, a, i) => pbj.openPbjQuarter(u, a, { communityId: i.communityId, date: String(i.date ?? '') }) },
  'pbj.validate': { permissions: REGULATORY, community: byRecord('PbjQuarter', 'quarterId'), run: (u, a, i) => pbj.validatePbjQuarter(u, a, { quarterId: i.quarterId }) },
  'pbj.mark_exported': { permissions: REGULATORY, community: byRecord('PbjQuarter', 'quarterId'), run: (u, a, i) => pbj.markPbjExported(u, a, { quarterId: i.quarterId }) },
  'pbj.record_outcome': { permissions: REGULATORY, community: byRecord('PbjQuarter', 'quarterId'), run: (u, a, i) => pbj.recordPbjOutcome(u, a, { quarterId: i.quarterId, outcome: i.outcome, note: i.note }) },
  'nhsn.generate': { permissions: REGULATORY, community: byCommunity, run: (u, a, i) => pbj.generateNhsnWeek(u, a, { communityId: i.communityId, weekStart: String(i.weekStart ?? ''), covidPositive: i.covidPositive === undefined || i.covidPositive === '' ? undefined : Number(i.covidPositive), fluPositive: i.fluPositive === undefined || i.fluPositive === '' ? undefined : Number(i.fluPositive) }) },
  'nhsn.record': { permissions: REGULATORY, community: byRecord('NhsnExport', 'exportId'), run: (u, a, i) => pbj.recordNhsnUpload(u, a, { exportId: i.exportId, step: i.step, confirmation: i.confirmation }) },

  // Workforce depth (Phase 5)
  'shift.create': { permissions: SCHEDULE, community: byCommunity, run: (u, a, i) => sched.createShift(u, a, { communityId: i.communityId, unitId: i.unitId || null, role: String(i.role ?? ''), date: String(i.date ?? ''), startTime: String(i.startTime ?? ''), endTime: String(i.endTime ?? ''), required: Number(i.required || 1), note: i.note }) },
  'shift.assign': { permissions: SCHEDULE, community: byRecord('Shift', 'shiftId'), serializable: true, run: (u, a, i) => sched.assignStaff(u, a, { shiftId: i.shiftId, staffMemberId: String(i.staffMemberId ?? '') }) },
  'shift.offer': { permissions: SCHEDULE, community: byRecord('Shift', 'shiftId'), serializable: true, run: (u, a, i) => sched.offerShift(u, a, { shiftId: i.shiftId, staffMemberId: String(i.staffMemberId ?? ''), hours: i.hours ? Number(i.hours) : undefined }) },
  'shift.move': { permissions: SCHEDULE, community: byRecord('ShiftAssignment', 'assignmentId'), serializable: true, run: (u, a, i) => sched.moveAssignment(u, a, { assignmentId: i.assignmentId, to: String(i.to ?? ''), reason: i.reason }) },
  'shift.cancel': { permissions: SCHEDULE, community: byRecord('Shift', 'shiftId'), run: (u, a, i) => sched.cancelShift(u, a, { shiftId: i.shiftId, reason: String(i.reason ?? '') }) },
  'credential.save': { permissions: CREDENTIALS, community: byRecord('StaffMember', 'staffMemberId'), run: (u, a, i) => sched.saveCredential(u, a, { staffMemberId: i.staffMemberId, kind: String(i.kind ?? ''), jurisdiction: i.jurisdiction, number: i.number, issuedAt: i.issuedAt || null, expiresAt: i.expiresAt || null, document: i.document }) },
  'credential.verify': { permissions: CREDENTIALS, community: byRecord('Credential', 'credentialId'), run: (u, a, i) => sched.verifyCredential(u, a, { credentialId: i.credentialId, source: String(i.source ?? ''), result: String(i.result ?? ''), reference: String(i.reference ?? ''), note: i.note }) },
  'credential.training': { permissions: CREDENTIALS, community: byRecord('StaffMember', 'staffMemberId'), run: (u, a, i) => sched.recordTraining(u, a, { staffMemberId: i.staffMemberId, kind: String(i.kind ?? ''), minutes: Number(i.minutes), completedOn: String(i.completedOn ?? ''), reference: String(i.reference ?? '') }) },
  'leie.import': { permissions: CREDENTIALS, community: byCommunity, run: (u, a, i) => sched.importLeie(u, a, { communityId: i.communityId, month: String(i.month ?? ''), text: String(i.text ?? '') }) },
  'agency.vendor': { permissions: SCHEDULE, community: byCommunity, run: (u, a, i) => sched.saveAgencyVendor(u, a, { communityId: i.communityId, name: String(i.name ?? ''), contractStart: i.contractStart || null, contractEnd: i.contractEnd || null, rates: { rn: i.rn, lpn: i.lpn, cna: i.cna, med_aide: i.med_aide } }) },
  'agency.invoice': { permissions: SCHEDULE, community: byRecord('AgencyVendor', 'vendorId'), run: (u, a, i) => sched.receiveAgencyInvoice(u, a, { vendorId: i.vendorId, invoiceNumber: String(i.invoiceNumber ?? ''), periodStart: String(i.periodStart ?? ''), periodEnd: String(i.periodEnd ?? ''), invoicedMinutes: Math.round(Number(i.hours) * 60), amountMinor: money(i.amountMinor, 'amount') }) },
  'agency.approve': { permissions: TIME_APPROVE, community: byRecord('AgencyInvoice', 'invoiceId'), run: (u, a, i) => sched.approveAgencyInvoice(u, a, { invoiceId: i.invoiceId, note: i.note }) },
  'payroll.export': { permissions: TIME_APPROVE, community: byCommunity, serializable: true, run: (u, a, i) => sched.exportPayroll(u, a, { communityId: i.communityId, periodStart: String(i.periodStart ?? ''), periodEnd: String(i.periodEnd ?? '') }) },
  'staffing.target': { permissions: SCHEDULE, community: byCommunity, run: (u, a, i) => sched.saveStaffingTarget(u, a, { communityId: i.communityId, metric: String(i.metric ?? ''), value: String(i.value ?? ''), effectiveFrom: String(i.effectiveFrom ?? ''), note: i.note }) },
  'staffing.compute': { permissions: SCHEDULE, community: byCommunity, run: (u, a, i) => sched.computeStaffingRange(u, a, { communityId: i.communityId, from: String(i.from ?? ''), days: Number(i.days || 1) }) },
}

/** All Phase 3 commands are for a signed-in person at the dashboard: an agent never moves money. */
export async function billingCommand(_root: unknown, args: { op: string; input?: Input | null; idempotencyKey: string }, context: { session: unknown; prisma: any }) {
  const handler = HANDLERS[args.op]
  if (!handler) throw new DomainError(Codes.INVALID_INPUT, 'Unknown action.')
  const input = (args.input && typeof args.input === 'object' ? { ...args.input } : {}) as Input
  if (handler.external) {
    const actor = await actorFor(context)
    assertHuman(context, actor, true)
    authorize(actor, { permissions: handler.permissions })
    await assertCommunityAccess(context.prisma, actor, await handler.community(context.prisma, input))
    return { replay: false, ...((await handler.external(context.prisma, actor, { ...input, __key: requireKey(args.idempotencyKey) })) as object) }
  }
  return runDomain(context, { idempotencyKey: args.idempotencyKey, op: args.op, input }, { name: `billing.${args.op}`, permissions: handler.permissions, humanOnly: true, serializable: handler.serializable, community: tx => handler.community(tx, input) }, (uow, actor) => handler.run(uow, actor, input) as Promise<object>)
}
