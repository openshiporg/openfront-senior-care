-- CreateTable
CREATE TABLE "AdlRecord" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "activity" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "recordedBy" TEXT,
    "pocTaskSlot" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdlRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "template" TEXT,
    "templateCode" TEXT NOT NULL DEFAULT '',
    "templateVersion" INTEGER,
    "answers" JSONB,
    "band" TEXT NOT NULL DEFAULT '',
    "score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "templateVersion" INTEGER DEFAULT 1,
    "scorer" TEXT NOT NULL,
    "definition" JSONB,
    "settings" JSONB,
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BehaviourEpisode" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "antecedent" TEXT NOT NULL DEFAULT '',
    "intervention" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "severity" TEXT DEFAULT 'mild',
    "startedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BehaviourEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlan" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER DEFAULT 1,
    "supersedes" TEXT,
    "basedOnAssessment" TEXT,
    "proposal" TEXT,
    "startedAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarePlanItem" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "carePlan" TEXT,
    "kind" TEXT NOT NULL,
    "parent" TEXT,
    "text" TEXT NOT NULL DEFAULT '',
    "discipline" TEXT DEFAULT 'nursing',
    "frequency" TEXT DEFAULT 'as_needed',
    "targetDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarePlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntakeRecord" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "amountMl" DECIMAL(12,3),
    "percentEaten" INTEGER,
    "at" TIMESTAMP(3),
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationOrderDetail" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "order" TEXT,
    "reference" TEXT,
    "drugName" TEXT NOT NULL DEFAULT '',
    "dose" DECIMAL(12,3) NOT NULL,
    "doseUnit" TEXT NOT NULL DEFAULT '',
    "route" TEXT,
    "prn" BOOLEAN NOT NULL DEFAULT false,
    "prnReason" TEXT NOT NULL DEFAULT '',
    "prnMinIntervalMinutes" INTEGER,
    "prnFollowUpMinutes" INTEGER DEFAULT 60,
    "times" JSONB,
    "holdParameters" JSONB,
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationOrderDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "readBack" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startAt" TIMESTAMP(3),
    "stopAt" TIMESTAMP(3),
    "enteredBy" TEXT,
    "prescriber" TEXT,
    "prescriberName" TEXT NOT NULL DEFAULT '',
    "needsCountersign" BOOLEAN NOT NULL DEFAULT false,
    "countersignedBy" TEXT,
    "countersignedAt" TIMESTAMP(3),
    "discontinuedReason" TEXT NOT NULL DEFAULT '',
    "allergyOverride" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicianVisit" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "physicianName" TEXT NOT NULL DEFAULT '',
    "visitedAt" TIMESTAMP(3),
    "summary" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhysicianVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocTaskSlot" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "item" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "slotKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PocTaskSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressNote" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "eventAt" TIMESTAMP(3),
    "lateEntry" BOOLEAN NOT NULL DEFAULT false,
    "author" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "amends" TEXT,
    "amendedBy" TEXT,
    "errorReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT,
    "dueAt" TIMESTAMP(3),
    "escalateAt" TIMESTAMP(3),
    "escalationOwnerRole" TEXT NOT NULL DEFAULT '',
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByWorkflow" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSign" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "value" DECIMAL(12,3),
    "unit" TEXT NOT NULL DEFAULT '',
    "takenAt" TIMESTAMP(3),
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalSign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wound" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "site" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "firstNotedAt" TIMESTAMP(3),
    "lastAssessedAt" TIMESTAMP(3),
    "currentStage" TEXT NOT NULL DEFAULT '',
    "assessmentIntervalDays" INTEGER DEFAULT 7,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WoundAssessment" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "wound" TEXT,
    "stage" TEXT,
    "lengthCm" DECIMAL(12,3),
    "widthCm" DECIMAL(12,3),
    "depthCm" DECIMAL(12,3),
    "description" TEXT NOT NULL DEFAULT '',
    "photos" JSONB,
    "assessedAt" TIMESTAMP(3),
    "assessedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WoundAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministrationSlot" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "detail" TEXT,
    "order" TEXT,
    "drugName" TEXT NOT NULL DEFAULT '',
    "slotKey" TEXT NOT NULL DEFAULT '',
    "scheduledFor" TIMESTAMP(3),
    "windowBefore" INTEGER DEFAULT 60,
    "windowAfter" INTEGER DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "settledAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdministrationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountDiscrepancy" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "shiftCount" TEXT,
    "supply" TEXT,
    "expected" DECIMAL(14,3) NOT NULL,
    "outgoingCounted" DECIMAL(14,3) NOT NULL,
    "incomingCounted" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolutionNote" TEXT NOT NULL DEFAULT '',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "adjustment" TEXT,
    "incident" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountDiscrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationAdministration" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "slot" TEXT,
    "detail" TEXT,
    "drugName" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "prn" BOOLEAN NOT NULL DEFAULT false,
    "doseGiven" DECIMAL(14,3),
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "doseUnit" TEXT NOT NULL DEFAULT '',
    "administeredAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3),
    "lateEntry" BOOLEAN NOT NULL DEFAULT false,
    "timing" TEXT,
    "identityCheck" TEXT,
    "holdVital" JSONB,
    "administeredBy" TEXT,
    "witness" TEXT,
    "supply" TEXT,
    "followUpDueAt" TIMESTAMP(3),
    "followUpOf" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationAdministration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationDestruction" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "supply" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT '',
    "destroyedAt" TIMESTAMP(3),
    "destroyedBy" TEXT,
    "witness" TEXT,
    "movement" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationDestruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationReference" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "genericName" TEXT NOT NULL DEFAULT '',
    "strength" TEXT NOT NULL DEFAULT '',
    "form" TEXT NOT NULL DEFAULT '',
    "ndc" TEXT NOT NULL DEFAULT '',
    "schedule" TEXT NOT NULL DEFAULT 'none',
    "highAlert" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSupply" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "reference" TEXT,
    "unitLocation" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "lot" TEXT NOT NULL DEFAULT '',
    "expiresOn" TIMESTAMP(3),
    "controlled" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL DEFAULT '',
    "balance" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationSupply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationSupplyMovement" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "supply" TEXT,
    "seq" INTEGER,
    "kind" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "at" TIMESTAMP(3),
    "actor" TEXT,
    "witness" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "administration" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationSupplyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyRelationship" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "adapter" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrnFollowUp" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "administration" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "effect" TEXT,
    "recordedBy" TEXT,
    "recordedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrnFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCount" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "unit" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "shift" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "outgoing" TEXT,
    "incoming" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCountEntry" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "shiftCount" TEXT,
    "supply" TEXT,
    "role" TEXT NOT NULL,
    "counted" DECIMAL(14,3) NOT NULL,
    "countedBy" TEXT,
    "at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCountEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntibioticCourse" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "drugName" TEXT NOT NULL DEFAULT '',
    "indication" TEXT NOT NULL DEFAULT '',
    "order" TEXT,
    "case" TEXT,
    "startedAt" TIMESTAMP(3),
    "plannedDays" INTEGER,
    "timeoutDueAt" TIMESTAMP(3),
    "timeoutOutcome" TEXT,
    "timeoutAt" TIMESTAMP(3),
    "timeoutBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntibioticCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Immunisation" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "vaccine" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "offeredAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "givenAt" TIMESTAMP(3),
    "lot" TEXT NOT NULL DEFAULT '',
    "recordedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Immunisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "severity" TEXT DEFAULT 'no_injury',
    "status" TEXT NOT NULL DEFAULT 'reported',
    "occurredAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reportedBy" TEXT,
    "witnessed" BOOLEAN NOT NULL DEFAULT false,
    "headStrike" BOOLEAN NOT NULL DEFAULT false,
    "allegedAbuseOrSbi" BOOLEAN NOT NULL DEFAULT false,
    "allegedOther" BOOLEAN NOT NULL DEFAULT false,
    "reportableDecision" TEXT DEFAULT 'pending',
    "downgradedBy" TEXT,
    "downgradeReason" TEXT NOT NULL DEFAULT '',
    "source" TEXT DEFAULT 'staff',
    "sourceNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentInvestigation" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "incident" TEXT,
    "findings" TEXT NOT NULL DEFAULT '',
    "rootCause" TEXT NOT NULL DEFAULT '',
    "interventions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "investigator" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentParty" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "incident" TEXT,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "notifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InfectionCase" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "syndrome" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'suspected',
    "onsetAt" TIMESTAMP(3),
    "criteria" JSONB,
    "organism" TEXT NOT NULL DEFAULT '',
    "criteriaMet" BOOLEAN NOT NULL DEFAULT false,
    "criteriaSet" TEXT NOT NULL DEFAULT '',
    "cultureAt" TIMESTAMP(3),
    "outbreak" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InfectionCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbreak" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "organism" TEXT NOT NULL DEFAULT '',
    "unit" TEXT,
    "status" TEXT NOT NULL DEFAULT 'declared',
    "declaredAt" TIMESTAMP(3),
    "declaredBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outbreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecautionOrder" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "kind" TEXT NOT NULL,
    "case" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reviewOn" DATE,
    "reason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecautionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryReport" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "community" TEXT,
    "incident" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "body" JSONB,
    "channel" TEXT,
    "confirmation" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "submittedBy" TEXT,
    "ruleNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRef" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "finding" TEXT,
    "recordType" TEXT NOT NULL DEFAULT '',
    "recordId" TEXT NOT NULL DEFAULT '',
    "spanStart" INTEGER,
    "spanEnd" INTEGER,
    "quote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "resident" TEXT,
    "workflowVersion" TEXT,
    "run" TEXT,
    "workflowCode" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL DEFAULT '',
    "severity" TEXT DEFAULT 'warning',
    "status" TEXT NOT NULL DEFAULT 'open',
    "task" TEXT,
    "proposal" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT NOT NULL DEFAULT '',
    "dismissedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InferenceCall" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "providerClass" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL,
    "policyAtCall" TEXT NOT NULL DEFAULT '',
    "inputHash" TEXT NOT NULL DEFAULT '',
    "outputHash" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3),
    "actor" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InferenceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowActivation" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "workflowVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "approvals" JSONB,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "workflowVersion" TEXT,
    "windowKey" TEXT NOT NULL DEFAULT '',
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "findingsOpened" INTEGER DEFAULT 0,
    "findingsResolved" INTEGER DEFAULT 0,
    "summary" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "definition" TEXT,
    "versionNumber" INTEGER,
    "graph" JSONB,
    "graphHash" TEXT NOT NULL DEFAULT '',
    "policyVersion" TEXT NOT NULL DEFAULT '',
    "policy" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "dryRun" JSONB,
    "createdByInference" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdlRecord_resident_idx" ON "AdlRecord"("resident");

