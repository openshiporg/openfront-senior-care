import { list } from '@keystone-6/core'
import { integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { scopedGoverned } from './scope'
import { fixedChoice, lifecycle, systemText } from './domainFields'
import { opt, ro } from './residentAccess'
import { stamps } from './clinical'

/* AI workflow layer v1 (SCHEMA §14). Workflows run only on request; see lib/workflows/engine.ts. */

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
    status: lifecycle(['draft', 'dry_run_ok', 'pending_activation', 'active', 'retired']),
    dryRun: json({ ...ro }),
    createdByInference: relationship({ ref: 'InferenceCall', ...ro }),
    description: systemText(),
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
    trigger: fixedChoice(['page_load', 'run_now', 'source_change', 'dry_run']),
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
    status: lifecycle(['open', 'resolved', 'dismissed']),
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
    spanStart: integer({ ...ro }),
    spanEnd: integer({ ...ro }),
    quote: text({ ...ro }),
    ...stamps(),
  },
})

/** Every call to a model, allowed or refused. */
export const InferenceCall = list({
  access: scopedGoverned(['canManageWorkflows', 'canReadFindings'], ['community']),
  ui: { labelField: 'purpose', listView: { initialColumns: ['purpose', 'provider', 'outcome', 'at'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    purpose: fixedChoice(['workflow_build', 'workflow_step', 'summarise', 'classify']),
    provider: systemText({ required: true }),
    providerClass: fixedChoice(['sandbox_fixture', 'self_hosted', 'baa_hosted', 'other']),
    model: systemText(),
    outcome: fixedChoice(['ok', 'refused_policy', 'error']),
    policyAtCall: systemText(),
    inputHash: systemText({ required: true }),
    outputHash: systemText(),
    inputTokens: integer({ ...ro }),
    outputTokens: integer({ ...ro }),
    reason: systemText(),
    at: when(),
    actor: by(),
    ...stamps(),
  },
})
