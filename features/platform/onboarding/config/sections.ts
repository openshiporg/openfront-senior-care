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
] as const