-- CreateIndex
CREATE INDEX "AdlRecord_community_idx" ON "AdlRecord"("community");

-- CreateIndex
CREATE INDEX "AdlRecord_recordedBy_idx" ON "AdlRecord"("recordedBy");

-- CreateIndex
CREATE INDEX "AdlRecord_pocTaskSlot_idx" ON "AdlRecord"("pocTaskSlot");

-- CreateIndex
CREATE INDEX "Assessment_resident_idx" ON "Assessment"("resident");

-- CreateIndex
CREATE INDEX "Assessment_community_idx" ON "Assessment"("community");

-- CreateIndex
CREATE INDEX "Assessment_template_idx" ON "Assessment"("template");

-- CreateIndex
CREATE INDEX "Assessment_templateCode_idx" ON "Assessment"("templateCode");

-- CreateIndex
CREATE INDEX "Assessment_completedBy_idx" ON "Assessment"("completedBy");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_code_idx" ON "AssessmentTemplate"("code");

-- CreateIndex
CREATE INDEX "BehaviourEpisode_resident_idx" ON "BehaviourEpisode"("resident");

-- CreateIndex
CREATE INDEX "BehaviourEpisode_community_idx" ON "BehaviourEpisode"("community");

-- CreateIndex
CREATE INDEX "BehaviourEpisode_recordedBy_idx" ON "BehaviourEpisode"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CarePlan_reference_key" ON "CarePlan"("reference");

