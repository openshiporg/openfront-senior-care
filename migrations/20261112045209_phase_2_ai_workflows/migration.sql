/*
  Warnings:

  - Added the required column `deidentification` to the `InferenceCall` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mode` to the `InferenceCall` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EvidenceRef" ADD COLUMN     "role" TEXT DEFAULT 'cause';

-- AlterTable
ALTER TABLE "InferenceCall" ADD COLUMN     "agentRun" TEXT,
ADD COLUMN     "dataCategories" JSONB,
ADD COLUMN     "deidentification" TEXT NOT NULL,
ADD COLUMN     "inferenceProvider" TEXT,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "mode" TEXT NOT NULL,
ADD COLUMN     "principal" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "syntheticOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workflowRun" TEXT;

-- AlterTable
ALTER TABLE "MedicationSupplyMovement" ADD COLUMN     "emergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emergencyReason" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "community" TEXT,
ADD COLUMN     "inferenceCall" TEXT,
ADD COLUMN     "rejectedReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sourceFinding" TEXT;

-- AlterTable
ALTER TABLE "WorkflowVersion" ADD COLUMN     "dryRunAt" TIMESTAMP(3),
ADD COLUMN     "proposedBy" TEXT,
ADD COLUMN     "proposedByAgent" TEXT,
ADD COLUMN     "request" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT;

-- CreateTable
CREATE TABLE "ExtractedFact" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "extractor" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT '',
    "sourceId" TEXT NOT NULL DEFAULT '',
    "sourceDigest" TEXT NOT NULL DEFAULT '',
    "cacheKey" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "facts" JSONB,
    "inferenceCall" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceProvider" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "adapter" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "processorRegistration" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedFact_cacheKey_key" ON "ExtractedFact"("cacheKey");

-- CreateIndex
CREATE INDEX "ExtractedFact_community_idx" ON "ExtractedFact"("community");

-- CreateIndex
CREATE INDEX "ExtractedFact_resident_idx" ON "ExtractedFact"("resident");

-- CreateIndex
CREATE INDEX "ExtractedFact_sourceId_idx" ON "ExtractedFact"("sourceId");

-- CreateIndex
CREATE INDEX "ExtractedFact_inferenceCall_idx" ON "ExtractedFact"("inferenceCall");

-- CreateIndex
CREATE UNIQUE INDEX "InferenceProvider_key_key" ON "InferenceProvider"("key");

-- CreateIndex
CREATE INDEX "InferenceProvider_processorRegistration_idx" ON "InferenceProvider"("processorRegistration");

-- CreateIndex
CREATE INDEX "InferenceCall_inferenceProvider_idx" ON "InferenceCall"("inferenceProvider");

-- CreateIndex
CREATE INDEX "InferenceCall_workflowRun_idx" ON "InferenceCall"("workflowRun");

-- CreateIndex
CREATE INDEX "InferenceCall_agentRun_idx" ON "InferenceCall"("agentRun");

-- CreateIndex
CREATE INDEX "Proposal_community_idx" ON "Proposal"("community");

-- CreateIndex
CREATE INDEX "Proposal_sourceFinding_idx" ON "Proposal"("sourceFinding");

-- CreateIndex
CREATE INDEX "Proposal_inferenceCall_idx" ON "Proposal"("inferenceCall");

-- CreateIndex
CREATE INDEX "WorkflowVersion_proposedBy_idx" ON "WorkflowVersion"("proposedBy");

-- CreateIndex
CREATE INDEX "WorkflowVersion_proposedByAgent_idx" ON "WorkflowVersion"("proposedByAgent");

-- CreateIndex
CREATE INDEX "WorkflowVersion_reviewedBy_idx" ON "WorkflowVersion"("reviewedBy");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_sourceFinding_fkey" FOREIGN KEY ("sourceFinding") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_inferenceCall_fkey" FOREIGN KEY ("inferenceCall") REFERENCES "InferenceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedFact" ADD CONSTRAINT "ExtractedFact_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedFact" ADD CONSTRAINT "ExtractedFact_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedFact" ADD CONSTRAINT "ExtractedFact_inferenceCall_fkey" FOREIGN KEY ("inferenceCall") REFERENCES "InferenceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceCall" ADD CONSTRAINT "InferenceCall_inferenceProvider_fkey" FOREIGN KEY ("inferenceProvider") REFERENCES "InferenceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceCall" ADD CONSTRAINT "InferenceCall_workflowRun_fkey" FOREIGN KEY ("workflowRun") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceCall" ADD CONSTRAINT "InferenceCall_agentRun_fkey" FOREIGN KEY ("agentRun") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceProvider" ADD CONSTRAINT "InferenceProvider_processorRegistration_fkey" FOREIGN KEY ("processorRegistration") REFERENCES "ProcessorRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_proposedByAgent_fkey" FOREIGN KEY ("proposedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
