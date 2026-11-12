import { list } from '@keystone-6/core'
import { json, relationship, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { scopedGoverned } from './scope'
import { trackingFields } from './trackingFields'

/* Agents (SCHEMA §14.7-14.8, INTEGRATIONS §7.2). Every write goes through a server command. */

/** The MCP scope catalogue. PHI scopes are off by default and need two approvers (SM§15.7). */
export const AGENT_SCOPES = [
  'workflow.read', 'workflow.propose', 'workflow.dry_run', 'workflow.pause', 'finding.read', 'finding.recheck', 'task.create',
  'census.read', 'resident.read_demographics', 'resident.read_clinical', 'workforce.read', 'compliance.read', 'incident.read',
  'proposal.create_note', 'proposal.create_care_plan', 'proposal.create_family_update', 'report.generate',
] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

export const PHI_AGENT_SCOPES: ReadonlySet<AgentScope> = new Set(['resident.read_demographics', 'resident.read_clinical'])

export const PROPOSAL_KINDS = [
  'progress_note_draft', 'care_plan_update', 'family_update_draft', 'care_level_change', 'precaution_order', 'workflow_version', 'regulatory_report_draft',
] as const

export const AgentToolGrant = list({
  access: governed('canAccessDashboard'),
  ui: { labelField: 'scope', listView: { initialColumns: ['agent', 'scope', 'status', 'createdAt'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity.grants', ...readOnly }),
    scope: fixedChoice(AGENT_SCOPES),
    communities: relationship({ ref: 'Community', many: true, ...readOnly }),
    constraints: json({ ...readOnly }),
    status: lifecycle(['requested', 'active', 'revoked']),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    revokedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AgentRun = list({
  access: governed('canAccessDashboard'),
  ui: { labelField: 'purpose', listView: { initialColumns: ['agent', 'status', 'startedAt', 'endedAt'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity.runs', ...readOnly }),
    purpose: systemText(),
    startedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    status: lifecycle(['started', 'completed', 'failed', 'aborted']),
    toolCalls: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Tool names and argument digests, never raw arguments.' } }),
    proposals: relationship({ ref: 'Proposal.agentRun', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * A suggestion that is never a chart record until a person turns it into one (SM §15.6): an agent or workflow drafts, a person with the
 * right permission accepts (which makes a draft record) and signs. Payloads hold clinical text, so reads are scoped to the community.
 */
export const Proposal = list({
  access: scopedGoverned(['canManageCarePlans', 'canChartNursing', 'canManageWorkflows'], ['community']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'status', 'proposedByAgent', 'proposedByUser', 'createdAt'] } },
  fields: {
    kind: fixedChoice(PROPOSAL_KINDS),
    payload: json({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    community: relationship({ ref: 'Community', ...readOnly }),
    resident: relationship({ ref: 'Resident', ...readOnly }),
    status: lifecycle(['proposed', 'accepted', 'signed', 'rejected', 'expired']),
    sourceFinding: relationship({ ref: 'Finding', ...readOnly }),
    inferenceCall: relationship({ ref: 'InferenceCall', ...readOnly }),
    rejectedReason: systemText(),
    agentRun: relationship({ ref: 'AgentRun.proposals', ...readOnly }),
    proposedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    proposedByUser: relationship({ ref: 'User', ...readOnly }),
    acceptedBy: relationship({ ref: 'User', ...readOnly }),
    resultRecordType: systemText(),
    resultRecordId: systemText({ indexed: true }),
    expiresAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
