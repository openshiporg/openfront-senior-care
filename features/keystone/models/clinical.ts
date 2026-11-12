import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import type { Permission } from '../access'
import { scopedGoverned } from './scope'
import { choice, fixedChoice, lifecycle, measurement, systemText, versionField } from './domainFields'
import { phiFields } from './phi'
import { opt, phiList, residentList, ro } from './residentAccess'
import { trackingFields } from './trackingFields'

/* Clinical record, assessments, care plans, orders and tasks (SCHEMA §5-§8). Rows are written by server commands only. */

const CLINICAL: Permission[] = ['canReadClinical']
export const rl = (read: Permission[] = CLINICAL) => residentList(['community'], ['resident'], read)
export const scope = () => ({
  resident: relationship({ ref: 'Resident', ...ro }),
  community: relationship({ ref: 'Community', ...ro }),
})
export const stamps = () => ({ version: versionField(), ...trackingFields })
const when = (description?: string) => timestamp({ ...ro, ...(description ? { ui: { ...ro.ui, description } } : {}) })
const by = () => relationship({ ref: 'User', ...ro })
const textarea = { ...ro, ui: { ...ro.ui, displayMode: 'textarea' as const } }

export const NOTE_KINDS = ['nursing', 'physician', 'social_services', 'therapy', 'dietary', 'activity', 'late_entry', 'other'] as const
/** ClinicalDocument contract: draft → signed → amended; entered_in_error hides a note without deleting it. */
export const ProgressNote = list({
  access: rl(),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'resident', 'status', 'eventAt', 'author'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(NOTE_KINDS),
    ...phiFields('ProgressNote', { body: ['clin', text, textarea] }),
    status: lifecycle(['draft', 'signed', 'amended', 'entered_in_error']),
    eventAt: when('When the thing happened (a late entry differs from the time it was written).'),
    lateEntry: checkbox({ defaultValue: false, ...ro }),
    author: by(),
    signedBy: by(),
    signedAt: when(),
    amends: relationship({ ref: 'ProgressNote', ...ro }),
    amendedBy: relationship({ ref: 'ProgressNote', ...ro }),
    errorReason: systemText(),
    ...stamps(),
  },
})
phiList('ProgressNote')

export const VITAL_KINDS = ['temperature', 'pulse', 'respirations', 'systolic_bp', 'diastolic_bp', 'spo2', 'weight', 'pain', 'blood_glucose'] as const
export const VitalSign = list({
  access: rl(['canReadClinical', 'canChartPointOfCare']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'value', 'unit', 'resident', 'takenAt'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(VITAL_KINDS),
    ...phiFields('VitalSign', { value: ['clin', measurement, { ...ro, validation: { isRequired: true } }] }),
    unit: systemText({ required: true }),
    takenAt: when(),
    recordedBy: by(),
    ...stamps(),
  },
})
phiList('VitalSign')

export const IntakeRecord = list({
  access: rl(['canReadClinical', 'canChartPointOfCare']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'amountMl', 'percentEaten', 'resident', 'at'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(['fluid', 'meal', 'supplement', 'tube_feed']),
    ...phiFields('IntakeRecord', { amountMl: ['clin', measurement, ro], percentEaten: ['clin', integer, ro] }),
    at: when(),
    recordedBy: by(),
    ...stamps(),
  },
})
phiList('IntakeRecord')

export const AdlRecord = list({
  access: rl(['canReadClinical', 'canChartPointOfCare']),
  ui: { labelField: 'activity', listView: { initialColumns: ['activity', 'level', 'resident', 'at'] } },
  fields: {
    ...scope(),
    activity: fixedChoice(['bed_mobility', 'transfer', 'walking', 'dressing', 'eating', 'toileting', 'bathing', 'hygiene', 'continence']),
    level: select({ ...opt(['independent', 'supervision', 'limited_assist', 'extensive_assist', 'total_dependence', 'did_not_occur']), validation: { isRequired: true }, ...ro }),
    at: when(),
    recordedBy: by(),
    pocTaskSlot: relationship({ ref: 'PocTaskSlot', ...ro }),
    ...stamps(),
  },
})
phiList('AdlRecord')

