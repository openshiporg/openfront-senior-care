-- Phase 5 workforce depth. New tables and two additive columns only. Prisma also proposed dropping eight hand-written unique
-- indexes from the 4b guards migrations (drift it cannot see); they are kept.

-- AlterTable
ALTER TABLE "JobCode" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "StaffMember" ADD COLUMN     "agencyVendor" TEXT;

-- CreateTable
CREATE TABLE "AgencyInvoice" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "vendor" TEXT,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "periodStart" DATE,
    "periodEnd" DATE,
    "invoicedMinutes" INTEGER DEFAULT 0,
    "amountMinor" BIGINT,
    "expectedMinutes" INTEGER DEFAULT 0,
    "expectedAmountMinor" BIGINT,
    "variance" JSONB,
    "status" TEXT NOT NULL DEFAULT 'received',
    "receivedBy" TEXT,
    "approvedBy" TEXT,
    "approvalNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyVendor" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "contractStart" DATE,
    "contractEnd" DATE,
    "rateCard" JSONB DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "staffMember" TEXT,
    "kind" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    "issuedAt" DATE,
    "expiresAt" DATE,
    "status" TEXT NOT NULL DEFAULT 'pending_verification',
    "document" TEXT NOT NULL DEFAULT '',
    "minutesCompleted" INTEGER DEFAULT 0,
    "completedOn" DATE,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialVerification" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "credential" TEXT,
    "staffMember" TEXT,
    "source" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "evidence" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeieImport" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "month" TEXT NOT NULL DEFAULT '',
    "fileHash" TEXT NOT NULL DEFAULT '',
    "rows" INTEGER DEFAULT 0,
    "checked" INTEGER DEFAULT 0,
    "matches" INTEGER DEFAULT 0,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeieImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExport" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "periodStart" DATE,
    "periodEnd" DATE,
    "rows" INTEGER DEFAULT 0,
    "totalMinutes" INTEGER DEFAULT 0,
    "csv" TEXT NOT NULL DEFAULT '',
    "csvHash" TEXT NOT NULL DEFAULT '',
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "exportedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "unit" TEXT,
    "role" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "required" INTEGER DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "shift" TEXT,
    "staffMember" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "credentialCheck" JSONB,
    "agencyRateMinor" BIGINT,
    "offerTokenHash" TEXT NOT NULL DEFAULT '',
    "offerExpiresAt" TIMESTAMP(3),
    "startPunch" TEXT,
    "coverageReason" TEXT NOT NULL DEFAULT '',
    "decidedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingDay" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "date" DATE,
    "census" INTEGER DEFAULT 0,
    "minutes" JSONB DEFAULT '{}',
    "hprd" JSONB DEFAULT '{}',
    "breaches" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'met',
    "computedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffingTarget" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "ruleRef" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffingTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyInvoice_community_idx" ON "AgencyInvoice"("community");

-- CreateIndex
CREATE INDEX "AgencyInvoice_vendor_idx" ON "AgencyInvoice"("vendor");

-- CreateIndex
CREATE INDEX "AgencyInvoice_invoiceNumber_idx" ON "AgencyInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "AgencyInvoice_receivedBy_idx" ON "AgencyInvoice"("receivedBy");

-- CreateIndex
CREATE INDEX "AgencyInvoice_approvedBy_idx" ON "AgencyInvoice"("approvedBy");

-- CreateIndex
CREATE INDEX "AgencyVendor_community_idx" ON "AgencyVendor"("community");

-- CreateIndex
CREATE INDEX "AgencyVendor_name_idx" ON "AgencyVendor"("name");

-- CreateIndex
CREATE INDEX "Credential_community_idx" ON "Credential"("community");

-- CreateIndex
CREATE INDEX "Credential_staffMember_idx" ON "Credential"("staffMember");

-- CreateIndex
CREATE INDEX "CredentialVerification_community_idx" ON "CredentialVerification"("community");

