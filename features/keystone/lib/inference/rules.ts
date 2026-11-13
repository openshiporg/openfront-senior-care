/**
 * The built-in rules engine (adapter `builtin_rules`): deterministic readers that run inside this server, with no model and no network
 * call, so no data ever leaves the operator. Each is a pure function of the delimited data and answers in the same shape the model
 * prompt asks for: exact spans, catalogue-only graphs, short care-plan items. An operator can register a self-hosted or BAA model
 * instead and make it the default.
 */
type Data = { label: string; text: string }[]
const get = (data: Data, label: string) => data.find(d => d.label === label)?.text ?? ''

const FALL = /\b(fell|had a fall|was found on the floor|found (?:her|him|them|the resident)? ?(?:sitting |lying )?on the floor|slid (?:out of|off|from) [^.]{1,40} (?:to|onto) the floor|lowered (?:her|him|them)? ?to the floor)\b/i
const NEGATED = /\b(no|denies|without|free of)\s+(?:a\s+)?(?:recent\s+)?falls?\b/i

/** Sentences that describe a fall, with their exact character span in the note. */
export function fallSpans(text: string) {
  const events: { kind: 'fall'; spanStart: number; spanEnd: number; quote: string; injury: 'none' | 'minor' | 'major' | 'unknown' }[] = []
  const sentence = /[^.!?\n]+[.!?]?/g
  for (let m = sentence.exec(text); m; m = sentence.exec(text)) {
    const raw = m[0]
    const lead = raw.length - raw.trimStart().length
    const quote = raw.trim()
    if (!quote || !FALL.test(quote) || NEGATED.test(quote)) continue
    const injury = /\bno (?:visible )?injur/i.test(text) ? 'none' : /\b(fracture|laceration|head strike|hit (?:her|his|their) head)\b/i.test(text) ? 'major' : /\b(bruise|skin tear|abrasion)\b/i.test(text) ? 'minor' : 'unknown'
    events.push({ kind: 'fall', spanStart: m.index + lead, spanEnd: m.index + lead + quote.length, quote, injury })
    if (events.length >= 5) break
  }
  return events
}

const num = (text: string, re: RegExp, fallback: number) => {
  const m = re.exec(text)
  return m ? Number(m[1]) : fallback
}

/** A staff description to a graph, using only catalogue blocks. Anything it cannot place becomes an unknown block, which validation refuses. */
function buildWorkflow(request: string) {
  const r = request.toLowerCase()
  if (/\bfall/.test(r)) {
    const hours = num(r, /(\d{1,3})\s*(?:hours?|hrs?|h)\b/, /\bday\b/.test(r) ? 24 : 72)
    const role = /\bdon\b|director of nursing/.test(r) ? 'don' : /\badon\b/.test(r) ? 'adon' : 'charge'
    return { name: `Post-fall huddle within ${hours} hours`, description: `When a note describes a fall, the ${role === 'charge' ? 'charge nurse on shift' : role.toUpperCase()} gets a post-fall huddle due within ${hours} hours.`, graph: { nodes: [{ block: 'source.progress_notes', params: { days: 7 } }, { block: 'extract.fall_from_note', params: {} }, { block: 'rule.deadline_after_event', params: { eventKind: 'fall', hours, taskKind: 'post_fall_huddle' } }, { block: 'coordinate.task_to_on_shift', params: { role } }] } }
  }
  if (/\b(fluid|drink|hydrat)/.test(r)) {
    const ml = num(r, /(\d{3,4})\s*(?:ml|millilit)/, 1000)
    return { name: `Fluid intake under ${ml} mL`, description: `Residents who drank less than ${ml} mL in 24 hours.`, graph: { nodes: [{ block: 'low_fluid_intake', params: { thresholdMl: ml } }, { block: 'coordinate.task_to_on_shift', params: { role: 'charge' } }] } }
  }
  if (/\bweight/.test(r)) {
    const percent = num(r, /(\d{1,2}(?:\.\d)?)\s*(?:%|percent)/, 5)
    const days = num(r, /(\d{1,3})\s*days?/, 30)
    return { name: `Weight down ${percent}% in ${days} days`, description: `Weight loss of ${percent}% or more over ${days} days.`, graph: { nodes: [{ block: 'weight_loss', params: { percent, days } }] } }
  }
  if (/\bwound/.test(r)) return { name: 'Wound assessment overdue', description: 'Open wounds past their assessment interval.', graph: { nodes: [{ block: 'wound_assessment_overdue', params: {} }] } }
  if (/\bmissed (?:dose|med)/.test(r)) return { name: 'Repeated missed doses', description: 'Missed doses for one resident in 24 hours.', graph: { nodes: [{ block: 'missed_doses', params: { count: num(r, /(\d{1,2})\s*(?:or more )?missed/, 2) } }] } }
  return { name: 'Unplaced request', description: 'The request did not match a block in the catalogue.', graph: { nodes: [{ block: 'freeform.unknown', params: {} }] } }
}

function draftCarePlan(data: Data) {
  const finding = get(data, 'finding')
  const evidence = get(data, 'evidence')
  if (/\bfall/i.test(`${finding} ${evidence}`)) {
    return {
      summary: 'After the fall described in the note, add a post-fall focus with closer supervision and a medication review.',
      items: [
        { kind: 'focus', text: 'Fall with risk of further falls (fall described in a progress note)' },
        { kind: 'goal', text: 'No further falls over the next 30 days', parentIndex: 0 },
        { kind: 'intervention', text: 'Hourly rounding with toileting offered on night shift', frequency: 'every_shift', parentIndex: 0 },
        { kind: 'intervention', text: 'Pharmacist review of sedating medications within 7 days', frequency: 'once', parentIndex: 0 },
      ],
    }
  }
  return { summary: 'Review the finding with the resident and family and update the plan.', items: [{ kind: 'intervention', text: `Review: ${finding.slice(0, 120) || 'workflow finding'}`, frequency: 'once' }] }
}

export const BUILTIN_RULES: Record<string, (data: Data) => unknown> = {
  'extract.fall_from_note@1': data => {
    const events = fallSpans(get(data, 'note'))
    return { outcome: events.length ? 'found' : 'none', events }
  },
  'workflow.build@1': data => buildWorkflow(get(data, 'request')),
  'draft.care_plan_update@1': data => draftCarePlan(data),
}
