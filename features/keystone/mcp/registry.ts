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
}

const idempotencyKey = { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9._:-]+$', description: 'Unique per intent. Reusing it returns the first result instead of acting twice.' }

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
  const response = await fetch(target.graphqlEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...target.auth },
    body: JSON.stringify({ query: tool.document, variables: args }),
  })
  const result = await response.json()
  if (result.errors?.length) {
    return { ok: false, errors: result.errors.map((e: { message?: string; extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code })) }
  }
  return { ok: true, result: result.data?.[tool.field] ?? null }
}