-- CreateIndex
CREATE INDEX "CredentialVerification_credential_idx" ON "CredentialVerification"("credential");

-- CreateIndex
CREATE INDEX "CredentialVerification_staffMember_idx" ON "CredentialVerification"("staffMember");

-- CreateIndex
CREATE INDEX "CredentialVerification_verifiedBy_idx" ON "CredentialVerification"("verifiedBy");

-- CreateIndex
CREATE INDEX "LeieImport_community_idx" ON "LeieImport"("community");

-- CreateIndex
CREATE INDEX "LeieImport_fileHash_idx" ON "LeieImport"("fileHash");

-- CreateIndex
CREATE INDEX "LeieImport_uploadedBy_idx" ON "LeieImport"("uploadedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollExport_reference_key" ON "PayrollExport"("reference");

-- CreateIndex
CREATE INDEX "PayrollExport_community_idx" ON "PayrollExport"("community");

-- CreateIndex
CREATE INDEX "PayrollExport_exportedBy_idx" ON "PayrollExport"("exportedBy");

-- CreateIndex
CREATE INDEX "Shift_community_idx" ON "Shift"("community");

-- CreateIndex
CREATE INDEX "Shift_unit_idx" ON "Shift"("unit");

-- CreateIndex
CREATE INDEX "ShiftAssignment_community_idx" ON "ShiftAssignment"("community");

-- CreateIndex
CREATE INDEX "ShiftAssignment_shift_idx" ON "ShiftAssignment"("shift");

-- CreateIndex
CREATE INDEX "ShiftAssignment_staffMember_idx" ON "ShiftAssignment"("staffMember");

-- CreateIndex
CREATE INDEX "ShiftAssignment_offerTokenHash_idx" ON "ShiftAssignment"("offerTokenHash");

-- CreateIndex
CREATE INDEX "ShiftAssignment_startPunch_idx" ON "ShiftAssignment"("startPunch");

-- CreateIndex
CREATE INDEX "ShiftAssignment_decidedBy_idx" ON "ShiftAssignment"("decidedBy");

-- CreateIndex
CREATE INDEX "StaffingDay_community_idx" ON "StaffingDay"("community");

-- CreateIndex
CREATE INDEX "StaffingTarget_community_idx" ON "StaffingTarget"("community");

-- CreateIndex
CREATE INDEX "StaffingTarget_unit_idx" ON "StaffingTarget"("unit");

-- CreateIndex
CREATE INDEX "StaffMember_agencyVendor_idx" ON "StaffMember"("agencyVendor");

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_agencyVendor_fkey" FOREIGN KEY ("agencyVendor") REFERENCES "AgencyVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_vendor_fkey" FOREIGN KEY ("vendor") REFERENCES "AgencyVendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyInvoice" ADD CONSTRAINT "AgencyInvoice_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgencyVendor" ADD CONSTRAINT "AgencyVendor_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialVerification" ADD CONSTRAINT "CredentialVerification_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialVerification" ADD CONSTRAINT "CredentialVerification_credential_fkey" FOREIGN KEY ("credential") REFERENCES "Credential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialVerification" ADD CONSTRAINT "CredentialVerification_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialVerification" ADD CONSTRAINT "CredentialVerification_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeieImport" ADD CONSTRAINT "LeieImport_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeieImport" ADD CONSTRAINT "LeieImport_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExport" ADD CONSTRAINT "PayrollExport_exportedBy_fkey" FOREIGN KEY ("exportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shift_fkey" FOREIGN KEY ("shift") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_staffMember_fkey" FOREIGN KEY ("staffMember") REFERENCES "StaffMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_startPunch_fkey" FOREIGN KEY ("startPunch") REFERENCES "TimePunch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingDay" ADD CONSTRAINT "StaffingDay_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingTarget" ADD CONSTRAINT "StaffingTarget_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffingTarget" ADD CONSTRAINT "StaffingTarget_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
