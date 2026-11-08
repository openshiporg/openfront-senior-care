import type { Permission } from '../access'

/**
 * Ridgeline Senior Communities and its Maple Ridge Senior Living community in Columbus, Ohio
 * (BUILD-PLAN §5). Every person, number and identifier is invented and marked synthetic.
 * Ids are deterministic (`seed_…`) so loading twice changes nothing.
 */

export const OPERATOR = {
  legalName: 'Ridgeline Senior Communities, LLC',
  displayName: 'Ridgeline Senior Communities',
  homeTimeZone: 'America/New_York',
}

export type RoleSeed = { id: string; name: string; description: string; permissions: Permission[] }

const STAFF_BASE: Permission[] = ['canAccessDashboard', 'canReportIncident']
const RESIDENT_READ: Permission[] = ['canReadResidentDemographics']
const CLINICAL_READ: Permission[] = [...RESIDENT_READ, 'canReadClinical']

/** The 25 roles from DOMAIN §10 / SCHEMA §1.4. None carries canBreakGlassRecords. */
export const ROLES: RoleSeed[] = [
  { id: 'seed_role_operator_admin', name: 'Operator Admin', description: 'Runs the platform for the operator: communities, people, roles and integrations.', permissions: [...STAFF_BASE, 'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canManageOnboarding', 'canManageOperator', 'canManageCommunities', 'canManagePlaces', 'canManageIntegrations', 'canManageAgents', 'canReadAudit', 'canReadCompliance', 'canReadSales'] },
  { id: 'seed_role_executive_director', name: 'Executive Director', description: 'Licensed administrator: census, sales, compliance and approvals for the community.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canSeeOtherPeople', 'canReadSales', 'canManageSales', 'canManageStorefront', 'canApproveCensusCorrections', 'canApproveIncidentDowngrade', 'canApproveRates', 'canApproveWriteOffs', 'canApproveIntegrations', 'canReadCompliance', 'canApproveCompliance', 'canReadIncidents', 'canReadBilling', 'canReadWorkforce', 'canReadAudit', 'canReadFindings', 'canApproveWorkflows'] },
  { id: 'seed_role_don', name: 'Director of Nursing', description: 'Clinical lead: corrections, count discrepancies, care plans and clinical approvals.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canReadSensitiveClinical', 'canChartNursing', 'canManageCarePlans', 'canManageAssessments', 'canApproveClinicalCorrections', 'canResolveCountDiscrepancy', 'canApproveControlledAdjustments', 'canInvestigateIncidents', 'canReadIncidents', 'canRecordCensus', 'canBreakGlass', 'canReadCompliance', 'canReadFindings', 'canApproveWorkflows', 'canManageWorkflows', 'canReadWorkforce'] },
  { id: 'seed_role_adon', name: 'Assistant Director of Nursing', description: 'Supports the DON; charts, plans care and investigates incidents.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canChartNursing', 'canManageCarePlans', 'canManageAssessments', 'canInvestigateIncidents', 'canReadIncidents', 'canRecordCensus', 'canBreakGlass', 'canReadFindings'] },
  { id: 'seed_role_charge_nurse', name: 'Charge Nurse (RN/LPN)', description: 'Unit nurse: charting, medication pass, census moves on the unit.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canChartNursing', 'canAdministerMeds', 'canWitnessControlled', 'canEnterOrders', 'canRecordCensus', 'canBreakGlass', 'canReadIncidents'] },
  { id: 'seed_role_cna', name: 'Certified Nursing Assistant', description: 'Point-of-care charting (ADLs, intake, vitals) on assigned units.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canChartPointOfCare'] },
  { id: 'seed_role_med_tech', name: 'Med Tech (AL)', description: 'Assisted-living medication administration where the state pack allows it.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canAdministerMeds', 'canChartPointOfCare'] },
  { id: 'seed_role_mds', name: 'MDS Coordinator', description: 'Assessments, MDS schedule and PDPM.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canManageAssessments', 'canSubmitRegulatory', 'canReadBilling', 'canReadIdentifiers'] },
  { id: 'seed_role_ip', name: 'Infection Preventionist', description: 'Infection surveillance, precautions, outbreaks and immunisations.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canManageInfectionControl', 'canDeclareOutbreak', 'canSubmitRegulatory', 'canReadFindings'] },
  { id: 'seed_role_prescriber', name: 'Prescriber', description: 'Physician or NP: orders and signatures.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canReadSensitiveClinical', 'canEnterOrders', 'canSignOrders'] },
  { id: 'seed_role_consultant_pharmacist', name: 'Consultant Pharmacist', description: 'Monthly drug regimen review.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canManagePharmacy'] },
  { id: 'seed_role_therapist', name: 'Therapist', description: 'PT/OT/SLP documentation and minutes.', permissions: [...STAFF_BASE, ...CLINICAL_READ, 'canChartNursing'] },
  { id: 'seed_role_dietary', name: 'Dietary', description: 'Diets, textures and meal service.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageDietary'] },
  { id: 'seed_role_activities', name: 'Activities', description: 'Activity calendar and participation.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageActivities', 'canManageFamilyUpdates'] },
  { id: 'seed_role_social_services', name: 'Social Services', description: 'Representatives, portal scopes, notices and family communication.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageRepresentatives', 'canApprovePortalScopes', 'canMessageFamilies', 'canManageFamilyUpdates', 'canReadSensitiveClinical'] },
  { id: 'seed_role_admissions', name: 'Admissions', description: 'Inquiries, tours, referrals, waitlist, admissions and discharges.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageSales', 'canReadSales', 'canManageStorefront', 'canAdmitDischarge', 'canRecordCensus', 'canManageRepresentatives'] },
  { id: 'seed_role_business_office', name: 'Business Office', description: 'Payers, coverage, billing and payments.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageBilling', 'canManageClaims', 'canPostPayments', 'canManageRates', 'canReadBilling', 'canReadIdentifiers', 'canManagePayments', 'canIssueRefunds'] },
  { id: 'seed_role_trust_officer', name: 'Trust Officer', description: 'Records resident trust deposits and withdrawals.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canOperateTrust', 'canReadTrust'] },
  { id: 'seed_role_trust_approver', name: 'Trust Approver', description: 'Second person for trust withdrawals over threshold and reconciliations.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canApproveTrust', 'canReadTrust'] },
  { id: 'seed_role_scheduler', name: 'Scheduler', description: 'Shifts and open-shift offers.', permissions: [...STAFF_BASE, 'canManageSchedule', 'canReadWorkforce'] },
  { id: 'seed_role_hr', name: 'Human Resources', description: 'People, credentials and timecards.', permissions: [...STAFF_BASE, 'canSeeOtherPeople', 'canManagePeople', 'canManageCredentials', 'canManageTimecards', 'canApproveTimecards', 'canReadWorkforce'] },
  { id: 'seed_role_privacy_officer', name: 'Privacy Officer', description: 'Reviews break-glass and PHI read audit; owns the BAA register.', permissions: [...STAFF_BASE, 'canReviewBreakGlass', 'canReadPhiAudit', 'canReadAudit', 'canReadCompliance', 'canApproveAgentGrants'] },
  { id: 'seed_role_compliance_lead', name: 'QAPI / Compliance Lead', description: 'Compliance clocks, surveys, QAPI and packs.', permissions: [...STAFF_BASE, ...RESIDENT_READ, 'canManageCompliance', 'canManageSurveys', 'canManageQapi', 'canApproveCompliance', 'canReadCompliance', 'canReadIncidents', 'canReadFindings', 'canReadAudit'] },
  { id: 'seed_role_surveyor', name: 'Surveyor', description: 'Read-only, time-boxed by the user access expiry.', permissions: ['canAccessDashboard', ...CLINICAL_READ, 'canReadCompliance', 'canReadIncidents'] },
  { id: 'seed_role_portal', name: 'Portal', description: 'Family portal only; no dashboard.', permissions: [] },
]

