-- AlterTable
ALTER TABLE "CoveragePeriod" ADD COLUMN     "endOverrideReason" TEXT,
ADD COLUMN     "hospiceAgency" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "hospiceElectionOn" DATE,
ADD COLUMN     "hospiceRoomBoardBps" INTEGER,
ADD COLUMN     "lastCoveredDay" DATE,
ADD COLUMN     "qualifyingStayEvidence" TEXT,
ADD COLUMN     "qualifyingStayEvidenceNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "qualifyingStayHospital" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "skilledCertBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "skilledCertSignedAt" DATE;

-- CreateTable
CREATE TABLE "Authorisation" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "stay" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "coverage" TEXT,
    "payer" TEXT,
    "payerAuthNumber" TEXT NOT NULL DEFAULT '',
    "levelOfCare" TEXT NOT NULL DEFAULT '',
    "requestedOn" DATE,
    "authFrom" DATE,
    "authTo" DATE,
    "reviewIntervalDays" INTEGER DEFAULT 7,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "note" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Authorisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitPeriodCounter" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "spellStart" DATE,
    "spellEnd" DATE,
    "fullDaysUsed" INTEGER DEFAULT 0,
    "coinsuranceDaysUsed" INTEGER DEFAULT 0,
    "priorDaysUsed" INTEGER DEFAULT 0,
    "lastCoveredDay" DATE,
    "derivedFromHash" TEXT NOT NULL DEFAULT '',
    "computedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitPeriodCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcurrentReview" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "authorisation" TEXT,
    "reviewedOn" DATE,
    "outcome" TEXT NOT NULL,
    "newAuthTo" DATE,
    "reviewer" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConcurrentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdsAssessment" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "stay" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "ardDate" DATE NOT NULL,
    "itemSet" TEXT,
    "itemSetVersion" TEXT NOT NULL DEFAULT '',
    "items" JSONB,
    "caaTriggers" JSONB,
    "editResults" JSONB,
    "hipps" TEXT NOT NULL DEFAULT '',
    "signatures" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "correctionOf" TEXT,
    "correctionNumber" INTEGER DEFAULT 0,
    "correctionReason" TEXT NOT NULL DEFAULT '',
    "submission" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdsAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MdsSubmission" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "recordCount" INTEGER DEFAULT 0,
    "payload" JSONB,
    "fvr" JSONB,
    "fileHash" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'generated',
    "generatedAt" TIMESTAMP(3),
    "generatedBy" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "fvrParsedAt" TIMESTAMP(3),
    "fvrSummary" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MdsSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdpmClassification" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "stay" TEXT,
    "assessment" TEXT,
    "mappingVersion" TEXT,
    "indicator" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "hipps" TEXT NOT NULL DEFAULT '',
    "groups" JSONB,
    "cmi" JSONB,
    "functionScores" JSONB,
    "inputHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'current',
    "supersededBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdpmClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdpmMappingVersion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "tables" JSONB,
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdpmMappingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorSnfDaysObservation" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "source" TEXT NOT NULL,
    "daysUsed" INTEGER NOT NULL,
    "asOf" DATE,
    "spellStart" DATE,
    "document" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriorSnfDaysObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceRate" (
    "id" TEXT NOT NULL,
    "mappingVersion" TEXT,
    "component" TEXT NOT NULL,
    "geography" TEXT NOT NULL DEFAULT '',
    "rate" DECIMAL(18,4) NOT NULL,
    "laborShare" DECIMAL(12,6),
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferenceRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Authorisation_reference_key" ON "Authorisation"("reference");

-- CreateIndex
CREATE INDEX "Authorisation_resident_idx" ON "Authorisation"("resident");

-- CreateIndex
CREATE INDEX "Authorisation_community_idx" ON "Authorisation"("community");

-- CreateIndex
CREATE INDEX "Authorisation_stay_idx" ON "Authorisation"("stay");

-- CreateIndex
CREATE INDEX "Authorisation_coverage_idx" ON "Authorisation"("coverage");

-- CreateIndex
CREATE INDEX "Authorisation_payer_idx" ON "Authorisation"("payer");

-- CreateIndex
CREATE INDEX "BenefitPeriodCounter_resident_idx" ON "BenefitPeriodCounter"("resident");

-- CreateIndex
CREATE INDEX "BenefitPeriodCounter_community_idx" ON "BenefitPeriodCounter"("community");

-- CreateIndex
CREATE INDEX "ConcurrentReview_resident_idx" ON "ConcurrentReview"("resident");

-- CreateIndex
CREATE INDEX "ConcurrentReview_community_idx" ON "ConcurrentReview"("community");

-- CreateIndex
CREATE INDEX "ConcurrentReview_authorisation_idx" ON "ConcurrentReview"("authorisation");

-- CreateIndex
CREATE INDEX "ConcurrentReview_recordedBy_idx" ON "ConcurrentReview"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "MdsAssessment_reference_key" ON "MdsAssessment"("reference");

-- CreateIndex
CREATE INDEX "MdsAssessment_resident_idx" ON "MdsAssessment"("resident");

-- CreateIndex
CREATE INDEX "MdsAssessment_community_idx" ON "MdsAssessment"("community");

-- CreateIndex
CREATE INDEX "MdsAssessment_stay_idx" ON "MdsAssessment"("stay");