export const Wound = list({
  access: rl(),
  ui: { labelField: 'site', listView: { initialColumns: ['site', 'kind', 'status', 'resident', 'firstNotedAt'] } },
  fields: {
    ...scope(),
    ...phiFields('Wound', { site: ['clin', text, { ...ro, validation: { isRequired: true } }] }),
    kind: fixedChoice(['pressure_injury', 'skin_tear', 'venous', 'arterial', 'diabetic', 'surgical', 'other']),
    status: lifecycle(['open', 'healing', 'healed', 'entered_in_error']),
    firstNotedAt: when(),
    lastAssessedAt: when(),
    currentStage: systemText(),
    assessmentIntervalDays: integer({ defaultValue: 7, ...ro }),
    assessments: relationship({ ref: 'WoundAssessment.wound', many: true, ...ro }),
    ...stamps(),
  },
})
phiList('Wound')

export const WoundAssessment = list({
  access: rl(),
  ui: { labelField: 'stage', listView: { initialColumns: ['wound', 'stage', 'lengthCm', 'widthCm', 'assessedAt'] } },
  fields: {
    ...scope(),
    wound: relationship({ ref: 'Wound.assessments', ...ro }),
    stage: select({ ...opt(['1', '2', '3', '4', 'unstageable', 'deep_tissue', 'not_applicable']), ...ro }),
    ...phiFields('WoundAssessment', {
      lengthCm: ['clin', measurement, ro], widthCm: ['clin', measurement, ro], depthCm: ['clin', measurement, ro],
      description: ['clin', text, textarea],
    }),
    photos: json({ ...ro, ui: { ...ro.ui, description: 'Document ids of wound photos.' } }),
    assessedAt: when(),
    assessedBy: by(),
    ...stamps(),
  },
})
phiList('WoundAssessment')

export const BehaviourEpisode = list({
  access: rl(['canReadSensitiveClinical']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'resident', 'startedAt', 'severity'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(['wandering', 'verbal', 'physical', 'resistance_to_care', 'sundowning', 'self_injury', 'other']),
    ...phiFields('BehaviourEpisode', { antecedent: ['sens', text, textarea], intervention: ['sens', text, textarea], outcome: ['sens', text, textarea] }),
    severity: select({ ...opt(['mild', 'moderate', 'severe']), defaultValue: 'mild', ...ro }),
    startedAt: when(),
    durationMinutes: integer({ ...ro }),
    recordedBy: by(),
    ...stamps(),
  },
})
phiList('BehaviourEpisode')

export const PhysicianVisit = list({
  access: rl(),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'resident', 'visitedAt', 'physicianName'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(['physician', 'nurse_practitioner', 'physician_assistant', 'telehealth']),
    physicianName: systemText({ required: true }),
    visitedAt: when(),
    ...phiFields('PhysicianVisit', { summary: ['clin', text, textarea] }),
    note: relationship({ ref: 'ProgressNote', ...ro }),
    recordedBy: by(),
    ...stamps(),
  },
})
phiList('PhysicianVisit')

/* ------------------------------------------------------------------ assessments */

export const AssessmentTemplate = list({
  access: scopedlessRead(),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'templateVersion', 'scorer', 'status'] } },
  fields: {
    code: systemText({ indexed: true, required: true }),
    name: systemText({ required: true }),
    templateVersion: integer({ defaultValue: 1, ...ro }),
    scorer: fixedChoice(['sum']),
    definition: json({ ...ro, ui: { ...ro.ui, description: 'Items with options and points, score bands and the source note. Validated by the template meta-schema before it is stored.' } }),
    settings: json({ ...ro }),
    sourceNote: systemText(),
    verifyNote: systemText(),
    status: lifecycle(['active', 'retired'], 'active'),
    ...stamps(),
  },
})

