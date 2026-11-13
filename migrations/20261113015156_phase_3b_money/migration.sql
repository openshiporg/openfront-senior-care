-- CreateTable
CREATE TABLE "MedicaidApplication" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "caseworker" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "requestedFrom" DATE,
    "submittedOn" DATE,
    "infoRequestedOn" DATE,
    "infoDueOn" DATE,
    "infoRespondedOn" DATE,
    "decisionOn" DATE,
    "effectiveOn" DATE,
    "appealDueOn" DATE,
    "appealFiledOn" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicaidApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientLiabilitySchedule" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "application" TEXT,
    "monthlyAmountMinor" BIGINT NOT NULL,
    "personalNeedsAllowanceMinor" BIGINT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientLiabilitySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "statement" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "totalMinor" BIGINT NOT NULL,
    "instalmentCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelledReason" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlanInstalment" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "plan" TEXT,
    "number" INTEGER NOT NULL,
    "dueOn" DATE,
    "amountMinor" BIGINT NOT NULL,
    "payment" TEXT,
    "attempts" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlanInstalment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestAllocationRun" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "account" TEXT,
    "month" DATE,
    "interestMinor" BIGINT NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "residualRule" TEXT NOT NULL DEFAULT '',
    "allocations" JSONB,
    "postedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestAllocationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuretyBond" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "account" TEXT,
    "carrier" TEXT NOT NULL DEFAULT '',
    "bondNumber" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "effectiveFrom" DATE,
    "expiresOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "replacedBy" TEXT,
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuretyBond_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustAuthorisation" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "ledger" TEXT,
    "representative" TEXT,
    "signedOn" DATE,
    "kinds" JSONB DEFAULT '[]',
    "perWithdrawalLimitMinor" BIGINT,
    "document" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_approval',
    "approval" TEXT,
    "revokedReason" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustAuthorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustStatement" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "ledger" TEXT,
    "quarter" DATE,
    "openingMinor" BIGINT NOT NULL,
    "inMinor" BIGINT NOT NULL,
    "outMinor" BIGINT NOT NULL,
    "closingMinor" BIGINT NOT NULL,
    "lines" JSONB,
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "TrustStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicaidApplication_reference_key" ON "MedicaidApplication"("reference");

-- CreateIndex
CREATE INDEX "MedicaidApplication_community_idx" ON "MedicaidApplication"("community");

-- CreateIndex
CREATE INDEX "MedicaidApplication_resident_idx" ON "MedicaidApplication"("resident");

-- CreateIndex
CREATE INDEX "MedicaidApplication_stay_idx" ON "MedicaidApplication"("stay");

-- CreateIndex
CREATE INDEX "PatientLiabilitySchedule_community_idx" ON "PatientLiabilitySchedule"("community");

-- CreateIndex
CREATE INDEX "PatientLiabilitySchedule_resident_idx" ON "PatientLiabilitySchedule"("resident");

-- CreateIndex
CREATE INDEX "PatientLiabilitySchedule_stay_idx" ON "PatientLiabilitySchedule"("stay");

-- CreateIndex
CREATE INDEX "PatientLiabilitySchedule_application_idx" ON "PatientLiabilitySchedule"("application");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlan_reference_key" ON "PaymentPlan"("reference");

-- CreateIndex
CREATE INDEX "PaymentPlan_community_idx" ON "PaymentPlan"("community");

-- CreateIndex
CREATE INDEX "PaymentPlan_resident_idx" ON "PaymentPlan"("resident");

-- CreateIndex
CREATE INDEX "PaymentPlan_statement_idx" ON "PaymentPlan"("statement");

-- CreateIndex
CREATE INDEX "PaymentPlan_createdBy_idx" ON "PaymentPlan"("createdBy");

-- CreateIndex
CREATE INDEX "PaymentPlanInstalment_community_idx" ON "PaymentPlanInstalment"("community");

-- CreateIndex
CREATE INDEX "PaymentPlanInstalment_resident_idx" ON "PaymentPlanInstalment"("resident");

-- CreateIndex
CREATE INDEX "PaymentPlanInstalment_plan_idx" ON "PaymentPlanInstalment"("plan");

-- CreateIndex
CREATE INDEX "PaymentPlanInstalment_payment_idx" ON "PaymentPlanInstalment"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentPlanInstalment_plan_number_key" ON "PaymentPlanInstalment"("plan", "number");

