import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Tx } from '../db'
import { ROLE_NAMES } from '../clinical/common'

/**
 * The block catalogue (INTEGRATIONS §2). A workflow graph may only name blocks defined here, in an order the catalogue allows:
 *   source (reads records) → extract (reads facts a model already extracted from those records) → rule (turns events into
 *   candidate findings, or into resolutions when the evidence that closes them exists) → coordinate (who owns the follow-up).
 * Detector blocks are self-contained source+rule reads from Phase 2. Nothing here writes, sends or calls a model: extraction runs
 * before the engine's transaction (lib/workflows/extraction.ts) and stores ExtractedFact rows, which the extract blocks read. The engine
 * turns candidates into findings and inbox tasks.
 */

export type Evidence = { recordType: string; recordId: string; quote?: string; spanStart?: number | null; spanEnd?: number | null; role?: 'cause' | 'resolution' }

export type Candidate = {
  residentId: string
  /** Distinguishes findings of one workflow for one resident (for example the date, or the event). */
  key: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'urgent'
  evidence: Evidence[]
  ownerRole?: string
  /** The inbox task kind the finding creates (default `finding`). */
  taskKind?: string
  dueAt?: Date
}

/** A record a source block read, with a digest of its text so extraction is cached per version of the record. */
export type SourceRecord = { recordType: string; recordId: string; residentId: string; at: Date; text: string; digest: string }
/** Something that happened, found in a record. */
export type EventFact = { kind: string; residentId: string; at: Date; key: string; evidence: Evidence[] }
/** The evidence that a finding's condition was met (a completed huddle task, a signed assessment). */
export type Resolution = { residentId: string; key: string; note: string; evidence: Evidence[] }

export type Flow = { records: SourceRecord[]; events: EventFact[]; candidates: Candidate[]; resolutions: Resolution[]; pending: number }
export const emptyFlow = (): Flow => ({ records: [], events: [], candidates: [], resolutions: [], pending: 0 })

export type BlockContext = { tx: Tx; communityId: string; now: Date; params: Record<string, unknown>; workflowCode: string; residentId?: string | null }
type Stage = 'source' | 'extract' | 'rule' | 'coordinate' | 'detector'
export type Block = { code: string; label: string; stage: Stage; description: string; params: z.ZodType<Record<string, unknown>>; run: (ctx: BlockContext, flow: Flow) => Promise<Flow> }

const hours = (n: number) => n * 3_600_000
const day = (d: Date) => d.toISOString().slice(0, 10)
export const digestText = (text: string) => createHash('sha256').update(text).digest('hex')

/** Phase 2 detectors: one read that returns candidates directly. */
const detector = (code: string, label: string, description: string, params: z.ZodType<Record<string, unknown>>, find: (ctx: BlockContext) => Promise<Candidate[]>): Block => ({
  code, label, description, stage: 'detector', params,
  async run(ctx, flow) { return { ...flow, candidates: [...flow.candidates, ...(await find(ctx))] } },
})

const lowFluid = detector('low_fluid_intake', 'Low fluid intake over 24 hours', 'Residents who drank less than a threshold in the 24 hours before the run.', z.object({ thresholdMl: z.number().int().min(100).max(5000).default(1000) }), async ({ tx, communityId, now, params, residentId }) => {
  const threshold = Number(params.thresholdMl ?? 1000)
  const since = new Date(now.getTime() - hours(24))
  const residents = await tx.resident.findMany({ where: { communityId, status: 'current', ...(residentId ? { id: residentId } : {}) }, select: { id: true } })
  const out: Candidate[] = []
  // One query for the whole community, not one per resident.
  const intake = await tx.intakeRecord.findMany({ where: { residentId: { in: residents.map(r => r.id) }, kind: 'fluid', at: { gte: since, lte: now } }, select: { id: true, residentId: true, amountMl: true } })
  const byResident = new Map<string, typeof intake>()
  for (const row of intake) byResident.set(row.residentId!, [...(byResident.get(row.residentId!) ?? []), row])
  for (const r of residents) {
    const rows = byResident.get(r.id) ?? []
    // A resident with no fluid charting at all is a documentation gap, flagged the same way.
    const total = rows.reduce((sum, row) => sum + Number(row.amountMl ?? 0), 0)
    if (total < threshold) {
      out.push({ residentId: r.id, key: day(now), title: `Low fluid intake: ${total} mL in 24 hours`, detail: `Threshold ${threshold} mL. ${rows.length} entries charted.`, severity: total < threshold / 2 ? 'urgent' : 'warning', ownerRole: ROLE_NAMES.charge, evidence: rows.slice(0, 10).map(row => ({ recordType: 'IntakeRecord', recordId: row.id, quote: `${row.amountMl ?? 0} mL` })) })
    }
  }
  return out
})

