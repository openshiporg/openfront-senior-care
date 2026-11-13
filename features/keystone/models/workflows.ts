import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { scopedGoverned } from './scope'
import { governed } from './listAccess'
import { fixedChoice, lifecycle, systemText } from './domainFields'
import { opt, ro } from './residentAccess'
import { stamps } from './clinical'

/* AI workflow layer v1 (SCHEMA §14). Workflows run only on request; see lib/workflows/engine.ts. Model calls go through lib/inference/gateway.ts only. */

const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })

export const WorkflowDefinition = list({
  access: scopedGoverned(['canReadFindings', 'canManageWorkflows'], ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'code', 'origin', 'status'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    code: systemText({ indexed: true, required: true }),
    name: systemText({ required: true }),
    description: systemText(),
    origin: fixedChoice(['library', 'staff_described']),
    status: lifecycle(['active', 'archived'], 'active'),
    versions: relationship({ ref: 'WorkflowVersion.definition', many: true, ...ro }),
    ...stamps(),
  },
})

export const WorkflowVersion = list({
  access: scopedGoverned(['canReadFindings', 'canManageWorkflows'], ['community']),
  ui: { labelField: 'versionNumber', listView: { initialColumns: ['definition', 'versionNumber', 'status', 'policyVersion'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    definition: relationship({ ref: 'WorkflowDefinition.versions', ...ro }),
    versionNumber: integer({ ...ro }),
    graph: json({ ...ro, ui: { ...ro.ui, description: 'Nodes drawn only from the block catalogue (lib/workflows/blocks.ts).' } }),
    graphHash: systemText({ required: true }),
    policyVersion: systemText({ required: true }),
    policy: json({ ...ro, ui: { ...ro.ui, description: 'Operator-tunable parameters, such as the daily fluid threshold.' } }),
    // SM §15.1: draft → proposed → dry_run_reviewed → (approved) active → paused → retired. dry_run_ok is the library's reviewed state.
    status: lifecycle(['draft', 'proposed', 'dry_run_reviewed', 'dry_run_ok', 'pending_activation', 'active', 'paused', 'retired']),
    dryRun: json({ ...ro, ui: { ...ro.ui, description: 'The last dry run over history: would-be findings per day, samples and the diff. Nothing was written.' } }),
    dryRunAt: when(),
    createdByInference: relationship({ ref: 'InferenceCall', ...ro }),
    description: systemText(),
    /** The plain-language job a person described (staff_described only). */
    request: text({ ...ro, ui: { ...ro.ui, displayMode: 'textarea' } }),
    proposedBy: by(),
    proposedByAgent: relationship({ ref: 'AgentIdentity', ...ro }),
    reviewedBy: by(),
    reviewedAt: when(),
    reviewNote: systemText(),
    activations: relationship({ ref: 'WorkflowActivation.workflowVersion', many: true, ...ro }),
    ...stamps(),
  },
})

/** Activation needs two people (DON and administrator) through ApprovalRequest. */
export const WorkflowActivation = list({
  access: scopedGoverned(['canReadFindings', 'canManageWorkflows'], ['community']),
  ui: { labelField: 'status', listView: { initialColumns: ['workflowVersion', 'status', 'activatedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    workflowVersion: relationship({ ref: 'WorkflowVersion.activations', ...ro }),
    status: lifecycle(['active', 'paused', 'ended']),
    approvals: json({ ...ro }),
    activatedAt: when(),
    activatedBy: by(),
    ...stamps(),
  },
})

/** One run per (activation, windowKey). The unique windowKey is what makes a second run in a window change nothing. */
export const WorkflowRun = list({
  access: scopedGoverned(['canReadFindings', 'canManageWorkflows'], ['community']),
  ui: { labelField: 'windowKey', listView: { initialColumns: ['windowKey', 'trigger', 'status', 'findingsOpened', 'startedAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    workflowVersion: relationship({ ref: 'WorkflowVersion', ...ro }),
    windowKey: systemText({ indexed: 'unique', required: true }),
    trigger: fixedChoice(['page_load', 'run_now', 'source_change', 'dry_run', 'recheck']),
    status: lifecycle(['running', 'succeeded', 'failed'], 'running'),
    startedAt: when(),
    finishedAt: when(),
    findingsOpened: integer({ defaultValue: 0, ...ro }),
    findingsResolved: integer({ defaultValue: 0, ...ro }),
    summary: json({ ...ro }),
    ...stamps(),
  },
})

export const Finding = list({
  access: scopedGoverned(['canReadFindings'], ['community']),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'status', 'severity', 'resident', 'createdAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    resident: relationship({ ref: 'Resident', ...ro }),
    workflowVersion: relationship({ ref: 'WorkflowVersion', ...ro }),
    run: relationship({ ref: 'WorkflowRun', ...ro }),
    workflowCode: systemText({ indexed: true, required: true }),
    dedupeKey: systemText({ indexed: 'unique', required: true }),
    title: systemText({ required: true }),
    detail: systemText(),
    severity: select({ ...opt(['info', 'warning', 'urgent']), defaultValue: 'warning', ...ro }),
    // resolved: the condition no longer holds. resolved_by_evidence: a re-check found the record that satisfies the rule (SM §15.4).
    status: lifecycle(['open', 'resolved', 'resolved_by_evidence', 'dismissed']),
    evidence: relationship({ ref: 'EvidenceRef.finding', many: true, ...ro }),
    task: relationship({ ref: 'Task', ...ro }),
    proposal: relationship({ ref: 'Proposal', ...ro }),
    resolvedAt: when(),
    resolutionNote: systemText(),
    dismissedBy: by(),
    ...stamps(),
  },
})

/** Points at the exact passage or row that caused a finding. */
export const EvidenceRef = list({
  access: scopedGoverned(['canReadFindings'], ['community']),
  ui: { labelField: 'recordType', listView: { initialColumns: ['finding', 'recordType', 'recordId', 'quote'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    finding: relationship({ ref: 'Finding.evidence', ...ro }),
    recordType: systemText({ required: true }),
    recordId: systemText({ required: true }),
    /** cause: why the finding opened. resolution: the record a re-check found that satisfies the rule. */
    role: select({ ...opt(['cause', 'resolution']), defaultValue: 'cause', ...ro }),
    /** Character offsets into the source text (a progress note body), so the passage can be shown exactly. */
    spanStart: integer({ ...ro }),
    spanEnd: integer({ ...ro }),
    quote: text({ ...ro }),
    ...stamps(),
  },
})

/**
 * What an extractor read from one source record (for example a fall in a progress note). A cache keyed by extractor version and the
 * source text's digest: the model is asked once per note version, outside any business transaction, and blocks read the stored facts.
 */
export const ExtractedFact = list({
  access: scopedGoverned(['canManageWorkflows'], ['community']),
  ui: { labelField: 'extractor', listView: { initialColumns: ['extractor', 'sourceType', 'outcome', 'createdAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    resident: relationship({ ref: 'Resident', ...ro }),
    extractor: systemText({ required: true }),
    sourceType: systemText({ required: true }),
    sourceId: systemText({ indexed: true, required: true }),
    sourceDigest: systemText({ required: true }),
    /** extractor + source + digest: one extraction per version of the text. */
    cacheKey: systemText({ indexed: 'unique', required: true }),
    outcome: fixedChoice(['found', 'none', 'unclear', 'refused']),
    facts: json({ ...ro, ui: { ...ro.ui, description: 'Typed facts with character spans into the source text.' } }),
    inferenceCall: relationship({ ref: 'InferenceCall', ...ro }),
    ...stamps(),
  },
})

/**
 * A registered model endpoint (INTEGRATIONS §1). The mode decides what data it may receive: self_hosted runs in the operator's network;
 * baa_hosted needs an active ProcessorRegistration; no_phi never sees PHI. builtin_rules is the in-process rules engine (self_hosted).
 */
export const InferenceProvider = list({
  access: governed(['canManageIntegrations', 'canManageWorkflows']),
  ui: { labelField: 'key', listView: { initialColumns: ['key', 'adapter', 'mode', 'status', 'isDefault'] } },
  fields: {
    key: systemText({ indexed: 'unique', required: true }),
    name: systemText({ required: true }),
    adapter: fixedChoice(['self_hosted_openai_compat', 'bedrock', 'azure_openai', 'builtin_rules']),
    mode: fixedChoice(['self_hosted', 'baa_hosted', 'no_phi']),
    endpoint: systemText(),
    model: systemText(),
    processorRegistration: relationship({ ref: 'ProcessorRegistration', ...ro }),
    isDefault: checkbox({ defaultValue: false, ...ro }),
    status: lifecycle(['draft', 'active', 'suspended'], 'draft'),
    ...stamps(),
  },
})

/** Every call to a model, allowed or refused (SCHEMA §14.9). Append-only. No prompt or response content is stored: digests and counts only. */
export const InferenceCall = list({
  access: scopedGoverned(['canManageWorkflows', 'canReadFindings'], ['community']),
  ui: { labelField: 'purpose', listView: { initialColumns: ['purpose', 'provider', 'mode', 'outcome', 'at'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    purpose: fixedChoice(['extract', 'summarise', 'draft_note', 'classify', 'workflow_build', 'workflow_step']),
    provider: systemText({ required: true }),
    inferenceProvider: relationship({ ref: 'InferenceProvider', ...ro }),
    providerClass: fixedChoice(['self_hosted', 'baa_hosted', 'other']),
    mode: fixedChoice(['self_hosted', 'baa_hosted', 'no_phi', 'none']),
    model: systemText(),
    outcome: fixedChoice(['ok', 'refused_policy', 'error', 'timeout', 'invalid_output']),
    policyAtCall: systemText(),
    deidentification: fixedChoice(['none', 'identifiers_removed', 'safe_harbor']),
    dataCategories: json({ ...ro }),
    syntheticOnly: checkbox({ defaultValue: false, ...ro }),
    inputHash: systemText({ required: true }),
    outputHash: systemText(),
    inputTokens: integer({ ...ro }),
    outputTokens: integer({ ...ro }),
    latencyMs: integer({ ...ro }),
    reason: systemText(),
    workflowRun: relationship({ ref: 'WorkflowRun', ...ro }),
    agentRun: relationship({ ref: 'AgentRun', ...ro }),
    principal: systemText(),
    at: when(),
    actor: by(),
    ...stamps(),
  },
})
