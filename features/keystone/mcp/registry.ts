/**
 * Openfront Senior Care MCP tools (INTEGRATIONS §7). The generic createData/updateData/deleteData
 * and schema-exploration tools are gone: an agent sees only this allow-list of named domain
 * queries and commands. Each runs as the token's principal through /api/graphql, which checks
 * permission, community assignment and agent grants, records the PHI read audit with
 * purpose=operations, and runs writes as one idempotent audited command. Human-only actions
 * (approvals, signing, break-glass, trust postings, claim release, closed-period census
 * corrections, portal scope grants, credential overrides) have no tool.
 */

export type DomainTool = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, object>; required: string[]; additionalProperties?: boolean }
  /** GraphQL document; variables come from the validated arguments. */
  document: string
  /** Field of the GraphQL result to return. */
  field: string
  writes: boolean
  /** A clinicalCommand op: the arguments (minus idempotencyKey) become the command input. */
  op?: string
}

const COMMAND = 'mutation Command($op: String!, $input: JSON, $idempotencyKey: String!) { clinicalCommand(op: $op, input: $input, idempotencyKey: $idempotencyKey) }'
const command = (name: string, op: string, description: string, properties: Record<string, object>, required: string[]): DomainTool => ({
  name, description, op, document: COMMAND, field: 'clinicalCommand', writes: true,
  inputSchema: { type: 'object', properties: { ...properties, idempotencyKey }, required: [...required, 'idempotencyKey'], additionalProperties: false },
})
const read = (name: string, description: string, args: Record<string, { schema: object; gql: string; required?: boolean }>): DomainTool => {
  const entries = Object.entries(args)
  const vars = entries.map(([k, v]) => `$${k}: ${v.gql}`).join(', ')
  const pass = entries.map(([k]) => `${k}: $${k}`).join(', ')
  return {
    name, description, field: name, writes: false,
    document: entries.length ? `query Q(${vars}) { ${name}(${pass}) }` : `query Q { ${name} }`,
    inputSchema: { type: 'object', properties: Object.fromEntries(entries.map(([k, v]) => [k, v.schema])), required: entries.filter(([, v]) => v.required !== false).map(([k]) => k), additionalProperties: false },
  }
}

export const idempotencyKey = { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9._:-]+$', description: 'Unique per intent. Reusing it returns the first result instead of acting twice.' }

const id = (description: string) => ({ type: 'string', minLength: 1, maxLength: 64, description })
const noArgs = { type: 'object' as const, properties: {}, required: [], additionalProperties: false }

