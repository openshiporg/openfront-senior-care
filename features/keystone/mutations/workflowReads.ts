import { requirePermission, requireScope } from '../lib/actor'
import { DomainError, Codes } from '../lib/errors'
import { catalogue, BLOCKS } from '../lib/workflows/blocks'
import { actorFor } from './actorFor'
import { assertCommunityAccess } from './run'
import { auditRead } from './reads'

/**
 * Workflow and finding reads for the MCP allow-list (INTEGRATIONS §7.2). People need canReadFindings or canManageWorkflows; agents need
 * workflow.read or finding.read. Findings and their evidence quote the chart, so every finding read writes a PhiReadAudit row first
 * (fail closed). Block types and graphs are catalogue metadata and carry no resident data.
 */

type Ctx = { session: any; prisma: any }

async function who(context: Ctx, scope: 'workflow.read' | 'finding.read') {
  const actor = await actorFor(context)
  if (actor.kind === 'agent') requireScope(actor, scope)
  else requirePermission(actor, 'canReadFindings', 'canManageWorkflows')
  return actor
}

export async function listBlockTypes(_root: unknown, _args: unknown, context: Ctx) {
  await who(context, 'workflow.read')
  return catalogue()
}

export async function getBlockType(_root: unknown, args: { code: string }, context: Ctx) {
  await who(context, 'workflow.read')
  const block = catalogue().find(b => b.code === args.code)
  if (!block || !BLOCKS[args.code]) throw new DomainError(Codes.NOT_FOUND, 'No such block.')
  return block
}

export async function listWorkflows(_root: unknown, args: { communityId: string }, context: Ctx) {
  const actor = await who(context, 'workflow.read')
  await assertCommunityAccess(context.prisma, actor, args.communityId)
  const defs = await context.prisma.workflowDefinition.findMany({
    where: { OR: [{ communityId: null }, { communityId: args.communityId }], status: 'active' }, orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, origin: true, versions: { orderBy: { versionNumber: 'desc' }, select: { id: true, versionNumber: true, status: true, dryRunAt: true, activations: { where: { communityId: args.communityId }, select: { id: true, status: true } } } } },
  })
  return defs
}

export async function getWorkflowVersion(_root: unknown, args: { versionId: string }, context: Ctx) {
  const actor = await who(context, 'workflow.read')
  const v = await context.prisma.workflowVersion.findUnique({ where: { id: args.versionId }, select: { id: true, communityId: true, versionNumber: true, status: true, graph: true, graphHash: true, description: true, dryRun: true, dryRunAt: true, reviewNote: true, definition: { select: { code: true, name: true, origin: true, communityId: true } } } })
  if (!v) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (v.communityId) await assertCommunityAccess(context.prisma, actor, v.communityId)
  return v
}

export async function getWorkflowRun(_root: unknown, args: { runId: string }, context: Ctx) {
  const actor = await who(context, 'workflow.read')
  const r = await context.prisma.workflowRun.findUnique({ where: { id: args.runId }, select: { id: true, communityId: true, windowKey: true, trigger: true, status: true, startedAt: true, finishedAt: true, findingsOpened: true, findingsResolved: true, summary: true, workflowVersionId: true } })
  if (!r) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  await assertCommunityAccess(context.prisma, actor, r.communityId)
  return r
}

const FINDING = { id: true, communityId: true, residentId: true, workflowCode: true, title: true, detail: true, severity: true, status: true, createdAt: true, resolvedAt: true, resolutionNote: true, taskId: true, proposalId: true, evidence: { select: { recordType: true, recordId: true, role: true, spanStart: true, spanEnd: true, quote: true } } }

export async function listFindings(_root: unknown, args: { communityId: string; status?: string | null }, context: Ctx) {
  const actor = await who(context, 'finding.read')
  await assertCommunityAccess(context.prisma, actor, args.communityId)
  const rows = await context.prisma.finding.findMany({ where: { communityId: args.communityId, status: args.status ?? 'open' }, orderBy: { createdAt: 'desc' }, take: 100, select: FINDING })
  await auditRead(context, actor, 'listFindings', [...new Set<string>(rows.map((r: { residentId: string | null }) => r.residentId).filter(Boolean))])
  return rows
}

export async function getFinding(_root: unknown, args: { findingId: string }, context: Ctx) {
  const actor = await who(context, 'finding.read')
  const f = await context.prisma.finding.findUnique({ where: { id: args.findingId }, select: FINDING })
  if (!f) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  await assertCommunityAccess(context.prisma, actor, f.communityId)
  if (f.residentId) await auditRead(context, actor, 'getFinding', [f.residentId])
  return f
}