function scopedlessRead() {
  return { operation: { query: ({ session }: any) => Boolean(session?.data?.role?.canAccessDashboard), create: () => false, update: () => false, delete: () => false } }
}

export const Assessment = list({
  access: rl(['canReadClinical', 'canManageAssessments']),
  ui: { labelField: 'templateCode', listView: { initialColumns: ['templateCode', 'resident', 'score', 'band', 'status', 'completedAt'] } },
  fields: {
    ...scope(),
    template: relationship({ ref: 'AssessmentTemplate', ...ro }),
    templateCode: systemText({ indexed: true, required: true }),
    templateVersion: integer({ ...ro }),
    ...phiFields('Assessment', { answers: ['clin', json, ro], band: ['clin', text, ro], score: ['clin', integer, ro] }),
    status: lifecycle(['in_progress', 'completed', 'entered_in_error'], 'completed'),
    completedAt: when(),
    completedBy: by(),
    ...stamps(),
  },
})
phiList('Assessment')

/* ------------------------------------------------------------------ care plans */

export const CarePlan = list({
  access: rl(['canReadClinical', 'canManageCarePlans']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'kind', 'status', 'resident', 'revision', 'signedAt'] } },
  fields: {
    ...scope(),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(['baseline', 'comprehensive', 'service_plan']),
    status: lifecycle(['draft', 'active', 'superseded', 'entered_in_error']),
    revision: integer({ defaultValue: 1, ...ro }),
    supersedes: relationship({ ref: 'CarePlan', ...ro }),
    items: relationship({ ref: 'CarePlanItem.carePlan', many: true, ...ro }),
    basedOnAssessment: relationship({ ref: 'Assessment', ...ro }),
    proposal: relationship({ ref: 'Proposal', ...ro }),
    startedAt: when(),
    signedBy: by(),
    signedAt: when(),
    ...stamps(),
  },
})
phiList('CarePlan')

export const CarePlanItem = list({
  access: rl(['canReadClinical', 'canManageCarePlans']),
  ui: { labelField: 'text', listView: { initialColumns: ['kind', 'text', 'frequency', 'resident'] } },
  fields: {
    ...scope(),
    carePlan: relationship({ ref: 'CarePlan.items', ...ro }),
    kind: fixedChoice(['focus', 'goal', 'intervention']),
    parent: relationship({ ref: 'CarePlanItem', ...ro }),
    ...phiFields('CarePlanItem', { text: ['clin', text, { ...textarea, validation: { isRequired: true } }] }),
    discipline: select({ ...opt(['nursing', 'cna', 'dietary', 'therapy', 'social_services', 'activities']), defaultValue: 'nursing', ...ro }),
    frequency: select({ ...opt(['once', 'every_shift', 'daily', 'twice_daily', 'weekly', 'as_needed']), defaultValue: 'as_needed', ...ro }),
    targetDate: calendarDay({ ...ro }),
    status: lifecycle(['active', 'met', 'discontinued'], 'active'),
    ...stamps(),
  },
})
phiList('CarePlanItem')

/** The CNA kardex: one slot per intervention occurrence (point-of-care task). */
export const PocTaskSlot = list({
  access: rl(['canReadClinical', 'canChartPointOfCare']),
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'resident', 'dueAt', 'status'] } },
  fields: {
    ...scope(),
    item: relationship({ ref: 'CarePlanItem', ...ro }),
    label: systemText({ required: true }),
    dueAt: when(),
    slotKey: systemText({ indexed: 'unique', required: true }),
    status: lifecycle(['pending', 'done', 'not_done']),
    doneAt: when(),
    doneBy: by(),
    ...stamps(),
  },
})
phiList('PocTaskSlot')

/* ------------------------------------------------------------------ orders */