export type StaffSeed = { id: string; name: string; email: string; title: string; roleId: string; kind: 'staff' | 'surveyor'; accessDays?: number }

export const STAFF: StaffSeed[] = [
  { id: 'seed_user_castellanos', name: 'Naomi Castellanos', email: 'naomi.castellanos@mapleridgeseniorliving.com', title: 'Executive Director', roleId: 'seed_role_executive_director', kind: 'staff' },
  { id: 'seed_user_oyelaran', name: 'Patrick Oyelaran, RN', email: 'patrick.oyelaran@mapleridgeseniorliving.com', title: 'Director of Nursing', roleId: 'seed_role_don', kind: 'staff' },
  { id: 'seed_user_lindqvist', name: 'Grace Lindqvist, RN', email: 'grace.lindqvist@mapleridgeseniorliving.com', title: 'Assistant Director of Nursing', roleId: 'seed_role_adon', kind: 'staff' },
  { id: 'seed_user_ramos', name: 'Luis Ramos, LPN', email: 'luis.ramos@mapleridgeseniorliving.com', title: 'Charge Nurse, Birch', roleId: 'seed_role_charge_nurse', kind: 'staff' },
  { id: 'seed_user_vukovic', name: 'Renata Vukovic, RN', email: 'renata.vukovic@mapleridgeseniorliving.com', title: 'MDS Coordinator', roleId: 'seed_role_mds', kind: 'staff' },
  { id: 'seed_user_achterberg', name: 'Samuel Achterberg, RN', email: 'samuel.achterberg@mapleridgeseniorliving.com', title: 'Infection Preventionist', roleId: 'seed_role_ip', kind: 'staff' },
  { id: 'seed_user_patel', name: 'Devika Patel', email: 'devika.patel@mapleridgeseniorliving.com', title: 'Admissions Director', roleId: 'seed_role_admissions', kind: 'staff' },
  { id: 'seed_user_brooks', name: 'Tasha Brooks, MSW', email: 'tasha.brooks@mapleridgeseniorliving.com', title: 'Social Services Director', roleId: 'seed_role_social_services', kind: 'staff' },
  { id: 'seed_user_holloway', name: 'Tamsin Holloway', email: 'tamsin.holloway@mapleridgeseniorliving.com', title: 'Business Office Manager', roleId: 'seed_role_business_office', kind: 'staff' },
  { id: 'seed_user_almeida', name: 'Jorge Almeida', email: 'jorge.almeida@mapleridgeseniorliving.com', title: 'Trust Officer', roleId: 'seed_role_trust_officer', kind: 'staff' },
  { id: 'seed_user_durand', name: 'Keisha Durand', email: 'keisha.durand@mapleridgeseniorliving.com', title: 'Scheduler', roleId: 'seed_role_scheduler', kind: 'staff' },
  { id: 'seed_user_ferreira_kahn', name: 'Martin Ferreira-Kahn', email: 'martin.ferreira-kahn@ridgelineseniorcommunities.com', title: 'Privacy Officer', roleId: 'seed_role_privacy_officer', kind: 'staff' },
  { id: 'seed_user_brandvold', name: 'Dr. Ilse Brandvold', email: 'ilse.brandvold@mapleridgeseniorliving.com', title: 'Medical Director', roleId: 'seed_role_prescriber', kind: 'staff' },
  { id: 'seed_user_adewale', name: 'Dr. Femi Adewale', email: 'femi.adewale@mapleridgeseniorliving.com', title: 'Consultant Pharmacist', roleId: 'seed_role_consultant_pharmacist', kind: 'staff' },
  { id: 'seed_user_ferris', name: 'Owen Ferris', email: 'owen.ferris@ridgelineseniorcommunities.com', title: 'Operator Administrator', roleId: 'seed_role_operator_admin', kind: 'staff' },
]

