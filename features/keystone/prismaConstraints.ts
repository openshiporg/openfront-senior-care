/**
 * Compound uniques Keystone can't express on a field (SCHEMA G9; openfront-convenience pattern).
 * Partial uniques, CHECK constraints and triggers live in raw-SQL migrations instead.
 */
export const COMPOUND_UNIQUES: Record<string, string[]> = {
  HolidayDate: ['@@unique([calendarId, date], map: "HolidayDate_calendar_date_key")'],
  StaffAssignment: ['@@unique([userId, communityId], map: "StaffAssignment_user_community_key")'],
  Building: ['@@unique([communityId, name], map: "Building_community_name_key")'],
  Unit: ['@@unique([communityId, code], map: "Unit_community_code_key")'],
  Room: ['@@unique([unitId, number], map: "Room_unit_number_key")'],
  Bed: ['@@unique([roomId, label], map: "Bed_room_label_key")'],
  Apartment: ['@@unique([unitId, number], map: "Apartment_unit_number_key")'],
  RegulatoryObligation: ['@@unique([packId, code], map: "RegulatoryObligation_pack_code_key")'],
  ComplianceClock: ['@@unique([obligationCode, subjectType, subjectId, occurrenceKey, supersedesId], map: "ComplianceClock_occurrence_key")'],
  MedicationSupplyMovement: ['@@unique([supplyId, seq], map: "MedicationSupplyMovement_supply_seq_key")'],
  BillingPeriod: ['@@unique([communityId, month], map: "BillingPeriod_community_month_key")'],
  Statement: ['@@unique([periodId, residentId], map: "Statement_period_resident_key")'],
  ResidentTrustLedger: ['@@unique([residentId, accountId], map: "ResidentTrustLedger_resident_account_key")'],
  TrustReconciliation: ['@@unique([accountId, month], map: "TrustReconciliation_account_month_key")'],
  CensusEvent: ['@@unique([stayId, seq], map: "CensusEvent_stay_seq_key")'],
  PaymentPlanInstalment: ['@@unique([planId, number], map: "PaymentPlanInstalment_plan_number_key")'],
  TrustStatement: ['@@unique([ledgerId, quarter], map: "TrustStatement_ledger_quarter_key")'],
  MdsAssessment: ['@@unique([residentId, kind, ardDate, correctionNumber], map: "MdsAssessment_resident_kind_ard_correction_key")'],
  ReferenceRate: ['@@unique([component, geography, effectiveFrom], map: "ReferenceRate_component_geo_from_key")'],
  InterestAllocationRun: ['@@unique([accountId, month], map: "InterestAllocationRun_account_month_key")'],
}

export function addDatabaseConstraints(schema: string): string {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`)
    const model = schema.match(pattern)?.[0]
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`)
    const missing = directives.filter(directive => !model.includes(directive))
    if (!missing.length) continue
    schema = schema.replace(model, model.replace(/\n\}$/, `\n${missing.map(directive => `  ${directive}`).join('\n')}\n}`))
  }
  return schema
}