const weightLoss = detector('weight_loss', 'Weight loss over 30 days', 'Weight down by a percentage over a number of days.', z.object({ percent: z.number().min(1).max(30).default(5), days: z.number().int().min(7).max(180).default(30) }), async ({ tx, communityId, now, params, residentId }) => {
  const pct = Number(params.percent ?? 5)
  const days = Number(params.days ?? 30)
  const since = new Date(now.getTime() - days * 86_400_000)
  const rows = await tx.vitalSign.findMany({ where: { communityId, kind: 'weight', takenAt: { gte: since, lte: now }, ...(residentId ? { residentId } : {}) }, orderBy: { takenAt: 'asc' }, select: { id: true, residentId: true, value: true, takenAt: true } })
  const by = new Map<string, typeof rows>()
  for (const row of rows) by.set(row.residentId!, [...(by.get(row.residentId!) ?? []), row])
  const out: Candidate[] = []
  for (const [rid, list] of by) {
    if (list.length < 2) continue
    const first = list[0]
    const last = list[list.length - 1]
    const loss = ((Number(first.value) - Number(last.value)) / Number(first.value)) * 100
    if (loss >= pct) out.push({ residentId: rid, key: day(last.takenAt!), title: `Weight down ${loss.toFixed(1)}% in ${days} days`, detail: `${first.value} kg to ${last.value} kg.`, severity: loss >= pct * 2 ? 'urgent' : 'warning', ownerRole: ROLE_NAMES.don, evidence: [{ recordType: 'VitalSign', recordId: first.id, quote: `${first.value} kg` }, { recordType: 'VitalSign', recordId: last.id, quote: `${last.value} kg` }] })
  }
  return out
})

const woundOverdue = detector('wound_assessment_overdue', 'Wound assessment overdue', 'Open wounds past their assessment interval.', z.object({}), async ({ tx, communityId, now, residentId }) => {
  const wounds = await tx.wound.findMany({ where: { communityId, status: 'open', createdAt: { lte: now }, ...(residentId ? { residentId } : {}) }, select: { id: true, residentId: true, site: true, lastAssessedAt: true, assessmentIntervalDays: true } })
  const out: Candidate[] = []
  for (const w of wounds) {
    const interval = (w.assessmentIntervalDays ?? 7) * 86_400_000
    const last = w.lastAssessedAt?.getTime() ?? 0
    if (now.getTime() - last > interval) out.push({ residentId: w.residentId!, key: `${w.id}:${day(new Date(last || 0))}`, title: `Wound assessment overdue: ${w.site}`, detail: w.lastAssessedAt ? `Last assessed ${day(w.lastAssessedAt)}.` : 'Never assessed.', severity: 'warning', ownerRole: ROLE_NAMES.charge, evidence: [{ recordType: 'Wound', recordId: w.id, quote: w.site }] })
  }
  return out
})

