import { z } from 'zod'
import { auditCreate } from '../cas'
import type { Actor } from '../actor'
import type { UnitOfWork } from '../unitOfWork'
import { Codes, DomainError } from '../errors'
import { invalid, residentFor, userOf, notFound } from './common'

/* Assessment template engine: a Zod meta-schema validates every template; a scorer registry turns answers into a score and band. */

export const TemplateDefinition = z.object({
  items: z.array(z.object({
    key: z.string().min(1),
    prompt: z.string().min(1),
    options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1), points: z.number().int() })).min(2),
  })).min(1),
  bands: z.array(z.object({ min: z.number().int(), label: z.string().min(1) })).min(1),
  /** 'higher_worse' scores read as risk (Braden is the reverse), kept for display only. */
  direction: z.enum(['higher_worse', 'higher_better']),
})
export type TemplateDefinition = z.infer<typeof TemplateDefinition>

type Scored = { score: number; band: string }
/** Scorer registry. 'sum' adds the points of the chosen options; bands are the highest `min` not above the score. */
export const SCORERS: Record<string, (def: TemplateDefinition, answers: Record<string, string>) => Scored> = {
  sum(def, answers) {
    let score = 0
    for (const item of def.items) {
      const chosen = item.options.find(o => o.value === answers[item.key])
      if (!chosen) throw new DomainError(Codes.INVALID_INPUT, `Answer "${item.prompt}".`, { field: item.key })
      score += chosen.points
    }
    const band = [...def.bands].sort((a, b) => b.min - a.min).find(b => score >= b.min) ?? def.bands[0]
    return { score, band: band.label }
  },
}

const opts = (...pairs: [string, string, number][]) => pairs.map(([value, label, points]) => ({ value, label, points }))
const scale = (n: number, labels: string[]) => opts(...labels.map((l, i) => [String(i + 1), l, 0] as [string, string, number])).slice(0, n)

/** Braden: points are the published 1-4 scale per item (item 6 has 1-3). Bands 19+ no risk, 15-18 mild, 13-14 moderate, 10-12 high, ≤9 very high. */
const braden: TemplateDefinition = {
  direction: 'higher_better',
  items: [
    { key: 'sensory', prompt: 'Sensory perception', options: opts(['1', 'Completely limited', 1], ['2', 'Very limited', 2], ['3', 'Slightly limited', 3], ['4', 'No impairment', 4]) },
    { key: 'moisture', prompt: 'Moisture', options: opts(['1', 'Constantly moist', 1], ['2', 'Very moist', 2], ['3', 'Occasionally moist', 3], ['4', 'Rarely moist', 4]) },
    { key: 'activity', prompt: 'Activity', options: opts(['1', 'Bedfast', 1], ['2', 'Chairfast', 2], ['3', 'Walks occasionally', 3], ['4', 'Walks frequently', 4]) },
    { key: 'mobility', prompt: 'Mobility', options: opts(['1', 'Completely immobile', 1], ['2', 'Very limited', 2], ['3', 'Slightly limited', 3], ['4', 'No limitation', 4]) },
    { key: 'nutrition', prompt: 'Nutrition', options: opts(['1', 'Very poor', 1], ['2', 'Probably inadequate', 2], ['3', 'Adequate', 3], ['4', 'Excellent', 4]) },
    { key: 'friction', prompt: 'Friction and shear', options: opts(['1', 'Problem', 1], ['2', 'Potential problem', 2], ['3', 'No apparent problem', 3]) },
  ],
  bands: [{ min: 0, label: 'Very high risk' }, { min: 10, label: 'High risk' }, { min: 13, label: 'Moderate risk' }, { min: 15, label: 'Mild risk' }, { min: 19, label: 'No risk' }],
}

