import type { Db } from '../db'
import type { Actor } from '../actor'
import { infer } from '../inference/gateway'
import { FALL_EXTRACTOR, FallFacts, digestText, factCacheKey, graphUses } from './blocks'

/**
 * Extraction runs BEFORE the engine's transaction (UnitOfWork rule: no network I/O inside a transaction). For every note the active
 * (or given) graphs will read, it asks the gateway once per version of the note and stores the answer as an ExtractedFact keyed by
 * (extractor, note, digest of the text). The extract blocks then read only stored facts, so a run is a deterministic read and a second
 * run in the same window changes nothing. A refused or failed call stores nothing: the note is "pending" and the finding page says so.
 */

const MAX_PER_REQUEST = 25

const SYSTEM = [
  'You read one nursing progress note and report whether it describes the resident falling.',
  'A fall is an unplanned descent to the floor or a lower surface, including being found on the floor or being lowered to the floor.',
  'Do not count denials ("no falls"), risk statements or history older than the note.',
  'For each fall give spanStart and spanEnd as character offsets into the note and quote exactly the text between them.',
  'Return {"outcome":"found"|"none"|"unclear","events":[{"kind":"fall","spanStart":0,"spanEnd":0,"quote":"...","injury":"none"|"minor"|"major"|"unknown"}]}.',
].join('\n')

export type ExtractionResult = { considered: number; extracted: number; cached: number; refused: number; failed: number }

export async function extractForCommunity(db: Db, actor: Actor, input: { communityId: string; now?: Date; graphs?: unknown[]; days?: number; residentId?: string | null }): Promise<ExtractionResult> {
  const out: ExtractionResult = { considered: 0, extracted: 0, cached: 0, refused: 0, failed: 0 }
  const graphs = input.graphs ?? (await db.workflowActivation.findMany({ where: { communityId: input.communityId, status: 'active', workflowVersion: { status: 'active' } }, select: { workflowVersion: { select: { graph: true } } } })).map(a => a.workflowVersion?.graph)
  if (!graphs.some(g => graphUses(g, 'extract.fall_from_note'))) return out
  const now = input.now ?? new Date()
  const days = input.days ?? 7
  const community = await db.community.findUnique({ where: { id: input.communityId }, select: { synthetic: true } })
  const notes = await db.progressNote.findMany({
    where: { communityId: input.communityId, status: { in: ['signed', 'amended'] }, eventAt: { gte: new Date(now.getTime() - days * 86_400_000), lte: now }, ...(input.residentId ? { residentId: input.residentId } : {}) },
    orderBy: { eventAt: 'desc' }, take: 500, select: { id: true, residentId: true, body: true, resident: { select: { synthetic: true } } },
  })
  out.considered = notes.length
  const keyed = notes.map(n => ({ ...n, digest: digestText(n.body) })).map(n => ({ ...n, cacheKey: factCacheKey(FALL_EXTRACTOR, 'ProgressNote', n.id, n.digest) }))
  const have = new Set((await db.extractedFact.findMany({ where: { cacheKey: { in: keyed.map(n => n.cacheKey) } }, select: { cacheKey: true } })).map(f => f.cacheKey))
  out.cached = have.size
  for (const note of keyed.filter(n => !have.has(n.cacheKey)).slice(0, MAX_PER_REQUEST)) {
    const result = await infer(db, {
      purpose: 'extract', task: FALL_EXTRACTOR, system: SYSTEM, data: [{ label: 'note', text: note.body }], output: FallFacts, carriesPhi: true,
      dataCategories: ['clinical_notes'], context: { communityId: input.communityId, actor, synthetic: Boolean(community?.synthetic && note.resident?.synthetic) },
    })
    if (!result.ok) {
      if (result.outcome === 'refused_policy') out.refused += 1
      else out.failed += 1
      continue
    }
    // Spans that do not match the note are dropped here as well as in the block: a model's claim is evidence only where the text says it.
    const events = result.value.events.filter(e => note.body.slice(e.spanStart, e.spanEnd) === e.quote)
    const outcome = result.value.outcome === 'found' && !events.length ? 'unclear' : result.value.outcome
    await db.extractedFact.createMany({
      data: [{ communityId: input.communityId, residentId: note.residentId, extractor: FALL_EXTRACTOR, sourceType: 'ProgressNote', sourceId: note.id, sourceDigest: note.digest, cacheKey: note.cacheKey, outcome, facts: { outcome, events } as never, inferenceCallId: result.callId }],
      skipDuplicates: true,
    })
    out.extracted += 1
  }
  return out
}
