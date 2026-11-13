-- CreateTable
CREATE TABLE "AncillaryInvoice" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "vendor" TEXT NOT NULL DEFAULT '',
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "invoiceDate" DATE,
    "serviceDate" DATE,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amountMinor" BIGINT NOT NULL,
    "consolidatedBilling" BOOLEAN NOT NULL DEFAULT false,
    "claim" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedBy" TEXT,
    "approvedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AncillaryInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "stay" TEXT,
    "payer" TEXT,
    "coverage" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "periodFrom" DATE,
    "periodTo" DATE,
    "typeOfBill" TEXT NOT NULL DEFAULT '',
    "frequencyCode" TEXT NOT NULL DEFAULT '',
    "occurrenceCodes" JSONB DEFAULT '[]',
    "occurrenceSpans" JSONB DEFAULT '[]',
    "valueCodes" JSONB DEFAULT '[]',
    "conditionCodes" JSONB DEFAULT '[]',
    "diagnoses" JSONB DEFAULT '{}',
    "totalChargesMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT DEFAULT 0,
    "exportText" TEXT NOT NULL DEFAULT '',
    "denial" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "previousClaim" TEXT,
    "scrubberResult" JSONB,
    "exportHash" TEXT NOT NULL DEFAULT '',
    "exportedAt" TIMESTAMP(3),
    "exportedBy" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "validatedBy" TEXT,
    "releasedBy" TEXT,
    "payerClaimNumber" TEXT NOT NULL DEFAULT '',
    "attendingNpi" TEXT NOT NULL DEFAULT '',
    "attendingName" TEXT NOT NULL DEFAULT '',
    "ackStatus" TEXT NOT NULL,
    "denialStatus" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimLine" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "claim" TEXT,
    "lineNumber" INTEGER NOT NULL,
    "revenueCode" TEXT NOT NULL DEFAULT '',
    "hippsCode" TEXT NOT NULL DEFAULT '',
    "serviceFrom" DATE,
    "serviceTo" DATE,
    "units" INTEGER NOT NULL,
    "chargeMinor" BIGINT NOT NULL,
    "paidMinor" BIGINT DEFAULT 0,
    "chargeIds" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Remittance" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "payer" TEXT,
    "traceNumber" TEXT NOT NULL DEFAULT '',
    "paymentDate" DATE,
    "totalPaidMinor" BIGINT NOT NULL,
    "fileHash" TEXT NOT NULL DEFAULT '',
    "rawText" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'imported',
    "exceptions" JSONB DEFAULT '[]',
    "claimCount" INTEGER DEFAULT 0,
    "importedBy" TEXT,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Remittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittancePosting" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "remittance" TEXT,
    "claim" TEXT,
    "paidMinor" BIGINT NOT NULL,
    "contractualMinor" BIGINT DEFAULT 0,
    "patientResponsibilityMinor" BIGINT DEFAULT 0,
    "otherMinor" BIGINT DEFAULT 0,
    "adjustments" JSONB DEFAULT '[]',
    "chargeIds" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemittancePosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCode" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "pbjJobTitleCode" TEXT NOT NULL DEFAULT '',
    "countsTowardNursing" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NhsnExport" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "weekStart" DATE,
    "weekEnd" DATE,
    "counts" JSONB,
    "problems" JSONB DEFAULT '[]',
    "csv" TEXT NOT NULL DEFAULT '',
    "csvHash" TEXT NOT NULL DEFAULT '',
    "templateNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'generated',
    "generatedBy" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "confirmation" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NhsnExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PbjQuarter" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "federalFiscalYear" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "dueOn" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "validation" JSONB,
    "xml" TEXT NOT NULL DEFAULT '',
    "xmlHash" TEXT NOT NULL DEFAULT '',
    "exportedAt" TIMESTAMP(3),
    "exportedBy" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reportNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PbjQuarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "user" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "employeeId" TEXT NOT NULL DEFAULT '',
    "jobCode" TEXT,
    "payType" TEXT NOT NULL,
    "agency" BOOLEAN NOT NULL DEFAULT false,
    "hireDate" DATE,
    "terminationDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeCorrection" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "staffMember" TEXT,
    "kind" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedBy" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePunch" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "staffMember" TEXT,
    "kind" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "punchHash" TEXT NOT NULL DEFAULT '',
    "batch" TEXT NOT NULL DEFAULT '',
    "correction" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimePunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timecard" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "staffMember" TEXT,
    "weekStart" DATE,
    "dayMinutes" JSONB DEFAULT '{}',
    "totalMinutes" INTEGER DEFAULT 0,
    "issues" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "submittedBy" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Timecard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AncillaryInvoice_community_idx" ON "AncillaryInvoice"("community");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_resident_idx" ON "AncillaryInvoice"("resident");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_stay_idx" ON "AncillaryInvoice"("stay");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_vendor_idx" ON "AncillaryInvoice"("vendor");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_claim_idx" ON "AncillaryInvoice"("claim");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_receivedBy_idx" ON "AncillaryInvoice"("receivedBy");

