import { z } from 'zod'
import type { Tx } from '../db'

/**
 * The block catalogue. A workflow graph may only name blocks defined here; each block is a pure read over source rows that returns
 * candidate findings. Nothing here writes, sends or calls out: the engine turns candidates into findings and inbox tasks.
 */

export type Candidate = {
  residentId: string
  /** Distinguishes findings of one workflow for one resident (for example the date). */
  key: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'urgent'
  evidence: { recordType: string; recordId: string; quote?: string }[]
  ownerRole?: string
}

export type BlockContext = { tx: Tx; communityId: string; now: Date; params: Record<string, unknown> }
type Block = { code: string; label: string; params: z.ZodType<Record<string, unknown>>; run: (ctx: BlockContext) => Promise<Candidate[]> }

const hours = (n: number) => n * 3_600_000
const day = (d: Date) => d.toISOString().slice(0, 10)

const lowFluid: Block = {
  code: 'low_fluid_intake',
  label: 'Low fluid intake over 24 hours',
  params: z.object({ thresholdMl: z.number().int().min(100).max(5000).default(1000) }),
  async run({ tx, communityId, now, params }) {
    const threshold = Number(params.thresholdMl ?? 1000)
    const since = new Date(now.getTime() - hours(24))
    const residents = await tx.resident.findMany({ where: { communityId, status: 'current' }, select: { id: true, firstName: true } })
    const out: Candidate[] = []
    for (const r of residents) {
      const rows = await tx.intakeRecord.findMany({ where: { residentId: r.id, kind: 'fluid', at: { gte: since } }, select: { id: true, amountMl: true } })
      // A resident with no fluid charting at all is a documentation gap, flagged the same way.
      const total = rows.reduce((sum, row) => sum + Number(row.amountMl ?? 0), 0)
      if (total < threshold) {
        out.push({ residentId: r.id, key: day(now), title: `Low fluid intake: ${total} mL in 24 hours`, detail: `Threshold ${threshold} mL. ${rows.length} entries charted.`, severity: total < threshold / 2 ? 'urgent' : 'warning', ownerRole: 'Charge Nurse (RN/LPN)', evidence: rows.slice(0, 10).map(row => ({ recordType: 'IntakeRecord', recordId: row.id, quote: `${row.amountMl ?? 0} mL` })) })
      }
    }
    return out
  },
}

const weightLoss: Block = {
  code: 'weight_loss',
  label: 'Weight loss over 30 days',
  params: z.object({ percent: z.number().min(1).max(30).default(5), days: z.number().int().min(7).max(180).default(30) }),
  async run({ tx, communityId, now, params }) {
    const pct = Number(params.percent ?? 5)
    const days = Number(params.days ?? 30)
    const since = new Date(now.getTime() - days * 86_400_000)
    const rows = await tx.vitalSign.findMany({ where: { communityId, kind: 'weight', takenAt: { gte: since } }, orderBy: { takenAt: 'asc' }, select: { id: true, residentId: true, value: true, takenAt: true } })
    const by = new Map<string, typeof rows>()
    for (const row of rows) by.set(row.residentId!, [...(by.get(row.residentId!) ?? []), row])
    const out: Candidate[] = []
    for (const [residentId, list] of by) {
      if (list.length < 2) continue
      const first = list[0]
      const last = list[list.length - 1]
      const loss = ((Number(first.value) - Number(last.value)) / Number(first.value)) * 100
      if (loss >= pct) out.push({ residentId, key: day(last.takenAt!), title: `Weight down ${loss.toFixed(1)}% in ${days} days`, detail: `${first.value} kg to ${last.value} kg.`, severity: loss >= pct * 2 ? 'urgent' : 'warning', ownerRole: 'Director of Nursing', evidence: [{ recordType: 'VitalSign', recordId: first.id, quote: `${first.value} kg` }, { recordType: 'VitalSign', recordId: last.id, quote: `${last.value} kg` }] })
    }
    return out
  },
}

