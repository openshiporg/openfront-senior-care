-- CreateTable
CREATE TABLE "BillingPeriod" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "month" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "derivationHash" TEXT NOT NULL DEFAULT '',
    "statementCount" INTEGER DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareLevel" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "setting" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "maxPoints" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareLevelAssignment" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "careLevel" TEXT,
    "points" INTEGER NOT NULL,
    "effectiveFrom" DATE,
    "noticeDeliveredOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareLevelAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "period" TEXT,
    "date" DATE,
    "kind" TEXT NOT NULL,
    "responsibility" TEXT NOT NULL,
    "payerKey" TEXT NOT NULL DEFAULT '',
    "payer" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "supersededBy" TEXT,
    "adjustsCharge" TEXT,
    "derivation" JSONB,
    "derivationHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeItem" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChargeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'held',
    "receivedOn" DATE,
    "appliedPayment" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicaidLiability" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "month" DATE,
    "liabilityMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'expected',
    "noticeReceivedOn" DATE,
    "infoRequestedOn" DATE,
    "infoRespondedOn" DATE,
    "appealFiledOn" DATE,
    "supersededBy" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicaidLiability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "statement" TEXT,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "token" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "failureCode" TEXT NOT NULL DEFAULT '',
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "initiatedBy" TEXT,
    "initiatedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "payment" TEXT,
    "statement" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "providerEventId" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "payment" TEXT,
    "outcome" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodToken" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "provider" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "token" TEXT NOT NULL DEFAULT '',
    "autopay" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethodToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLine" (
    "id" TEXT NOT NULL,
    "schedule" TEXT,
    "kind" TEXT NOT NULL,
    "apartmentType" TEXT,
    "careLevel" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "per" TEXT NOT NULL,
    "proration" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateSchedule" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "setting" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "noticeDays" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "approval" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "payment" TEXT,
    "deposit" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "approval" TEXT,
    "refundRef" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "issuedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "period" TEXT,
    "number" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'issued',
    "issuedAt" TIMESTAMP(3),
    "dueOn" DATE,
    "totalMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT NOT NULL DEFAULT 0,
    "lines" JSONB,
    "chargeHash" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentTrustLedger" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "account" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedOn" DATE,
    "closedReason" TEXT,
    "conveyedOn" DATE,
    "conveyedTo" TEXT NOT NULL DEFAULT '',
    "consentOnFile" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentTrustLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustAccount" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustLedgerLine" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "transaction" TEXT,
    "ledger" TEXT,
    "account" TEXT,
    "bucket" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "effectiveOn" DATE,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustLedgerLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustReconciliation" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "account" TEXT,
    "month" DATE,
    "bankBalanceMinor" BIGINT NOT NULL,
    "bookBalanceMinor" BIGINT NOT NULL,
    "residentTotalMinor" BIGINT NOT NULL,
    "differenceMinor" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'untied',
    "detail" JSONB,
    "preparedBy" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustTransaction" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "ledger" TEXT,
    "account" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'posted',
    "preparedBy" TEXT,
    "signedBy" TEXT,
    "approval" TEXT,
    "reverses" TEXT,
    "effectiveOn" DATE,
    "postedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPeriod_community_idx" ON "BillingPeriod"("community");

-- CreateIndex
CREATE INDEX "BillingPeriod_closedBy_idx" ON "BillingPeriod"("closedBy");

-- CreateIndex
CREATE INDEX "CareLevel_community_idx" ON "CareLevel"("community");

-- CreateIndex
CREATE INDEX "CareLevelAssignment_community_idx" ON "CareLevelAssignment"("community");

-- CreateIndex
CREATE INDEX "CareLevelAssignment_resident_idx" ON "CareLevelAssignment"("resident");

-- CreateIndex
CREATE INDEX "CareLevelAssignment_stay_idx" ON "CareLevelAssignment"("stay");

-- CreateIndex
CREATE INDEX "CareLevelAssignment_careLevel_idx" ON "CareLevelAssignment"("careLevel");

-- CreateIndex
CREATE INDEX "Charge_community_idx" ON "Charge"("community");

-- CreateIndex
CREATE INDEX "Charge_resident_idx" ON "Charge"("resident");

-- CreateIndex
CREATE INDEX "Charge_stay_idx" ON "Charge"("stay");

-- CreateIndex
CREATE INDEX "Charge_period_idx" ON "Charge"("period");

-- CreateIndex
CREATE INDEX "Charge_payerKey_idx" ON "Charge"("payerKey");

-- CreateIndex
CREATE INDEX "Charge_payer_idx" ON "Charge"("payer");

-- CreateIndex
CREATE INDEX "Charge_supersededBy_idx" ON "Charge"("supersededBy");

-- CreateIndex
CREATE INDEX "Charge_adjustsCharge_idx" ON "Charge"("adjustsCharge");

-- CreateIndex
CREATE INDEX "ChargeItem_community_idx" ON "ChargeItem"("community");

