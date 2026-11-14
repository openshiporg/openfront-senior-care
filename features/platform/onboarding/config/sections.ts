import { APPROVAL_POLICIES, COMMUNITY, NF_UNITS, OPERATOR, PAYERS, RESIDENTIAL_UNITS, ROLES, STAFF } from '@/features/keystone/seed/operator'

/**
 * What "Load Maple Ridge" creates, section by section. Each section is one idempotent
 * server command; every record is marked synthetic. Later phases add residents, clinical, billing
 * and workforce sections here.
 */
const nfBeds = NF_UNITS.reduce((sum, unit) => sum + unit.beds, 0)
const apartments = RESIDENTIAL_UNITS.reduce((sum, unit) => sum + unit.count, 0)

export const SETUP_SECTIONS = [
  {
    id: 'operator',
    title: 'Operator, community, places and people',
    mutation: 'mutation LoadOperator($idempotencyKey: String!) { loadOperatorSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadOperatorSetup',
    items: [
      OPERATOR.legalName,
      `${COMMUNITY.name}, ${COMMUNITY.city}, ${COMMUNITY.region}`,
      `${NF_UNITS.length} nursing units, ${nfBeds} licensed beds`,
      `${RESIDENTIAL_UNITS.length} residential wings, ${apartments} apartments`,
      `${PAYERS.length} payers`,
      `${ROLES.length} roles with separated duties`,
      ...STAFF.map((person: { name: string; title: string }) => `${person.name} · ${person.title}`),
      'US federal holiday calendar 2026-2028 and the Ohio rule pack',
      `${APPROVAL_POLICIES.length} maker-checker approval policies`,
    ],
  },
  {
    id: 'census',
    title: 'Residents, census history, sales and family portal',
    mutation: 'mutation LoadCensus($idempotencyKey: String!) { loadCensusSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadCensusSetup',
    items: [
      'About 200 residents across nursing, assisted living, memory care and independent living',
      '60 days of census: admissions, room changes, hospital leaves with bed holds, discharges',
      'Representatives with healthcare and financial authority, and one court-appointed guardian',
      'Family portal accounts with scopes granted by a second staff member',
      'Signed-off midnight census for the last four weeks',
      'Storefront copy, published starting prices and tour times',
      'Hospital referrals, a waitlist with offers, tours and leads at every stage',
      'Break-glass uses with the privacy officer\'s review',
    ],
  },
  {
    id: 'mds',
    title: 'MDS, PDPM and Medicare Part A',
    mutation: 'mutation LoadMds($idempotencyKey: String!) { loadMdsSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadMdsSetup',
    items: [
      'MDS 3.0 item sets V1.19.1 and V1.20.1, chosen by the assessment reference date',
      'FY2026 PDPM case-mix tables and unadjusted federal rates, CY2026 SNF coinsurance ($217.00)',
      '12 Medicare Part A residents in Birch with completed 5-day assessments and their PDPM classification',
    ],
  },
  {
    id: 'workforce',
    title: 'Workforce: staff, credentials and staffing targets',
    mutation: 'mutation LoadWorkforce($idempotencyKey: String!) { loadWorkforceSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadWorkforceSetup',
    items: [
      'Job codes with their shift role: RN, LPN, CNA, medication aide, dietary',
      '11 staff with primary-source verified licences, CPR, background and OIG exclusion checks (one CNA has nothing on file)',
      'Ohio direct-care minimum of 2.5 hours per resident day, and the operator targets',
      'The 2024 federal minimum staffing rule as repealed history (effective 2026-02-02), never a breach',
    ],
  },
] as const
