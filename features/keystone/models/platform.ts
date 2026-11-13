import { label } from '../../../lib/labels'
import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { isStaff, permissions } from '../access'
import { choice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed, immutable, managed, serverOnly } from './listAccess'
import { assignedFilter, scopedManaged } from './scope'
import { trackingFields } from './trackingFields'

/* Platform spine (SCHEMA §1, §12.1-12.2, §13.8, §14.8, §15). */

export const SETTINGS = ['nursing_facility', 'assisted_living', 'memory_care', 'independent_living'] as const

const staffRead = { query: isStaff }

export const OperatorSettings = list({
  isSingleton: true,
  graphql: { plural: 'OperatorSettingsItems' },
  access: { operation: { ...staffRead, create: permissions.canManageOperator, update: permissions.canManageOperator, delete: () => false } },
  fields: {
    legalName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Senior Care' }),
    displayName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Senior Care' }),
    homeTimeZone: text({ defaultValue: 'America/New_York', validation: { isRequired: true } }),
    jurisdictionPacks: relationship({ ref: 'JurisdictionPack', many: true }),
    // Changed only through the maker-checker mutation requestOperatorControls.
    inferencePolicy: select({ type: 'string', options: ['self_hosted_only', 'self_hosted_or_baa', 'any_registered'].map(value => ({ label: label(value), value })), defaultValue: 'self_hosted_only', validation: { isRequired: true }, ...readOnly }),
    breakGlassMaxHours: integer({ ...readOnly, defaultValue: 4 }),
    reauthMinutes: integer({ ...readOnly, defaultValue: 15 }),
    bedHoldNoticeGraceHours: integer({ ...readOnly, defaultValue: 24, ui: { ...readOnly.ui, description: 'Operator policy: how long after an emergency transfer the written bed-hold notice may be recorded. 42 CFR 483.15(d)(2) says "at the time of transfer"; the grace window is policy (verify with counsel).' } }),
    writeOffApprovalThresholdMinor: minor({ defaultValue: 0n }),
    refundApprovalThresholdMinor: minor({ defaultValue: 0n }),
    trustApprovalThresholdMinor: minor({ defaultValue: 0n }),
    strictAgentOwnerSoD: checkbox({ ...readOnly, defaultValue: true }),
    synthetic: checkbox({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const Community = list({
  access: {
    operation: { query: isStaff, create: permissions.canManageCommunities, update: permissions.canManageCommunities, delete: () => false },
    filter: { query: assignedFilter([]), update: assignedFilter([]) },
  },
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'reference', 'status', 'timeZone'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z0-9-]{2,60}$/, explanation: 'Lowercase letters, digits and hyphens' } } }),
    reference: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z]{2,5}$/, explanation: '2-5 capital letters' } } }),
    timeZone: text({ defaultValue: 'America/New_York', validation: { isRequired: true } }),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text(),
    postalCode: text(),
    country: text({ defaultValue: 'US' }),
    phone: text(),
    settingsOffered: json({ defaultValue: [] }),
    jurisdictionPack: relationship({ ref: 'JurisdictionPack' }),
    holidayCalendar: relationship({ ref: 'HolidayCalendar' }),
    identifiers: json({ defaultValue: {}, ui: { description: 'CCN, NPI, state licence, Medicaid provider id, NHSN OrgID. Seeded values are invented.' } }),
    bedHoldPolicy: relationship({ ref: 'BedHoldPolicy' }),
    buildings: relationship({ ref: 'Building.community', many: true }),
    units: relationship({ ref: 'Unit.community', many: true }),
    storefront: relationship({ ref: 'StorefrontSite.community' }),
    synthetic: checkbox({ defaultValue: false, ...readOnly }),
    status: choice(['setup', 'active', 'closed'], 'setup'),
    ...trackingFields,
  },
})