const woundOverdue: Block = {
  code: 'wound_assessment_overdue',
  label: 'Wound assessment overdue',
  params: z.object({}),
  async run({ tx, communityId, now }) {
    const wounds = await tx.wound.findMany({ where: { communityId, status: 'open' }, select: { id: true, residentId: true, site: true, lastAssessedAt: true, assessmentIntervalDays: true } })
    const out: Candidate[] = []
    for (const w of wounds) {
      const interval = (w.assessmentIntervalDays ?? 7) * 86_400_000
      const last = w.lastAssessedAt?.getTime() ?? 0
      if (now.getTime() - last > interval) out.push({ residentId: w.residentId!, key: `${w.id}:${day(new Date(last || 0))}`, title: `Wound assessment overdue: ${w.site}`, detail: w.lastAssessedAt ? `Last assessed ${day(w.lastAssessedAt)}.` : 'Never assessed.', severity: 'warning', ownerRole: 'Charge Nurse (RN/LPN)', evidence: [{ recordType: 'Wound', recordId: w.id, quote: w.site }] })
    }
    return out
  },
}

const missedDoses: Block = {
  code: 'missed_doses',
  label: 'Repeated missed doses',
  params: z.object({ count: z.number().int().min(2).max(20).default(2) }),
  async run({ tx, communityId, now, params }) {
    const need = Number(params.count ?? 2)
    const slots = await tx.administrationSlot.findMany({ where: { communityId, status: 'missed', scheduledFor: { gte: new Date(now.getTime() - hours(24)) } }, select: { id: true, residentId: true, drugName: true } })
    const by = new Map<string, typeof slots>()
    for (const s of slots) by.set(s.residentId!, [...(by.get(s.residentId!) ?? []), s])
    return [...by].filter(([, list]) => list.length >= need).map(([residentId, list]) => ({
      residentId, key: day(now), title: `${list.length} missed doses in 24 hours`, detail: [...new Set(list.map(s => s.drugName))].join(', '), severity: 'urgent' as const, ownerRole: 'Director of Nursing',
      evidence: list.slice(0, 10).map(s => ({ recordType: 'AdministrationSlot', recordId: s.id, quote: s.drugName ?? undefined })),
    }))
  },
}

export const BLOCKS: Record<string, Block> = Object.fromEntries([lowFluid, weightLoss, woundOverdue, missedDoses].map(b => [b.code, b]))

export const WorkflowGraph = z.object({ nodes: z.array(z.object({ block: z.string(), params: z.record(z.string(), z.unknown()).default({}) })).min(1).max(8) })
export type WorkflowGraph = z.infer<typeof WorkflowGraph>

/** Validates a graph against the catalogue and fills defaults. Throws a readable error for an unknown block or a bad parameter. */
export function validateGraph(input: unknown): WorkflowGraph {
  const graph = WorkflowGraph.parse(input)
  return { nodes: graph.nodes.map(node => {
    const block = BLOCKS[node.block]
    if (!block) throw new Error(`Unknown block "${node.block}".`)
    return { block: node.block, params: block.params.parse(node.params) }
  }) }
}

export const LIBRARY = [
  { code: 'low_fluid_intake', name: 'Low fluid intake', description: 'Residents who drank less than the daily threshold.', graph: { nodes: [{ block: 'low_fluid_intake', params: { thresholdMl: 1000 } }] }, policy: { thresholdMl: 1000 } },
  { code: 'weight_loss', name: 'Significant weight loss', description: 'Weight down 5% or more over 30 days.', graph: { nodes: [{ block: 'weight_loss', params: { percent: 5, days: 30 } }] }, policy: { percent: 5, days: 30 } },
  { code: 'wound_assessment_overdue', name: 'Wound assessment overdue', description: 'Open wounds past their assessment interval.', graph: { nodes: [{ block: 'wound_assessment_overdue', params: {} }] }, policy: {} },
  { code: 'missed_doses', name: 'Repeated missed doses', description: 'Two or more missed doses for one resident in 24 hours.', graph: { nodes: [{ block: 'missed_doses', params: { count: 2 } }] }, policy: { count: 2 } },
] as const
