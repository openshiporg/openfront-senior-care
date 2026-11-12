# Phase 3: private pay, deposits, statements, resident trust, Medicaid liability

Builds on Phase 2 (commit `38a4912`). No timer, job, cron, outbox, autopay runner or sent message exists. Month-end close and billing derivation are idempotent staff buttons per month. The 30-day conveyance, Medicaid information-request and appeal deadlines are worked out when a page loads. Rate-change notices are printable pages with a recorded delivery date; the app sends nothing.

## What shipped
- **Rates** (`billing/rates.ts`): care levels, rate schedules and lines. Publishing is a maker-checker approval (`rate.publish`, canApproveRates); lines freeze at publication. `rateChangeNotices` lists the residents who need notice and by when.
- **Derivation** (`billing/derive.ts`): a pure function of census days, coverage, care levels, published rates and Medicaid liabilities. Same input gives the same lines, order and hashes. Amounts are integer cents; rates and quantities use `decimal.js`; proration is allocated so the pieces add up to the month.
- **Month-end** (`billing/period.ts`): `billing.derive` brings the open month in line with the census; `billing.close` freezes the charges and issues one statement per resident; `billing.adjust_closed` posts the difference caused by a later change as an adjustment line in the next open month. A changed charge is superseded by a new row, a removed one is voided, nothing is edited. `verifyPeriod` re-derives a closed month and compares hashes.
- **Payments** (`billing/payments.ts`, `integrations/payment`): hand payments, deposits, refunds (second approver over the threshold; a refund never reopens a paid statement) and Stripe test card/ACH. A second charge while one is pending or unknown is refused, in the service and by a partial unique index. "Check status" only retrieves. A decline is final for its key. An idempotency error is recorded as unknown. Webhooks are verified, deduplicated by provider event id and applied once (`app/api/payments/webhook`).
- **Autopay**: a stored token charged by the "Charge stored cards" button after the close; never retried automatically.
- **Resident trust** (`trust/ledger.ts`, `trust/service.ts`): double-entry lines in BigInt, append-only. Withdrawals over `trustApprovalThresholdMinor` wait for a second signer, never the preparer. A reversal is a new transaction. Closing a ledger starts the 30-day conveyance clock. The three-way reconciliation (bank, bank-control book, sum of resident ledgers) is prepared by one person and signed by another.
- **Medicaid liability** (`billing/medicaid.ts`): monthly patient liability, correction by a new row, information-request and appeal clocks.
- **Statement PDF**: made on request at `/api/statements/<id>/pdf` (`billing/statementPdf.ts`), through the signed-in session's list access.
- **Family portal APIs only**: `portalStatements` and `portalTrustBalance`, behind the `statements` and `trust_balance` grants and two-step sign-in, each read audited. No portal screen.
- **Screens**: Billing (months and statements), Statement, Rates and notices, Medicaid liability, Resident funds, Resident ledger. Navigation through `navigation.ts`; every list is facility-scoped and money and PHI reads are gated by role.
- **Seed** (`seed/billing.ts`, onboarding `loadBillingSetup`): care levels, published assisted-living and memory-care schedules, a charge list and the resident funds account. Every figure is invented.
- **Database guards** (`20261112110000_phase_3_billing_trust_guards`): one live charge per key, one in-flight card/ACH payment per statement, append-only triggers (trust lines, payment allocations and events), a charge guard, a deferred trust-balanced constraint trigger and the preparer-is-not-signer check. `20261112120000_phase_3_compound_uniques` adds the four compound uniques declared in `prismaConstraints.ts`. All migrations are additive: no ALTER, UPDATE or DROP of an existing table.

## Open items (verify, built generically)
- Rate, notice and conveyance day counts follow the generic defaults (30/10/90 days); Ohio specifics are not asserted.
- The trust account is one pooled account per community; multi-account banks are not modelled.
- Card and ACH run against Stripe test mode only.

## Exit gate and tests
1. `mutations/billing.db.test.ts`: close for 48 assisted-living apartments and 24 memory-care suites (72 statements); `verifyPeriod` re-derives byte-identically.
2. Same file: a back-dated room change after the statement gives superseding charges and an adjustment line; closed history is untouched.
3. `trust/ledger.test.ts` (fast-check): lines balance, no resident ledger is negative at any historical date, the reconciliation ties.
4. `mutations/trust.db.test.ts`: withdrawal over the threshold needs a second approver; the preparer never signs; reversal, reconciliation, conveyance.
5. `mutations/payments.db.test.ts`: webhook replay and an unknown outcome produce exactly one payment; refunds, deposits, autopay.
Also `billing/medicaid.test.ts` (clocks). Run each DB file alone: `timeout 300 npx vitest run <file> --no-file-parallelism`.

## r1 fixes (review items M1–M6, M8)

- **M1 resident credit.** A settle that finds nothing left to allocate records the excess as a `ResidentCredit` (open, with the amount left). It shows on the statement screen under "Credit on account" and can be applied to a statement (`credit.apply`, a `credit` payment) or refunded (`refund.request` with `creditId`). Never silent.
- **M2 deposit rules.** The Ohio pack carries `depositRefund` per deposit kind (refundable, refundWindowDays from receipt, forfeitable). A refund outside the rule is refused. `deposit.forfeit` (held → forfeited) needs a second approver. `community_fee` is a deposit kind.
- **M3 second person.** The census gives occupancy: the first occupant of an apartment that day pays rent, the second pays the `second_person` rate.
- **M4 care level.** An increase bills only from the later of its effective date and `noticeDeliveredOn` + the pack's `careLevelIncreaseNoticeDays`; a decrease applies at once. `care_level.assign` creates the row from AL points, or by hand with a reason, and supersedes the current one.
- **M5 rate shape.** `per:'day'` and the `daily` method give rate × days. `rate.add_line` refuses combinations that make no sense (`checkRateShape`).
- **M6 adjustments and write-offs.** `adjustment.create` and `writeoff.create` write a `BalanceAdjustment`. At or above `writeOffApprovalThresholdMinor` they wait for a different person with `canApproveWriteOffs`. They are append-only; a correction supersedes. `Statement.adjustedMinor` carries the total, and the balance is total − paid − adjusted.
- **M8 database guards** (`20261112150000_phase_3_r1_money_guards`): triggers in the `hs_money_period` pattern for Statement, BillingPeriod, RateSchedule, RateLine, Charge, Payment, Refund, Deposit, MedicaidLiability, CareLevelAssignment, BalanceAdjustment, ResidentCredit, TrustTransaction and TrustReconciliation, plus a never-negative constraint trigger on the trust ledger. `scripts/sqlguards.mjs` proves each probe is refused as a non-owner role.

## Deferred to Phase 3b

PaymentPlan, ageing, GL export, MedicaidApplication, PNA, TrustAuthorisation, quarterly statements, the SSI alert, interest, the surety bond and the portal payments API are **deferred to Phase 3b** (Euler's decision on review item M7).