const missedDoses = detector('missed_doses', 'Repeated missed doses', 'A number of missed doses for one resident in 24 hours.', z.object({ count: z.number().int().min(2).max(20).default(2) }), async ({ tx, communityId, now, params, residentId }) => {
  const need = Number(params.count ?? 2)
  const slots = await tx.administrationSlot.findMany({ where: { communityId, status: 'missed', scheduledFor: { gte: new Date(now.getTime() - hours(24)), lte: now }, ...(residentId ? { residentId } : {}) }, select: { id: true, residentId: true, drugName: true } })
  const by = new Map<string, typeof slots>()
  for (const s of slots) by.set(s.residentId!, [...(by.get(s.residentId!) ?? []), s])
  return [...by].filter(([, list]) => list.length >= need).map(([rid, list]) => ({
    residentId: rid, key: day(now), title: `${list.length} missed doses in 24 hours`, detail: [...new Set(list.map(s => s.drugName))].join(', '), severity: 'urgent' as const, ownerRole: ROLE_NAMES.don,
    evidence: list.slice(0, 10).map(s => ({ recordType: 'AdministrationSlot', recordId: s.id, quote: s.drugName ?? undefined })),
  }))
})

/* ── Composable blocks (Phase 2 r1: incident analysis) ─────────────────────────────────────────────────────────── */

const progressNotes: Block = {
  code: 'source.progress_notes', stage: 'source', label: 'Progress notes', description: 'Signed progress notes whose event time falls in the last N days.',
  params: z.object({ days: z.number().int().min(1).max(30).default(7) }),
  async run({ tx, communityId, now, params, residentId }, flow) {
    const days = Number(params.days ?? 7)
    const notes = await tx.progressNote.findMany({
      where: { communityId, status: { in: ['signed', 'amended'] }, eventAt: { gte: new Date(now.getTime() - days * 86_400_000), lte: now }, signedAt: { lte: now }, ...(residentId ? { residentId } : {}) },
      orderBy: { eventAt: 'asc' }, take: 500, select: { id: true, residentId: true, eventAt: true, body: true },
    })
    return { ...flow, records: [...flow.records, ...notes.map(n => ({ recordType: 'ProgressNote', recordId: n.id, residentId: n.residentId!, at: n.eventAt!, text: n.body, digest: digestText(n.body) }))] }
  },
}

export const FALL_EXTRACTOR = 'extract.fall_from_note@1'
export const factCacheKey = (extractor: string, recordType: string, recordId: string, digest: string) => `${extractor}:${recordType}:${recordId}:${digest.slice(0, 32)}`
export const FallFacts = z.object({
  outcome: z.enum(['found', 'none', 'unclear']),
  events: z.array(z.object({ kind: z.literal('fall'), spanStart: z.number().int().min(0), spanEnd: z.number().int().min(1), quote: z.string().min(1).max(600), injury: z.enum(['none', 'minor', 'major', 'unknown']).default('unknown') })).max(5).default([]),
})
export type FallFacts = z.infer<typeof FallFacts>

const fallFromNote: Block = {
  code: 'extract.fall_from_note', stage: 'extract', label: 'Fall described in a note', description: 'Falls a model found in a note, each with the exact span of text it rests on. Reads stored extractions only.',
  params: z.object({}),
  async run({ tx }, flow) {
    const notes = flow.records.filter(r => r.recordType === 'ProgressNote')
    if (!notes.length) return flow
    const keys = notes.map(n => factCacheKey(FALL_EXTRACTOR, n.recordType, n.recordId, n.digest))
    const facts = new Map((await tx.extractedFact.findMany({ where: { cacheKey: { in: keys } }, select: { cacheKey: true, outcome: true, facts: true } })).map(f => [f.cacheKey, f]))
    const events: EventFact[] = []
    let pending = 0
    for (const note of notes) {
      const fact = facts.get(factCacheKey(FALL_EXTRACTOR, note.recordType, note.recordId, note.digest))
      if (!fact) { pending += 1; continue }
      if (fact.outcome !== 'found') continue
      const parsed = FallFacts.safeParse(fact.facts)
      if (!parsed.success) continue
      for (const e of parsed.data.events) {
        // The span must still say what the model quoted; otherwise the claim is not evidence.
        if (note.text.slice(e.spanStart, e.spanEnd) !== e.quote) continue
        events.push({ kind: 'fall', residentId: note.residentId, at: note.at, key: `fall:${note.recordId}:${e.spanStart}`, evidence: [{ recordType: 'ProgressNote', recordId: note.recordId, quote: e.quote, spanStart: e.spanStart, spanEnd: e.spanEnd, role: 'cause' }] })
      }
    }
    return { ...flow, events: [...flow.events, ...events], pending: flow.pending + pending }
  },
}