-- CreateIndex
CREATE INDEX "Deposit_community_idx" ON "Deposit"("community");

-- CreateIndex
CREATE INDEX "Deposit_resident_idx" ON "Deposit"("resident");

-- CreateIndex
CREATE INDEX "Deposit_appliedPayment_idx" ON "Deposit"("appliedPayment");

-- CreateIndex
CREATE INDEX "MedicaidLiability_community_idx" ON "MedicaidLiability"("community");

-- CreateIndex
CREATE INDEX "MedicaidLiability_resident_idx" ON "MedicaidLiability"("resident");

-- CreateIndex
CREATE INDEX "MedicaidLiability_stay_idx" ON "MedicaidLiability"("stay");

-- CreateIndex
CREATE INDEX "MedicaidLiability_supersededBy_idx" ON "MedicaidLiability"("supersededBy");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_community_idx" ON "Payment"("community");

-- CreateIndex
CREATE INDEX "Payment_resident_idx" ON "Payment"("resident");

-- CreateIndex
CREATE INDEX "Payment_statement_idx" ON "Payment"("statement");

-- CreateIndex
CREATE INDEX "Payment_providerRef_idx" ON "Payment"("providerRef");

-- CreateIndex
CREATE INDEX "Payment_token_idx" ON "Payment"("token");

-- CreateIndex
CREATE INDEX "Payment_initiatedBy_idx" ON "Payment"("initiatedBy");

-- CreateIndex
CREATE INDEX "PaymentAllocation_community_idx" ON "PaymentAllocation"("community");

-- CreateIndex
CREATE INDEX "PaymentAllocation_resident_idx" ON "PaymentAllocation"("resident");

-- CreateIndex
CREATE INDEX "PaymentAllocation_payment_idx" ON "PaymentAllocation"("payment");

-- CreateIndex
CREATE INDEX "PaymentAllocation_statement_idx" ON "PaymentAllocation"("statement");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_community_idx" ON "PaymentEvent"("community");

-- CreateIndex
CREATE INDEX "PaymentEvent_payment_idx" ON "PaymentEvent"("payment");

-- CreateIndex
CREATE INDEX "PaymentMethodToken_community_idx" ON "PaymentMethodToken"("community");

-- CreateIndex
CREATE INDEX "PaymentMethodToken_resident_idx" ON "PaymentMethodToken"("resident");

-- CreateIndex
CREATE INDEX "RateLine_schedule_idx" ON "RateLine"("schedule");

-- CreateIndex
CREATE INDEX "RateLine_apartmentType_idx" ON "RateLine"("apartmentType");

-- CreateIndex
CREATE INDEX "RateLine_careLevel_idx" ON "RateLine"("careLevel");

-- CreateIndex
CREATE INDEX "RateSchedule_community_idx" ON "RateSchedule"("community");

-- CreateIndex
CREATE INDEX "RateSchedule_approval_idx" ON "RateSchedule"("approval");

-- CreateIndex
CREATE INDEX "Refund_community_idx" ON "Refund"("community");

-- CreateIndex
CREATE INDEX "Refund_resident_idx" ON "Refund"("resident");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_deposit_idx" ON "Refund"("deposit");

-- CreateIndex
CREATE INDEX "Refund_approval_idx" ON "Refund"("approval");

