import { command } from '../lib/command'
import type { Db } from '../lib/db'
import { admitResident } from '../lib/census'
import { addDays, localDate } from '../lib/calendar'
import { loadMdsReference, openMds, saveMdsItems, signMdsSections, completeMds } from '../mds/service'
import { recordSkilledCert } from '../coverage/service'
import { sectionsFor, type ItemSetDefinition } from '../mds/itemSet'
import { GOLDEN_CASES, goldenItems } from '../pdpm/goldenCases'
import { COMMUNITY } from './operator'
import { seedActor } from './census'

/**
 * Phase 4a starting data: the MDS item sets and FY2026 PDPM tables, the community's CBSA, and the golden PDPM cases as invented
 * Medicare Part A residents admitted today from a hospital, each with a completed 5-day assessment that classifies to the
 * hand-checked HIPPS. Every person is fictional. Each resident is its own idempotent command, run by the staff member who would
 * do it (admissions by Patel, the MDS by the coordinator), so a repeated load replays instead of admitting twice.
 */

const ADMISSIONS = 'seed_user_patel'
const MDS_COORDINATOR = 'seed_user_vukovic'
const BIRTH_YEARS = [1938, 1941, 1944, 1936, 1947, 1940, 1943, 1939, 1945, 1942, 1937, 1946]

/** One case per resident (Ada Quill's day-25 case is the same person), as a 5-day: the IPA case is seeded as that resident's 5-day. */
export const SEED_CASES = GOLDEN_CASES.filter(c => !/, day 25$/.test(c.name))

export async function runMdsSeed(db: Db, options: { now?: Date; idempotencyPrefix?: string } = {}) {
  const now = options.now ?? new Date()
  const prefix = options.idempotencyPrefix ?? 'seed-mds-v1'
  const created = { templates: 0, rates: 0, residents: 0, assessments: 0 }
  const coordinator = seedActor(MDS_COORDINATOR)
  const ref = await command(db, { name: 'setup.load_mds_reference', actor: coordinator, idempotencyKey: `${prefix}:reference`, params: {}, now }, async uow => {
    const loaded = await loadMdsReference(uow, coordinator)
    const community = await uow.tx.community.findUnique({ where: { id: COMMUNITY.id }, select: { identifiers: true } })
    const ids = (community?.identifiers ?? {}) as Record<string, string>
    if (community && !ids.cbsa) await uow.tx.community.update({ where: { id: COMMUNITY.id }, data: { identifiers: { ...ids, cbsa: 'cbsa_17460' } } })
    return loaded
  })
  created.templates += ref.value.templates
  created.rates += ref.value.rates
  const community = await db.community.findUnique({ where: { id: COMMUNITY.id }, select: { timeZone: true } })
  if (!community) return created

  // The community's own calendar day: the ARD, the certification and Z0500B are local dates, never tomorrow.
  const today = localDate(community.timeZone ?? 'America/New_York', now)
  for (const [i, c] of SEED_CASES.entries()) {
    const [firstName, lastName] = c.name.split(',')[0].split(' ')
    const result = await command(db, { name: 'setup.mds_case', actor: coordinator, idempotencyKey: `${prefix}:case:${i}`, params: { case: c.name }, serializable: true, now }, async uow => {
      const admissions = seedActor(ADMISSIONS)
      const taken = new Set((await uow.tx.stay.findMany({ where: { status: { in: ['admitted', 'on_leave', 'pending'] }, currentBedId: { not: null } }, select: { currentBedId: true } })).map(s => s.currentBedId))
      const beds = await uow.tx.bed.findMany({
        where: { status: 'available', certification: { in: ['dual', 'medicare'] }, room: { genderPolicy: 'any', unit: { communityId: COMMUNITY.id, setting: 'nursing_facility', secured: false } } },
        orderBy: [{ room: { unit: { code: 'asc' } } }, { label: 'asc' }], select: { id: true },
      })
      const bed = beds.find(b => !taken.has(b.id))
      if (!bed) return { skipped: 'no_bed' }
      const admittedAt = new Date(now.getTime() - 3 * 3600_000)
      const admit = await admitResident(uow, admissions, {
        communityId: COMMUNITY.id, resident: { firstName, lastName, dateOfBirth: `${BIRTH_YEARS[i % BIRTH_YEARS.length]}-0${(i % 9) + 1}-1${i % 9}`, sex: i % 2 ? 'male' : 'female' },
        representatives: [{ firstName: 'Family', lastName, roles: ['healthcare_poa', 'family'], contactPriority: 1 }],
        bedId: bed.id, payerId: 'seed_payer_medicare_a', qualifyingStayFrom: addDays(today, -6), qualifyingStayTo: addDays(today, -1), admissionSource: 'acute_hospital',
        effectiveAt: admittedAt, pasrrLevel1: { completedAt: addDays(today, -2), result: 'Level I negative: Level II not required.' }, idempotencyKey: `${prefix}:admit:${i}`, synthetic: true,
      })
      const stay = await uow.tx.stay.findUniqueOrThrow({ where: { id: admit.stayId }, select: { id: true, coverage: { select: { id: true } } } })
      await recordSkilledCert(uow, admissions, { coverageId: stay.coverage[0].id, signedOn: today, signedBy: 'Dr. Imani Castellanos (fictional)' })
      const opened = await openMds(uow, coordinator, { stayId: stay.id, kind: 'pps_5day', ardDate: today })
      await saveMdsItems(uow, coordinator, { assessmentId: opened.assessmentId, items: { ...goldenItems(c.input), H0300: '1', J0300: '1', B0700: '0', B1000: '0' } })
      const row = await uow.tx.mdsAssessment.findUniqueOrThrow({ where: { id: opened.assessmentId }, select: { itemSetId: true } })
      const set = (await uow.tx.assessmentTemplate.findUniqueOrThrow({ where: { id: row.itemSetId! } })).definition as unknown as ItemSetDefinition
      await signMdsSections(uow, coordinator, { assessmentId: opened.assessmentId, sections: sectionsFor('pps_5day', set), title: 'RN, MDS Coordinator' })
      const done = await completeMds(uow, coordinator, { assessmentId: opened.assessmentId, completedOn: today, aids: c.input.aids })
      return { hipps: done.hipps }
    })
    if ('hipps' in result.value && !result.replay) { created.residents += 1; created.assessments += 1 }
  }
  return created
}
