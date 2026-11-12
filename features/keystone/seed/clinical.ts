import { systemActor, type Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { seedAssessmentTemplates } from '../lib/clinical/assessments'
import { enterOrder, createCarePlan } from '../lib/clinical/plans'
import { receiveSupply, generateAdministrationSlots } from '../lib/clinical/medications'
import { seedWorkflowLibrary } from '../lib/workflows/engine'
import { auditCreate } from '../lib/cas'

/** Phase 2 demo data. Every drug, dose, person and number is invented. Idempotent: each piece checks for itself first. */
const REFERENCES = [
  { name: 'Lisinopril', strength: '10 mg', form: 'tablet', schedule: 'none', highAlert: false },
  { name: 'Metformin', strength: '500 mg', form: 'tablet', schedule: 'none', highAlert: false },
  { name: 'Acetaminophen', strength: '325 mg', form: 'tablet', schedule: 'none', highAlert: false },
  { name: 'Lorazepam', strength: '0.5 mg', form: 'tablet', schedule: 'iv', highAlert: false },
  { name: 'Oxycodone', strength: '5 mg', form: 'tablet', schedule: 'ii', highAlert: true },
] as const

export async function seedClinical(uow: UnitOfWork, actor: Actor = systemActor('seed')) {
  const { tx } = uow
  const out: Record<string, number> = { templates: 0, workflows: 0, references: 0, orders: 0, supplies: 0, carePlans: 0, activations: 0 }
  // Phase 2 turns on the federal clocks that were loaded dormant. The Ohio self-report stays off until counsel confirms it (verify).
  const on = await tx.regulatoryObligation.updateMany({ where: { code: { in: ['CP_BASELINE_48H', 'CP_COMPREHENSIVE_7D', 'F609_INITIAL_2H', 'F609_INITIAL_24H', 'F609_INVESTIGATION_5WD', 'PHYSICIAN_VISIT_30_60'] }, active: false }, data: { active: true } })
  out.clocksActivated = on.count
  out.templates = (await seedAssessmentTemplates(uow, actor)).created
  out.workflows = (await seedWorkflowLibrary(uow, actor)).created

  for (const ref of REFERENCES) {
    if (await tx.medicationReference.findFirst({ where: { name: ref.name, strength: ref.strength } })) continue
    await tx.medicationReference.create({ data: { ...ref, genericName: ref.name, source: 'manual', status: 'active' } })
    out.references += 1
  }

  const community = await tx.community.findFirst({ where: { synthetic: true }, orderBy: { createdAt: 'asc' } })
  if (!community) return out
  if (!(await tx.pharmacyRelationship.findFirst({ where: { communityId: community.id } }))) {
    await tx.pharmacyRelationship.create({ data: { communityId: community.id, name: 'Lakeshore Institutional Pharmacy (invented)', adapter: 'manual', phone: '555-0140', status: 'active' } })
  }

  // Workflows are switched on for the demo community directly (a seed is not a person asking). Real activation is a two-person approval.
  for (const version of await tx.workflowVersion.findMany({ where: { status: 'dry_run_ok', definition: { origin: 'library' } } })) {
    await tx.workflowActivation.create({ data: { communityId: community.id, workflowVersionId: version.id, status: 'active', activatedAt: uow.now, approvals: { seed: true } as never } })
    await tx.workflowVersion.update({ where: { id: version.id }, data: { status: 'active', version: { increment: 1 } } })
    out.activations += 1
  }

  const residents = await tx.resident.findMany({ where: { communityId: community.id, status: 'current', synthetic: true }, orderBy: { reference: 'asc' }, take: 4, select: { id: true } })
  const kit = await tx.unit.findFirst({ where: { communityId: community.id, setting: 'nursing_facility' }, orderBy: { code: 'asc' } })
  for (const [index, resident] of residents.entries()) {
    if (await tx.order.findFirst({ where: { residentId: resident.id } })) continue
    const mine = index % 2 === 0 ? { drugName: 'Lisinopril', dose: 10, doseUnit: 'mg', times: ['08:00'], holdParameters: { vital: 'systolic_bp', op: 'lt' as const, value: 100 } } : { drugName: 'Metformin', dose: 500, doseUnit: 'mg', times: ['08:00', '17:00'] }
    await enterOrder(uow, actor, { residentId: resident.id, kind: 'medication', summary: `${mine.drugName} ${mine.dose} ${mine.doseUnit}`, source: 'written', prescriberName: 'Dr. Imani Okafor (invented)', medication: { ...mine, route: 'oral' } })
    await enterOrder(uow, actor, { residentId: resident.id, kind: 'medication', summary: 'Acetaminophen 325 mg every 6 hours as needed for pain', source: 'written', prescriberName: 'Dr. Imani Okafor (invented)', medication: { drugName: 'Acetaminophen', dose: 325, doseUnit: 'mg', route: 'oral', prn: true, prnReason: 'pain', prnMinIntervalMinutes: 360, prnFollowUpMinutes: 60 } })
    out.orders += 2
    await createCarePlan(uow, actor, { residentId: resident.id, kind: 'baseline', items: [
      { kind: 'focus', text: 'Risk of falls' }, { kind: 'goal', text: 'No falls with injury this quarter', parentIndex: 0 },
      { kind: 'intervention', text: 'Check call light within reach; offer toileting', frequency: 'every_shift', parentIndex: 0 },
    ] })
    out.carePlans += 1
  }

  const witness = await tx.user.findFirst({ where: { role: { name: 'Charge Nurse (RN/LPN)' } }, select: { id: true } })
  if (kit && witness && !(await tx.medicationSupply.findFirst({ where: { communityId: community.id, controlled: true } }))) {
    await receiveSupply(uow, actor, { communityId: community.id, kind: 'house_stock', label: 'Lorazepam 0.5 mg (house stock, invented)', unit: 'tablet', quantity: 30, unitLocationId: kit.id, controlled: true, witnessId: witness?.id ?? null })
    out.supplies += 1
  }
  if (!(await tx.medicationSupply.findFirst({ where: { communityId: community.id, kind: 'ekit' } }))) {
    await receiveSupply(uow, actor, { communityId: community.id, kind: 'ekit', label: 'Emergency kit A (invented)', unit: 'dose', quantity: 12, unitLocationId: kit?.id ?? null })
    out.supplies += 1
  }
  // The only model the demo has: recorded fixtures in-process. The gateway lets synthetic residents reach it and nobody else.
  if (!(await tx.inferenceProvider.findUnique({ where: { key: 'sandbox' } }))) {
    await tx.inferenceProvider.create({ data: { key: 'sandbox', name: 'Sandbox fixtures (synthetic data only)', adapter: 'sandbox_fixture', mode: 'sandbox', model: 'sandbox-fixture@1', isDefault: true, status: 'active' } })
    out.inferenceProviders = 1
  }
  await generateAdministrationSlots(uow, community.id)
  auditCreate(uow, actor, 'Community', community.id, 'seed.clinical_loaded', out)
  return out
}