const TASK_FOR = { fall: 'post_fall_huddle' } as const
const deadlineAfterEvent: Block = {
  code: 'rule.deadline_after_event', stage: 'rule', label: 'Follow-up due after an event', description: 'Each event needs a follow-up task done within a number of hours; the completed task resolves the finding.',
  params: z.object({ eventKind: z.enum(['fall']).default('fall'), hours: z.number().int().min(1).max(336).default(72), taskKind: z.enum(['post_fall_huddle', 'neuro_checks', 'incident_follow_up']).default('post_fall_huddle') }),
  async run({ tx, workflowCode, now, params }, flow) {
    const kind = String(params.eventKind ?? 'fall') as keyof typeof TASK_FOR
    const within = Number(params.hours ?? 72)
    const taskKind = String(params.taskKind ?? TASK_FOR[kind])
    const events = flow.events.filter(e => e.kind === kind)
    const candidates: Candidate[] = []
    const resolutions: Resolution[] = []
    for (const e of events) {
      const due = new Date(e.at.getTime() + hours(within))
      const done = await tx.task.findFirst({ where: { dedupeKey: `finding:${workflowCode}:${e.residentId}:${e.key}`, kind: taskKind, status: 'done', completedAt: { lte: now } }, select: { id: true, completedAt: true } })
      if (done) {
        resolutions.push({ residentId: e.residentId, key: e.key, note: `${taskKind.replaceAll('_', ' ')} completed ${done.completedAt?.toISOString() ?? ''}`.trim(), evidence: [{ recordType: 'Task', recordId: done.id, quote: 'Follow-up task completed', role: 'resolution' }] })
        continue
      }
      const late = due.getTime() < now.getTime()
      candidates.push({ residentId: e.residentId, key: e.key, title: `Post-fall huddle due by ${due.toISOString().slice(0, 16).replace('T', ' ')} UTC`, detail: `A ${kind} is described in a note. A ${taskKind.replaceAll('_', ' ')} is due within ${within} hours of it${late ? ' and is late' : ''}.`, severity: late ? 'urgent' : 'warning', evidence: e.evidence, taskKind, dueAt: due })
    }
    return { ...flow, candidates: [...flow.candidates, ...candidates], resolutions: [...flow.resolutions, ...resolutions] }
  },
}

const ROLE_KEYS = ['charge', 'don', 'adon', 'director'] as const
const taskToOnShift: Block = {
  code: 'coordinate.task_to_on_shift', stage: 'coordinate', label: 'Give the task to the on-shift role', description: 'The follow-up goes to the role on shift on the unit (the charge nurse by default). Until the shift roster arrives, the role owns it.',
  params: z.object({ role: z.enum(ROLE_KEYS).default('charge') }),
  async run({ params }, flow) {
    const key = String(params.role ?? 'charge') as (typeof ROLE_KEYS)[number]
    const ownerRole = (ROLE_NAMES as Record<string, string>)[key] ?? ROLE_NAMES.charge
    return { ...flow, candidates: flow.candidates.map(c => ({ ...c, ownerRole })) }
  },
}

export const BLOCKS: Record<string, Block> = Object.fromEntries([lowFluid, weightLoss, woundOverdue, missedDoses, progressNotes, fallFromNote, deadlineAfterEvent, taskToOnShift].map(b => [b.code, b]))

/** The catalogue as an agent or the builder sees it: codes, stages, descriptions and parameter shapes. No data. */
export function catalogue() {
  return Object.values(BLOCKS).map(b => ({ code: b.code, stage: b.stage, label: b.label, description: b.description, params: describeParams(b.params) }))
}
function describeParams(schema: z.ZodTypeAny): Record<string, string> {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodTypeAny> }).shape ?? {}
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v._def?.innerType?._def?.typeName ?? v._def?.typeName ?? 'unknown']))
}