-- CreateIndex
CREATE INDEX "CarePlan_resident_idx" ON "CarePlan"("resident");

-- CreateIndex
CREATE INDEX "CarePlan_community_idx" ON "CarePlan"("community");

-- CreateIndex
CREATE INDEX "CarePlan_supersedes_idx" ON "CarePlan"("supersedes");

-- CreateIndex
CREATE INDEX "CarePlan_basedOnAssessment_idx" ON "CarePlan"("basedOnAssessment");

-- CreateIndex
CREATE INDEX "CarePlan_proposal_idx" ON "CarePlan"("proposal");

-- CreateIndex
CREATE INDEX "CarePlan_signedBy_idx" ON "CarePlan"("signedBy");

-- CreateIndex
CREATE INDEX "CarePlanItem_resident_idx" ON "CarePlanItem"("resident");

-- CreateIndex
CREATE INDEX "CarePlanItem_community_idx" ON "CarePlanItem"("community");

-- CreateIndex
CREATE INDEX "CarePlanItem_carePlan_idx" ON "CarePlanItem"("carePlan");

-- CreateIndex
CREATE INDEX "CarePlanItem_parent_idx" ON "CarePlanItem"("parent");

-- CreateIndex
CREATE INDEX "IntakeRecord_resident_idx" ON "IntakeRecord"("resident");

-- CreateIndex
CREATE INDEX "IntakeRecord_community_idx" ON "IntakeRecord"("community");

-- CreateIndex
CREATE INDEX "IntakeRecord_recordedBy_idx" ON "IntakeRecord"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "MedicationOrderDetail_order_key" ON "MedicationOrderDetail"("order");

-- CreateIndex
CREATE INDEX "MedicationOrderDetail_resident_idx" ON "MedicationOrderDetail"("resident");

-- CreateIndex
CREATE INDEX "MedicationOrderDetail_community_idx" ON "MedicationOrderDetail"("community");

-- CreateIndex
CREATE INDEX "MedicationOrderDetail_reference_idx" ON "MedicationOrderDetail"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE INDEX "Order_resident_idx" ON "Order"("resident");

-- CreateIndex
CREATE INDEX "Order_community_idx" ON "Order"("community");

-- CreateIndex
CREATE INDEX "Order_enteredBy_idx" ON "Order"("enteredBy");

-- CreateIndex
CREATE INDEX "Order_prescriber_idx" ON "Order"("prescriber");

-- CreateIndex
CREATE INDEX "Order_countersignedBy_idx" ON "Order"("countersignedBy");

-- CreateIndex
CREATE INDEX "PhysicianVisit_resident_idx" ON "PhysicianVisit"("resident");

-- CreateIndex
CREATE INDEX "PhysicianVisit_community_idx" ON "PhysicianVisit"("community");

-- CreateIndex
CREATE INDEX "PhysicianVisit_note_idx" ON "PhysicianVisit"("note");

-- CreateIndex
CREATE INDEX "PhysicianVisit_recordedBy_idx" ON "PhysicianVisit"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PocTaskSlot_slotKey_key" ON "PocTaskSlot"("slotKey");

-- CreateIndex
CREATE INDEX "PocTaskSlot_resident_idx" ON "PocTaskSlot"("resident");

-- CreateIndex
CREATE INDEX "PocTaskSlot_community_idx" ON "PocTaskSlot"("community");