/** Morse Fall Scale: history 0/25, secondary diagnosis 0/15, aid 0/15/30, IV 0/20, gait 0/10/20, mental status 0/15. Bands 0-24 low, 25-44 moderate, 45+ high (facility cut-offs vary; verify). */
const morse: TemplateDefinition = {
  direction: 'higher_worse',
  items: [
    { key: 'history', prompt: 'History of falling (in the last 3 months)', options: opts(['no', 'No', 0], ['yes', 'Yes', 25]) },
    { key: 'secondary', prompt: 'Secondary diagnosis', options: opts(['no', 'No', 0], ['yes', 'Yes', 15]) },
    { key: 'aid', prompt: 'Ambulatory aid', options: opts(['none', 'None, bed rest, nurse assist', 0], ['crutches', 'Crutches, cane, walker', 15], ['furniture', 'Furniture', 30]) },
    { key: 'iv', prompt: 'IV or heparin lock', options: opts(['no', 'No', 0], ['yes', 'Yes', 20]) },
    { key: 'gait', prompt: 'Gait', options: opts(['normal', 'Normal, bed rest, wheelchair', 0], ['weak', 'Weak', 10], ['impaired', 'Impaired', 20]) },
    { key: 'mental', prompt: 'Mental status', options: opts(['oriented', 'Oriented to own ability', 0], ['forgets', 'Forgets limitations', 15]) },
  ],
  bands: [{ min: 0, label: 'Low risk' }, { min: 25, label: 'Moderate risk' }, { min: 45, label: 'High risk' }],
}

/** BIMS (MDS C0500): repetition 0-3, year 0-3, month 0-2, day 0-1, recall 0-6 (sum 0-15). 13-15 intact, 8-12 moderately impaired, 0-7 severely impaired. */
const bims: TemplateDefinition = {
  direction: 'higher_better',
  items: [
    { key: 'repetition', prompt: 'Repetition of three words', options: opts(['0', 'None', 0], ['1', 'One', 1], ['2', 'Two', 2], ['3', 'Three', 3]) },
    { key: 'year', prompt: 'Year', options: opts(['0', 'Missed by >5 years or no answer', 0], ['1', 'Missed by 2-5 years', 1], ['2', 'Missed by 1 year', 2], ['3', 'Correct', 3]) },
    { key: 'month', prompt: 'Month', options: opts(['0', 'Missed by >1 month or no answer', 0], ['1', 'Missed by 6 days to 1 month', 1], ['2', 'Accurate within 5 days', 2]) },
    { key: 'day', prompt: 'Day of the week', options: opts(['0', 'Incorrect or no answer', 0], ['1', 'Correct', 1]) },
    { key: 'recall_sock', prompt: 'Recall: sock', options: opts(['0', 'No, could not recall', 0], ['1', 'Yes, after cueing', 1], ['2', 'Yes, no cue required', 2]) },
    { key: 'recall_blue', prompt: 'Recall: blue', options: opts(['0', 'No, could not recall', 0], ['1', 'Yes, after cueing', 1], ['2', 'Yes, no cue required', 2]) },
    { key: 'recall_bed', prompt: 'Recall: bed', options: opts(['0', 'No, could not recall', 0], ['1', 'Yes, after cueing', 1], ['2', 'Yes, no cue required', 2]) },
  ],
  bands: [{ min: 0, label: 'Severe impairment' }, { min: 8, label: 'Moderate impairment' }, { min: 13, label: 'Cognitively intact' }],
}

const phqItems = ['Little interest or pleasure', 'Feeling down, depressed or hopeless', 'Trouble sleeping or sleeping too much', 'Feeling tired or little energy', 'Poor appetite or overeating', 'Feeling bad about yourself', 'Trouble concentrating', 'Moving or speaking slowly, or restless', 'Thoughts of being better off dead or of self-harm']
/** PHI-9 style PHQ-9: each item 0-3; bands 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe. Any answer above 0 on item 9 needs same-day clinical review (a task is created). */
const phq9: TemplateDefinition = {
  direction: 'higher_worse',
  items: phqItems.map((prompt, i) => ({ key: `q${i + 1}`, prompt, options: opts(['0', 'Not at all', 0], ['1', 'Several days', 1], ['2', 'More than half the days', 2], ['3', 'Nearly every day', 3]) })),
  bands: [{ min: 0, label: 'Minimal' }, { min: 5, label: 'Mild' }, { min: 10, label: 'Moderate' }, { min: 15, label: 'Moderately severe' }, { min: 20, label: 'Severe' }],
}