export type PolicySeed = { action: string; description: string; requiredPermission: Permission; expiresAfterMinutes: number }

export const APPROVAL_POLICIES: PolicySeed[] = [
  { action: 'census.correct_closed_period', description: 'Correct a census event inside a closed billing period.', requiredPermission: 'canApproveCensusCorrections', expiresAfterMinutes: 1440 },
  { action: 'operator.controls', description: 'Change operator controls (inference policy, break-glass hours, approval thresholds).', requiredPermission: 'canApproveCompliance', expiresAfterMinutes: 1440 },
  { action: 'portal.grant_scope', description: 'Grant a family portal scope above "updates".', requiredPermission: 'canApprovePortalScopes', expiresAfterMinutes: 7 * 1440 },
  { action: 'agent_grant.activate', description: 'Activate a tool grant for an AI agent (PHI scopes need two approvers).', requiredPermission: 'canApproveAgentGrants', expiresAfterMinutes: 1440 },
  { action: 'role.assign_approval', description: 'Give a person a role that can approve.', requiredPermission: 'canManageRoles', expiresAfterMinutes: 1440 },
  { action: 'rate.publish', description: 'Publish a rate schedule.', requiredPermission: 'canApproveRates', expiresAfterMinutes: 1440 },
]

/* Maple Ridge Senior Living: places (BUILD-PLAN §5). */

