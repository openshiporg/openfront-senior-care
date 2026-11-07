// Role permissions (SCHEMA §1.4). Operate and approve permissions come in pairs so one person never
// needs both halves of a control; the separation-of-duties check still blocks self-approval when a
// user happens to hold both.
export const permissionNames = [
  // Starter and fleet-mandatory
  'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canAccessDashboard',
  'canManageOnboarding', 'canManagePayments', 'canIssueRefunds', 'canReadAudit',
  // Operator and communities
  'canManageOperator', 'canManageCommunities', 'canManagePlaces', 'canManageIntegrations', 'canApproveIntegrations',
  // Sales and storefront
  'canManageSales', 'canManageStorefront', 'canReadSales',
  // Residents and census
  'canAdmitDischarge', 'canRecordCensus', 'canManageRepresentatives', 'canApproveCensusCorrections', 'canReadResidentDemographics',
  // Clinical
  'canChartPointOfCare', 'canChartNursing', 'canManageAssessments', 'canManageCarePlans', 'canEnterOrders', 'canSignOrders',
  'canApproveClinicalCorrections', 'canReadClinical', 'canReadSensitiveClinical',
  // Medications
  'canAdministerMeds', 'canWitnessControlled', 'canManagePharmacy', 'canResolveCountDiscrepancy', 'canApproveControlledAdjustments',
  // Incidents and infection prevention
  'canReportIncident', 'canInvestigateIncidents', 'canManageInfectionControl', 'canApproveIncidentDowngrade', 'canDeclareOutbreak', 'canReadIncidents',
  // Workforce
  'canManageSchedule', 'canManageTimecards', 'canManageCredentials', 'canApproveTimecards', 'canReadWorkforce',
  // Billing
  'canManageRates', 'canManageBilling', 'canManageClaims', 'canPostPayments', 'canApproveRates', 'canApproveWriteOffs', 'canReleaseClaims',
  'canReadBilling', 'canReadIdentifiers',
  // Resident trust
  'canOperateTrust', 'canApproveTrust', 'canReadTrust',
  // Compliance and quality
  'canManageCompliance', 'canManageSurveys', 'canManageQapi', 'canSubmitRegulatory', 'canApproveCompliance', 'canReadCompliance',
  // Portal and engagement
  'canManageFamilyUpdates', 'canManageActivities', 'canManageDietary', 'canMessageFamilies', 'canApprovePortalScopes',
  // AI workflows and agents
  'canManageWorkflows', 'canManageAgents', 'canApproveWorkflows', 'canApproveAgentGrants', 'canReadFindings',
  // Privacy
  'canBreakGlass', 'canReviewBreakGlass', 'canReadPhiAudit',
  // Raw status correction. Never seeded on a default role; every use is audited.
  'canBreakGlassRecords',
] as const

export type Permission = typeof permissionNames[number]

/** Permissions never granted by default (the first-user Owner role and every seeded role leave them off). */
export const NEVER_DEFAULT: readonly Permission[] = ['canBreakGlassRecords']

/** Permissions that let a user decide someone else's request. Assigning a role holding one of these is maker-checker. */
export const approvalPermissions = permissionNames.filter(name =>
  name.startsWith('canApprove') || name === 'canReleaseClaims' || name === 'canResolveCountDiscrepancy' || name === 'canReviewBreakGlass' || name === 'canBreakGlassRecords',
) as Permission[]

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    email?: string
    kind?: string | null
    accessExpiresAt?: string | null
    role: ({ id: string; name: string } & Record<Permission, boolean>) | null
  }
}

type AccessArgs = { session?: Session | null }

/** Signed in, and not past a time-boxed access window (surveyors, consultants). */
export const isSignedIn = ({ session }: AccessArgs) => {
  if (!session) return false
  const expires = session.data?.accessExpiresAt
  return !expires || Date.parse(expires) > Date.now()
}

/** A staff member (not a family portal user). */
export const isStaff = ({ session }: AccessArgs) => isSignedIn({ session }) && session?.data.kind !== 'portal' && session?.data.role?.canAccessDashboard === true

export const hasPermission = (session: Session | null | undefined, permission: Permission) =>
  isSignedIn({ session }) && session?.data.kind !== 'portal' && session?.data.role?.[permission] === true

export const permissions = Object.fromEntries(
  permissionNames.map(name => [name, ({ session }: AccessArgs) => hasPermission(session, name)])
) as Record<Permission, (args: AccessArgs) => boolean>

/** Any of the given permissions. */
export const anyOf = (...names: Permission[]) => ({ session }: AccessArgs) => names.some(name => hasPermission(session, name))

/** Only server code (through context.sudo()) may perform the operation. */
export const sys = () => false

export const rules = {
  canReadPeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canSeeOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
  canUpdatePeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canEditOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
}