-- CreateIndex
CREATE INDEX "MdsAssessment_itemSet_idx" ON "MdsAssessment"("itemSet");

-- CreateIndex
CREATE INDEX "MdsAssessment_completedBy_idx" ON "MdsAssessment"("completedBy");

-- CreateIndex
CREATE INDEX "MdsAssessment_correctionOf_idx" ON "MdsAssessment"("correctionOf");

-- CreateIndex
CREATE INDEX "MdsAssessment_submission_idx" ON "MdsAssessment"("submission");

-- CreateIndex
CREATE UNIQUE INDEX "MdsAssessment_resident_kind_ard_correction_key" ON "MdsAssessment"("resident", "kind", "ardDate", "correctionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MdsSubmission_reference_key" ON "MdsSubmission"("reference");

-- CreateIndex
CREATE INDEX "MdsSubmission_community_idx" ON "MdsSubmission"("community");

-- CreateIndex
CREATE INDEX "MdsSubmission_generatedBy_idx" ON "MdsSubmission"("generatedBy");

-- CreateIndex
CREATE INDEX "MdsSubmission_uploadedBy_idx" ON "MdsSubmission"("uploadedBy");

-- CreateIndex
CREATE INDEX "PdpmClassification_resident_idx" ON "PdpmClassification"("resident");

-- CreateIndex
CREATE INDEX "PdpmClassification_community_idx" ON "PdpmClassification"("community");

-- CreateIndex
CREATE INDEX "PdpmClassification_stay_idx" ON "PdpmClassification"("stay");

-- CreateIndex
CREATE INDEX "PdpmClassification_assessment_idx" ON "PdpmClassification"("assessment");

-- CreateIndex
CREATE INDEX "PdpmClassification_mappingVersion_idx" ON "PdpmClassification"("mappingVersion");

-- CreateIndex
CREATE INDEX "PdpmClassification_supersededBy_idx" ON "PdpmClassification"("supersededBy");

-- CreateIndex
CREATE UNIQUE INDEX "PdpmMappingVersion_code_key" ON "PdpmMappingVersion"("code");

-- CreateIndex
CREATE INDEX "PriorSnfDaysObservation_resident_idx" ON "PriorSnfDaysObservation"("resident");

-- CreateIndex
CREATE INDEX "PriorSnfDaysObservation_community_idx" ON "PriorSnfDaysObservation"("community");

-- CreateIndex
CREATE INDEX "PriorSnfDaysObservation_document_idx" ON "PriorSnfDaysObservation"("document");

-- CreateIndex
CREATE INDEX "PriorSnfDaysObservation_recordedBy_idx" ON "PriorSnfDaysObservation"("recordedBy");

-- CreateIndex
CREATE INDEX "ReferenceRate_mappingVersion_idx" ON "ReferenceRate"("mappingVersion");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceRate_component_geo_from_key" ON "ReferenceRate"("component", "geography", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CoveragePeriod_qualifyingStayEvidence_idx" ON "CoveragePeriod"("qualifyingStayEvidence");

-- AddForeignKey
ALTER TABLE "CoveragePeriod" ADD CONSTRAINT "CoveragePeriod_qualifyingStayEvidence_fkey" FOREIGN KEY ("qualifyingStayEvidence") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "CoveragePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Authorisation" ADD CONSTRAINT "Authorisation_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitPeriodCounter" ADD CONSTRAINT "BenefitPeriodCounter_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitPeriodCounter" ADD CONSTRAINT "BenefitPeriodCounter_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcurrentReview" ADD CONSTRAINT "ConcurrentReview_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcurrentReview" ADD CONSTRAINT "ConcurrentReview_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcurrentReview" ADD CONSTRAINT "ConcurrentReview_authorisation_fkey" FOREIGN KEY ("authorisation") REFERENCES "Authorisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcurrentReview" ADD CONSTRAINT "ConcurrentReview_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_itemSet_fkey" FOREIGN KEY ("itemSet") REFERENCES "AssessmentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_correctionOf_fkey" FOREIGN KEY ("correctionOf") REFERENCES "MdsAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsAssessment" ADD CONSTRAINT "MdsAssessment_submission_fkey" FOREIGN KEY ("submission") REFERENCES "MdsSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsSubmission" ADD CONSTRAINT "MdsSubmission_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsSubmission" ADD CONSTRAINT "MdsSubmission_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MdsSubmission" ADD CONSTRAINT "MdsSubmission_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_assessment_fkey" FOREIGN KEY ("assessment") REFERENCES "MdsAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_mappingVersion_fkey" FOREIGN KEY ("mappingVersion") REFERENCES "PdpmMappingVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdpmClassification" ADD CONSTRAINT "PdpmClassification_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "PdpmClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorSnfDaysObservation" ADD CONSTRAINT "PriorSnfDaysObservation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorSnfDaysObservation" ADD CONSTRAINT "PriorSnfDaysObservation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorSnfDaysObservation" ADD CONSTRAINT "PriorSnfDaysObservation_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorSnfDaysObservation" ADD CONSTRAINT "PriorSnfDaysObservation_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceRate" ADD CONSTRAINT "ReferenceRate_mappingVersion_fkey" FOREIGN KEY ("mappingVersion") REFERENCES "PdpmMappingVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