/** PAINAD: five items scored 0-2, total 0-10. */
const painad: TemplateDefinition = {
  direction: 'higher_worse',
  items: [
    { key: 'breathing', prompt: 'Breathing', options: opts(['0', 'Normal', 0], ['1', 'Occasional laboured breathing', 1], ['2', 'Noisy, long hyperventilation, Cheyne-Stokes', 2]) },
    { key: 'vocalisation', prompt: 'Negative vocalisation', options: opts(['0', 'None', 0], ['1', 'Occasional moan or groan', 1], ['2', 'Repeated calling out, crying', 2]) },
    { key: 'face', prompt: 'Facial expression', options: opts(['0', 'Smiling or inexpressive', 0], ['1', 'Sad, frightened, frown', 1], ['2', 'Facial grimacing', 2]) },
    { key: 'body', prompt: 'Body language', options: opts(['0', 'Relaxed', 0], ['1', 'Tense, fidgeting', 1], ['2', 'Rigid, fists clenched, striking out', 2]) },
    { key: 'consolability', prompt: 'Consolability', options: opts(['0', 'No need to console', 0], ['1', 'Distracted or reassured by voice or touch', 1], ['2', 'Unable to console', 2]) },
  ],
  bands: [{ min: 0, label: 'No pain' }, { min: 1, label: 'Mild pain' }, { min: 4, label: 'Moderate pain' }, { min: 7, label: 'Severe pain' }],
}

/** Elopement risk: facility screen. Item weights and the "high" cut-off are the operator's policy, not a regulation (verify with the clinical lead). */
const elopement: TemplateDefinition = {
  direction: 'higher_worse',
  items: [
    { key: 'history', prompt: 'History of elopement or exit-seeking', options: opts(['no', 'No', 0], ['yes', 'Yes', 3]) },
    { key: 'cognition', prompt: 'Cognitive impairment', options: opts(['none', 'None', 0], ['mild', 'Mild', 1], ['moderate', 'Moderate or severe', 2]) },
    { key: 'wandering', prompt: 'Wanders or paces', options: opts(['no', 'No', 0], ['yes', 'Yes', 2]) },
    { key: 'statements', prompt: 'Says they want to leave or go home', options: opts(['no', 'No', 0], ['yes', 'Yes', 2]) },
    { key: 'mobility', prompt: 'Can walk or self-propel a wheelchair', options: opts(['no', 'No', 0], ['yes', 'Yes', 1]) },
  ],
  bands: [{ min: 0, label: 'Low risk' }, { min: 4, label: 'Moderate risk' }, { min: 7, label: 'High risk' }],
}

/** Ohio assisted-living resident assessment and care-level points. The OAC 3701-16/3701-17 forms are not reproduced: this is a generic ADL/IADL points sheet. OPEN ITEM (verify): replace the items with the ODH-prescribed assessment before use. */
const ohioAl: TemplateDefinition = {
  direction: 'higher_worse',
  items: ['Bathing', 'Dressing', 'Toileting', 'Transfers', 'Eating', 'Medication management', 'Cognition and orientation', 'Behaviours'].map((prompt, i) => ({
    key: `al${i + 1}`, prompt, options: opts(['0', 'Independent', 0], ['1', 'Needs cueing or standby help', 1], ['2', 'Needs hands-on help', 2], ['3', 'Total help', 3]),
  })),
  bands: [{ min: 0, label: 'Care level 1 (minimal)' }, { min: 5, label: 'Care level 2' }, { min: 11, label: 'Care level 3' }, { min: 18, label: 'Care level 4' }],
}