export const ORDER_KINDS = ['medication', 'treatment', 'diet', 'lab', 'therapy', 'code_status', 'activity', 'monitoring', 'other'] as const
export const Order = list({
  access: rl(['canReadClinical', 'canEnterOrders', 'canAdministerMeds']),
  ui: { labelField: 'summary', listView: { initialColumns: ['kind', 'summary', 'resident', 'status', 'source', 'startAt'] } },
  fields: {
    ...scope(),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(ORDER_KINDS),
    ...phiFields('Order', { summary: ['clin', text, { ...ro, validation: { isRequired: true } }], instructions: ['clin', text, textarea] }),
    source: fixedChoice(['written', 'electronic', 'verbal', 'telephone']),
    readBack: checkbox({ defaultValue: false, ...ro }),
    status: lifecycle(['active', 'discontinued', 'completed', 'entered_in_error'], 'active'),
    startAt: when(),
    stopAt: when(),
    enteredBy: by(),
    prescriber: by(),
    prescriberName: systemText(),
    needsCountersign: checkbox({ defaultValue: false, ...ro }),
    countersignedBy: by(),
    countersignedAt: when(),
    discontinuedReason: systemText(),
    allergyOverride: systemText(),
    medication: relationship({ ref: 'MedicationOrderDetail.order', ...ro }),
    ...stamps(),
  },
})
phiList('Order')

export const MedicationOrderDetail = list({
  access: rl(['canReadClinical', 'canEnterOrders', 'canAdministerMeds']),
  ui: { labelField: 'drugName', listView: { initialColumns: ['drugName', 'dose', 'route', 'resident', 'prn'] } },
  fields: {
    ...scope(),
    order: relationship({ ref: 'Order.medication', ...ro }),
    reference: relationship({ ref: 'MedicationReference', ...ro }),
    drugName: systemText({ required: true }),
    dose: measurement({ required: true }),
    doseUnit: systemText({ required: true }),
    route: select({ ...opt(['oral', 'sublingual', 'topical', 'subcutaneous', 'intramuscular', 'inhaled', 'ophthalmic', 'rectal', 'transdermal']), ...ro }),
    prn: checkbox({ defaultValue: false, ...ro }),
    prnReason: systemText(),
    prnMinIntervalMinutes: integer({ ...ro }),
    prnFollowUpMinutes: integer({ defaultValue: 60, ...ro }),
    times: json({ ...ro, ui: { ...ro.ui, description: 'Local administration times, e.g. ["08:00","20:00"].' } }),
    holdParameters: json({ ...ro, ui: { ...ro.ui, description: 'e.g. { "vital": "systolic_bp", "op": "lt", "value": 100 }. Hold the dose when the latest value trips it.' } }),
    controlled: checkbox({ defaultValue: false, ...ro }),
    ...stamps(),
  },
})
phiList('MedicationOrderDetail')

/* ------------------------------------------------------------------ tasks */

export const TASK_KINDS = ['general', 'post_fall_huddle', 'neuro_checks', 'hydration', 'wound_assessment', 'infection_review', 'prn_followup', 'incident_form', 'countersign', 'incident_follow_up', 'count_discrepancy', 'escalation', 'care_plan_review', 'finding'] as const
/** The staff inbox. Escalations and notifications are tasks, never sent messages. */
export const Task = list({
  access: scopedGoverned('canAccessDashboard', ['community']),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'kind', 'status', 'ownerRole', 'assignee', 'dueAt'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    resident: relationship({ ref: 'Resident', ...ro }),
    kind: fixedChoice(TASK_KINDS),
    title: systemText({ required: true }),
    detail: systemText(),
    dedupeKey: systemText({ indexed: 'unique' }),
    status: lifecycle(['open', 'in_progress', 'done', 'cancelled']),
    ownerRole: systemText(),
    assignee: relationship({ ref: 'User', ...ro }),
    dueAt: when(),
    escalateAt: when('Past this time the task shows as escalated to the role above.'),
    escalationOwnerRole: systemText(),
    subjectType: systemText(),
    subjectId: systemText({ indexed: true }),
    completedBy: by(),
    completedAt: when(),
    createdByWorkflow: systemText(),
    ...stamps(),
  },
})

export { choice }
