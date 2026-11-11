import type { Permission } from '../access'
import { DomainError, Codes } from '../lib/errors'
import { delegateOf, type Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import type { Actor } from '../lib/actor'
import { casUpdate, lockRow } from '../lib/cas'
import { assertCommunityAccess, communityOf, runDomain } from './run'
import { actorFor } from './actorFor'
import { advanceTimedStates } from '../lib/maintenance'
import * as record from '../lib/clinical/record'
import * as assess from '../lib/clinical/assessments'
import * as plans from '../lib/clinical/plans'
import * as meds from '../lib/clinical/medications'
import * as inc from '../lib/clinical/incidents'
import * as ipac from '../lib/clinical/ipac'
import * as wf from '../lib/workflows/engine'
import { command } from '../lib/command'
import { requireKey } from './op'
import { requirePermission } from '../lib/actor'

type Input = Record<string, any>
type Handler = {
  permissions: Permission[]
  /** Where the target lives: a resident, a community, or a record id looked up by model. */
  community: (tx: Tx, input: Input) => Promise<string | null>
  run: (uow: UnitOfWork, actor: Actor, input: Input) => Promise<unknown>
  humanOnly?: boolean
  serializable?: boolean
}

const byResident = (tx: Tx, i: Input) => communityOf.resident(tx, String(i.residentId ?? ''))
const byCommunity = async (_tx: Tx, i: Input) => (i.communityId ? String(i.communityId) : null)
const byRecord = (model: string, field: string) => async (tx: Tx, i: Input) => {
  const id = i[field]
  if (typeof id !== 'string' || !id) return null
  const row = (await delegateOf(tx, model).findUnique({ where: { id }, select: { communityId: true } })) as { communityId: string | null } | null
  return row?.communityId ?? null
}
const byUnit = async (tx: Tx, i: Input) => (await tx.unit.findUnique({ where: { id: String(i.unitId ?? '') }, select: { communityId: true } }))?.communityId ?? null
const bySupply = byRecord('MedicationSupply', 'supplyId')

const NURSE: Permission[] = ['canChartNursing']
const MED: Permission[] = ['canAdministerMeds']

/** The whole Phase 2 command surface. Every entry checks its permission and the actor's community assignment before it runs. */
export const HANDLERS: Record<string, Handler> = {
  // Clinical record
  'note.create': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byResident, run: (u, a, i) => record.createProgressNote(u, a, i as any) },
  'note.sign': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byRecord('ProgressNote', 'noteId'), run: (u, a, i) => record.signProgressNote(u, a, i as any) },
  'note.amend': { permissions: ['canChartNursing'], community: byRecord('ProgressNote', 'noteId'), run: (u, a, i) => record.amendProgressNote(u, a, i as any) },
  'note.error': { permissions: ['canChartNursing'], community: byRecord('ProgressNote', 'noteId'), run: (u, a, i) => record.markNoteInError(u, a, i as any), humanOnly: true },
  'vitals.record': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byResident, run: (u, a, i) => record.recordVitals(u, a, i as any) },
  'intake.record': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byResident, run: (u, a, i) => record.recordIntake(u, a, i as any) },
  'adl.record': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byResident, run: (u, a, i) => record.recordAdl(u, a, i as any) },
  'wound.open': { permissions: NURSE, community: byResident, run: (u, a, i) => record.openWound(u, a, i as any) },
  'wound.assess': { permissions: NURSE, community: byRecord('Wound', 'woundId'), run: (u, a, i) => record.assessWound(u, a, i as any) },
  'behaviour.record': { permissions: ['canChartPointOfCare', 'canChartNursing'], community: byResident, run: (u, a, i) => record.recordBehaviour(u, a, i as any) },
  'visit.record': { permissions: NURSE, community: byResident, run: (u, a, i) => record.recordPhysicianVisit(u, a, i as any) },
  // Assessments and care plans
  'assessment.complete': { permissions: ['canManageAssessments', 'canChartNursing'], community: byResident, run: (u, a, i) => assess.completeAssessment(u, a, i as any) },
  'assessment.loadTemplates': { permissions: ['canManageAssessments'], community: async () => null, run: (u, a) => assess.seedAssessmentTemplates(u, a) },
  'carePlan.create': { permissions: ['canManageCarePlans'], community: byResident, run: (u, a, i) => plans.createCarePlan(u, a, i as any) },
  'carePlan.sign': { permissions: ['canManageCarePlans'], community: byRecord('CarePlan', 'carePlanId'), run: (u, a, i) => plans.signCarePlan(u, a, i as any), humanOnly: true },
  // Orders
  'order.enter': { permissions: ['canEnterOrders'], community: byResident, run: (u, a, i) => plans.enterOrder(u, a, i as any) },
  'order.countersign': { permissions: ['canSignOrders'], community: byRecord('Order', 'orderId'), run: (u, a, i) => plans.countersignOrder(u, a, i as any), humanOnly: true },
  'order.discontinue': { permissions: ['canEnterOrders', 'canSignOrders'], community: byRecord('Order', 'orderId'), run: (u, a, i) => plans.discontinueOrder(u, a, i as any) },
  // eMAR
  'emar.open': {
    permissions: [...MED, 'canReadClinical'], community: byCommunity,
    run: async (u, a, i) => ({ slots: await meds.generateAdministrationSlots(u, String(i.communityId)), missed: await meds.settleMissedDoses(u, a, String(i.communityId)), prnFollowUpsMissed: await meds.settlePrnFollowUps(u, a, String(i.communityId)) }),
  },
  'emar.administer': { permissions: MED, community: byRecord('AdministrationSlot', 'slotId'), run: (u, a, i) => meds.administerDose(u, a, i as any), humanOnly: true },
  'emar.prn': { permissions: MED, community: byRecord('MedicationOrderDetail', 'detailId'), run: (u, a, i) => meds.administerPrn(u, a, i as any), humanOnly: true },
  'emar.prnFollowUp': { permissions: MED, community: byRecord('PrnFollowUp', 'followUpId'), run: (u, a, i) => meds.recordPrnFollowUp(u, a, i as any) },
  // Supplies and counts
  'supply.receive': { permissions: ['canManagePharmacy', 'canAdministerMeds'], community: byCommunity, run: (u, a, i) => meds.receiveSupply(u, a, i as any), humanOnly: true },
  'supply.destroy': { permissions: ['canManagePharmacy', 'canWitnessControlled'], community: bySupply, run: (u, a, i) => meds.destroySupply(u, a, i as any), humanOnly: true },
  'ekit.draw': { permissions: MED, community: bySupply, run: (u, a, i) => meds.drawFromEkit(u, a, i as any), humanOnly: true },
  'count.start': { permissions: MED, community: byUnit, run: (u, a, i) => meds.startShiftCount(u, a, i as any), humanOnly: true },
  'count.entry': { permissions: MED, community: byRecord('ShiftCount', 'shiftCountId'), run: (u, a, i) => meds.submitCountEntry(u, a, i as any), humanOnly: true },
  'count.complete': { permissions: MED, community: byRecord('ShiftCount', 'shiftCountId'), run: (u, a, i) => meds.completeShiftCount(u, a, i as any), humanOnly: true },
  'count.resolve': { permissions: ['canResolveCountDiscrepancy'], community: byRecord('CountDiscrepancy', 'discrepancyId'), run: (u, a, i) => meds.resolveDiscrepancy(u, a, i as any), humanOnly: true },
  // Incidents
  'incident.report': { permissions: ['canReportIncident'], community: async (tx, i) => (i.residentId ? communityOf.resident(tx, String(i.residentId)) : i.communityId ? String(i.communityId) : null), run: (u, a, i) => inc.createIncident(u, a, i as any) },
  'incident.investigate': { permissions: ['canInvestigateIncidents'], community: byRecord('Incident', 'incidentId'), run: (u, a, i) => inc.startInvestigation(u, a, i as any) },
  'incident.completeInvestigation': { permissions: ['canInvestigateIncidents'], community: byRecord('IncidentInvestigation', 'investigationId'), run: (u, a, i) => inc.completeInvestigation(u, a, i as any) },
  'incident.draftReport': { permissions: ['canInvestigateIncidents', 'canSubmitRegulatory'], community: byRecord('Incident', 'incidentId'), run: (u, a, i) => inc.draftRegulatoryReport(u, a, i as any) },
  'incident.recordSubmission': { permissions: ['canSubmitRegulatory'], community: byRecord('RegulatoryReport', 'reportId'), run: (u, a, i) => inc.recordReportSubmission(u, a, i as any), humanOnly: true },
  'incident.close': { permissions: ['canInvestigateIncidents'], community: byRecord('Incident', 'incidentId'), run: (u, a, i) => inc.closeIncident(u, a, i as any), humanOnly: true },
  'incident.requestDowngrade': { permissions: ['canInvestigateIncidents'], community: byRecord('Incident', 'incidentId'), run: (u, a, i) => inc.requestDowngrade(u, a, i as any), humanOnly: true },
  // Infection prevention
  'ipac.openCase': { permissions: ['canManageInfectionControl'], community: byResident, run: (u, a, i) => ipac.openInfectionCase(u, a, i as any) },
  'ipac.updateCase': { permissions: ['canManageInfectionControl'], community: byRecord('InfectionCase', 'caseId'), run: (u, a, i) => ipac.updateInfectionCase(u, a, i as any) },
  'ipac.startPrecaution': { permissions: ['canManageInfectionControl', 'canChartNursing'], community: byResident, run: (u, a, i) => ipac.startPrecaution(u, a, i as any) },
  'ipac.endPrecaution': { permissions: ['canManageInfectionControl'], community: byRecord('PrecautionOrder', 'precautionId'), run: (u, a, i) => ipac.endPrecaution(u, a, i as any) },
  'ipac.startAntibiotic': { permissions: ['canManageInfectionControl', 'canEnterOrders'], community: byResident, run: (u, a, i) => ipac.startAntibioticCourse(u, a, i as any) },
  'ipac.antibioticTimeout': { permissions: ['canManageInfectionControl'], community: byRecord('AntibioticCourse', 'courseId'), run: (u, a, i) => ipac.recordAntibioticTimeout(u, a, i as any) },
  'ipac.declareOutbreak': { permissions: ['canDeclareOutbreak'], community: byCommunity, run: (u, a, i) => ipac.declareOutbreak(u, a, i as any), humanOnly: true },
  'ipac.closeOutbreak': { permissions: ['canDeclareOutbreak'], community: async (tx, i) => (await tx.outbreak.findUnique({ where: { id: String(i.outbreakId ?? '') }, select: { communityId: true } }))?.communityId ?? null, run: (u, a, i) => ipac.closeOutbreak(u, a, i as any), humanOnly: true },
  'ipac.immunisation': { permissions: ['canManageInfectionControl', 'canChartNursing'], community: byResident, run: (u, a, i) => ipac.recordImmunisation(u, a, i as any) },
  // Tasks
  'task.complete': { permissions: ['canChartPointOfCare', 'canChartNursing', 'canReadClinical'], community: byRecord('Task', 'taskId'), run: (u, a, i) => completeTask(u, a, i) },
  // Workflows
  'workflow.loadLibrary': { permissions: ['canManageWorkflows'], community: async () => null, run: (u, a) => wf.seedWorkflowLibrary(u, a) },
  'workflow.requestActivation': { permissions: ['canManageWorkflows'], community: byCommunity, run: (u, a, i) => wf.requestActivation(u, a, i as any), humanOnly: true },
  'workflow.run': { permissions: ['canReadFindings', 'canManageWorkflows'], community: byCommunity, run: (u, a, i) => wf.runWorkflows(u, a, { communityId: String(i.communityId), trigger: 'run_now' }) },
  'finding.dismiss': { permissions: ['canReadFindings'], community: byRecord('Finding', 'findingId'), run: (u, a, i) => wf.dismissFinding(u, a, i as any), humanOnly: true },
}