-- CreateIndex
CREATE INDEX "AncillaryInvoice_approvedBy_idx" ON "AncillaryInvoice"("approvedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Claim_reference_key" ON "Claim"("reference");

-- CreateIndex
CREATE INDEX "Claim_community_idx" ON "Claim"("community");

-- CreateIndex
CREATE INDEX "Claim_resident_idx" ON "Claim"("resident");

-- CreateIndex
CREATE INDEX "Claim_stay_idx" ON "Claim"("stay");

-- CreateIndex
CREATE INDEX "Claim_payer_idx" ON "Claim"("payer");

-- CreateIndex
CREATE INDEX "Claim_coverage_idx" ON "Claim"("coverage");

-- CreateIndex
CREATE INDEX "Claim_previousClaim_idx" ON "Claim"("previousClaim");

-- CreateIndex
CREATE INDEX "Claim_exportedBy_idx" ON "Claim"("exportedBy");

-- CreateIndex
CREATE INDEX "Claim_uploadedBy_idx" ON "Claim"("uploadedBy");

-- CreateIndex
CREATE INDEX "Claim_validatedBy_idx" ON "Claim"("validatedBy");

-- CreateIndex
CREATE INDEX "Claim_releasedBy_idx" ON "Claim"("releasedBy");

-- CreateIndex
CREATE INDEX "ClaimLine_community_idx" ON "ClaimLine"("community");

-- CreateIndex
CREATE INDEX "ClaimLine_resident_idx" ON "ClaimLine"("resident");

-- CreateIndex
CREATE INDEX "ClaimLine_claim_idx" ON "ClaimLine"("claim");

-- CreateIndex
CREATE INDEX "Remittance_community_idx" ON "Remittance"("community");

-- CreateIndex
CREATE INDEX "Remittance_payer_idx" ON "Remittance"("payer");

-- CreateIndex
CREATE INDEX "Remittance_traceNumber_idx" ON "Remittance"("traceNumber");

-- CreateIndex
CREATE INDEX "Remittance_importedBy_idx" ON "Remittance"("importedBy");

-- CreateIndex
CREATE INDEX "Remittance_postedBy_idx" ON "Remittance"("postedBy");

-- CreateIndex
CREATE INDEX "RemittancePosting_community_idx" ON "RemittancePosting"("community");

-- CreateIndex
CREATE INDEX "RemittancePosting_resident_idx" ON "RemittancePosting"("resident");

-- CreateIndex
CREATE INDEX "RemittancePosting_remittance_idx" ON "RemittancePosting"("remittance");

-- CreateIndex
CREATE INDEX "RemittancePosting_claim_idx" ON "RemittancePosting"("claim");

-- CreateIndex
CREATE INDEX "JobCode_community_idx" ON "JobCode"("community");

-- CreateIndex
CREATE INDEX "JobCode_code_idx" ON "JobCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NhsnExport_reference_key" ON "NhsnExport"("reference");

-- CreateIndex
CREATE INDEX "NhsnExport_community_idx" ON "NhsnExport"("community");

-- CreateIndex
CREATE INDEX "NhsnExport_generatedBy_idx" ON "NhsnExport"("generatedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PbjQuarter_reference_key" ON "PbjQuarter"("reference");

-- CreateIndex
CREATE INDEX "PbjQuarter_community_idx" ON "PbjQuarter"("community");

-- CreateIndex
CREATE INDEX "PbjQuarter_exportedBy_idx" ON "PbjQuarter"("exportedBy");

-- CreateIndex
CREATE INDEX "StaffMember_community_idx" ON "StaffMember"("community");

-- CreateIndex
CREATE INDEX "StaffMember_user_idx" ON "StaffMember"("user");

-- CreateIndex
CREATE INDEX "StaffMember_employeeId_idx" ON "StaffMember"("employeeId");

-- CreateIndex
CREATE INDEX "StaffMember_jobCode_idx" ON "StaffMember"("jobCode");

-- CreateIndex
CREATE INDEX "TimeCorrection_community_idx" ON "TimeCorrection"("community");

-- CreateIndex
CREATE INDEX "TimeCorrection_staffMember_idx" ON "TimeCorrection"("staffMember");

-- CreateIndex
CREATE INDEX "TimeCorrection_requestedBy_idx" ON "TimeCorrection"("requestedBy");

-- CreateIndex
CREATE INDEX "TimeCorrection_decidedBy_idx" ON "TimeCorrection"("decidedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TimePunch_punchHash_key" ON "TimePunch"("punchHash");

-- CreateIndex
CREATE INDEX "TimePunch_community_idx" ON "TimePunch"("community");

-- CreateIndex
CREATE INDEX "TimePunch_staffMember_idx" ON "TimePunch"("staffMember");

-- CreateIndex
CREATE INDEX "TimePunch_correction_idx" ON "TimePunch"("correction");

-- CreateIndex
CREATE INDEX "TimePunch_recordedBy_idx" ON "TimePunch"("recordedBy");

-- CreateIndex
CREATE INDEX "Timecard_community_idx" ON "Timecard"("community");

-- CreateIndex
CREATE INDEX "Timecard_staffMember_idx" ON "Timecard"("staffMember");

-- CreateIndex
CREATE INDEX "Timecard_submittedBy_idx" ON "Timecard"("submittedBy");

-- CreateIndex
CREATE INDEX "Timecard_approvedBy_idx" ON "Timecard"("approvedBy");

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AncillaryInvoice" ADD CONSTRAINT "AncillaryInvoice_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "CoveragePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_previousClaim_fkey" FOREIGN KEY ("previousClaim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_validatedBy_fkey" FOREIGN KEY ("validatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_releasedBy_fkey" FOREIGN KEY ("releasedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimLine" ADD CONSTRAINT "ClaimLine_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_importedBy_fkey" FOREIGN KEY ("importedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Remittance" ADD CONSTRAINT "Remittance_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePosting" ADD CONSTRAINT "RemittancePosting_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePosting" ADD CONSTRAINT "RemittancePosting_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePosting" ADD CONSTRAINT "RemittancePosting_remittance_fkey" FOREIGN KEY ("remittance") REFERENCES "Remittance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittancePosting" ADD CONSTRAINT "RemittancePosting_claim_fkey" FOREIGN KEY ("claim") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCode" ADD CONSTRAINT "JobCode_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhsnExport" ADD CONSTRAINT "NhsnExport_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NhsnExport" ADD CONSTRAINT "NhsnExport_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbjQuarter" ADD CONSTRAINT "PbjQuarter_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PbjQuarter" ADD CONSTRAINT "PbjQuarter_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_jobCode_fkey" FOREIGN KEY ("jobCode") REFERENCES "JobCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrection" ADD CONSTRAINT "TimeCorrection_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrection" ADD CONSTRAINT "TimeCorrection_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrection" ADD CONSTRAINT "TimeCorrection_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeCorrection" ADD CONSTRAINT "TimeCorrection_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_correction_fkey" FOREIGN KEY ("correction") REFERENCES "TimeCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePunch" ADD CONSTRAINT "TimePunch_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timecard" ADD CONSTRAINT "Timecard_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