-- CreateIndex
CREATE INDEX "PocTaskSlot_item_idx" ON "PocTaskSlot"("item");

-- CreateIndex
CREATE INDEX "PocTaskSlot_doneBy_idx" ON "PocTaskSlot"("doneBy");

-- CreateIndex
CREATE INDEX "ProgressNote_resident_idx" ON "ProgressNote"("resident");

-- CreateIndex
CREATE INDEX "ProgressNote_community_idx" ON "ProgressNote"("community");

-- CreateIndex
CREATE INDEX "ProgressNote_author_idx" ON "ProgressNote"("author");

-- CreateIndex
CREATE INDEX "ProgressNote_signedBy_idx" ON "ProgressNote"("signedBy");

-- CreateIndex
CREATE INDEX "ProgressNote_amends_idx" ON "ProgressNote"("amends");

-- CreateIndex
CREATE INDEX "ProgressNote_amendedBy_idx" ON "ProgressNote"("amendedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Task_dedupeKey_key" ON "Task"("dedupeKey");

-- CreateIndex
CREATE INDEX "Task_community_idx" ON "Task"("community");

-- CreateIndex
CREATE INDEX "Task_resident_idx" ON "Task"("resident");

-- CreateIndex
CREATE INDEX "Task_assignee_idx" ON "Task"("assignee");

-- CreateIndex
CREATE INDEX "Task_subjectId_idx" ON "Task"("subjectId");

-- CreateIndex
CREATE INDEX "Task_completedBy_idx" ON "Task"("completedBy");

-- CreateIndex
CREATE INDEX "VitalSign_resident_idx" ON "VitalSign"("resident");

-- CreateIndex
CREATE INDEX "VitalSign_community_idx" ON "VitalSign"("community");

-- CreateIndex
CREATE INDEX "VitalSign_recordedBy_idx" ON "VitalSign"("recordedBy");

-- CreateIndex
CREATE INDEX "Wound_resident_idx" ON "Wound"("resident");

-- CreateIndex
CREATE INDEX "Wound_community_idx" ON "Wound"("community");

-- CreateIndex
CREATE INDEX "WoundAssessment_resident_idx" ON "WoundAssessment"("resident");

-- CreateIndex
CREATE INDEX "WoundAssessment_community_idx" ON "WoundAssessment"("community");

-- CreateIndex
CREATE INDEX "WoundAssessment_wound_idx" ON "WoundAssessment"("wound");

-- CreateIndex
CREATE INDEX "WoundAssessment_assessedBy_idx" ON "WoundAssessment"("assessedBy");

-- CreateIndex
CREATE UNIQUE INDEX "AdministrationSlot_slotKey_key" ON "AdministrationSlot"("slotKey");

-- CreateIndex
CREATE INDEX "AdministrationSlot_resident_idx" ON "AdministrationSlot"("resident");

-- CreateIndex
CREATE INDEX "AdministrationSlot_community_idx" ON "AdministrationSlot"("community");

-- CreateIndex
CREATE INDEX "AdministrationSlot_detail_idx" ON "AdministrationSlot"("detail");

-- CreateIndex
CREATE INDEX "AdministrationSlot_order_idx" ON "AdministrationSlot"("order");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_community_idx" ON "CountDiscrepancy"("community");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_shiftCount_idx" ON "CountDiscrepancy"("shiftCount");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_supply_idx" ON "CountDiscrepancy"("supply");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_resolvedBy_idx" ON "CountDiscrepancy"("resolvedBy");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_adjustment_idx" ON "CountDiscrepancy"("adjustment");

-- CreateIndex
CREATE INDEX "CountDiscrepancy_incident_idx" ON "CountDiscrepancy"("incident");

-- CreateIndex
CREATE INDEX "MedicationAdministration_resident_idx" ON "MedicationAdministration"("resident");

-- CreateIndex
CREATE INDEX "MedicationAdministration_community_idx" ON "MedicationAdministration"("community");

-- CreateIndex
CREATE INDEX "MedicationAdministration_slot_idx" ON "MedicationAdministration"("slot");

-- CreateIndex
CREATE INDEX "MedicationAdministration_detail_idx" ON "MedicationAdministration"("detail");

-- CreateIndex
CREATE INDEX "MedicationAdministration_administeredBy_idx" ON "MedicationAdministration"("administeredBy");

-- CreateIndex
CREATE INDEX "MedicationAdministration_witness_idx" ON "MedicationAdministration"("witness");

-- CreateIndex
CREATE INDEX "MedicationAdministration_supply_idx" ON "MedicationAdministration"("supply");

-- CreateIndex
CREATE INDEX "MedicationAdministration_followUpOf_idx" ON "MedicationAdministration"("followUpOf");

-- CreateIndex
CREATE INDEX "MedicationDestruction_community_idx" ON "MedicationDestruction"("community");

-- CreateIndex
CREATE INDEX "MedicationDestruction_supply_idx" ON "MedicationDestruction"("supply");

-- CreateIndex
CREATE INDEX "MedicationDestruction_destroyedBy_idx" ON "MedicationDestruction"("destroyedBy");

-- CreateIndex
CREATE INDEX "MedicationDestruction_witness_idx" ON "MedicationDestruction"("witness");

-- CreateIndex
CREATE INDEX "MedicationDestruction_movement_idx" ON "MedicationDestruction"("movement");

-- CreateIndex
CREATE INDEX "MedicationReference_ndc_idx" ON "MedicationReference"("ndc");

-- CreateIndex
CREATE INDEX "MedicationSupply_community_idx" ON "MedicationSupply"("community");

-- CreateIndex
CREATE INDEX "MedicationSupply_resident_idx" ON "MedicationSupply"("resident");

-- CreateIndex
CREATE INDEX "MedicationSupply_reference_idx" ON "MedicationSupply"("reference");

-- CreateIndex
CREATE INDEX "MedicationSupply_unitLocation_idx" ON "MedicationSupply"("unitLocation");

-- CreateIndex
CREATE INDEX "MedicationSupplyMovement_community_idx" ON "MedicationSupplyMovement"("community");

-- CreateIndex
CREATE INDEX "MedicationSupplyMovement_supply_idx" ON "MedicationSupplyMovement"("supply");

-- CreateIndex
CREATE INDEX "MedicationSupplyMovement_actor_idx" ON "MedicationSupplyMovement"("actor");

-- CreateIndex
CREATE INDEX "MedicationSupplyMovement_witness_idx" ON "MedicationSupplyMovement"("witness");

-- CreateIndex
CREATE INDEX "MedicationSupplyMovement_administration_idx" ON "MedicationSupplyMovement"("administration");

-- CreateIndex
CREATE INDEX "PharmacyRelationship_community_idx" ON "PharmacyRelationship"("community");

-- CreateIndex
CREATE INDEX "PrnFollowUp_resident_idx" ON "PrnFollowUp"("resident");

-- CreateIndex
CREATE INDEX "PrnFollowUp_community_idx" ON "PrnFollowUp"("community");

-- CreateIndex
CREATE INDEX "PrnFollowUp_administration_idx" ON "PrnFollowUp"("administration");

-- CreateIndex
CREATE INDEX "PrnFollowUp_recordedBy_idx" ON "PrnFollowUp"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftCount_reference_key" ON "ShiftCount"("reference");

-- CreateIndex
CREATE INDEX "ShiftCount_community_idx" ON "ShiftCount"("community");

-- CreateIndex
CREATE INDEX "ShiftCount_unit_idx" ON "ShiftCount"("unit");

-- CreateIndex
CREATE INDEX "ShiftCount_outgoing_idx" ON "ShiftCount"("outgoing");

-- CreateIndex
CREATE INDEX "ShiftCount_incoming_idx" ON "ShiftCount"("incoming");

-- CreateIndex
CREATE INDEX "ShiftCountEntry_community_idx" ON "ShiftCountEntry"("community");

-- CreateIndex
CREATE INDEX "ShiftCountEntry_shiftCount_idx" ON "ShiftCountEntry"("shiftCount");

-- CreateIndex
CREATE INDEX "ShiftCountEntry_supply_idx" ON "ShiftCountEntry"("supply");

-- CreateIndex
CREATE INDEX "ShiftCountEntry_countedBy_idx" ON "ShiftCountEntry"("countedBy");

-- CreateIndex
CREATE INDEX "AntibioticCourse_resident_idx" ON "AntibioticCourse"("resident");

-- CreateIndex
CREATE INDEX "AntibioticCourse_community_idx" ON "AntibioticCourse"("community");

-- CreateIndex
CREATE INDEX "AntibioticCourse_order_idx" ON "AntibioticCourse"("order");

-- CreateIndex
CREATE INDEX "AntibioticCourse_case_idx" ON "AntibioticCourse"("case");

-- CreateIndex
CREATE INDEX "AntibioticCourse_timeoutBy_idx" ON "AntibioticCourse"("timeoutBy");

-- CreateIndex
CREATE INDEX "Immunisation_resident_idx" ON "Immunisation"("resident");

-- CreateIndex
CREATE INDEX "Immunisation_community_idx" ON "Immunisation"("community");

-- CreateIndex
CREATE INDEX "Immunisation_recordedBy_idx" ON "Immunisation"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_resident_idx" ON "Incident"("resident");

-- CreateIndex
CREATE INDEX "Incident_community_idx" ON "Incident"("community");

-- CreateIndex
CREATE INDEX "Incident_reportedBy_idx" ON "Incident"("reportedBy");

-- CreateIndex
CREATE INDEX "Incident_downgradedBy_idx" ON "Incident"("downgradedBy");

-- CreateIndex
CREATE INDEX "Incident_sourceNote_idx" ON "Incident"("sourceNote");

-- CreateIndex
CREATE INDEX "IncidentInvestigation_resident_idx" ON "IncidentInvestigation"("resident");

-- CreateIndex
CREATE INDEX "IncidentInvestigation_community_idx" ON "IncidentInvestigation"("community");

-- CreateIndex
CREATE INDEX "IncidentInvestigation_incident_idx" ON "IncidentInvestigation"("incident");

-- CreateIndex
CREATE INDEX "IncidentInvestigation_investigator_idx" ON "IncidentInvestigation"("investigator");

-- CreateIndex
CREATE INDEX "IncidentParty_resident_idx" ON "IncidentParty"("resident");

-- CreateIndex
CREATE INDEX "IncidentParty_community_idx" ON "IncidentParty"("community");

-- CreateIndex
CREATE INDEX "IncidentParty_incident_idx" ON "IncidentParty"("incident");

-- CreateIndex
CREATE INDEX "InfectionCase_resident_idx" ON "InfectionCase"("resident");

-- CreateIndex
CREATE INDEX "InfectionCase_community_idx" ON "InfectionCase"("community");

-- CreateIndex
CREATE INDEX "InfectionCase_outbreak_idx" ON "InfectionCase"("outbreak");

-- CreateIndex
CREATE INDEX "Outbreak_community_idx" ON "Outbreak"("community");

-- CreateIndex
CREATE INDEX "Outbreak_unit_idx" ON "Outbreak"("unit");

-- CreateIndex
CREATE INDEX "Outbreak_declaredBy_idx" ON "Outbreak"("declaredBy");

-- CreateIndex
CREATE INDEX "PrecautionOrder_resident_idx" ON "PrecautionOrder"("resident");

-- CreateIndex
CREATE INDEX "PrecautionOrder_community_idx" ON "PrecautionOrder"("community");

-- CreateIndex
CREATE INDEX "PrecautionOrder_case_idx" ON "PrecautionOrder"("case");

-- CreateIndex
CREATE INDEX "RegulatoryReport_resident_idx" ON "RegulatoryReport"("resident");

-- CreateIndex
CREATE INDEX "RegulatoryReport_community_idx" ON "RegulatoryReport"("community");

-- CreateIndex
CREATE INDEX "RegulatoryReport_incident_idx" ON "RegulatoryReport"("incident");

-- CreateIndex
CREATE INDEX "RegulatoryReport_submittedBy_idx" ON "RegulatoryReport"("submittedBy");

-- CreateIndex
CREATE INDEX "EvidenceRef_community_idx" ON "EvidenceRef"("community");

-- CreateIndex
CREATE INDEX "EvidenceRef_finding_idx" ON "EvidenceRef"("finding");

-- CreateIndex
CREATE UNIQUE INDEX "Finding_dedupeKey_key" ON "Finding"("dedupeKey");

-- CreateIndex
CREATE INDEX "Finding_community_idx" ON "Finding"("community");

-- CreateIndex
CREATE INDEX "Finding_resident_idx" ON "Finding"("resident");

-- CreateIndex
CREATE INDEX "Finding_workflowVersion_idx" ON "Finding"("workflowVersion");

-- CreateIndex
CREATE INDEX "Finding_run_idx" ON "Finding"("run");

-- CreateIndex
CREATE INDEX "Finding_workflowCode_idx" ON "Finding"("workflowCode");

-- CreateIndex
CREATE INDEX "Finding_task_idx" ON "Finding"("task");

-- CreateIndex
CREATE INDEX "Finding_proposal_idx" ON "Finding"("proposal");

-- CreateIndex
CREATE INDEX "Finding_dismissedBy_idx" ON "Finding"("dismissedBy");

-- CreateIndex
CREATE INDEX "InferenceCall_community_idx" ON "InferenceCall"("community");

-- CreateIndex
CREATE INDEX "InferenceCall_actor_idx" ON "InferenceCall"("actor");

-- CreateIndex
CREATE INDEX "WorkflowActivation_community_idx" ON "WorkflowActivation"("community");

-- CreateIndex
CREATE INDEX "WorkflowActivation_workflowVersion_idx" ON "WorkflowActivation"("workflowVersion");

-- CreateIndex
CREATE INDEX "WorkflowActivation_activatedBy_idx" ON "WorkflowActivation"("activatedBy");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_community_idx" ON "WorkflowDefinition"("community");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_code_idx" ON "WorkflowDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_windowKey_key" ON "WorkflowRun"("windowKey");

-- CreateIndex
CREATE INDEX "WorkflowRun_community_idx" ON "WorkflowRun"("community");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowVersion_idx" ON "WorkflowRun"("workflowVersion");

-- CreateIndex
CREATE INDEX "WorkflowVersion_community_idx" ON "WorkflowVersion"("community");

-- CreateIndex
CREATE INDEX "WorkflowVersion_definition_idx" ON "WorkflowVersion"("definition");

-- CreateIndex
CREATE INDEX "WorkflowVersion_createdByInference_idx" ON "WorkflowVersion"("createdByInference");

-- AddForeignKey
ALTER TABLE "AdlRecord" ADD CONSTRAINT "AdlRecord_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdlRecord" ADD CONSTRAINT "AdlRecord_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdlRecord" ADD CONSTRAINT "AdlRecord_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdlRecord" ADD CONSTRAINT "AdlRecord_pocTaskSlot_fkey" FOREIGN KEY ("pocTaskSlot") REFERENCES "PocTaskSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_template_fkey" FOREIGN KEY ("template") REFERENCES "AssessmentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEpisode" ADD CONSTRAINT "BehaviourEpisode_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEpisode" ADD CONSTRAINT "BehaviourEpisode_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BehaviourEpisode" ADD CONSTRAINT "BehaviourEpisode_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "CarePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_basedOnAssessment_fkey" FOREIGN KEY ("basedOnAssessment") REFERENCES "Assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_proposal_fkey" FOREIGN KEY ("proposal") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlan" ADD CONSTRAINT "CarePlan_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_carePlan_fkey" FOREIGN KEY ("carePlan") REFERENCES "CarePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarePlanItem" ADD CONSTRAINT "CarePlanItem_parent_fkey" FOREIGN KEY ("parent") REFERENCES "CarePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRecord" ADD CONSTRAINT "IntakeRecord_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRecord" ADD CONSTRAINT "IntakeRecord_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntakeRecord" ADD CONSTRAINT "IntakeRecord_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrderDetail" ADD CONSTRAINT "MedicationOrderDetail_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrderDetail" ADD CONSTRAINT "MedicationOrderDetail_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrderDetail" ADD CONSTRAINT "MedicationOrderDetail_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationOrderDetail" ADD CONSTRAINT "MedicationOrderDetail_reference_fkey" FOREIGN KEY ("reference") REFERENCES "MedicationReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_enteredBy_fkey" FOREIGN KEY ("enteredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_prescriber_fkey" FOREIGN KEY ("prescriber") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_countersignedBy_fkey" FOREIGN KEY ("countersignedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianVisit" ADD CONSTRAINT "PhysicianVisit_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianVisit" ADD CONSTRAINT "PhysicianVisit_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianVisit" ADD CONSTRAINT "PhysicianVisit_note_fkey" FOREIGN KEY ("note") REFERENCES "ProgressNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicianVisit" ADD CONSTRAINT "PhysicianVisit_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocTaskSlot" ADD CONSTRAINT "PocTaskSlot_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocTaskSlot" ADD CONSTRAINT "PocTaskSlot_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocTaskSlot" ADD CONSTRAINT "PocTaskSlot_item_fkey" FOREIGN KEY ("item") REFERENCES "CarePlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PocTaskSlot" ADD CONSTRAINT "PocTaskSlot_doneBy_fkey" FOREIGN KEY ("doneBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_author_fkey" FOREIGN KEY ("author") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_amends_fkey" FOREIGN KEY ("amends") REFERENCES "ProgressNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressNote" ADD CONSTRAINT "ProgressNote_amendedBy_fkey" FOREIGN KEY ("amendedBy") REFERENCES "ProgressNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSign" ADD CONSTRAINT "VitalSign_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wound" ADD CONSTRAINT "Wound_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wound" ADD CONSTRAINT "Wound_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WoundAssessment" ADD CONSTRAINT "WoundAssessment_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WoundAssessment" ADD CONSTRAINT "WoundAssessment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WoundAssessment" ADD CONSTRAINT "WoundAssessment_wound_fkey" FOREIGN KEY ("wound") REFERENCES "Wound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WoundAssessment" ADD CONSTRAINT "WoundAssessment_assessedBy_fkey" FOREIGN KEY ("assessedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationSlot" ADD CONSTRAINT "AdministrationSlot_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationSlot" ADD CONSTRAINT "AdministrationSlot_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationSlot" ADD CONSTRAINT "AdministrationSlot_detail_fkey" FOREIGN KEY ("detail") REFERENCES "MedicationOrderDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministrationSlot" ADD CONSTRAINT "AdministrationSlot_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_shiftCount_fkey" FOREIGN KEY ("shiftCount") REFERENCES "ShiftCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_supply_fkey" FOREIGN KEY ("supply") REFERENCES "MedicationSupply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_adjustment_fkey" FOREIGN KEY ("adjustment") REFERENCES "MedicationSupplyMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountDiscrepancy" ADD CONSTRAINT "CountDiscrepancy_incident_fkey" FOREIGN KEY ("incident") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_slot_fkey" FOREIGN KEY ("slot") REFERENCES "AdministrationSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_detail_fkey" FOREIGN KEY ("detail") REFERENCES "MedicationOrderDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_administeredBy_fkey" FOREIGN KEY ("administeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_supply_fkey" FOREIGN KEY ("supply") REFERENCES "MedicationSupply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationAdministration" ADD CONSTRAINT "MedicationAdministration_followUpOf_fkey" FOREIGN KEY ("followUpOf") REFERENCES "MedicationAdministration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDestruction" ADD CONSTRAINT "MedicationDestruction_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDestruction" ADD CONSTRAINT "MedicationDestruction_supply_fkey" FOREIGN KEY ("supply") REFERENCES "MedicationSupply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDestruction" ADD CONSTRAINT "MedicationDestruction_destroyedBy_fkey" FOREIGN KEY ("destroyedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDestruction" ADD CONSTRAINT "MedicationDestruction_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationDestruction" ADD CONSTRAINT "MedicationDestruction_movement_fkey" FOREIGN KEY ("movement") REFERENCES "MedicationSupplyMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupply" ADD CONSTRAINT "MedicationSupply_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupply" ADD CONSTRAINT "MedicationSupply_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupply" ADD CONSTRAINT "MedicationSupply_reference_fkey" FOREIGN KEY ("reference") REFERENCES "MedicationReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupply" ADD CONSTRAINT "MedicationSupply_unitLocation_fkey" FOREIGN KEY ("unitLocation") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_supply_fkey" FOREIGN KEY ("supply") REFERENCES "MedicationSupply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationSupplyMovement" ADD CONSTRAINT "MedicationSupplyMovement_administration_fkey" FOREIGN KEY ("administration") REFERENCES "MedicationAdministration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyRelationship" ADD CONSTRAINT "PharmacyRelationship_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrnFollowUp" ADD CONSTRAINT "PrnFollowUp_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrnFollowUp" ADD CONSTRAINT "PrnFollowUp_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrnFollowUp" ADD CONSTRAINT "PrnFollowUp_administration_fkey" FOREIGN KEY ("administration") REFERENCES "MedicationAdministration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrnFollowUp" ADD CONSTRAINT "PrnFollowUp_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCount" ADD CONSTRAINT "ShiftCount_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCount" ADD CONSTRAINT "ShiftCount_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCount" ADD CONSTRAINT "ShiftCount_outgoing_fkey" FOREIGN KEY ("outgoing") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCount" ADD CONSTRAINT "ShiftCount_incoming_fkey" FOREIGN KEY ("incoming") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCountEntry" ADD CONSTRAINT "ShiftCountEntry_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCountEntry" ADD CONSTRAINT "ShiftCountEntry_shiftCount_fkey" FOREIGN KEY ("shiftCount") REFERENCES "ShiftCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCountEntry" ADD CONSTRAINT "ShiftCountEntry_supply_fkey" FOREIGN KEY ("supply") REFERENCES "MedicationSupply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCountEntry" ADD CONSTRAINT "ShiftCountEntry_countedBy_fkey" FOREIGN KEY ("countedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntibioticCourse" ADD CONSTRAINT "AntibioticCourse_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntibioticCourse" ADD CONSTRAINT "AntibioticCourse_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntibioticCourse" ADD CONSTRAINT "AntibioticCourse_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntibioticCourse" ADD CONSTRAINT "AntibioticCourse_case_fkey" FOREIGN KEY ("case") REFERENCES "InfectionCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntibioticCourse" ADD CONSTRAINT "AntibioticCourse_timeoutBy_fkey" FOREIGN KEY ("timeoutBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Immunisation" ADD CONSTRAINT "Immunisation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Immunisation" ADD CONSTRAINT "Immunisation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Immunisation" ADD CONSTRAINT "Immunisation_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_downgradedBy_fkey" FOREIGN KEY ("downgradedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_sourceNote_fkey" FOREIGN KEY ("sourceNote") REFERENCES "ProgressNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigation" ADD CONSTRAINT "IncidentInvestigation_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigation" ADD CONSTRAINT "IncidentInvestigation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigation" ADD CONSTRAINT "IncidentInvestigation_incident_fkey" FOREIGN KEY ("incident") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentInvestigation" ADD CONSTRAINT "IncidentInvestigation_investigator_fkey" FOREIGN KEY ("investigator") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentParty" ADD CONSTRAINT "IncidentParty_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentParty" ADD CONSTRAINT "IncidentParty_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentParty" ADD CONSTRAINT "IncidentParty_incident_fkey" FOREIGN KEY ("incident") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfectionCase" ADD CONSTRAINT "InfectionCase_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfectionCase" ADD CONSTRAINT "InfectionCase_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InfectionCase" ADD CONSTRAINT "InfectionCase_outbreak_fkey" FOREIGN KEY ("outbreak") REFERENCES "Outbreak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbreak" ADD CONSTRAINT "Outbreak_declaredBy_fkey" FOREIGN KEY ("declaredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecautionOrder" ADD CONSTRAINT "PrecautionOrder_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecautionOrder" ADD CONSTRAINT "PrecautionOrder_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecautionOrder" ADD CONSTRAINT "PrecautionOrder_case_fkey" FOREIGN KEY ("case") REFERENCES "InfectionCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReport" ADD CONSTRAINT "RegulatoryReport_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReport" ADD CONSTRAINT "RegulatoryReport_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReport" ADD CONSTRAINT "RegulatoryReport_incident_fkey" FOREIGN KEY ("incident") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryReport" ADD CONSTRAINT "RegulatoryReport_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRef" ADD CONSTRAINT "EvidenceRef_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRef" ADD CONSTRAINT "EvidenceRef_finding_fkey" FOREIGN KEY ("finding") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_workflowVersion_fkey" FOREIGN KEY ("workflowVersion") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_run_fkey" FOREIGN KEY ("run") REFERENCES "WorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_task_fkey" FOREIGN KEY ("task") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_proposal_fkey" FOREIGN KEY ("proposal") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_dismissedBy_fkey" FOREIGN KEY ("dismissedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceCall" ADD CONSTRAINT "InferenceCall_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InferenceCall" ADD CONSTRAINT "InferenceCall_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActivation" ADD CONSTRAINT "WorkflowActivation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActivation" ADD CONSTRAINT "WorkflowActivation_workflowVersion_fkey" FOREIGN KEY ("workflowVersion") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowActivation" ADD CONSTRAINT "WorkflowActivation_activatedBy_fkey" FOREIGN KEY ("activatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowVersion_fkey" FOREIGN KEY ("workflowVersion") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_definition_fkey" FOREIGN KEY ("definition") REFERENCES "WorkflowDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_createdByInference_fkey" FOREIGN KEY ("createdByInference") REFERENCES "InferenceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
