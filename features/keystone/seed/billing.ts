import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { COMMUNITY } from './operator'
import { seedMeta } from './platform'
import { OH_BILLING_RULES } from './packs'

/**
 * Phase 3 starting data for Maple Ridge: care levels, published rate schedules for assisted living and memory care, the
 * ancillary charge list and the resident funds trust account. Every figure is invented. Idempotent: rows are keyed by
 * deterministic ids and created only when missing, and nothing already edited is overwritten. The schedules are loaded
 * already published (a seeded starting position); changing them afterwards goes through the maker-checker publish.
 */

const day = (date: string) => new Date(`${date}T00:00:00Z`)

const CARE_LEVELS = [
  { id: 'seed_care_al_1', code: 'AL1', name: 'Level 1 assistance', setting: 'assisted_living', minPoints: 0, maxPoints: 9 },
  { id: 'seed_care_al_2', code: 'AL2', name: 'Level 2 assistance', setting: 'assisted_living', minPoints: 10, maxPoints: 19 },
  { id: 'seed_care_al_3', code: 'AL3', name: 'Level 3 assistance', setting: 'assisted_living', minPoints: 20, maxPoints: 40 },
  { id: 'seed_care_mc_1', code: 'MC1', name: 'Memory care level 1', setting: 'memory_care', minPoints: 0, maxPoints: 14 },
  { id: 'seed_care_mc_2', code: 'MC2', name: 'Memory care level 2', setting: 'memory_care', minPoints: 15, maxPoints: 40 },
] as const

/** Monthly amounts in cents. */
const AL_LINES: [string, string | null, string | null, number][] = [
  ['apartment_rent', 'seed_apt_studio', null, 485_000],
  ['apartment_rent', 'seed_apt_one_bed', null, 595_000],
  ['apartment_rent', 'seed_apt_companion', null, 665_000],
  ['care_level', null, 'seed_care_al_1', 95_000],
  ['care_level', null, 'seed_care_al_2', 185_000],
  ['care_level', null, 'seed_care_al_3', 295_000],
  ['second_person', null, null, 120_000],
  ['med_management', null, null, 45_000],
]
const MC_LINES: [string, string | null, string | null, number][] = [
  ['apartment_rent', 'seed_apt_mc_suite', null, 560_000],
  ['care_level', null, 'seed_care_mc_1', 340_000],
  ['care_level', null, 'seed_care_mc_2', 480_000],
  ['med_management', null, null, 45_000],
]

const CHARGE_ITEMS = [
  { id: 'seed_charge_item_beauty', code: 'BEAUTY', name: 'Salon visit', kind: 'ancillary', unitPriceMinor: 3_500n },
  { id: 'seed_charge_item_laundry', code: 'LAUNDRY', name: 'Personal laundry, per month', kind: 'ancillary', unitPriceMinor: 6_000n },
  { id: 'seed_charge_item_community_fee', code: 'COMMFEE', name: 'Community fee', kind: 'community_fee', unitPriceMinor: 250_000n },
  { id: 'seed_charge_item_late', code: 'LATE', name: 'Late payment fee', kind: 'late_fee', unitPriceMinor: 2_500n },
] as const

export async function seedBilling(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  const created = { careLevels: 0, schedules: 0, rateLines: 0, chargeItems: 0, trustAccounts: 0 }
  const communityId = COMMUNITY.id
  if (!(await tx.community.findUnique({ where: { id: communityId }, select: { id: true } }))) return created

  // The Ohio pack gains its billing rules without touching anything already in it.
  const ohio = await tx.jurisdictionPack.findUnique({ where: { code: 'US-OH' }, select: { id: true, rules: true } })
  if (ohio) {
    const have = (ohio.rules ?? {}) as Record<string, unknown>
    const missing = Object.entries(OH_BILLING_RULES).filter(([key]) => !(key in have))
    if (missing.length) {
      await tx.jurisdictionPack.update({ where: { id: ohio.id }, data: { rules: { ...have, ...Object.fromEntries(missing) } as never } })
      auditCreate(uow, actor, 'JurisdictionPack', ohio.id, 'pack.billing_rules_loaded', { keys: missing.map(([key]) => key) }, seedMeta)
    }
  }

  for (const level of CARE_LEVELS) {
    if (await tx.careLevel.findUnique({ where: { id: level.id }, select: { id: true } })) continue
    await tx.careLevel.create({ data: { ...level, communityId, status: 'active' } })
    created.careLevels += 1
  }

  for (const [id, name, setting, lines] of [
    ['seed_rates_al_2026', 'Assisted living 2026', 'assisted_living', AL_LINES],
    ['seed_rates_mc_2026', 'Memory care 2026', 'memory_care', MC_LINES],
  ] as const) {
    if (await tx.rateSchedule.findUnique({ where: { id }, select: { id: true } })) continue
    await tx.rateSchedule.create({ data: { id, communityId, name, setting, effectiveFrom: day('2026-01-01'), noticeDays: 30, status: 'draft' } })
    auditCreate(uow, actor, 'RateSchedule', id, 'rate_schedule.seeded', { setting }, seedMeta)
    created.schedules += 1
    await tx.rateLine.createMany({
      data: lines.map(([kind, apartmentTypeId, careLevelId, amountMinor]) => ({ scheduleId: id, kind, apartmentTypeId, careLevelId, amountMinor: BigInt(amountMinor), per: 'month', proration: 'actual_days_in_month' })),
    })
    created.rateLines += lines.length
    await tx.rateSchedule.update({ where: { id }, data: { status: 'published', publishedAt: uow.now } })
  }

  for (const item of CHARGE_ITEMS) {
    if (await tx.chargeItem.findUnique({ where: { id: item.id }, select: { id: true } })) continue
    await tx.chargeItem.create({ data: { ...item, communityId, status: 'active' } })
    created.chargeItems += 1
  }

  if (!(await tx.trustAccount.findUnique({ where: { id: 'seed_trust_account_maple_ridge' }, select: { id: true } }))) {
    await tx.trustAccount.create({ data: { id: 'seed_trust_account_maple_ridge', communityId, name: 'Resident funds', bankName: 'Ohio Valley Bank', last4: '7712', status: 'active' } })
    created.trustAccounts += 1
  }
  return created
}