export const StaffAssignment = list({
  access: {
    operation: { query: isStaff, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: () => false },
    filter: {
      query: ({ session }) => (session?.data?.role?.canManagePeople ? true : { user: { id: { equals: session?.itemId ?? '' } } }),
    },
  },
  ui: { listView: { initialColumns: ['user', 'community', 'role', 'status', 'effectiveFrom'] } },
  fields: {
    user: relationship({ ref: 'User.assignments' }),
    community: relationship({ ref: 'Community' }),
    units: relationship({ ref: 'Unit', many: true, ui: { description: 'Empty means every unit in the community.' } }),
    role: relationship({ ref: 'Role', ui: { description: 'Overrides the user role in this community.' } }),
    effectiveFrom: calendarDay(),
    effectiveTo: calendarDay(),
    status: choice(['active', 'ended'], 'active'),
    ...trackingFields,
  },
})

export const DeviceRegistration = list({
  access: scopedManaged('canManageCommunities', 'canManageCommunities', ['community']),
  ui: { listView: { initialColumns: ['name', 'community', 'unit', 'revokedAt'] } },
  fields: {
    community: relationship({ ref: 'Community' }),
    unit: relationship({ ref: 'Unit' }),
    name: text({ validation: { isRequired: true } }),
    deviceKeyHash: systemText(),
    allowedKinds: json({ defaultValue: ['poc', 'emar'] }),
    revokedAt: timestamp(),
    ...trackingFields,
  },
})