export const WorkflowGraph = z.object({ nodes: z.array(z.object({ block: z.string(), params: z.record(z.string(), z.unknown()).default({}) })).min(1).max(8) })
export type WorkflowGraph = z.infer<typeof WorkflowGraph>

const NEEDS: Partial<Record<Stage, keyof Pick<Flow, 'records' | 'events' | 'candidates'>>> = { extract: 'records', rule: 'events', coordinate: 'candidates' }
const GIVES: Record<Stage, keyof Pick<Flow, 'records' | 'events' | 'candidates'> | null> = { source: 'records', extract: 'events', rule: 'candidates', detector: 'candidates', coordinate: null }

/**
 * Validates a graph against the catalogue and fills defaults. Unknown blocks, bad parameters and a block that needs something no earlier
 * block produces are refused with a readable message. A graph must end with something that can open a finding.
 */
export function validateGraph(input: unknown): WorkflowGraph {
  const parsed = WorkflowGraph.safeParse(input)
  if (!parsed.success) throw new Error('A workflow is a list of 1 to 8 steps, each naming a block.')
  const have = new Set<string>()
  const nodes = parsed.data.nodes.map((node, index) => {
    const block = BLOCKS[node.block]
    if (!block) throw new Error(`Step ${index + 1}: "${node.block}" is not in the block catalogue.`)
    const params = block.params.safeParse(node.params)
    if (!params.success) throw new Error(`Step ${index + 1} (${block.code}): ${params.error.issues.map(i => `${i.path.join('.') || 'params'} ${i.message}`).join('; ')}`)
    const need = NEEDS[block.stage]
    if (need && !have.has(need)) throw new Error(`Step ${index + 1} (${block.code}) needs ${need} from an earlier step.`)
    const give = GIVES[block.stage]
    if (give) have.add(give)
    return { block: node.block, params: params.data }
  })
  if (!have.has('candidates')) throw new Error('The workflow never opens a finding: end it with a rule or a detector.')
  return { nodes }
}

/** Run a validated graph as a pure read. */
export async function runGraph(ctx: Omit<BlockContext, 'params'>, graph: WorkflowGraph): Promise<Flow> {
  let flow = emptyFlow()
  for (const node of graph.nodes) flow = await BLOCKS[node.block].run({ ...ctx, params: node.params }, flow)
  return flow
}

export const graphUses = (graph: unknown, block: string) => {
  const nodes = (graph as { nodes?: { block?: string }[] } | null)?.nodes
  return Array.isArray(nodes) && nodes.some(n => n?.block === block)
}

export const LIBRARY = [
  { code: 'low_fluid_intake', name: 'Low fluid intake', description: 'Residents who drank less than the daily threshold.', graph: { nodes: [{ block: 'low_fluid_intake', params: { thresholdMl: 1000 } }] }, policy: { thresholdMl: 1000 } },
  { code: 'weight_loss', name: 'Significant weight loss', description: 'Weight down 5% or more over 30 days.', graph: { nodes: [{ block: 'weight_loss', params: { percent: 5, days: 30 } }] }, policy: { percent: 5, days: 30 } },
  { code: 'wound_assessment_overdue', name: 'Wound assessment overdue', description: 'Open wounds past their assessment interval.', graph: { nodes: [{ block: 'wound_assessment_overdue', params: {} }] }, policy: {} },
  { code: 'missed_doses', name: 'Repeated missed doses', description: 'Two or more missed doses for one resident in 24 hours.', graph: { nodes: [{ block: 'missed_doses', params: { count: 2 } }] }, policy: { count: 2 } },
  {
    code: 'incident_analysis', name: 'Incident analysis', description: 'A fall described only in a progress note: the charge nurse on shift gets a post-fall huddle due within 72 hours.',
    graph: { nodes: [{ block: 'source.progress_notes', params: { days: 7 } }, { block: 'extract.fall_from_note', params: {} }, { block: 'rule.deadline_after_event', params: { eventKind: 'fall', hours: 72, taskKind: 'post_fall_huddle' } }, { block: 'coordinate.task_to_on_shift', params: { role: 'charge' } }] },
    policy: { hours: 72 },
  },
] as const