-- CreateIndex
CREATE INDEX "InterestAllocationRun_community_idx" ON "InterestAllocationRun"("community");

-- CreateIndex
CREATE INDEX "InterestAllocationRun_account_idx" ON "InterestAllocationRun"("account");

-- CreateIndex
CREATE INDEX "InterestAllocationRun_postedBy_idx" ON "InterestAllocationRun"("postedBy");

-- CreateIndex
CREATE UNIQUE INDEX "InterestAllocationRun_account_month_key" ON "InterestAllocationRun"("account", "month");

-- CreateIndex
CREATE INDEX "SuretyBond_community_idx" ON "SuretyBond"("community");

-- CreateIndex
CREATE INDEX "SuretyBond_account_idx" ON "SuretyBond"("account");

-- CreateIndex
CREATE INDEX "SuretyBond_replacedBy_idx" ON "SuretyBond"("replacedBy");

-- CreateIndex
CREATE INDEX "SuretyBond_recordedBy_idx" ON "SuretyBond"("recordedBy");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_community_idx" ON "TrustAuthorisation"("community");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_resident_idx" ON "TrustAuthorisation"("resident");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_ledger_idx" ON "TrustAuthorisation"("ledger");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_representative_idx" ON "TrustAuthorisation"("representative");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_document_idx" ON "TrustAuthorisation"("document");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_approval_idx" ON "TrustAuthorisation"("approval");

-- CreateIndex
CREATE INDEX "TrustAuthorisation_recordedBy_idx" ON "TrustAuthorisation"("recordedBy");

-- CreateIndex
CREATE INDEX "TrustStatement_community_idx" ON "TrustStatement"("community");

-- CreateIndex
CREATE INDEX "TrustStatement_resident_idx" ON "TrustStatement"("resident");

-- CreateIndex
CREATE INDEX "TrustStatement_ledger_idx" ON "TrustStatement"("ledger");

-- CreateIndex
CREATE INDEX "TrustStatement_generatedBy_idx" ON "TrustStatement"("generatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TrustStatement_ledger_quarter_key" ON "TrustStatement"("ledger", "quarter");

-- AddForeignKey
ALTER TABLE "MedicaidApplication" ADD CONSTRAINT "MedicaidApplication_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidApplication" ADD CONSTRAINT "MedicaidApplication_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaidApplication" ADD CONSTRAINT "MedicaidApplication_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientLiabilitySchedule" ADD CONSTRAINT "PatientLiabilitySchedule_application_fkey" FOREIGN KEY ("application") REFERENCES "MedicaidApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_statement_fkey" FOREIGN KEY ("statement") REFERENCES "Statement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstalment" ADD CONSTRAINT "PaymentPlanInstalment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstalment" ADD CONSTRAINT "PaymentPlanInstalment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstalment" ADD CONSTRAINT "PaymentPlanInstalment_plan_fkey" FOREIGN KEY ("plan") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstalment" ADD CONSTRAINT "PaymentPlanInstalment_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestAllocationRun" ADD CONSTRAINT "InterestAllocationRun_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestAllocationRun" ADD CONSTRAINT "InterestAllocationRun_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestAllocationRun" ADD CONSTRAINT "InterestAllocationRun_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuretyBond" ADD CONSTRAINT "SuretyBond_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuretyBond" ADD CONSTRAINT "SuretyBond_account_fkey" FOREIGN KEY ("account") REFERENCES "TrustAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuretyBond" ADD CONSTRAINT "SuretyBond_replacedBy_fkey" FOREIGN KEY ("replacedBy") REFERENCES "SuretyBond"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuretyBond" ADD CONSTRAINT "SuretyBond_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_ledger_fkey" FOREIGN KEY ("ledger") REFERENCES "ResidentTrustLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_representative_fkey" FOREIGN KEY ("representative") REFERENCES "Representative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustAuthorisation" ADD CONSTRAINT "TrustAuthorisation_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustStatement" ADD CONSTRAINT "TrustStatement_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustStatement" ADD CONSTRAINT "TrustStatement_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustStatement" ADD CONSTRAINT "TrustStatement_ledger_fkey" FOREIGN KEY ("ledger") REFERENCES "ResidentTrustLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustStatement" ADD CONSTRAINT "TrustStatement_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