export const BreakGlassGrant = list({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: () => false, delete: () => false },
    filter: {
      query: ({ session }) => (session?.data?.role?.canReviewBreakGlass ? true : { user: { id: { equals: session?.itemId ?? '' } } }),
    },
  },
  ui: { listView: { initialColumns: ['user', 'resident', 'reason', 'status', 'expiresAt'] } },
  fields: {
    user: relationship({ ref: 'User', ...readOnly }),
    resident: relationship({ ref: 'Resident', ...readOnly }),
    reason: fixedChoiceText(['emergency_care', 'coverage_gap', 'other']),
    note: systemText({ required: true }),
    requestedAt: timestamp({ ...readOnly }),
    expiresAt: timestamp({ ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    status: lifecycle(['active', 'ended', 'reviewed_ok', 'reviewed_violation']),
    reviewedBy: relationship({ ref: 'User', ...readOnly }),
    reviewNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

function fixedChoiceText(values: string[]) {
  return select({ type: 'string', options: values.map(value => ({ label: label(value), value })), validation: { isRequired: true }, ...readOnly })
}

export const AgentIdentity = list({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageAgents, update: () => false, delete: () => false } },
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    kind: choice(['llm_agent', 'rules_engine', 'external_mcp_client'], 'llm_agent'),
    model: text(),
    provider: text(),
    owner: relationship({ ref: 'User' }),
    status: lifecycle(['active', 'suspended', 'retired']),
    killSwitch: checkbox({ defaultValue: false, ...readOnly }),
    oauthApp: relationship({ ref: 'OAuthApp' }),
    grants: relationship({ ref: 'AgentToolGrant.agent', many: true, ...readOnly }),
    runs: relationship({ ref: 'AgentRun.agent', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AuditEvent = list({
  access: immutable('canReadAudit'),
  ui: { labelField: 'eventType', listView: { initialColumns: ['seq', 'at', 'eventType', 'entityType', 'entityId', 'actorUser'], initialSort: { field: 'seq', direction: 'DESC' } } },
  fields: {
    seq: integer({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: 'unique', required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: relationship({ ref: 'User', ...readOnly }),
    actorAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    approver: relationship({ ref: 'User', ...readOnly }),
    reason: systemText(),
    before: json({ ...readOnly }),
    after: json({ ...readOnly }),
    metadata: json({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: 'unique', required: true }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** One row per GraphQL/MCP/portal request that could resolve PHI (DOMAIN I-PR1). Values are never stored. */
export const PhiReadAudit = list({
  access: immutable('canReadPhiAudit'),
  ui: { labelField: 'operationName', listView: { initialColumns: ['occurredAt', 'actorReference', 'operationName', 'purpose', 'resultCount', 'breakGlass'], initialSort: { field: 'occurredAt', direction: 'DESC' } } },
  fields: {
    occurredAt: timestamp({ ...readOnly, defaultValue: { kind: 'now' }, db: { isNullable: false }, validation: { isRequired: true } }),
    actorReference: systemText({ indexed: true, required: true }),
    actorKind: systemText(),
    operationType: systemText(),
    operationName: systemText(),
    rootFields: json({ ...readOnly }),
    selectedFields: json({ ...readOnly }),
    selectionDigest: systemText(),
    resultReferenceDigest: systemText(),
    resourceReferences: json({ ...readOnly }),
    purpose: systemText({ required: true }),
    breakGlass: checkbox({ defaultValue: false, ...readOnly }),
    correlationReference: systemText(),
    resultCount: integer({ defaultValue: 0, ...readOnly }),
    success: checkbox({ defaultValue: true, ...readOnly }),
  },
})

export const CommandReceipt = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: text({ validation: { isRequired: true } }),
    principalKey: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    requestParams: json(),
    responseCode: text(),
    responseBody: json(),
    recoveryPoint: text({ defaultValue: 'completed' }),
    completedAt: timestamp({ defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
})

export const Lease = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    owner: text({ validation: { isRequired: true } }),
    fencingToken: integer({ defaultValue: 0, validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})

export const Job = list({
  access: governed('canManageIntegrations'),
  fields: {
    kind: systemText({ indexed: 'unique', required: true }),
    intervalSeconds: integer({ ...readOnly }),
    nextRunAt: timestamp({ ...readOnly }),
    lastRunAt: timestamp({ ...readOnly }),
    status: lifecycle(['idle', 'running', 'failed', 'disabled'], 'idle'),
    leaseKey: systemText(),
    lastError: systemText(),
    runs: relationship({ ref: 'JobRun.job', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const JobRun = list({
  access: governed(['canManageIntegrations', 'canRecordCensus']),
  ui: { listView: { initialColumns: ['job', 'scopeKey', 'status', 'startedAt', 'finishedAt'] } },
  fields: {
    job: relationship({ ref: 'Job.runs', ...readOnly }),
    kind: systemText({ indexed: true, required: true }),
    scopeKey: systemText({ indexed: true }),
    status: lifecycle(['running', 'succeeded', 'failed']),
    startedAt: timestamp({ ...readOnly }),
    finishedAt: timestamp({ ...readOnly }),
    summary: json({ ...readOnly }),
    fencingToken: integer({ ...readOnly }),
    ...trackingFields,
  },
})

export const Sequence = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    nextValue: integer({ defaultValue: 1, validation: { isRequired: true } }),
  },
})

/** Fixed-window counters for public endpoints (hospital RequestRateLimitBucket). */
export const RequestRateLimitBucket = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    bucketKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    count: integer({ defaultValue: 0, validation: { isRequired: true } }),
    windowStartsAt: timestamp({ validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
  },
})

/** No PHI in a notification body: it says "You have a new update" and links to the dashboard or portal (SCHEMA §13.8). */
export const Notification = list({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: permissions.canAccessDashboard, delete: () => false },
    filter: {
      query: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
      update: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
    },
  },
  fields: {
    recipient: relationship({ ref: 'User', ...readOnly }),
    channel: choice(['in_app', 'email', 'sms'], 'in_app'),
    template: systemText({ required: true }),
    payloadRef: json({ ...readOnly, ui: { ...readOnly.ui, description: 'References only (ids, links), never PHI.' } }),
    status: lifecycle(['pending', 'sent', 'failed']),
    deliveries: relationship({ ref: 'NotificationDelivery.notification', many: true, ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    readAt: timestamp(),
    ...trackingFields,
  },
})

export const NotificationDelivery = list({
  access: governed('canManageIntegrations'),
  fields: {
    notification: relationship({ ref: 'Notification.deliveries', ...readOnly }),
    attempt: integer({ defaultValue: 1, ...readOnly }),
    outcome: select({ type: 'string', options: ['sent', 'failed', 'unknown'].map(value => ({ label: label(value), value })), validation: { isRequired: true }, ...readOnly }),
    providerMessageId: systemText(),
    at: timestamp({ ...readOnly, defaultValue: { kind: 'now' } }),
  },
})

export const HolidayCalendar = list({
  access: managed('signedIn', 'canManageCommunities'),
  ui: { labelField: 'code' },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: text(),
    timeZone: text({ validation: { isRequired: true }, defaultValue: 'America/New_York' }),
    weekendDays: json({ defaultValue: [0, 6] }),
    dates: relationship({ ref: 'HolidayDate.calendar', many: true }),
    coverageThrough: calendarDay({ ui: { description: 'Working-day clocks past this date fail closed.' } }),
    source: text({ ui: { description: 'Where the holiday table came from and when it was checked.' } }),
    ...trackingFields,
  },
})

export const HolidayDate = list({
  access: managed('signedIn', 'canManageCommunities'),
  ui: { labelField: 'name', listView: { initialColumns: ['calendar', 'date', 'name'] } },
  fields: {
    calendar: relationship({ ref: 'HolidayCalendar.dates' }),
    date: calendarDay({ validation: { isRequired: true } }),
    name: text(),
    ...trackingFields,
  },
})

export const ApprovalPolicy = list({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageOperator, update: () => false, delete: () => false } },
  ui: { labelField: 'action' },
  fields: {
    action: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text(),
    requiredPermission: text({ validation: { isRequired: true } }),
    minApprovals: integer({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: integer({ defaultValue: 1440 }),
    ...trackingFields,
  },
})

export const ApprovalRequest = list({
  access: governed('canAccessDashboard'),
  ui: { labelField: 'action', listView: { initialColumns: ['action', 'status', 'targetList', 'requestedBy', 'createdAt', 'expiresAt'] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    community: relationship({ ref: 'Community', ...readOnly }),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    payload: json({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    requestedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    status: lifecycle(['pending', 'approved', 'rejected', 'expired', 'cancelled']),
    expiresAt: timestamp({ ...readOnly }),
    consumedAt: timestamp({ ...readOnly, ui: { ...readOnly.ui, description: 'When the approved action was carried out. An approval is used once.' } }),
    decisions: relationship({ ref: 'ApprovalDecision.request', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ApprovalDecision = list({
  access: immutable('canAccessDashboard'),
  fields: {
    request: relationship({ ref: 'ApprovalRequest.decisions', ...readOnly }),
    decidedBy: relationship({ ref: 'User', ...readOnly }),
    decision: select({ type: 'string', options: ['approve', 'reject'].map(value => ({ label: label(value), value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** Files live in a private bucket; reads go through short-lived signed URLs (SCHEMA G13). */
export const Document = list({
  access: {
    operation: { query: isStaff, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(['community']) },
  },
  fields: {
    title: text({ validation: { isRequired: true } }),
    kind: choice(['admission_agreement', 'residency_agreement', 'notice', 'bed_hold_policy', 'authority', 'advance_directive', 'referral_packet', 'pasrr', 'photo', 'floor_plan', 'policy', 'pack_source', 'qualifying_stay', 'mds_submission', 'other'], 'other'),
    community: relationship({ ref: 'Community', ...readOnly }),
    resident: relationship({ ref: 'Resident', ...readOnly }),
    phiTier: select({ type: 'string', options: ['pub', 'op', 'dem', 'clin', 'sens', 'ident', 'fin'].map(value => ({ label: label(value), value })), defaultValue: 'op', validation: { isRequired: true }, ...readOnly }),
    template: relationship({ ref: 'DocumentTemplate', ...readOnly }),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    sizeBytes: integer({ ...readOnly }),
    documentVersion: integer({ defaultValue: 1, ...readOnly }),
    supersedes: relationship({ ref: 'Document', ...readOnly }),
    status: lifecycle(['draft', 'pending_signature', 'signed', 'final', 'entered_in_error'], 'final'),
    signedAt: timestamp({ ...readOnly }),
    retentionUntil: calendarDay({ ...readOnly }),
    ...trackingFields,
  },
})

export const DocumentTemplate = list({
  access: managed('canAccessDashboard', 'canManageCompliance'),
  ui: { labelField: 'name' },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: text({ validation: { isRequired: true } }),
    kind: choice(['admission_agreement', 'residency_agreement', 'notice', 'bed_hold_policy', 'other'], 'notice'),
    jurisdictionPack: relationship({ ref: 'JurisdictionPack' }),
    body: text({ ui: { displayMode: 'textarea' } }),
    templateVersion: integer({ defaultValue: 1 }),
    verifyNote: text({ ui: { displayMode: 'textarea', description: 'Shown on generated notices until counsel confirms the wording.' } }),
    ...trackingFields,
  },
})

export const SecretBox = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    purpose: text({ validation: { isRequired: true } }),
    ciphertext: text({ validation: { isRequired: true } }),
    iv: text({ validation: { isRequired: true } }),
    authTag: text({ validation: { isRequired: true } }),
    keyVersion: integer({ defaultValue: 1 }),
    ...trackingFields,
  },
})

/** The BAA register (SCHEMA §15): who processes PHI for the operator, under which agreement. */
export const ProcessorRegistration = list({
  access: managed('canManageIntegrations', 'canManageIntegrations'),
  ui: { labelField: 'processor' },
  fields: {
    processor: text({ validation: { isRequired: true } }),
    service: text(),
    baaDocument: relationship({ ref: 'Document' }),
    effectiveFrom: calendarDay(),
    effectiveTo: calendarDay(),
    dataCategories: json({ defaultValue: [] }),
    status: choice(['draft', 'active', 'lapsed'], 'draft'),
    ...trackingFields,
  },
})

export const JurisdictionPack = list({
  access: managed('signedIn', 'canManageCompliance'),
  ui: { labelField: 'code' },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    name: text({ validation: { isRequired: true } }),
    packVersion: text({ validation: { isRequired: true }, defaultValue: '1' }),
    effectiveFrom: calendarDay(),
    status: choice(['draft', 'active', 'retired'], 'active'),
    rules: json({ defaultValue: {}, ui: { description: 'Configuration values (e.g. bed-hold day allotments) with ruleRef and verifyNote per entry.' } }),
    obligations: relationship({ ref: 'RegulatoryObligation.pack', many: true }),
    sourceNote: text({ ui: { displayMode: 'textarea' } }),
    ...trackingFields,
  },
})

export const RegulatoryObligation = list({
  access: governed('signedIn'),
  ui: { labelField: 'code', listView: { initialColumns: ['code', 'pack', 'description', 'ruleRef', 'active'] } },
  fields: {
    pack: relationship({ ref: 'JurisdictionPack.obligations', ...readOnly }),
    code: systemText({ indexed: true, required: true }),
    description: systemText(),
    appliesTo: json({ ...readOnly }),
    startFact: systemText(),
    dueRule: json({ ...readOnly }),
    evidenceTypes: json({ ...readOnly }),
    waivable: checkbox({ defaultValue: false, ...readOnly }),
    ruleRef: systemText(),
    verifyNote: systemText(),
    ownerRole: systemText(),
    active: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Dormant obligations are loaded for reference and start when their phase ships.' } }),
    ...trackingFields,
  },
})

export const ComplianceClock = list({
  access: {
    operation: { query: permissions.canReadCompliance, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(['community']) },
  },
  ui: { labelField: 'obligationCode', listView: { initialColumns: ['obligationCode', 'status', 'dueAt', 'subjectType', 'community'] } },
  fields: {
    obligation: relationship({ ref: 'RegulatoryObligation', ...readOnly }),
    obligationCode: systemText({ indexed: true, required: true }),
    community: relationship({ ref: 'Community', ...readOnly }),
    resident: relationship({ ref: 'Resident', ...readOnly }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    occurrenceKey: systemText({ required: true }),
    startedAt: timestamp({ ...readOnly }),
    dueAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'satisfied', 'overdue', 'satisfied_late', 'waived', 'cancelled']),
    ownerRole: systemText(),
    escalationLevel: integer({ defaultValue: 0, ...readOnly }),
    satisfiedBy: json({ ...readOnly }),
    satisfiedAt: timestamp({ ...readOnly }),
    cancelReason: systemText(),
    supersedes: relationship({ ref: 'ComplianceClock', ...readOnly }),
    current: checkbox({ defaultValue: true, ...readOnly }),
    ruleRef: systemText(),
    verifyNote: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})