-- CreateIndex
CREATE INDEX "Refund_requestedBy_idx" ON "Refund"("requestedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_number_key" ON "Statement"("number");

-- CreateIndex
CREATE INDEX "Statement_community_idx" ON "Statement"("community");

-- CreateIndex
CREATE INDEX "Statement_resident_idx" ON "Statement"("resident");

-- CreateIndex
CREATE INDEX "Statement_period_idx" ON "Statement"("period");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentTrustLedger_reference_key" ON "ResidentTrustLedger"("reference");

-- CreateIndex
CREATE INDEX "ResidentTrustLedger_community_idx" ON "ResidentTrustLedger"("community");

-- CreateIndex
CREATE INDEX "ResidentTrustLedger_resident_idx" ON "ResidentTrustLedger"("resident");

-- CreateIndex
CREATE INDEX "ResidentTrustLedger_account_idx" ON "ResidentTrustLedger"("account");

-- CreateIndex
CREATE INDEX "TrustAccount_community_idx" ON "TrustAccount"("community");

-- CreateIndex
CREATE INDEX "TrustLedgerLine_community_idx" ON "TrustLedgerLine"("community");

-- CreateIndex
CREATE INDEX "TrustLedgerLine_resident_idx" ON "TrustLedgerLine"("resident");

-- CreateIndex
CREATE INDEX "TrustLedgerLine_transaction_idx" ON "TrustLedgerLine"("transaction");

-- CreateIndex
CREATE INDEX "TrustLedgerLine_ledger_idx" ON "TrustLedgerLine"("ledger");

-- CreateIndex
CREATE INDEX "TrustLedgerLine_account_idx" ON "TrustLedgerLine"("account");

-- CreateIndex
CREATE INDEX "TrustReconciliation_community_idx" ON "TrustReconciliation"("community");

-- CreateIndex
CREATE INDEX "TrustReconciliation_account_idx" ON "TrustReconciliation"("account");

-- CreateIndex
CREATE INDEX "TrustReconciliation_preparedBy_idx" ON "TrustReconciliation"("preparedBy");

-- CreateIndex
CREATE INDEX "TrustReconciliation_signedBy_idx" ON "TrustReconciliation"("signedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TrustTransaction_reference_key" ON "TrustTransaction"("reference");

-- CreateIndex
CREATE INDEX "TrustTransaction_community_idx" ON "TrustTransaction"("community");

-- CreateIndex
CREATE INDEX "TrustTransaction_resident_idx" ON "TrustTransaction"("resident");

-- CreateIndex
CREATE INDEX "TrustTransaction_ledger_idx" ON "TrustTransaction"("ledger");

-- CreateIndex
CREATE INDEX "TrustTransaction_account_idx" ON "TrustTransaction"("account");

-- CreateIndex
CREATE INDEX "TrustTransaction_preparedBy_idx" ON "TrustTransaction"("preparedBy");

-- CreateIndex
CREATE INDEX "TrustTransaction_signedBy_idx" ON "TrustTransaction"("signedBy");

-- CreateIndex
CREATE INDEX "TrustTransaction_approval_idx" ON "TrustTransaction"("approval");

-- CreateIndex
CREATE INDEX "TrustTransaction_reverses_idx" ON "TrustTransaction"("reverses");

-- AddForeignKey
ALTER TABLE "BillingPeriod" ADD CONSTRAINT "BillingPeriod_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPeriod" ADD CONSTRAINT "BillingPeriod_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLevel" ADD CONSTRAINT "CareLevel_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLevelAssignment" ADD CONSTRAINT "CareLevelAssignment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLevelAssignment" ADD CONSTRAINT "CareLevelAssignment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLevelAssignment" ADD CONSTRAINT "CareLevelAssignment_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLevelAssignment" ADD CONSTRAINT "CareLevelAssignment_careLevel_fkey" FOREIGN KEY ("careLevel") REFERENCES "CareLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_period_fkey" FOREIGN KEY ("period") REFERENCES "BillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_adjustsCharge_fkey" FOREIGN KEY ("adjustsCharge") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargeItem" ADD CONSTRAINT "ChargeItem_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_appliedPayment_fkey" FOREIGN KEY ("appliedPayment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidLiability" ADD CONSTRAINT "MedicaidLiability_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidLiability" ADD CONSTRAINT "MedicaidLiability_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidLiability" ADD CONSTRAINT "MedicaidLiability_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidLiability" ADD CONSTRAINT "MedicaidLiability_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "MedicaidLiability"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_token_fkey" FOREIGN KEY ("token") REFERENCES "PaymentMethodToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_initiatedBy_fkey" FOREIGN KEY ("initiatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodToken" ADD CONSTRAINT "PaymentMethodToken_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethodToken" ADD CONSTRAINT "PaymentMethodToken_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLine" ADD CONSTRAINT "RateLine_schedule_fkey" FOREIGN KEY ("schedule") REFERENCES "RateSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLine" ADD CONSTRAINT "RateLine_apartmentType_fkey" FOREIGN KEY ("apartmentType") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateLine" ADD CONSTRAINT "RateLine_careLevel_fkey" FOREIGN KEY ("careLevel") REFERENCES "CareLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateSchedule" ADD CONSTRAINT "RateSchedule_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_deposit_fkey" FOREIGN KEY ("deposit") REFERENCES "Deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_period_fkey" FOREIGN KEY ("period") REFERENCES "BillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentTrustLedger" ADD CONSTRAINT "ResidentTrustLedger_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentTrustLedger" ADD CONSTRAINT "ResidentTrustLedger_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentTrustLedger" ADD CONSTRAINT "ResidentTrustLedger_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAccount" ADD CONSTRAINT "TrustAccount_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_transaction_fkey" FOREIGN KEY ("transaction") REFERENCES "TrustTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_ledger_fkey" FOREIGN KEY ("ledger") REFERENCES "ResidentTrustLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustLedgerLine" ADD CONSTRAINT "TrustLedgerLine_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustReconciliation" ADD CONSTRAINT "TrustReconciliation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustReconciliation" ADD CONSTRAINT "TrustReconciliation_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustReconciliation" ADD CONSTRAINT "TrustReconciliation_preparedBy_fkey" FOREIGN KEY ("preparedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustReconciliation" ADD CONSTRAINT "TrustReconciliation_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_ledger_fkey" FOREIGN KEY ("ledger") REFERENCES "ResidentTrustLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_preparedBy_fkey" FOREIGN KEY ("preparedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustTransaction" ADD CONSTRAINT "TrustTransaction_reverses_fkey" FOREIGN KEY ("reverses") REFERENCES "TrustTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