export const TEMPLATE_SEEDS = [
  { code: 'braden', name: 'Braden scale (pressure injury risk)', definition: braden, sourceNote: 'Braden & Bergstrom 1987.', verifyNote: '' },
  { code: 'morse', name: 'Morse Fall Scale', definition: morse, sourceNote: 'Morse 1989.', verifyNote: 'Risk cut-offs are facility policy (verify).' },
  { code: 'bims', name: 'BIMS (cognition)', definition: bims, sourceNote: 'MDS 3.0 C0500.', verifyNote: '' },
  { code: 'phq9', name: 'PHQ-9 (depression)', definition: phq9, sourceNote: 'Kroenke 2001.', verifyNote: '' },
  { code: 'painad', name: 'PAINAD (pain in dementia)', definition: painad, sourceNote: 'Warden 2003.', verifyNote: '' },
  { code: 'elopement', name: 'Elopement risk', definition: elopement, sourceNote: 'Operator screen.', verifyNote: 'Weights and cut-offs are operator policy (verify).' },
  { code: 'oh_al_resident', name: 'Ohio assisted-living resident assessment', definition: ohioAl, sourceNote: 'Generic ADL points sheet.', verifyNote: 'Verify against the OAC 3701-16/3701-17 prescribed form.' },
] as const

export async function seedAssessmentTemplates(uow: UnitOfWork, actor: Actor) {
  let created = 0
  for (const seed of TEMPLATE_SEEDS) {
    TemplateDefinition.parse(seed.definition)
    if (await uow.tx.assessmentTemplate.findFirst({ where: { code: seed.code } })) continue
    const row = await uow.tx.assessmentTemplate.create({ data: { code: seed.code, name: seed.name, templateVersion: 1, scorer: 'sum', definition: seed.definition as never, sourceNote: seed.sourceNote, verifyNote: seed.verifyNote, status: 'active' } })
    auditCreate(uow, actor, 'AssessmentTemplate', row.id, 'assessment_template.loaded', { code: seed.code })
    created += 1
  }
  return { created }
}

export async function completeAssessment(uow: UnitOfWork, actor: Actor, input: { residentId: string; templateCode: string; answers: Record<string, string> }) {
  const resident = await residentFor(uow.tx, input.residentId)
  const template = await uow.tx.assessmentTemplate.findFirst({ where: { code: input.templateCode, status: 'active' }, orderBy: { templateVersion: 'desc' } })
  if (!template) return notFound('Assessment template')
  const parsed = TemplateDefinition.safeParse(template.definition)
  if (!parsed.success) return invalid('This template is malformed.')
  if (!input.answers || typeof input.answers !== 'object') return invalid('Answer every question.', 'answers')
  const scorer = SCORERS[template.scorer]
  if (!scorer) return invalid('This template has no scorer.')
  const { score, band } = scorer(parsed.data, input.answers)
  const row = await uow.tx.assessment.create({
    data: { residentId: resident.id, communityId: resident.communityId, templateId: template.id, templateCode: template.code, templateVersion: template.templateVersion, answers: input.answers as never, score, band, status: 'completed', completedAt: uow.now, completedById: userOf(actor) },
  })
  auditCreate(uow, actor, 'Assessment', row.id, 'assessment.completed', { template: template.code, score, band, residentId: resident.id })
  // Projections the face sheet shows: fall risk and elopement risk.
  if (template.code === 'morse') await uow.tx.resident.update({ where: { id: resident.id }, data: { fallRisk: band } })
  if (template.code === 'elopement') await uow.tx.resident.update({ where: { id: resident.id }, data: { elopementRisk: band } })
  const { createTask, ROLE_NAMES } = await import('./common')
  if (template.code === 'phq9' && input.answers.q9 && input.answers.q9 !== '0') {
    await createTask(uow, actor, { communityId: resident.communityId, residentId: resident.id, kind: 'escalation', title: 'PHQ-9 item 9 answered: same-day clinical review', ownerRole: ROLE_NAMES.charge, escalationOwnerRole: ROLE_NAMES.don, dueAt: new Date(uow.now.getTime() + 4 * 3_600_000), dedupeKey: `phq9-item9:${row.id}`, subjectType: 'Assessment', subjectId: row.id })
  }
  return { assessmentId: row.id, score, band }
}