export const COMMUNITY = {
  id: 'seed_community_maple_ridge',
  name: 'Maple Ridge Senior Living',
  slug: 'maple-ridge',
  reference: 'MRSL',
  timeZone: 'America/New_York',
  addressLine1: '4100 Maple Ridge Parkway',
  city: 'Columbus',
  region: 'OH',
  postalCode: '43219',
  country: 'US',
  phone: '(614) 471-3800',
  settingsOffered: ['nursing_facility', 'assisted_living', 'memory_care', 'independent_living'],
  identifiers: { ccn: '366427', npi: '1487296530', stateLicence: 'NH-2194', medicaidProviderId: '0318462', nhsnOrgId: '48271' },
}

/** 120 dual-certified nursing beds (BUILD-PLAN §5): semi-private rooms of two beds; Aspen has 4 isolation-capable private rooms. */
export const NF_UNITS = [
  { id: 'seed_unit_birch', name: 'Birch', code: 'BIR', specialty: 'short_stay_rehab', firstRoom: 101, beds: 32, isolationRooms: 0 },
  { id: 'seed_unit_cedar', name: 'Cedar', code: 'CED', specialty: 'long_term', firstRoom: 201, beds: 32, isolationRooms: 0 },
  { id: 'seed_unit_willow', name: 'Willow', code: 'WIL', specialty: 'long_term', firstRoom: 217, beds: 32, isolationRooms: 0 },
  { id: 'seed_unit_aspen', name: 'Aspen', code: 'ASP', specialty: 'long_term', firstRoom: 305, beds: 24, isolationRooms: 4 },
] as const

export const RESIDENTIAL_UNITS = [
  { id: 'seed_unit_meadow', name: 'Meadow', code: 'MEA', setting: 'assisted_living', secured: false, count: 48, prefix: 'A' },
  { id: 'seed_unit_harbor', name: 'Harbor', code: 'HAR', setting: 'memory_care', secured: true, count: 24, prefix: 'H' },
  { id: 'seed_unit_grove', name: 'Grove', code: 'GRO', setting: 'independent_living', secured: false, count: 20, prefix: 'I' },
] as const

export const APARTMENT_TYPES = [
  { id: 'seed_apt_studio', name: 'Studio', setting: 'assisted_living', squareFeet: 410, bedrooms: 0, description: 'A bright studio with a kitchenette and an accessible bathroom.' },
  { id: 'seed_apt_one_bed', name: 'One Bedroom', setting: 'assisted_living', squareFeet: 620, bedrooms: 1, description: 'A separate bedroom, a living room and a kitchenette.' },
  { id: 'seed_apt_companion', name: 'Companion Suite', setting: 'assisted_living', squareFeet: 540, bedrooms: 1, description: 'A shared suite for spouses or companions.' },
  { id: 'seed_apt_mc_suite', name: 'Memory Care Suite', setting: 'memory_care', squareFeet: 330, bedrooms: 0, description: 'A private suite in the secured Harbor neighbourhood.' },
  { id: 'seed_apt_il_one', name: 'Independent One Bedroom', setting: 'independent_living', squareFeet: 760, bedrooms: 1, description: 'A full kitchen, a patio and housekeeping included.' },
] as const

/** Which apartment type each residential apartment gets (by index). */
export function apartmentTypeFor(unitCode: string, index: number) {
  if (unitCode === 'HAR') return 'seed_apt_mc_suite'
  if (unitCode === 'GRO') return 'seed_apt_il_one'
  if (index % 8 === 7) return 'seed_apt_companion'
  return index % 3 === 0 ? 'seed_apt_one_bed' : 'seed_apt_studio'
}

