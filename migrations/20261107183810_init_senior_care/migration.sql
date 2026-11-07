-- CreateEnum
CREATE TYPE "UserKindType" AS ENUM ('staff', 'portal', 'surveyor', 'auditor', 'administrator');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" TEXT,
    "kind" "UserKindType" DEFAULT 'staff',
    "title" TEXT NOT NULL DEFAULT '',
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "accessExpiresAt" TIMESTAMP(3),
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "canSeeOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canEditOtherPeople" BOOLEAN NOT NULL DEFAULT false,
    "canManagePeople" BOOLEAN NOT NULL DEFAULT false,
    "canManageRoles" BOOLEAN NOT NULL DEFAULT false,
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canReadAudit" BOOLEAN NOT NULL DEFAULT false,
    "canManageOperator" BOOLEAN NOT NULL DEFAULT false,
    "canManageCommunities" BOOLEAN NOT NULL DEFAULT false,
    "canManagePlaces" BOOLEAN NOT NULL DEFAULT false,
    "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "canApproveIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "canManageSales" BOOLEAN NOT NULL DEFAULT false,
    "canManageStorefront" BOOLEAN NOT NULL DEFAULT false,
    "canReadSales" BOOLEAN NOT NULL DEFAULT false,
    "canAdmitDischarge" BOOLEAN NOT NULL DEFAULT false,
    "canRecordCensus" BOOLEAN NOT NULL DEFAULT false,
    "canManageRepresentatives" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCensusCorrections" BOOLEAN NOT NULL DEFAULT false,
    "canReadResidentDemographics" BOOLEAN NOT NULL DEFAULT false,
    "canChartPointOfCare" BOOLEAN NOT NULL DEFAULT false,
    "canChartNursing" BOOLEAN NOT NULL DEFAULT false,
    "canManageAssessments" BOOLEAN NOT NULL DEFAULT false,
    "canManageCarePlans" BOOLEAN NOT NULL DEFAULT false,
    "canEnterOrders" BOOLEAN NOT NULL DEFAULT false,
    "canSignOrders" BOOLEAN NOT NULL DEFAULT false,
    "canApproveClinicalCorrections" BOOLEAN NOT NULL DEFAULT false,
    "canReadClinical" BOOLEAN NOT NULL DEFAULT false,
    "canReadSensitiveClinical" BOOLEAN NOT NULL DEFAULT false,
    "canAdministerMeds" BOOLEAN NOT NULL DEFAULT false,
    "canWitnessControlled" BOOLEAN NOT NULL DEFAULT false,
    "canManagePharmacy" BOOLEAN NOT NULL DEFAULT false,
    "canResolveCountDiscrepancy" BOOLEAN NOT NULL DEFAULT false,
    "canApproveControlledAdjustments" BOOLEAN NOT NULL DEFAULT false,
    "canReportIncident" BOOLEAN NOT NULL DEFAULT false,
    "canInvestigateIncidents" BOOLEAN NOT NULL DEFAULT false,
    "canManageInfectionControl" BOOLEAN NOT NULL DEFAULT false,
    "canApproveIncidentDowngrade" BOOLEAN NOT NULL DEFAULT false,
    "canDeclareOutbreak" BOOLEAN NOT NULL DEFAULT false,
    "canReadIncidents" BOOLEAN NOT NULL DEFAULT false,
    "canManageSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canManageTimecards" BOOLEAN NOT NULL DEFAULT false,
    "canManageCredentials" BOOLEAN NOT NULL DEFAULT false,
    "canApproveTimecards" BOOLEAN NOT NULL DEFAULT false,
    "canReadWorkforce" BOOLEAN NOT NULL DEFAULT false,
    "canManageRates" BOOLEAN NOT NULL DEFAULT false,
    "canManageBilling" BOOLEAN NOT NULL DEFAULT false,
    "canManageClaims" BOOLEAN NOT NULL DEFAULT false,
    "canPostPayments" BOOLEAN NOT NULL DEFAULT false,
    "canApproveRates" BOOLEAN NOT NULL DEFAULT false,
    "canApproveWriteOffs" BOOLEAN NOT NULL DEFAULT false,
    "canReleaseClaims" BOOLEAN NOT NULL DEFAULT false,
    "canReadBilling" BOOLEAN NOT NULL DEFAULT false,
    "canReadIdentifiers" BOOLEAN NOT NULL DEFAULT false,
    "canOperateTrust" BOOLEAN NOT NULL DEFAULT false,
    "canApproveTrust" BOOLEAN NOT NULL DEFAULT false,
    "canReadTrust" BOOLEAN NOT NULL DEFAULT false,
    "canManageCompliance" BOOLEAN NOT NULL DEFAULT false,
    "canManageSurveys" BOOLEAN NOT NULL DEFAULT false,
    "canManageQapi" BOOLEAN NOT NULL DEFAULT false,
    "canSubmitRegulatory" BOOLEAN NOT NULL DEFAULT false,
    "canApproveCompliance" BOOLEAN NOT NULL DEFAULT false,
    "canReadCompliance" BOOLEAN NOT NULL DEFAULT false,
    "canManageFamilyUpdates" BOOLEAN NOT NULL DEFAULT false,
    "canManageActivities" BOOLEAN NOT NULL DEFAULT false,
    "canManageDietary" BOOLEAN NOT NULL DEFAULT false,
    "canMessageFamilies" BOOLEAN NOT NULL DEFAULT false,
    "canApprovePortalScopes" BOOLEAN NOT NULL DEFAULT false,
    "canManageWorkflows" BOOLEAN NOT NULL DEFAULT false,
    "canManageAgents" BOOLEAN NOT NULL DEFAULT false,
    "canApproveWorkflows" BOOLEAN NOT NULL DEFAULT false,
    "canApproveAgentGrants" BOOLEAN NOT NULL DEFAULT false,
    "canReadFindings" BOOLEAN NOT NULL DEFAULT false,
    "canBreakGlass" BOOLEAN NOT NULL DEFAULT false,
    "canReviewBreakGlass" BOOLEAN NOT NULL DEFAULT false,
    "canReadPhiAudit" BOOLEAN NOT NULL DEFAULT false,
    "canBreakGlassRecords" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentIdentity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'llm_agent',
    "model" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "killSwitch" BOOLEAN NOT NULL DEFAULT false,
    "oauthApp" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "request" TEXT,
    "decidedBy" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "minApprovals" INTEGER DEFAULT 1,
    "thresholdMinor" BIGINT,
    "expiresAfterMinutes" INTEGER DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "targetList" TEXT NOT NULL DEFAULT '',
    "targetId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "requiredPermission" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "requestedByAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "actorUser" TEXT,
    "actorAgent" TEXT,
    "approver" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakGlassGrant" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "resident" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "requestedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewedBy" TEXT,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakGlassGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "command" TEXT NOT NULL DEFAULT '',
    "principalKey" TEXT NOT NULL DEFAULT '',
    "requestHash" TEXT NOT NULL DEFAULT '',
    "requestParams" JSONB,
    "responseCode" TEXT NOT NULL DEFAULT '',
    "responseBody" JSONB,
    "recoveryPoint" TEXT NOT NULL DEFAULT 'completed',
    "completedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'US',
    "phone" TEXT NOT NULL DEFAULT '',
    "settingsOffered" JSONB DEFAULT '[]',
    "jurisdictionPack" TEXT,
    "holidayCalendar" TEXT,
    "identifiers" JSONB DEFAULT '{}',
    "bedHoldPolicy" TEXT,
    "storefront" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'setup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceClock" (
    "id" TEXT NOT NULL,
    "obligation" TEXT,
    "obligationCode" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "resident" TEXT,
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "occurrenceKey" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "escalationLevel" INTEGER DEFAULT 0,
    "satisfiedBy" JSONB,
    "satisfiedAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "supersedes" TEXT,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "ruleRef" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "unit" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "deviceKeyHash" TEXT NOT NULL DEFAULT '',
    "allowedKinds" JSONB DEFAULT '["poc","emar"]',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'other',
    "community" TEXT,
    "resident" TEXT,
    "phiTier" TEXT NOT NULL DEFAULT 'op',
    "template" TEXT,
    "storageKey" TEXT NOT NULL DEFAULT '',
    "sha256" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER,
    "documentVersion" INTEGER DEFAULT 1,
    "supersedes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'final',
    "signedAt" TIMESTAMP(3),
    "retentionUntil" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'notice',
    "jurisdictionPack" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "templateVersion" INTEGER DEFAULT 1,
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayCalendar" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "weekendDays" JSONB DEFAULT '[0,6]',
    "coverageThrough" DATE,
    "source" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayDate" (
    "id" TEXT NOT NULL,
    "calendar" TEXT,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "intervalSeconds" INTEGER,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "leaseKey" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT,
    "kind" TEXT NOT NULL DEFAULT '',
    "scopeKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "fencingToken" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPack" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "packVersion" TEXT NOT NULL DEFAULT '1',
    "effectiveFrom" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "rules" JSONB DEFAULT '{}',
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "fencingToken" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "template" TEXT NOT NULL DEFAULT '',
    "payloadRef" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notification" TEXT,
    "attempt" INTEGER DEFAULT 1,
    "outcome" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorSettings" (
    "id" INTEGER NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT 'Openfront Senior Care',
    "displayName" TEXT NOT NULL DEFAULT 'Openfront Senior Care',
    "homeTimeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "inferencePolicy" TEXT NOT NULL DEFAULT 'self_hosted_only',
    "breakGlassMaxHours" INTEGER DEFAULT 4,
    "reauthMinutes" INTEGER DEFAULT 15,
    "bedHoldNoticeGraceHours" INTEGER DEFAULT 24,
    "writeOffApprovalThresholdMinor" BIGINT NOT NULL DEFAULT 0,
    "refundApprovalThresholdMinor" BIGINT NOT NULL DEFAULT 0,
    "trustApprovalThresholdMinor" BIGINT NOT NULL DEFAULT 0,
    "strictAgentOwnerSoD" BOOLEAN NOT NULL DEFAULT true,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "aggregateType" TEXT NOT NULL DEFAULT '',
    "aggregateId" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "fencingToken" INTEGER DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhiReadAudit" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorReference" TEXT NOT NULL DEFAULT '',
    "actorKind" TEXT NOT NULL DEFAULT '',
    "operationType" TEXT NOT NULL DEFAULT '',
    "operationName" TEXT NOT NULL DEFAULT '',
    "rootFields" JSONB,
    "selectedFields" JSONB,
    "selectionDigest" TEXT NOT NULL DEFAULT '',
    "resultReferenceDigest" TEXT NOT NULL DEFAULT '',
    "resourceReferences" JSONB,
    "purpose" TEXT NOT NULL DEFAULT '',
    "breakGlass" BOOLEAN NOT NULL DEFAULT false,
    "correlationReference" TEXT NOT NULL DEFAULT '',
    "resultCount" INTEGER DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PhiReadAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessorRegistration" (
    "id" TEXT NOT NULL,
    "processor" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL DEFAULT '',
    "baaDocument" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "dataCategories" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessorRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryObligation" (
    "id" TEXT NOT NULL,
    "pack" TEXT,
    "code" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "appliesTo" JSONB,
    "startFact" TEXT NOT NULL DEFAULT '',
    "dueRule" JSONB,
    "evidenceTypes" JSONB,
    "waivable" BOOLEAN NOT NULL DEFAULT false,
    "ruleRef" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "ownerRole" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRateLimitBucket" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestRateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretBox" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "ciphertext" TEXT NOT NULL DEFAULT '',
    "iv" TEXT NOT NULL DEFAULT '',
    "authTag" TEXT NOT NULL DEFAULT '',
    "keyVersion" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecretBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAssignment" (
    "id" TEXT NOT NULL,
    "user" TEXT,
    "community" TEXT,
    "role" TEXT,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "purpose" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'started',
    "toolCalls" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolGrant" (
    "id" TEXT NOT NULL,
    "agent" TEXT,
    "scope" TEXT NOT NULL,
    "constraints" JSONB,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "approval" TEXT,
    "revokedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB,
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "resident" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "agentRun" TEXT,
    "proposedByAgent" TEXT,
    "proposedByUser" TEXT,
    "acceptedBy" TEXT,
    "resultRecordType" TEXT NOT NULL DEFAULT '',
    "resultRecordId" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "unit" TEXT,
    "number" TEXT NOT NULL DEFAULT '',
    "apartmentType" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "allowsUnrelatedCompanion" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'available',
    "statusReason" TEXT NOT NULL DEFAULT '',
    "occupantCount" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApartmentType" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "setting" TEXT NOT NULL DEFAULT 'assisted_living',
    "squareFeet" INTEGER,
    "bedrooms" INTEGER DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "floorPlan" TEXT,
    "publishedFromPriceMinor" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApartmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "room" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "certification" TEXT NOT NULL DEFAULT 'dual',
    "licensed" BOOLEAN NOT NULL DEFAULT true,
    "features" JSONB DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'available',
    "statusReason" TEXT NOT NULL DEFAULT '',
    "currentStay" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedHoldPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "jurisdictionPack" TEXT,
    "medicaidHoldDaysPerYear" INTEGER DEFAULT 30,
    "medicaidHoldPaid" BOOLEAN NOT NULL DEFAULT true,
    "medicaidHoldRateRule" JSONB DEFAULT '{}',
    "therapeuticLeaveDaysPerYear" INTEGER DEFAULT 30,
    "privateHoldDailyRateMinor" BIGINT,
    "noticeTemplate" TEXT,
    "ruleRef" TEXT NOT NULL DEFAULT '',
    "verifyNote" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedHoldPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedOccupancy" (
    "id" TEXT NOT NULL,
    "bed" TEXT,
    "stay" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "openedByEvent" TEXT,
    "closedByEvent" TEXT,

    CONSTRAINT "BedOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'mixed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceReservation" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "bed" TEXT,
    "apartment" TEXT,
    "prospect" TEXT,
    "referral" TEXT,
    "waitlistEntry" TEXT,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "consumedByStay" TEXT,
    "operationKeyHash" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "unit" TEXT,
    "number" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'semi_private',
    "isolationCapable" BOOLEAN NOT NULL DEFAULT false,
    "privateBath" BOOLEAN NOT NULL DEFAULT false,
    "genderPolicy" TEXT NOT NULL DEFAULT 'any',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "building" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "setting" TEXT NOT NULL DEFAULT 'nursing_facility',
    "secured" BOOLEAN NOT NULL DEFAULT false,
    "specialty" TEXT NOT NULL DEFAULT 'none',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvanceDirective" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "document" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvanceDirective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allergy" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "substance" TEXT NOT NULL DEFAULT '',
    "reaction" TEXT NOT NULL DEFAULT '',
    "severity" TEXT DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'active',
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CensusDay" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "stay" TEXT,
    "date" DATE NOT NULL,
    "setting" TEXT NOT NULL DEFAULT '',
    "bed" TEXT,
    "apartment" TEXT,
    "unit" TEXT,
    "presence" TEXT NOT NULL DEFAULT '',
    "primaryCoverage" TEXT,
    "payerKind" TEXT NOT NULL DEFAULT '',
    "billableForPayer" BOOLEAN NOT NULL DEFAULT true,
    "snapshotRun" TEXT,
    "supersededBy" TEXT,

    CONSTRAINT "CensusDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CensusEvent" (
    "id" TEXT NOT NULL,
    "stay" TEXT,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "observedAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "fromBed" TEXT,
    "toBed" TEXT,
    "fromApartment" TEXT,
    "toApartment" TEXT,
    "leaveKind" TEXT,
    "coverage" TEXT,
    "holdElected" BOOLEAN NOT NULL DEFAULT false,
    "holdPaidBy" TEXT,
    "dischargeDisposition" TEXT,
    "initiatedBy" TEXT,
    "voidsEvent" TEXT,
    "correctionReason" TEXT NOT NULL DEFAULT '',
    "approval" TEXT,
    "detail" JSONB,
    "actor" TEXT,
    "actorAgent" TEXT,
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "prevHash" TEXT NOT NULL DEFAULT '',
    "hash" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CensusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CensusSignoff" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "unit" TEXT,
    "date" DATE NOT NULL,
    "totals" JSONB,
    "run" TEXT,
    "signedBy" TEXT,
    "signedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CensusSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" JSONB,
    "preferredChannel" TEXT DEFAULT 'phone',
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoveragePeriod" (
    "id" TEXT NOT NULL,
    "stay" TEXT,
    "payer" TEXT,
    "rank" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "levelCode" TEXT NOT NULL DEFAULT '',
    "memberReference" TEXT NOT NULL DEFAULT '',
    "qualifyingStayFrom" DATE,
    "qualifyingStayTo" DATE,
    "endReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoveragePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "icd10" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "rank" TEXT DEFAULT 'secondary',
    "onsetDate" DATE,
    "resolvedDate" DATE,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoticeDelivery" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL DEFAULT '',
    "subjectId" TEXT NOT NULL DEFAULT '',
    "resident" TEXT,
    "censusEvent" TEXT,
    "recipientRepresentative" TEXT,
    "method" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "deliveredBy" TEXT,
    "document" TEXT,
    "acknowledgement" TEXT DEFAULT 'not_required',
    "witness" TEXT,
    "copyToOmbudsmanAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'private_pay',
    "payerId" TEXT NOT NULL DEFAULT '',
    "dayCountingRule" TEXT NOT NULL DEFAULT 'count_admit_not_discharge',
    "timelyFilingDays" INTEGER,
    "claimFormat" TEXT NOT NULL DEFAULT 'invoice',
    "contact" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreAdmissionScreen" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "prospect" TEXT,
    "kind" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT '',
    "document" TEXT,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreAdmissionScreen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Representative" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "resident" TEXT,
    "contact" TEXT,
    "self" BOOLEAN NOT NULL DEFAULT false,
    "roles" JSONB DEFAULT '[]',
    "authorityDocument" TEXT,
    "authorityVerifiedBy" TEXT,
    "authorityVerifiedAt" TIMESTAMP(3),
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "contactPriority" INTEGER DEFAULT 1,
    "portalAccount" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "preferredName" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" DATE,
    "sex" TEXT,
    "genderIdentity" TEXT NOT NULL DEFAULT '',
    "pronouns" TEXT NOT NULL DEFAULT '',
    "primaryLanguage" TEXT NOT NULL DEFAULT '',
    "interpreterNeeded" BOOLEAN NOT NULL DEFAULT false,
    "maritalStatus" TEXT NOT NULL DEFAULT '',
    "religion" TEXT NOT NULL DEFAULT '',
    "veteran" BOOLEAN NOT NULL DEFAULT false,
    "codeStatus" TEXT,
    "capacityStatus" TEXT DEFAULT 'unknown',
    "fallRisk" TEXT NOT NULL DEFAULT '',
    "elopementRisk" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'current',
    "currentStay" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentIdentifier" (
    "id" TEXT NOT NULL,
    "resident" TEXT,
    "kind" TEXT NOT NULL,
    "issuer" TEXT NOT NULL DEFAULT '',
    "display" TEXT NOT NULL DEFAULT '',
    "valueEncrypted" TEXT NOT NULL DEFAULT '',
    "valueHash" TEXT NOT NULL DEFAULT '',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResidentIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "resident" TEXT,
    "community" TEXT,
    "setting" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pre_admit',
    "presence" TEXT NOT NULL DEFAULT 'not_admitted',
    "admittedAt" TIMESTAMP(3),
    "dischargedAt" TIMESTAMP(3),
    "admissionSource" TEXT,
    "dischargeDisposition" TEXT,
    "priorStay" TEXT,
    "currentBed" TEXT,
    "currentApartment" TEXT,
    "heldBed" TEXT,
    "agreement" TEXT,
    "leaveDaysUsedThisYear" INTEGER DEFAULT 0,
    "projection" JSONB,
    "placementReason" TEXT NOT NULL DEFAULT '',
    "initialPayerKind" TEXT NOT NULL DEFAULT '',
    "projectionVersion" INTEGER DEFAULT 0,
    "projectionHash" TEXT NOT NULL DEFAULT '',
    "lastEventHash" TEXT NOT NULL DEFAULT '',
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySnapshot" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "apartmentType" TEXT,
    "setting" TEXT NOT NULL DEFAULT '',
    "snapshotKey" TEXT NOT NULL DEFAULT '',
    "availableCount" INTEGER DEFAULT 0,
    "waitlistOpen" BOOLEAN NOT NULL DEFAULT true,
    "computedAt" TIMESTAMP(3),

    CONSTRAINT "AvailabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "source" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "relationship" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "consentToContact" BOOLEAN NOT NULL DEFAULT false,
    "utm" JSONB,
    "lead" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    "payRange" JSONB DEFAULT '{}',
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "owner" TEXT,
    "primaryContact" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "lostReason" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "referralSource" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "contact" TEXT,
    "community" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "invitedBy" TEXT,
    "invitationTokenHash" TEXT NOT NULL DEFAULT '',
    "invitationExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "mfaEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "sessionEpoch" INTEGER DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalScopeGrant" (
    "id" TEXT NOT NULL,
    "account" TEXT,
    "resident" TEXT,
    "representative" TEXT,
    "scope" TEXT NOT NULL,
    "authorityBasis" TEXT NOT NULL,
    "consentDocument" TEXT,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposedBy" TEXT,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalScopeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "lead" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" DATE,
    "careNotes" TEXT NOT NULL DEFAULT '',
    "desiredSetting" TEXT,
    "desiredMoveIn" DATE,
    "convertedResident" TEXT,
    "synthetic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedPrice" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "apartmentType" TEXT,
    "setting" TEXT,
    "label" TEXT NOT NULL DEFAULT '',
    "fromMinor" BIGINT NOT NULL,
    "toMinor" BIGINT,
    "period" TEXT NOT NULL DEFAULT 'month',
    "communityFeeMinor" BIGINT,
    "disclaimer" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "source" TEXT,
    "receivedAt" TIMESTAMP(3),
    "prospect" TEXT,
    "expectedPayer" TEXT,
    "clinicalSummary" TEXT NOT NULL DEFAULT '',
    "pasrrLevel1" TEXT,
    "pasrrLevel2Required" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'received',
    "declineReason" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSource" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'hospital',
    "feeTerms" JSONB DEFAULT '{}',
    "contact" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesActivity" (
    "id" TEXT NOT NULL,
    "lead" TEXT,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffBio" (
    "id" TEXT NOT NULL,
    "site" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "photo" TEXT,
    "sortOrder" INTEGER DEFAULT 0,
    "consentDocument" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffBio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorefrontSite" (
    "id" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "heroTitle" TEXT NOT NULL DEFAULT '',
    "heroBody" TEXT NOT NULL DEFAULT '',
    "amenities" JSONB DEFAULT '[]',
    "diningCopy" TEXT NOT NULL DEFAULT '',
    "activitiesCopy" TEXT NOT NULL DEFAULT '',
    "careLevelsCopy" TEXT NOT NULL DEFAULT '',
    "faq" JSONB DEFAULT '[]',
    "showCmsRatings" BOOLEAN NOT NULL DEFAULT false,
    "acceptedPayers" JSONB DEFAULT '[]',
    "seo" JSONB DEFAULT '{}',
    "tourBookingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "slot" TEXT,
    "lead" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "guestTokenHash" TEXT NOT NULL DEFAULT '',
    "holdExpiresAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSlot" (
    "id" TEXT NOT NULL,
    "community" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "kind" TEXT NOT NULL DEFAULT 'either',
    "host" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "community" TEXT,
    "prospect" TEXT,
    "lead" TEXT,
    "apartmentType" TEXT,
    "setting" TEXT,
    "priority" INTEGER DEFAULT 100,
    "priorityReason" TEXT DEFAULT 'date_order',
    "status" TEXT NOT NULL DEFAULT 'active',
    "offeredReservation" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_Referral_packet" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_StorefrontSite_gallery" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_OperatorSettings_jurisdictionPacks" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "_StaffAssignment_units" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_AgentToolGrant_communities" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_ApartmentType_photos" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE UNIQUE INDEX "AgentIdentity_name_key" ON "AgentIdentity"("name");

-- CreateIndex
CREATE INDEX "AgentIdentity_owner_idx" ON "AgentIdentity"("owner");

-- CreateIndex
CREATE INDEX "AgentIdentity_oauthApp_idx" ON "AgentIdentity"("oauthApp");

-- CreateIndex
CREATE INDEX "ApprovalDecision_request_idx" ON "ApprovalDecision"("request");

-- CreateIndex
CREATE INDEX "ApprovalDecision_decidedBy_idx" ON "ApprovalDecision"("decidedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalPolicy_action_key" ON "ApprovalPolicy"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_action_idx" ON "ApprovalRequest"("action");

-- CreateIndex
CREATE INDEX "ApprovalRequest_community_idx" ON "ApprovalRequest"("community");

-- CreateIndex
CREATE INDEX "ApprovalRequest_targetId_idx" ON "ApprovalRequest"("targetId");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedBy_idx" ON "ApprovalRequest"("requestedBy");

-- CreateIndex
CREATE INDEX "ApprovalRequest_requestedByAgent_idx" ON "ApprovalRequest"("requestedByAgent");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_seq_key" ON "AuditEvent"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_eventKey_key" ON "AuditEvent"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_hash_key" ON "AuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUser_idx" ON "AuditEvent"("actorUser");

-- CreateIndex
CREATE INDEX "AuditEvent_actorAgent_idx" ON "AuditEvent"("actorAgent");

-- CreateIndex
CREATE INDEX "AuditEvent_approver_idx" ON "AuditEvent"("approver");

-- CreateIndex
CREATE INDEX "BreakGlassGrant_user_idx" ON "BreakGlassGrant"("user");

-- CreateIndex
CREATE INDEX "BreakGlassGrant_resident_idx" ON "BreakGlassGrant"("resident");

-- CreateIndex
CREATE INDEX "BreakGlassGrant_reviewedBy_idx" ON "BreakGlassGrant"("reviewedBy");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_idempotencyKey_key" ON "CommandReceipt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Community_reference_key" ON "Community"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Community_storefront_key" ON "Community"("storefront");

-- CreateIndex
CREATE INDEX "Community_jurisdictionPack_idx" ON "Community"("jurisdictionPack");

-- CreateIndex
CREATE INDEX "Community_holidayCalendar_idx" ON "Community"("holidayCalendar");

-- CreateIndex
CREATE INDEX "Community_bedHoldPolicy_idx" ON "Community"("bedHoldPolicy");

-- CreateIndex
CREATE INDEX "ComplianceClock_obligation_idx" ON "ComplianceClock"("obligation");

-- CreateIndex
CREATE INDEX "ComplianceClock_obligationCode_idx" ON "ComplianceClock"("obligationCode");

-- CreateIndex
CREATE INDEX "ComplianceClock_community_idx" ON "ComplianceClock"("community");

-- CreateIndex
CREATE INDEX "ComplianceClock_resident_idx" ON "ComplianceClock"("resident");

-- CreateIndex
CREATE INDEX "ComplianceClock_subjectId_idx" ON "ComplianceClock"("subjectId");

-- CreateIndex
CREATE INDEX "ComplianceClock_supersedes_idx" ON "ComplianceClock"("supersedes");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceClock_occurrence_key" ON "ComplianceClock"("obligationCode", "subjectType", "subjectId", "occurrenceKey", "supersedes");

-- CreateIndex
CREATE INDEX "DeviceRegistration_community_idx" ON "DeviceRegistration"("community");

-- CreateIndex
CREATE INDEX "DeviceRegistration_unit_idx" ON "DeviceRegistration"("unit");

-- CreateIndex
CREATE INDEX "Document_community_idx" ON "Document"("community");

-- CreateIndex
CREATE INDEX "Document_resident_idx" ON "Document"("resident");

-- CreateIndex
CREATE INDEX "Document_template_idx" ON "Document"("template");

-- CreateIndex
CREATE INDEX "Document_supersedes_idx" ON "Document"("supersedes");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_key_key" ON "DocumentTemplate"("key");

-- CreateIndex
CREATE INDEX "DocumentTemplate_jurisdictionPack_idx" ON "DocumentTemplate"("jurisdictionPack");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayCalendar_code_key" ON "HolidayCalendar"("code");

-- CreateIndex
CREATE INDEX "HolidayDate_calendar_idx" ON "HolidayDate"("calendar");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayDate_calendar_date_key" ON "HolidayDate"("calendar", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Job_kind_key" ON "Job"("kind");

-- CreateIndex
CREATE INDEX "JobRun_job_idx" ON "JobRun"("job");

-- CreateIndex
CREATE INDEX "JobRun_kind_idx" ON "JobRun"("kind");

-- CreateIndex
CREATE INDEX "JobRun_scopeKey_idx" ON "JobRun"("scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionPack_code_key" ON "JurisdictionPack"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lease_key_key" ON "Lease"("key");

-- CreateIndex
CREATE INDEX "Notification_recipient_idx" ON "Notification"("recipient");

-- CreateIndex
CREATE INDEX "NotificationDelivery_notification_idx" ON "NotificationDelivery"("notification");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_topic_idx" ON "OutboxEvent"("topic");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateId_idx" ON "OutboxEvent"("aggregateId");

-- CreateIndex
CREATE INDEX "PhiReadAudit_actorReference_idx" ON "PhiReadAudit"("actorReference");

-- CreateIndex
CREATE INDEX "ProcessorRegistration_baaDocument_idx" ON "ProcessorRegistration"("baaDocument");

-- CreateIndex
CREATE INDEX "RegulatoryObligation_pack_idx" ON "RegulatoryObligation"("pack");

-- CreateIndex
CREATE INDEX "RegulatoryObligation_code_idx" ON "RegulatoryObligation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryObligation_pack_code_key" ON "RegulatoryObligation"("pack", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRateLimitBucket_bucketKey_key" ON "RequestRateLimitBucket"("bucketKey");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_key_key" ON "Sequence"("key");

-- CreateIndex
CREATE INDEX "StaffAssignment_user_idx" ON "StaffAssignment"("user");

-- CreateIndex
CREATE INDEX "StaffAssignment_community_idx" ON "StaffAssignment"("community");

-- CreateIndex
CREATE INDEX "StaffAssignment_role_idx" ON "StaffAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAssignment_user_community_key" ON "StaffAssignment"("user", "community");

-- CreateIndex
CREATE INDEX "AgentRun_agent_idx" ON "AgentRun"("agent");

-- CreateIndex
CREATE INDEX "AgentToolGrant_agent_idx" ON "AgentToolGrant"("agent");

-- CreateIndex
CREATE INDEX "AgentToolGrant_approval_idx" ON "AgentToolGrant"("approval");

-- CreateIndex
CREATE INDEX "Proposal_resident_idx" ON "Proposal"("resident");

-- CreateIndex
CREATE INDEX "Proposal_agentRun_idx" ON "Proposal"("agentRun");

-- CreateIndex
CREATE INDEX "Proposal_proposedByAgent_idx" ON "Proposal"("proposedByAgent");

-- CreateIndex
CREATE INDEX "Proposal_proposedByUser_idx" ON "Proposal"("proposedByUser");

-- CreateIndex
CREATE INDEX "Proposal_acceptedBy_idx" ON "Proposal"("acceptedBy");

-- CreateIndex
CREATE INDEX "Proposal_resultRecordId_idx" ON "Proposal"("resultRecordId");

-- CreateIndex
CREATE INDEX "Apartment_unit_idx" ON "Apartment"("unit");

-- CreateIndex
CREATE INDEX "Apartment_apartmentType_idx" ON "Apartment"("apartmentType");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_unit_number_key" ON "Apartment"("unit", "number");

-- CreateIndex
CREATE INDEX "ApartmentType_community_idx" ON "ApartmentType"("community");

-- CreateIndex
CREATE INDEX "ApartmentType_floorPlan_idx" ON "ApartmentType"("floorPlan");

-- CreateIndex
CREATE INDEX "Bed_room_idx" ON "Bed"("room");

-- CreateIndex
CREATE INDEX "Bed_currentStay_idx" ON "Bed"("currentStay");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_room_label_key" ON "Bed"("room", "label");

-- CreateIndex
CREATE INDEX "BedHoldPolicy_community_idx" ON "BedHoldPolicy"("community");

-- CreateIndex
CREATE INDEX "BedHoldPolicy_jurisdictionPack_idx" ON "BedHoldPolicy"("jurisdictionPack");

-- CreateIndex
CREATE INDEX "BedHoldPolicy_noticeTemplate_idx" ON "BedHoldPolicy"("noticeTemplate");

-- CreateIndex
CREATE INDEX "BedOccupancy_bed_idx" ON "BedOccupancy"("bed");

-- CreateIndex
CREATE INDEX "BedOccupancy_stay_idx" ON "BedOccupancy"("stay");

-- CreateIndex
CREATE INDEX "BedOccupancy_openedByEvent_idx" ON "BedOccupancy"("openedByEvent");

-- CreateIndex
CREATE INDEX "BedOccupancy_closedByEvent_idx" ON "BedOccupancy"("closedByEvent");

-- CreateIndex
CREATE INDEX "Building_community_idx" ON "Building"("community");

-- CreateIndex
CREATE UNIQUE INDEX "Building_community_name_key" ON "Building"("community", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceReservation_reference_key" ON "PlaceReservation"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceReservation_operationKeyHash_key" ON "PlaceReservation"("operationKeyHash");

-- CreateIndex
CREATE INDEX "PlaceReservation_community_idx" ON "PlaceReservation"("community");

-- CreateIndex
CREATE INDEX "PlaceReservation_bed_idx" ON "PlaceReservation"("bed");

-- CreateIndex
CREATE INDEX "PlaceReservation_apartment_idx" ON "PlaceReservation"("apartment");

-- CreateIndex
CREATE INDEX "PlaceReservation_prospect_idx" ON "PlaceReservation"("prospect");

-- CreateIndex
CREATE INDEX "PlaceReservation_referral_idx" ON "PlaceReservation"("referral");

-- CreateIndex
CREATE INDEX "PlaceReservation_waitlistEntry_idx" ON "PlaceReservation"("waitlistEntry");

-- CreateIndex
CREATE INDEX "PlaceReservation_consumedByStay_idx" ON "PlaceReservation"("consumedByStay");

-- CreateIndex
CREATE INDEX "Room_unit_idx" ON "Room"("unit");

-- CreateIndex
CREATE UNIQUE INDEX "Room_unit_number_key" ON "Room"("unit", "number");

-- CreateIndex
CREATE INDEX "Unit_community_idx" ON "Unit"("community");

-- CreateIndex
CREATE INDEX "Unit_building_idx" ON "Unit"("building");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_community_code_key" ON "Unit"("community", "code");

-- CreateIndex
CREATE INDEX "AdvanceDirective_resident_idx" ON "AdvanceDirective"("resident");

-- CreateIndex
CREATE INDEX "AdvanceDirective_document_idx" ON "AdvanceDirective"("document");

-- CreateIndex
CREATE INDEX "AdvanceDirective_verifiedBy_idx" ON "AdvanceDirective"("verifiedBy");

-- CreateIndex
CREATE INDEX "Allergy_resident_idx" ON "Allergy"("resident");

-- CreateIndex
CREATE INDEX "Allergy_recordedBy_idx" ON "Allergy"("recordedBy");

-- CreateIndex
CREATE INDEX "CensusDay_community_idx" ON "CensusDay"("community");

-- CreateIndex
CREATE INDEX "CensusDay_stay_idx" ON "CensusDay"("stay");

-- CreateIndex
CREATE INDEX "CensusDay_bed_idx" ON "CensusDay"("bed");

-- CreateIndex
CREATE INDEX "CensusDay_apartment_idx" ON "CensusDay"("apartment");

-- CreateIndex
CREATE INDEX "CensusDay_unit_idx" ON "CensusDay"("unit");

-- CreateIndex
CREATE INDEX "CensusDay_primaryCoverage_idx" ON "CensusDay"("primaryCoverage");

-- CreateIndex
CREATE INDEX "CensusDay_snapshotRun_idx" ON "CensusDay"("snapshotRun");

-- CreateIndex
CREATE INDEX "CensusDay_supersededBy_idx" ON "CensusDay"("supersededBy");

-- CreateIndex
CREATE UNIQUE INDEX "CensusEvent_idempotencyKey_key" ON "CensusEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CensusEvent_stay_idx" ON "CensusEvent"("stay");

-- CreateIndex
CREATE INDEX "CensusEvent_fromBed_idx" ON "CensusEvent"("fromBed");

-- CreateIndex
CREATE INDEX "CensusEvent_toBed_idx" ON "CensusEvent"("toBed");

-- CreateIndex
CREATE INDEX "CensusEvent_fromApartment_idx" ON "CensusEvent"("fromApartment");

-- CreateIndex
CREATE INDEX "CensusEvent_toApartment_idx" ON "CensusEvent"("toApartment");

-- CreateIndex
CREATE INDEX "CensusEvent_coverage_idx" ON "CensusEvent"("coverage");

-- CreateIndex
CREATE INDEX "CensusEvent_voidsEvent_idx" ON "CensusEvent"("voidsEvent");

-- CreateIndex
CREATE INDEX "CensusEvent_approval_idx" ON "CensusEvent"("approval");

-- CreateIndex
CREATE INDEX "CensusEvent_actor_idx" ON "CensusEvent"("actor");

-- CreateIndex
CREATE INDEX "CensusEvent_actorAgent_idx" ON "CensusEvent"("actorAgent");

-- CreateIndex
CREATE UNIQUE INDEX "CensusEvent_stay_seq_key" ON "CensusEvent"("stay", "seq");

-- CreateIndex
CREATE INDEX "CensusSignoff_community_idx" ON "CensusSignoff"("community");

-- CreateIndex
CREATE INDEX "CensusSignoff_unit_idx" ON "CensusSignoff"("unit");

-- CreateIndex
CREATE INDEX "CensusSignoff_run_idx" ON "CensusSignoff"("run");

-- CreateIndex
CREATE INDEX "CensusSignoff_signedBy_idx" ON "CensusSignoff"("signedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_reference_key" ON "Contact"("reference");

-- CreateIndex
CREATE INDEX "Contact_community_idx" ON "Contact"("community");

-- CreateIndex
CREATE INDEX "CoveragePeriod_stay_idx" ON "CoveragePeriod"("stay");

-- CreateIndex
CREATE INDEX "CoveragePeriod_payer_idx" ON "CoveragePeriod"("payer");

-- CreateIndex
CREATE INDEX "Diagnosis_resident_idx" ON "Diagnosis"("resident");

-- CreateIndex
CREATE INDEX "NoticeDelivery_subjectId_idx" ON "NoticeDelivery"("subjectId");

-- CreateIndex
CREATE INDEX "NoticeDelivery_resident_idx" ON "NoticeDelivery"("resident");

-- CreateIndex
CREATE INDEX "NoticeDelivery_censusEvent_idx" ON "NoticeDelivery"("censusEvent");

-- CreateIndex
CREATE INDEX "NoticeDelivery_recipientRepresentative_idx" ON "NoticeDelivery"("recipientRepresentative");

-- CreateIndex
CREATE INDEX "NoticeDelivery_deliveredBy_idx" ON "NoticeDelivery"("deliveredBy");

-- CreateIndex
CREATE INDEX "NoticeDelivery_document_idx" ON "NoticeDelivery"("document");

-- CreateIndex
CREATE INDEX "NoticeDelivery_witness_idx" ON "NoticeDelivery"("witness");

-- CreateIndex
CREATE INDEX "PreAdmissionScreen_resident_idx" ON "PreAdmissionScreen"("resident");

-- CreateIndex
CREATE INDEX "PreAdmissionScreen_prospect_idx" ON "PreAdmissionScreen"("prospect");

-- CreateIndex
CREATE INDEX "PreAdmissionScreen_document_idx" ON "PreAdmissionScreen"("document");

-- CreateIndex
CREATE UNIQUE INDEX "Representative_reference_key" ON "Representative"("reference");

-- CreateIndex
CREATE INDEX "Representative_resident_idx" ON "Representative"("resident");

-- CreateIndex
CREATE INDEX "Representative_contact_idx" ON "Representative"("contact");

-- CreateIndex
CREATE INDEX "Representative_authorityDocument_idx" ON "Representative"("authorityDocument");

-- CreateIndex
CREATE INDEX "Representative_authorityVerifiedBy_idx" ON "Representative"("authorityVerifiedBy");

-- CreateIndex
CREATE INDEX "Representative_portalAccount_idx" ON "Representative"("portalAccount");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_reference_key" ON "Resident"("reference");

-- CreateIndex
CREATE INDEX "Resident_community_idx" ON "Resident"("community");

-- CreateIndex
CREATE INDEX "Resident_currentStay_idx" ON "Resident"("currentStay");

-- CreateIndex
CREATE INDEX "ResidentIdentifier_resident_idx" ON "ResidentIdentifier"("resident");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_reference_key" ON "Stay"("reference");

-- CreateIndex
CREATE INDEX "Stay_resident_idx" ON "Stay"("resident");

-- CreateIndex
CREATE INDEX "Stay_community_idx" ON "Stay"("community");

-- CreateIndex
CREATE INDEX "Stay_priorStay_idx" ON "Stay"("priorStay");

-- CreateIndex
CREATE INDEX "Stay_currentBed_idx" ON "Stay"("currentBed");

-- CreateIndex
CREATE INDEX "Stay_currentApartment_idx" ON "Stay"("currentApartment");

-- CreateIndex
CREATE INDEX "Stay_heldBed_idx" ON "Stay"("heldBed");

-- CreateIndex
CREATE INDEX "Stay_agreement_idx" ON "Stay"("agreement");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySnapshot_snapshotKey_key" ON "AvailabilitySnapshot"("snapshotKey");

-- CreateIndex
CREATE INDEX "AvailabilitySnapshot_community_idx" ON "AvailabilitySnapshot"("community");

-- CreateIndex
CREATE INDEX "AvailabilitySnapshot_apartmentType_idx" ON "AvailabilitySnapshot"("apartmentType");

-- CreateIndex
CREATE UNIQUE INDEX "Inquiry_publicCode_key" ON "Inquiry"("publicCode");

-- CreateIndex
CREATE INDEX "Inquiry_community_idx" ON "Inquiry"("community");

-- CreateIndex
CREATE INDEX "Inquiry_lead_idx" ON "Inquiry"("lead");

-- CreateIndex
CREATE INDEX "JobPosting_community_idx" ON "JobPosting"("community");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_reference_key" ON "Lead"("reference");

-- CreateIndex
CREATE INDEX "Lead_community_idx" ON "Lead"("community");

-- CreateIndex
CREATE INDEX "Lead_owner_idx" ON "Lead"("owner");

-- CreateIndex
CREATE INDEX "Lead_primaryContact_idx" ON "Lead"("primaryContact");

-- CreateIndex
CREATE INDEX "Lead_referralSource_idx" ON "Lead"("referralSource");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_reference_key" ON "PortalAccount"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_user_key" ON "PortalAccount"("user");

-- CreateIndex
CREATE INDEX "PortalAccount_contact_idx" ON "PortalAccount"("contact");

-- CreateIndex
CREATE INDEX "PortalAccount_community_idx" ON "PortalAccount"("community");

-- CreateIndex
CREATE INDEX "PortalAccount_invitedBy_idx" ON "PortalAccount"("invitedBy");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_account_idx" ON "PortalScopeGrant"("account");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_resident_idx" ON "PortalScopeGrant"("resident");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_representative_idx" ON "PortalScopeGrant"("representative");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_consentDocument_idx" ON "PortalScopeGrant"("consentDocument");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_proposedBy_idx" ON "PortalScopeGrant"("proposedBy");

-- CreateIndex
CREATE INDEX "PortalScopeGrant_grantedBy_idx" ON "PortalScopeGrant"("grantedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_reference_key" ON "Prospect"("reference");

-- CreateIndex
CREATE INDEX "Prospect_community_idx" ON "Prospect"("community");

-- CreateIndex
CREATE INDEX "Prospect_lead_idx" ON "Prospect"("lead");

-- CreateIndex
CREATE INDEX "Prospect_convertedResident_idx" ON "Prospect"("convertedResident");

-- CreateIndex
CREATE INDEX "PublishedPrice_community_idx" ON "PublishedPrice"("community");

-- CreateIndex
CREATE INDEX "PublishedPrice_apartmentType_idx" ON "PublishedPrice"("apartmentType");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_reference_key" ON "Referral"("reference");

-- CreateIndex
CREATE INDEX "Referral_community_idx" ON "Referral"("community");

-- CreateIndex
CREATE INDEX "Referral_source_idx" ON "Referral"("source");

-- CreateIndex
CREATE INDEX "Referral_prospect_idx" ON "Referral"("prospect");

-- CreateIndex
CREATE INDEX "Referral_pasrrLevel1_idx" ON "Referral"("pasrrLevel1");

-- CreateIndex
CREATE INDEX "ReferralSource_community_idx" ON "ReferralSource"("community");

-- CreateIndex
CREATE INDEX "SalesActivity_lead_idx" ON "SalesActivity"("lead");

-- CreateIndex
CREATE INDEX "SalesActivity_by_idx" ON "SalesActivity"("by");

-- CreateIndex
CREATE INDEX "StaffBio_site_idx" ON "StaffBio"("site");

-- CreateIndex
CREATE INDEX "StaffBio_photo_idx" ON "StaffBio"("photo");

-- CreateIndex
CREATE INDEX "StaffBio_consentDocument_idx" ON "StaffBio"("consentDocument");

-- CreateIndex
CREATE UNIQUE INDEX "Tour_publicCode_key" ON "Tour"("publicCode");

-- CreateIndex
CREATE INDEX "Tour_community_idx" ON "Tour"("community");

-- CreateIndex
CREATE INDEX "Tour_slot_idx" ON "Tour"("slot");

-- CreateIndex
CREATE INDEX "Tour_lead_idx" ON "Tour"("lead");

-- CreateIndex
CREATE INDEX "TourSlot_community_idx" ON "TourSlot"("community");

-- CreateIndex
CREATE INDEX "TourSlot_host_idx" ON "TourSlot"("host");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_reference_key" ON "WaitlistEntry"("reference");

-- CreateIndex
CREATE INDEX "WaitlistEntry_community_idx" ON "WaitlistEntry"("community");

-- CreateIndex
CREATE INDEX "WaitlistEntry_prospect_idx" ON "WaitlistEntry"("prospect");

-- CreateIndex
CREATE INDEX "WaitlistEntry_lead_idx" ON "WaitlistEntry"("lead");

-- CreateIndex
CREATE INDEX "WaitlistEntry_apartmentType_idx" ON "WaitlistEntry"("apartmentType");

-- CreateIndex
CREATE INDEX "WaitlistEntry_offeredReservation_idx" ON "WaitlistEntry"("offeredReservation");

-- CreateIndex
CREATE UNIQUE INDEX "_Referral_packet_AB_unique" ON "_Referral_packet"("A", "B");

-- CreateIndex
CREATE INDEX "_Referral_packet_B_index" ON "_Referral_packet"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_StorefrontSite_gallery_AB_unique" ON "_StorefrontSite_gallery"("A", "B");

-- CreateIndex
CREATE INDEX "_StorefrontSite_gallery_B_index" ON "_StorefrontSite_gallery"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_OperatorSettings_jurisdictionPacks_AB_unique" ON "_OperatorSettings_jurisdictionPacks"("A", "B");

-- CreateIndex
CREATE INDEX "_OperatorSettings_jurisdictionPacks_B_index" ON "_OperatorSettings_jurisdictionPacks"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_StaffAssignment_units_AB_unique" ON "_StaffAssignment_units"("A", "B");

-- CreateIndex
CREATE INDEX "_StaffAssignment_units_B_index" ON "_StaffAssignment_units"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_AgentToolGrant_communities_AB_unique" ON "_AgentToolGrant_communities"("A", "B");

-- CreateIndex
CREATE INDEX "_AgentToolGrant_communities_B_index" ON "_AgentToolGrant_communities"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_ApartmentType_photos_AB_unique" ON "_ApartmentType_photos"("A", "B");

-- CreateIndex
CREATE INDEX "_ApartmentType_photos_B_index" ON "_ApartmentType_photos"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_oauthApp_fkey" FOREIGN KEY ("oauthApp") REFERENCES "OAuthApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_request_fkey" FOREIGN KEY ("request") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByAgent_fkey" FOREIGN KEY ("requestedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUser_fkey" FOREIGN KEY ("actorUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorAgent_fkey" FOREIGN KEY ("actorAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_approver_fkey" FOREIGN KEY ("approver") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassGrant" ADD CONSTRAINT "BreakGlassGrant_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassGrant" ADD CONSTRAINT "BreakGlassGrant_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakGlassGrant" ADD CONSTRAINT "BreakGlassGrant_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_jurisdictionPack_fkey" FOREIGN KEY ("jurisdictionPack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_holidayCalendar_fkey" FOREIGN KEY ("holidayCalendar") REFERENCES "HolidayCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_bedHoldPolicy_fkey" FOREIGN KEY ("bedHoldPolicy") REFERENCES "BedHoldPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Community" ADD CONSTRAINT "Community_storefront_fkey" FOREIGN KEY ("storefront") REFERENCES "StorefrontSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceClock" ADD CONSTRAINT "ComplianceClock_obligation_fkey" FOREIGN KEY ("obligation") REFERENCES "RegulatoryObligation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceClock" ADD CONSTRAINT "ComplianceClock_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceClock" ADD CONSTRAINT "ComplianceClock_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceClock" ADD CONSTRAINT "ComplianceClock_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "ComplianceClock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_template_fkey" FOREIGN KEY ("template") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersedes_fkey" FOREIGN KEY ("supersedes") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_jurisdictionPack_fkey" FOREIGN KEY ("jurisdictionPack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayDate" ADD CONSTRAINT "HolidayDate_calendar_fkey" FOREIGN KEY ("calendar") REFERENCES "HolidayCalendar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_job_fkey" FOREIGN KEY ("job") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipient_fkey" FOREIGN KEY ("recipient") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notification_fkey" FOREIGN KEY ("notification") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessorRegistration" ADD CONSTRAINT "ProcessorRegistration_baaDocument_fkey" FOREIGN KEY ("baaDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryObligation" ADD CONSTRAINT "RegulatoryObligation_pack_fkey" FOREIGN KEY ("pack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_agent_fkey" FOREIGN KEY ("agent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolGrant" ADD CONSTRAINT "AgentToolGrant_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_agentRun_fkey" FOREIGN KEY ("agentRun") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposedByAgent_fkey" FOREIGN KEY ("proposedByAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposedByUser_fkey" FOREIGN KEY ("proposedByUser") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_apartmentType_fkey" FOREIGN KEY ("apartmentType") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentType" ADD CONSTRAINT "ApartmentType_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApartmentType" ADD CONSTRAINT "ApartmentType_floorPlan_fkey" FOREIGN KEY ("floorPlan") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_currentStay_fkey" FOREIGN KEY ("currentStay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedHoldPolicy" ADD CONSTRAINT "BedHoldPolicy_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedHoldPolicy" ADD CONSTRAINT "BedHoldPolicy_jurisdictionPack_fkey" FOREIGN KEY ("jurisdictionPack") REFERENCES "JurisdictionPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedHoldPolicy" ADD CONSTRAINT "BedHoldPolicy_noticeTemplate_fkey" FOREIGN KEY ("noticeTemplate") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_openedByEvent_fkey" FOREIGN KEY ("openedByEvent") REFERENCES "CensusEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_closedByEvent_fkey" FOREIGN KEY ("closedByEvent") REFERENCES "CensusEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_apartment_fkey" FOREIGN KEY ("apartment") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_prospect_fkey" FOREIGN KEY ("prospect") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_referral_fkey" FOREIGN KEY ("referral") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_waitlistEntry_fkey" FOREIGN KEY ("waitlistEntry") REFERENCES "WaitlistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_consumedByStay_fkey" FOREIGN KEY ("consumedByStay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_building_fkey" FOREIGN KEY ("building") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceDirective" ADD CONSTRAINT "AdvanceDirective_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceDirective" ADD CONSTRAINT "AdvanceDirective_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceDirective" ADD CONSTRAINT "AdvanceDirective_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allergy" ADD CONSTRAINT "Allergy_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_bed_fkey" FOREIGN KEY ("bed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_apartment_fkey" FOREIGN KEY ("apartment") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_primaryCoverage_fkey" FOREIGN KEY ("primaryCoverage") REFERENCES "CoveragePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_snapshotRun_fkey" FOREIGN KEY ("snapshotRun") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusDay" ADD CONSTRAINT "CensusDay_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES "CensusDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_fromBed_fkey" FOREIGN KEY ("fromBed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_toBed_fkey" FOREIGN KEY ("toBed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_fromApartment_fkey" FOREIGN KEY ("fromApartment") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_toApartment_fkey" FOREIGN KEY ("toApartment") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_coverage_fkey" FOREIGN KEY ("coverage") REFERENCES "CoveragePeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_voidsEvent_fkey" FOREIGN KEY ("voidsEvent") REFERENCES "CensusEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_approval_fkey" FOREIGN KEY ("approval") REFERENCES "ApprovalRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_actorAgent_fkey" FOREIGN KEY ("actorAgent") REFERENCES "AgentIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusSignoff" ADD CONSTRAINT "CensusSignoff_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusSignoff" ADD CONSTRAINT "CensusSignoff_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusSignoff" ADD CONSTRAINT "CensusSignoff_run_fkey" FOREIGN KEY ("run") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CensusSignoff" ADD CONSTRAINT "CensusSignoff_signedBy_fkey" FOREIGN KEY ("signedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoveragePeriod" ADD CONSTRAINT "CoveragePeriod_stay_fkey" FOREIGN KEY ("stay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoveragePeriod" ADD CONSTRAINT "CoveragePeriod_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Payer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_censusEvent_fkey" FOREIGN KEY ("censusEvent") REFERENCES "CensusEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_recipientRepresentative_fkey" FOREIGN KEY ("recipientRepresentative") REFERENCES "Representative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_deliveredBy_fkey" FOREIGN KEY ("deliveredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeDelivery" ADD CONSTRAINT "NoticeDelivery_witness_fkey" FOREIGN KEY ("witness") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAdmissionScreen" ADD CONSTRAINT "PreAdmissionScreen_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAdmissionScreen" ADD CONSTRAINT "PreAdmissionScreen_prospect_fkey" FOREIGN KEY ("prospect") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreAdmissionScreen" ADD CONSTRAINT "PreAdmissionScreen_document_fkey" FOREIGN KEY ("document") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_contact_fkey" FOREIGN KEY ("contact") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_authorityDocument_fkey" FOREIGN KEY ("authorityDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_authorityVerifiedBy_fkey" FOREIGN KEY ("authorityVerifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Representative" ADD CONSTRAINT "Representative_portalAccount_fkey" FOREIGN KEY ("portalAccount") REFERENCES "PortalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_currentStay_fkey" FOREIGN KEY ("currentStay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentIdentifier" ADD CONSTRAINT "ResidentIdentifier_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_priorStay_fkey" FOREIGN KEY ("priorStay") REFERENCES "Stay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_currentBed_fkey" FOREIGN KEY ("currentBed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_currentApartment_fkey" FOREIGN KEY ("currentApartment") REFERENCES "Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_heldBed_fkey" FOREIGN KEY ("heldBed") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_agreement_fkey" FOREIGN KEY ("agreement") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySnapshot" ADD CONSTRAINT "AvailabilitySnapshot_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySnapshot" ADD CONSTRAINT "AvailabilitySnapshot_apartmentType_fkey" FOREIGN KEY ("apartmentType") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_owner_fkey" FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_primaryContact_fkey" FOREIGN KEY ("primaryContact") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referralSource_fkey" FOREIGN KEY ("referralSource") REFERENCES "ReferralSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_contact_fkey" FOREIGN KEY ("contact") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccount" ADD CONSTRAINT "PortalAccount_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_account_fkey" FOREIGN KEY ("account") REFERENCES "PortalAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_resident_fkey" FOREIGN KEY ("resident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_representative_fkey" FOREIGN KEY ("representative") REFERENCES "Representative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_consentDocument_fkey" FOREIGN KEY ("consentDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_proposedBy_fkey" FOREIGN KEY ("proposedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalScopeGrant" ADD CONSTRAINT "PortalScopeGrant_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_convertedResident_fkey" FOREIGN KEY ("convertedResident") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPrice" ADD CONSTRAINT "PublishedPrice_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedPrice" ADD CONSTRAINT "PublishedPrice_apartmentType_fkey" FOREIGN KEY ("apartmentType") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_source_fkey" FOREIGN KEY ("source") REFERENCES "ReferralSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_prospect_fkey" FOREIGN KEY ("prospect") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_pasrrLevel1_fkey" FOREIGN KEY ("pasrrLevel1") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralSource" ADD CONSTRAINT "ReferralSource_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_by_fkey" FOREIGN KEY ("by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBio" ADD CONSTRAINT "StaffBio_site_fkey" FOREIGN KEY ("site") REFERENCES "StorefrontSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBio" ADD CONSTRAINT "StaffBio_photo_fkey" FOREIGN KEY ("photo") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffBio" ADD CONSTRAINT "StaffBio_consentDocument_fkey" FOREIGN KEY ("consentDocument") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_slot_fkey" FOREIGN KEY ("slot") REFERENCES "TourSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_host_fkey" FOREIGN KEY ("host") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_community_fkey" FOREIGN KEY ("community") REFERENCES "Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_prospect_fkey" FOREIGN KEY ("prospect") REFERENCES "Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_apartmentType_fkey" FOREIGN KEY ("apartmentType") REFERENCES "ApartmentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_offeredReservation_fkey" FOREIGN KEY ("offeredReservation") REFERENCES "PlaceReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Referral_packet" ADD CONSTRAINT "_Referral_packet_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Referral_packet" ADD CONSTRAINT "_Referral_packet_B_fkey" FOREIGN KEY ("B") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorefrontSite_gallery" ADD CONSTRAINT "_StorefrontSite_gallery_A_fkey" FOREIGN KEY ("A") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StorefrontSite_gallery" ADD CONSTRAINT "_StorefrontSite_gallery_B_fkey" FOREIGN KEY ("B") REFERENCES "StorefrontSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OperatorSettings_jurisdictionPacks" ADD CONSTRAINT "_OperatorSettings_jurisdictionPacks_A_fkey" FOREIGN KEY ("A") REFERENCES "JurisdictionPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OperatorSettings_jurisdictionPacks" ADD CONSTRAINT "_OperatorSettings_jurisdictionPacks_B_fkey" FOREIGN KEY ("B") REFERENCES "OperatorSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffAssignment_units" ADD CONSTRAINT "_StaffAssignment_units_A_fkey" FOREIGN KEY ("A") REFERENCES "StaffAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_StaffAssignment_units" ADD CONSTRAINT "_StaffAssignment_units_B_fkey" FOREIGN KEY ("B") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentToolGrant_communities" ADD CONSTRAINT "_AgentToolGrant_communities_A_fkey" FOREIGN KEY ("A") REFERENCES "AgentToolGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentToolGrant_communities" ADD CONSTRAINT "_AgentToolGrant_communities_B_fkey" FOREIGN KEY ("B") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApartmentType_photos" ADD CONSTRAINT "_ApartmentType_photos_A_fkey" FOREIGN KEY ("A") REFERENCES "ApartmentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ApartmentType_photos" ADD CONSTRAINT "_ApartmentType_photos_B_fkey" FOREIGN KEY ("B") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Senior care guards (SCHEMA G7, G9, §17) ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Append-only evidence: these rows are never updated or deleted, whatever the application does.
-- Corrections are new rows (a voiding CensusEvent, a superseding CensusDay).
CREATE OR REPLACE FUNCTION sc_forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AuditEvent', 'ApprovalDecision', 'CensusEvent', 'PhiReadAudit', 'NoticeDelivery', 'CensusSignoff'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION sc_forbid_change()', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION sc_forbid_change()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- A census-day row may only gain the pointer to the row that supersedes it.
CREATE OR REPLACE FUNCTION sc_census_day_supersede_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD."supersededBy" IS NOT NULL
     OR (to_jsonb(NEW) - 'supersededBy') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededBy') THEN
    RAISE EXCEPTION 'CensusDay rows are append-only (only supersededBy may be set, once)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "CensusDay_append_only" BEFORE UPDATE OR DELETE ON "CensusDay" FOR EACH ROW EXECUTE FUNCTION sc_census_day_supersede_only();
CREATE TRIGGER "CensusDay_no_truncate" BEFORE TRUNCATE ON "CensusDay" FOR EACH STATEMENT EXECUTE FUNCTION sc_forbid_change();

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_seq_positive" CHECK (seq > 0);
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_hash_format" CHECK (hash ~ '^[0-9a-f]{64}$' AND "prevHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_seq_positive" CHECK (seq > 0);
ALTER TABLE "CensusEvent" ADD CONSTRAINT "CensusEvent_hash_format" CHECK (hash ~ '^[0-9a-f]{64}$' AND "prevHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_attempts_nonnegative" CHECK (attempts >= 0);
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_fencing_positive" CHECK ("fencingToken" > 0);
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_next_positive" CHECK ("nextValue" > 0);
ALTER TABLE "ApprovalPolicy" ADD CONSTRAINT "ApprovalPolicy_min_approvals" CHECK ("minApprovals" >= 1);
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_version_nonnegative" CHECK (version >= 0);
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_occupancy_within_capacity" CHECK ("occupantCount" >= 0 AND "occupantCount" <= capacity);
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_capacity_positive" CHECK (capacity >= 1);
ALTER TABLE "PlaceReservation" ADD CONSTRAINT "PlaceReservation_one_place" CHECK ((bed IS NULL) <> (apartment IS NULL));
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_interval_order" CHECK ("endAt" IS NULL OR "endAt" >= "startAt");

-- A bed is claimed by at most one stay at any instant (occupied or held).
ALTER TABLE "BedOccupancy" ADD CONSTRAINT "BedOccupancy_no_overlap"
  EXCLUDE USING gist (bed WITH =, tsrange("startAt", COALESCE("endAt", 'infinity'::timestamp), '[)') WITH &&);

-- One primary coverage per stay per day.
ALTER TABLE "CoveragePeriod" ADD CONSTRAINT "CoveragePeriod_primary_no_overlap"
  EXCLUDE USING gist (stay WITH =, daterange("startDate", COALESCE("endDate", 'infinity'::date), '[)') WITH &&)
  WHERE (rank = 'primary' AND status IN ('pending', 'active', 'ending', 'ended', 'retro_approved'));

-- One active assignment per person and community over time.
ALTER TABLE "StaffAssignment" ADD CONSTRAINT "StaffAssignment_no_overlap"
  EXCLUDE USING gist ("user" WITH =, community WITH =, daterange(COALESCE("effectiveFrom", '-infinity'::date), COALESCE("effectiveTo", 'infinity'::date), '[]') WITH &&)
  WHERE (status = 'active');

CREATE UNIQUE INDEX "PlaceReservation_active_bed_key" ON "PlaceReservation"(bed) WHERE status = 'active' AND bed IS NOT NULL;
CREATE UNIQUE INDEX "PlaceReservation_active_apartment_key" ON "PlaceReservation"(apartment) WHERE status = 'active' AND apartment IS NOT NULL;
CREATE UNIQUE INDEX "ComplianceClock_current_key" ON "ComplianceClock"("obligationCode", "subjectType", "subjectId", "occurrenceKey") WHERE "current";
CREATE UNIQUE INDEX "PortalScopeGrant_live_key" ON "PortalScopeGrant"(account, resident, scope) WHERE status IN ('proposed', 'granted');
CREATE UNIQUE INDEX "AgentToolGrant_active_scope_key" ON "AgentToolGrant"(agent, scope) WHERE status = 'active';
CREATE UNIQUE INDEX "CensusSignoff_community_date_key" ON "CensusSignoff"(community, date) WHERE unit IS NULL;

-- Due-work indexes for the workers and boards.
CREATE INDEX "OutboxEvent_due_idx" ON "OutboxEvent" ("nextAttemptAt", "createdAt") WHERE status IN ('pending', 'failed');
CREATE INDEX "OutboxEvent_leased_idx" ON "OutboxEvent" ("leaseExpiresAt") WHERE status = 'leased';
CREATE INDEX "ComplianceClock_board_idx" ON "ComplianceClock" (community, status, "dueAt") WHERE "current";
CREATE INDEX "PlaceReservation_expiry_idx" ON "PlaceReservation" ("expiresAt") WHERE status = 'active';
