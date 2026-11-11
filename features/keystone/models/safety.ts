import { list } from '@keystone-6/core'
import { checkbox, calendarDay, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { scopedGoverned } from './scope'
import { fixedChoice, lifecycle, systemText } from './domainFields'
import { phiFields } from './phi'
import { opt, phiList, ro } from './residentAccess'
import { rl, scope, stamps } from './clinical'

/* Incidents (SCHEMA §9) and infection prevention (SCHEMA §10). */

const when = () => timestamp({ ...ro })
const by = () => relationship({ ref: 'User', ...ro })
const textarea = { ...ro, ui: { ...ro.ui, displayMode: 'textarea' as const } }

export const INCIDENT_KINDS = ['fall', 'medication_error', 'elopement', 'injury_unknown_source', 'alleged_abuse', 'alleged_neglect', 'misappropriation', 'resident_to_resident', 'skin', 'choking', 'infection', 'controlled_substance_discrepancy', 'other'] as const

export const Incident = list({
  access: rl(['canReportIncident', 'canReadIncidents', 'canInvestigateIncidents']),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'kind', 'status', 'severity', 'resident', 'occurredAt'] } },
  fields: {
    ...scope(),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: fixedChoice(INCIDENT_KINDS),
    ...phiFields('Incident', { description: ['clin', text, textarea], location: ['clin', text, ro] }),
    severity: select({ ...opt(['no_injury', 'minor', 'moderate', 'major', 'death']), defaultValue: 'no_injury', ...ro }),
    status: lifecycle(['reported', 'under_investigation', 'closed', 'entered_in_error']),
    occurredAt: when(),
    discoveredAt: when(),
    reportedAt: when(),
    reportedBy: by(),
    witnessed: checkbox({ defaultValue: false, ...ro }),
    headStrike: checkbox({ defaultValue: false, ...ro }),
    allegedAbuseOrSbi: checkbox({ defaultValue: false, ...ro }),
    allegedOther: checkbox({ defaultValue: false, ...ro }),
    reportableDecision: select({ ...opt(['reportable', 'not_reportable', 'pending']), defaultValue: 'pending', ...ro }),
    downgradedBy: by(),
    downgradeReason: systemText(),
    source: select({ ...opt(['staff', 'workflow']), defaultValue: 'staff', ...ro }),
    sourceNote: relationship({ ref: 'ProgressNote', ...ro }),
    parties: relationship({ ref: 'IncidentParty.incident', many: true, ...ro }),
    investigations: relationship({ ref: 'IncidentInvestigation.incident', many: true, ...ro }),
    reports: relationship({ ref: 'RegulatoryReport.incident', many: true, ...ro }),
    closedAt: when(),
    ...stamps(),
  },
})
phiList('Incident')

export const IncidentParty = list({
  access: rl(['canReportIncident', 'canReadIncidents', 'canInvestigateIncidents']),
  ui: { labelField: 'role', listView: { initialColumns: ['role', 'name', 'incident'] } },
  fields: {
    ...scope(),
    incident: relationship({ ref: 'Incident.parties', ...ro }),
    role: fixedChoice(['involved_resident', 'witness', 'staff_involved', 'alleged_perpetrator', 'family_notified', 'physician_notified']),
    name: systemText({ required: true }),
    resident: relationship({ ref: 'Resident', ...ro }),
    notifiedAt: when(),
    ...stamps(),
  },
})
phiList('IncidentParty')

export const IncidentInvestigation = list({
  access: rl(['canInvestigateIncidents', 'canReadIncidents']),
  ui: { labelField: 'status', listView: { initialColumns: ['incident', 'status', 'investigator', 'startedAt'] } },
  fields: {
    ...scope(),
    incident: relationship({ ref: 'Incident.investigations', ...ro }),
    ...phiFields('IncidentInvestigation', { findings: ['clin', text, textarea], rootCause: ['clin', text, textarea], interventions: ['clin', text, textarea] }),
    status: lifecycle(['open', 'completed']),
    investigator: by(),
    startedAt: when(),
    completedAt: when(),
    ...stamps(),
  },
})
phiList('IncidentInvestigation')