async function completeTask(uow: UnitOfWork, actor: Actor, input: Input) {
  const task = await lockRow<{ id: string; version: number; status: string }>(uow.tx, 'Task', String(input.taskId))
  await casUpdate(uow, { model: 'Task', id: task.id, version: task.version, from: ['open', 'in_progress'], to: 'done', actor, eventType: 'task.done', data: { completedById: actor.kind === 'user' ? actor.userId : null, completedAt: uow.now } })
  return { taskId: task.id }
}

/** The one GraphQL entry point for Phase 2 commands. Unknown names fail before anything runs. */
export async function clinicalCommand(_root: unknown, args: { op: string; input?: Input | null; idempotencyKey: string }, context: { session: unknown; prisma: any }) {
  const handler = HANDLERS[args.op]
  if (!handler) throw new DomainError(Codes.INVALID_INPUT, 'Unknown action.')
  const input = (args.input && typeof args.input === 'object' ? args.input : {}) as Input
  return runDomain(context, { idempotencyKey: args.idempotencyKey, op: args.op, input }, { name: `clinical.${args.op}`, permissions: handler.permissions, humanOnly: handler.humanOnly, serializable: handler.serializable, community: tx => handler.community(tx, input) }, async (uow, actor) => {
    const result = (await handler.run(uow, actor, input)) as object
    // The mutation that changes source data also asks the engine to look (idempotent per window).
    if (SOURCE_OPS.has(args.op)) {
      const communityId = await handler.community(uow.tx, input)
      if (communityId) await wf.runWorkflows(uow, actor, { communityId, trigger: 'source_change' })
    }
    return result
  })
}

const SOURCE_OPS = new Set(['intake.record', 'vitals.record', 'wound.open', 'wound.assess', 'emar.administer', 'emar.open'])

/**
 * Page-load run: findings pages call this when they open. It is a normal command (one transaction, audited) with a
 * per-window key, so reloading inside the window creates nothing. Not a timer; it only ever runs because someone asked for the page.
 */
export async function runWorkflowsOnLoad(_root: unknown, args: { communityId: string; idempotencyKey: string }, context: { session: unknown; prisma: any }) {
  const actor = await actorFor(context)
  requirePermission(actor, 'canReadFindings', 'canManageWorkflows')
  await advanceTimedStates(context.prisma)
  const result = await command(context.prisma, { name: 'workflow.page_load', actor, idempotencyKey: requireKey(args.idempotencyKey), params: { communityId: args.communityId } }, async uow => {
    await assertCommunityAccess(uow.tx, actor, args.communityId)
    return wf.runWorkflows(uow, actor, { communityId: args.communityId, trigger: 'page_load' })
  })
  return { replay: result.replay, ...(result.value as object) }
}