export const DOMAIN_TOOLS: DomainTool[] = [
  {
    name: 'censusSummary',
    description: 'Census counts for one community on a community-local date (default today): residents present, in house, on held leave, by setting, unit and payer kind, plus bed and apartment status counts and the last signed-off date. No resident names. Agents need the census.read grant.',
    inputSchema: { type: 'object', properties: { communityId: id('Community id'), date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD, community-local' } }, required: ['communityId'], additionalProperties: false },
    document: 'query CensusSummary($communityId: ID!, $date: String) { censusSummary(communityId: $communityId, date: $date) }',
    field: 'censusSummary',
    writes: false,
  },
  {
    name: 'bedBoard',
    description: 'Every unit, bed and apartment in a community with its status (available, reserved, occupied, held, cleaning, turnover, out of service) and the stay occupying it. Resident names appear only with resident.read_demographics; every such read is audited.',
    inputSchema: { type: 'object', properties: { communityId: id('Community id'), unitId: id('Optional unit id') }, required: ['communityId'], additionalProperties: false },
    document: 'query BedBoard($communityId: ID!, $unitId: ID) { bedBoard(communityId: $communityId, unitId: $unitId) }',
    field: 'bedBoard',
    writes: false,
  },
  {
    name: 'residentRoster',
    description: 'Residents of a community by stay status (admitted by default): name, place, presence, admission date and primary payer. Needs resident.read_demographics; every read is audited.',
    inputSchema: { type: 'object', properties: { communityId: id('Community id'), status: { type: 'string', enum: ['admitted', 'discharged', 'deceased', 'pre_admit'] } }, required: ['communityId'], additionalProperties: false },
    document: 'query ResidentRoster($communityId: ID!, $status: String) { residentRoster(communityId: $communityId, status: $status) }',
    field: 'residentRoster',
    writes: false,
  },
  {
    name: 'verifyStay',
    description: 'Rebuild one stay\'s census projection from its events and check the census hash chain. Reports any mismatch.',
    inputSchema: { type: 'object', properties: { stayId: id('Stay id') }, required: ['stayId'], additionalProperties: false },
    document: 'query VerifyStay($stayId: ID!) { verifyStay(stayId: $stayId) }',
    field: 'verifyStay',
    writes: false,
  },
  {
    name: 'verifyAuditChain',
    description: 'Recompute the hash-chained audit log and report whether it is intact (and where it breaks if not). Needs canReadAudit.',
    inputSchema: noArgs,
    document: 'query VerifyAuditChain { verifyAuditChain }',
    field: 'verifyAuditChain',
    writes: false,
  },
  {
    name: 'logSalesActivity',
    description: 'Log a call, email, text, tour, assessment or note against a sales lead. Needs canManageSales and an mcp:write connection.',
    inputSchema: { type: 'object', properties: { leadId: id('Lead id'), kind: { type: 'string', enum: ['call', 'email', 'text', 'tour', 'assessment', 'note'] }, summary: { type: 'string', minLength: 1, maxLength: 4000 }, idempotencyKey }, required: ['leadId', 'kind', 'summary', 'idempotencyKey'], additionalProperties: false },
    document: 'mutation LogSalesActivity($leadId: ID!, $kind: String!, $summary: String!, $idempotencyKey: String!) { logSalesActivity(leadId: $leadId, kind: $kind, summary: $summary, idempotencyKey: $idempotencyKey) }',
    field: 'logSalesActivity',
    writes: true,
  },

  // Workflows, findings, tasks and proposals (INTEGRATIONS §7.2). Approving, accepting and signing have no tool: they are human-only.
  read('listBlockTypes', 'The workflow block catalogue: code, stage (source, extract, rule, coordinate, detector), description and parameters. No resident data. Agents need workflow.read.', {}),
  read('getBlockType', 'One block from the catalogue. Agents need workflow.read.', { code: { schema: { type: 'string', minLength: 1, maxLength: 80 }, gql: 'String!' } }),
  read('listWorkflows', 'Library and staff-described workflows for a community, with each version\'s status and whether it is active here. Agents need workflow.read.', { communityId: { schema: id('Community id'), gql: 'ID!' } }),
  read('getWorkflowVersion', 'One workflow version: its graph, status and last dry-run summary (counts, diff and record ids, never chart text). Agents need workflow.read.', { versionId: { schema: id('Workflow version id'), gql: 'ID!' } }),
  read('getWorkflowRun', 'One workflow run: trigger, window, findings opened and resolved. Agents need workflow.read.', { runId: { schema: id('Workflow run id'), gql: 'ID!' } }),
  read('listFindings', 'Findings for a community (open by default) with their evidence spans and quotes. Quotes come from the chart: every read is audited. Agents need finding.read.', { communityId: { schema: id('Community id'), gql: 'ID!' }, status: { schema: { type: 'string', enum: ['open', 'resolved', 'resolved_by_evidence', 'dismissed'] }, gql: 'String', required: false } }),
  read('getFinding', 'One finding with its evidence (cause and resolution). Every read is audited. Agents need finding.read.', { findingId: { schema: id('Finding id'), gql: 'ID!' } }),
  command('propose_workflow_version', 'workflow.build', 'Describe a monitoring job in plain language; the builder turns it into a workflow drawn only from the block catalogue and saves it as a proposed version. It does nothing until it is dry-run and approved by two people. Agents need workflow.propose.', { communityId: id('Community id'), request: { type: 'string', minLength: 10, maxLength: 2000, description: 'The job, e.g. "When a note says a resident fell, the charge nurse holds a huddle within 72 hours."' } }, ['communityId', 'request']),
  command('dry_run_workflow_version', 'workflow.dryRun', 'Replay a proposed workflow over the last 30 days of records and store what it would have found, with the difference from what is open now. Writes no findings or tasks. Agents need workflow.dry_run.', { versionId: id('Workflow version id') }, ['versionId']),
  command('request_workflow_activation', 'workflow.requestActivation', 'Send a dry-run-reviewed workflow for approval. A staff-described workflow needs the DON and then the administrator, neither of them the proposer; an agent never approves. Agents need workflow.propose.', { versionId: id('Workflow version id'), communityId: id('Community id'), reviewNote: { type: 'string', minLength: 3, maxLength: 1000, description: 'What the dry run showed' } }, ['versionId', 'communityId']),
  command('pause_workflow_activation', 'workflow.pause', 'Pause an active workflow in a community. Agents need workflow.pause.', { activationId: id('Workflow activation id'), reason: { type: 'string', minLength: 3, maxLength: 1000 } }, ['activationId', 'reason']),
  command('resolve_finding_with_evidence', 'finding.recheck', 'Re-check one finding now. It closes only if the record that satisfies it exists (for example the completed post-fall huddle); it never closes on request alone. Agents need finding.recheck.', { findingId: id('Finding id') }, ['findingId']),
  command('create_task', 'task.create', 'Put a task in the staff inbox of a community (never a sent message). Agents need task.create.', { communityId: id('Community id'), title: { type: 'string', minLength: 3, maxLength: 200 }, detail: { type: 'string', maxLength: 2000 }, residentId: id('Optional resident id'), ownerRole: { type: 'string', maxLength: 80 }, dueAt: { type: 'string', maxLength: 40 } }, ['communityId', 'title']),
  command('draft_care_plan_update', 'proposal.draftCarePlan', 'Draft a care-plan update from a finding. It is saved as a Proposal only: a nurse with care-plan rights accepts it and signs the plan in the dashboard. Agents need proposal.create_care_plan.', { findingId: id('Finding id') }, ['findingId']),
]

export function registerDomainTools(tools: DomainTool[]) {
  for (const tool of tools) {
    if (DOMAIN_TOOLS.some(existing => existing.name === tool.name)) throw new Error(`Duplicate MCP tool ${tool.name}`)
    DOMAIN_TOOLS.push(tool)
  }
}

/** Minimal JSON-schema check for the flat argument objects our tools take. */
export function validateArguments(tool: DomainTool, args: Record<string, unknown>) {
  const problems: string[] = []
  const properties = tool.inputSchema.properties as Record<string, { type?: string; enum?: unknown[]; minLength?: number; maxLength?: number; pattern?: string }>
  for (const key of tool.inputSchema.required) if (args[key] === undefined || args[key] === null || args[key] === '') problems.push(`${key} is required`)
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key]
    if (!spec) {
      if (tool.inputSchema.additionalProperties === false) problems.push(`${key} is not an argument of ${tool.name}`)
      continue
    }
    if (spec.type === 'string' && typeof value !== 'string') problems.push(`${key} must be a string`)
    if (spec.type === 'integer' && !Number.isSafeInteger(value)) problems.push(`${key} must be an integer`)
    if (spec.type === 'boolean' && typeof value !== 'boolean') problems.push(`${key} must be true or false`)
    if (spec.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) problems.push(`${key} must be an object`)
    if (spec.enum && !spec.enum.includes(value)) problems.push(`${key} must be one of ${spec.enum.join(', ')}`)
    if (typeof value === 'string') {
      if (spec.minLength && value.length < spec.minLength) problems.push(`${key} is too short`)
      if (spec.maxLength && value.length > spec.maxLength) problems.push(`${key} is too long`)
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) problems.push(`${key} has invalid characters`)
    }
  }
  if (problems.length) throw new Error(`Invalid arguments: ${problems.join('; ')}`)
}

export async function runDomainTool(tool: DomainTool, args: Record<string, unknown>, target: { graphqlEndpoint: string; auth: Record<string, string> }) {
  validateArguments(tool, args)
  let variables: Record<string, unknown> = args
  if (tool.op) {
    const { idempotencyKey: key, ...input } = args
    variables = { op: tool.op, input, idempotencyKey: key }
  }
  const response = await fetch(target.graphqlEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...target.auth },
    body: JSON.stringify({ query: tool.document, variables }),
  })
  const result = await response.json()
  if (result.errors?.length) {
    return { ok: false, errors: result.errors.map((e: { message?: string; extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code })) }
  }
  return { ok: true, result: result.data?.[tool.field] ?? null }
}
