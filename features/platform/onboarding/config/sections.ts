import { APPROVAL_POLICIES, COMMUNITY, NF_UNITS, OPERATOR, PAYERS, RESIDENTIAL_UNITS, ROLES, STAFF } from '@/features/keystone/seed/operator'

/**
 * What "Load Maple Ridge (fictional)" creates, section by section. Each section is one idempotent
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
      `${OPERATOR.legalName} (fictional)`,
      `${COMMUNITY.name}, ${COMMUNITY.city}, ${COMMUNITY.region}`,
      `${NF_UNITS.length} nursing units, ${nfBeds} licensed beds`,
      `${RESIDENTIAL_UNITS.length} residential wings, ${apartments} apartments`,
      `${PAYERS.length} payers (fictional plans)`,
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
] as const