/** A report to the state or CMS. Submission is manual: staff file it elsewhere and record the confirmation. */
export const RegulatoryReport = list({
  access: rl(['canReadIncidents', 'canInvestigateIncidents', 'canSubmitRegulatory']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'incident', 'status', 'submittedAt'] } },
  fields: {
    ...scope(),
    incident: relationship({ ref: 'Incident.reports', ...ro }),
    kind: fixedChoice(['f609_initial', 'f609_followup', 'state_self_report']),
    status: lifecycle(['draft', 'submitted']),
    body: json({ ...ro }),
    channel: select({ ...opt(['state_portal', 'phone', 'fax', 'other']), ...ro }),
    confirmation: systemText(),
    submittedAt: when(),
    submittedBy: by(),
    ruleNote: systemText(),
    ...stamps(),
  },
})
phiList('RegulatoryReport')

/* ------------------------------------------------------------------ IPAC */

export const InfectionCase = list({
  access: rl(['canManageInfectionControl', 'canReadClinical']),
  ui: { labelField: 'syndrome', listView: { initialColumns: ['syndrome', 'resident', 'status', 'onsetAt', 'criteriaMet'] } },
  fields: {
    ...scope(),
    syndrome: fixedChoice(['uti', 'respiratory', 'skin_soft_tissue', 'gastroenteritis', 'covid19', 'influenza', 'cdiff', 'other']),
    status: lifecycle(['suspected', 'confirmed', 'ruled_out', 'resolved']),
    onsetAt: when(),
    ...phiFields('InfectionCase', { criteria: ['clin', json, ro], organism: ['clin', text, ro] }),
    criteriaMet: checkbox({ defaultValue: false, ...ro }),
    criteriaSet: systemText(),
    cultureAt: when(),
    outbreak: relationship({ ref: 'Outbreak.cases', ...ro }),
    ...stamps(),
  },
})
phiList('InfectionCase')

export const PrecautionOrder = list({
  access: rl(['canManageInfectionControl', 'canReadClinical']),
  ui: { labelField: 'kind', listView: { initialColumns: ['kind', 'resident', 'status', 'startedAt', 'reviewOn'] } },
  fields: {
    ...scope(),
    kind: fixedChoice(['standard', 'contact', 'droplet', 'airborne', 'enhanced_barrier']),
    case: relationship({ ref: 'InfectionCase', ...ro }),
    status: lifecycle(['active', 'ended']),
    startedAt: when(),
    endedAt: when(),
    reviewOn: calendarDay({ ...ro }),
    reason: systemText(),
    ...stamps(),
  },
})
phiList('PrecautionOrder')

export const AntibioticCourse = list({
  access: rl(['canManageInfectionControl', 'canReadClinical']),
  ui: { labelField: 'drugName', listView: { initialColumns: ['drugName', 'resident', 'status', 'startedAt', 'timeoutDueAt'] } },
  fields: {
    ...scope(),
    drugName: systemText({ required: true }),
    indication: systemText(),
    order: relationship({ ref: 'Order', ...ro }),
    case: relationship({ ref: 'InfectionCase', ...ro }),
    startedAt: when(),
    plannedDays: integer({ ...ro }),
    timeoutDueAt: when(),
    timeoutOutcome: select({ ...opt(['continue', 'narrow', 'stop', 'change']), ...ro }),
    timeoutAt: when(),
    timeoutBy: by(),
    status: lifecycle(['active', 'completed', 'stopped']),
    ...stamps(),
  },
})
phiList('AntibioticCourse')

export const Outbreak = list({
  access: scopedGoverned(['canManageInfectionControl', 'canDeclareOutbreak'], ['community']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'status', 'declaredAt', 'organism'] } },
  fields: {
    community: relationship({ ref: 'Community', ...ro }),
    name: systemText({ required: true }),
    organism: systemText(),
    unit: relationship({ ref: 'Unit', ...ro }),
    status: lifecycle(['declared', 'contained', 'closed'], 'declared'),
    declaredAt: when(),
    declaredBy: by(),
    closedAt: when(),
    cases: relationship({ ref: 'InfectionCase.outbreak', many: true, ...ro }),
    ...stamps(),
  },
})

export const Immunisation = list({
  access: rl(['canManageInfectionControl', 'canReadClinical']),
  ui: { labelField: 'vaccine', listView: { initialColumns: ['vaccine', 'resident', 'status', 'givenAt'] } },
  fields: {
    ...scope(),
    vaccine: fixedChoice(['influenza', 'covid19', 'pneumococcal', 'rsv', 'tdap', 'hepatitis_b', 'other']),
    status: lifecycle(['offered', 'accepted', 'declined', 'given', 'contraindicated']),
    offeredAt: when(),
    decidedAt: when(),
    givenAt: when(),
    lot: systemText(),
    recordedBy: by(),
    ...stamps(),
  },
})
phiList('Immunisation')