export const PAYERS = [
  { id: 'seed_payer_medicare_a', name: 'Medicare Part A', kind: 'medicare_a', claimFormat: '837i', dayCountingRule: 'count_admit_not_discharge' },
  { id: 'seed_payer_ohio_medicaid', name: 'Ohio Medicaid (fee-for-service)', kind: 'medicaid_ffs', claimFormat: '837i', dayCountingRule: 'count_admit_not_discharge' },
  { id: 'seed_payer_buckeye_ma', name: 'Buckeye Health Advantage', kind: 'medicare_advantage', claimFormat: '837i', dayCountingRule: 'count_admit_not_discharge' },
  { id: 'seed_payer_ohio_mco', name: 'Scioto Care Partners', kind: 'medicaid_mco', claimFormat: '837i', dayCountingRule: 'count_admit_not_discharge' },
  { id: 'seed_payer_lakeshore_ltc', name: 'Lakeshore Long-Term Care Insurance', kind: 'ltc_insurance', claimFormat: 'invoice', dayCountingRule: 'count_admit_not_discharge' },
  { id: 'seed_payer_private', name: 'Private pay', kind: 'private_pay', claimFormat: 'invoice', dayCountingRule: 'count_admit_not_discharge' },
] as const

export const FAMILY_NAMES = ['Abbott', 'Bauer', 'Castillo', 'Delgado', 'Eastman', 'Fischer', 'Gallagher', 'Hoffman', 'Iverson', 'Jablonski', 'Kowalski', 'Lindgren', 'Mahoney', 'Novak', 'Ortega', 'Pruitt', 'Quinlan', 'Rasmussen', 'Sorensen', 'Takahashi', 'Underwood', 'Vasquez', 'Whitaker', 'Yoder']
export const GIVEN_NAMES = ['Dorothy', 'Harold', 'Evelyn', 'Walter', 'Margaret', 'Eugene', 'Ruth', 'Clarence', 'Betty', 'Raymond', 'Shirley', 'Howard', 'Virginia', 'Earl', 'Lorraine', 'Gerald', 'Marion', 'Lloyd', 'Doris', 'Vernon', 'Irene', 'Leonard', 'Bernice', 'Floyd']

/* Place generators (pure): the platform seed creates these rows, the census seed places people in them. */

export function nfRooms(unit: (typeof NF_UNITS)[number]) {
  const rooms: { number: string; kind: string; isolation: boolean; beds: string[] }[] = []
  let remaining: number = unit.beds
  for (let i = 0; remaining > 0; i += 1) {
    const isolation = i < unit.isolationRooms
    const number = String(unit.firstRoom + i)
    const beds = isolation || remaining === 1 ? ['A'] : ['A', 'B']
    rooms.push({ number, kind: beds.length === 1 ? 'private' : 'semi_private', isolation, beds })
    remaining -= beds.length
  }
  return rooms
}

/** Apartments of a residential unit: ids, numbers (A2-14, H6, I3), types and capacity. */
export const residentialApartments = (unit: (typeof RESIDENTIAL_UNITS)[number]) =>
  Array.from({ length: unit.count }, (_, index) => {
    const floor = unit.code === 'MEA' ? 1 + Math.floor(index / 16) : 1
    const number = unit.code === 'MEA' ? `${unit.prefix}${floor}-${String((index % 16) + 1).padStart(2, '0')}` : `${unit.prefix}${index + 1}`
    const apartmentTypeId = apartmentTypeFor(unit.code, index)
    return { id: `seed_apartment_${unit.code.toLowerCase()}_${index + 1}`, number, apartmentTypeId, capacity: apartmentTypeId === 'seed_apt_companion' ? 2 : 1 }
  })

/** Bed ids of a nursing unit in room order, with their labels (e.g. 112A). */
export const nfBeds = (unit: (typeof NF_UNITS)[number]) =>
  nfRooms(unit).flatMap(room => room.beds.map(label => ({ id: `seed_room_${unit.code.toLowerCase()}_${room.number}_${label.toLowerCase()}`, label: `${room.number}${label}` })))
