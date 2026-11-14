import type { Actor } from '../lib/actor'
import { auditCreate } from '../lib/cas'
import type { UnitOfWork } from '../lib/unitOfWork'
import { saveCredential, verifyCredential } from '../scheduling/service'
import { COMMUNITY } from './operator'
import { seedMeta } from './platform'

/**
 * Phase 5 starting data for Maple Ridge: job codes with their shift role, a roster of invented staff with verified
 * credentials, and the staffing targets. The federal minimum-staffing rule is loaded as repealed history only (HHS interim final
 * rule effective 2026-02-02); Ohio's direct-care rule and the operator's own policy drive breaches. Idempotent: rows have
 * deterministic ids and are created only when missing.
 */

const day = (date: string) => new Date(`${date}T00:00:00Z`)

const JOBS = [
  ['seed_job_rn', 'RN', 'Registered Nurse', '7', 'rn', true],
  ['seed_job_lpn', 'LPN', 'Licensed Practical Nurse', '9', 'lpn', true],
  ['seed_job_cna', 'CNA', 'Certified Nurse Aide', '10', 'cna', true],
  ['seed_job_med', 'MED', 'Medication Aide', '12', 'med_aide', true],
  ['seed_job_dining', 'DIET', 'Dietary Aide', '40', 'other', false],
] as const

/** [id, name, job, payType, credentialed] — credentialed=false leaves the person with nothing on file. */
const ROSTER = [
  ['seed_staff_rn_okafor', 'Adaeze Okafor, RN', 'seed_job_rn', 'exempt', true],
  ['seed_staff_rn_whitlow', 'Brent Whitlow, RN', 'seed_job_rn', 'non_exempt', true],
  ['seed_staff_lpn_marsh', 'Corinne Marsh, LPN', 'seed_job_lpn', 'non_exempt', true],
  ['seed_staff_lpn_tran', 'Danh Tran, LPN', 'seed_job_lpn', 'non_exempt', true],
  ['seed_staff_cna_abara', 'Esperanza Abara, CNA', 'seed_job_cna', 'non_exempt', true],
  ['seed_staff_cna_lindgren', 'Folasade Lindgren, CNA', 'seed_job_cna', 'non_exempt', true],
  ['seed_staff_cna_petrov', 'Gideon Petrov, CNA', 'seed_job_cna', 'non_exempt', true],
  ['seed_staff_cna_halloran', 'Harriet Halloran, CNA', 'seed_job_cna', 'non_exempt', true],
  ['seed_staff_cna_fenwick', 'Marcus Fenwick, CNA', 'seed_job_cna', 'non_exempt', true],
  ['seed_staff_cna_brandvold', 'Tessa Brandvold, CNA', 'seed_job_cna', 'non_exempt', false],
  ['seed_staff_med_ibarra', 'Isidro Ibarra, Medication Aide', 'seed_job_med', 'non_exempt', true],
] as const

const OHIO_PACK_TARGET = { metric: 'direct_care_hprd', value: '2.50', ruleRef: 'ORC 3721.04 and Ohio Adm. Code 3701-17-08: a minimum daily average of 2.5 hours of direct care per resident (RN, LPN and nurse aides)' }
const FEDERAL_REPEALED = [
  { metric: 'total_nurse_hprd', value: '3.48' },
  { metric: 'rn_hprd', value: '0.55' },
  { metric: 'cna_hprd', value: '2.45' },
] as const
const OPERATOR_TARGETS = [
  { metric: 'total_nurse_hprd', value: '3.20' },
  { metric: 'rn_hprd', value: '0.45' },
] as const

export async function seedWorkforce(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  const created = { jobCodes: 0, staff: 0, credentials: 0, targets: 0 }
  const communityId = COMMUNITY.id
  if (!(await tx.community.findUnique({ where: { id: communityId }, select: { id: true } }))) return created

  for (const [id, code, title, pbj, category, nursing] of JOBS) {
    const have = await tx.jobCode.findUnique({ where: { id }, select: { id: true } })
    if (have) { await tx.jobCode.update({ where: { id }, data: { category } }); continue }
    if (await tx.jobCode.findFirst({ where: { communityId, code } })) continue
    await tx.jobCode.create({ data: { id, communityId, code, title, pbjJobTitleCode: pbj, countsTowardNursing: nursing, category, status: 'active' } })
    auditCreate(uow, actor, 'JobCode', id, 'jobcode.created', { code }, seedMeta)
    created.jobCodes += 1
  }

  for (const [id, name, jobCodeId, payType, credentialed] of ROSTER) {
    if (await tx.staffMember.findUnique({ where: { id }, select: { id: true } })) continue
    const employeeId = id.replace('seed_staff_', 'E-').toUpperCase().slice(0, 28)
    await tx.staffMember.create({ data: { id, communityId, name, employeeId, jobCodeId, payType, hireDate: day('2024-03-04'), status: 'active' } })
    auditCreate(uow, actor, 'StaffMember', id, 'staff.created', { employeeId }, seedMeta)
    created.staff += 1
    if (!credentialed) continue
    const category = JOBS.find(j => j[0] === jobCodeId)![4]
    const kinds: [string, string | null][] = [
      [{ rn: 'rn_licence', lpn: 'lpn_licence', cna: 'cna_registry', med_aide: 'med_aide_cert', other: 'cpr' }[category]!, '2027-09-30'],
      ['cpr', '2027-03-31'],
      ['background_check_state', null],
      ['oig_exclusion', null],
    ]
    for (const [kind, expiresAt] of [...new Map(kinds).entries()]) {
      const { credentialId } = await saveCredential(uow, actor, { staffMemberId: id, kind, jurisdiction: kind.endsWith('licence') || kind === 'cna_registry' || kind === 'med_aide_cert' ? 'OH' : 'US', number: `${kind.toUpperCase().slice(0, 6)}-${id.slice(-5).toUpperCase()}`, issuedAt: '2024-02-01', expiresAt, document: `${kind}-${id.slice(-5)}.pdf` })
      await verifyCredential(uow, actor, { credentialId, source: kind === 'oig_exclusion' ? 'manual' : kind === 'background_check_state' ? 'background_vendor' : 'state_registry', result: 'clear', reference: `ON-FILE-${id.slice(-5).toUpperCase()}`, note: 'Primary source on file at hire.' })
      created.credentials += 1
    }
  }

  const targets: { source: string; metric: string; value: string; status: string; ruleRef: string; from: string; to: string | null; note: string }[] = [
    { source: 'jurisdiction_pack', ...OHIO_PACK_TARGET, status: 'active', from: '2026-01-01', to: null, note: 'Ohio state minimum, enforced through licensure by the Ohio Department of Health. Verify with counsel.' },
    ...FEDERAL_REPEALED.map(t => ({ source: 'jurisdiction_pack', ...t, status: 'repealed', ruleRef: '42 CFR 483.35(b)(1) as added 2024. Repealed by the HHS interim final rule of 2025-12-02, effective 2026-02-02.', from: '2024-04-22', to: '2026-02-01', note: 'History only. The federal minimum is repealed and never raises a breach.' })),
    ...OPERATOR_TARGETS.map(t => ({ source: 'operator_policy', ...t, status: 'active', ruleRef: 'Operator staffing policy', from: '2026-01-01', to: null, note: 'Maple Ridge target, set by the Executive Director and DON.' })),
  ]
  for (const t of targets) {
    const id = `seed_target_${t.source === 'operator_policy' ? 'op' : t.status === 'repealed' ? 'fed' : 'oh'}_${t.metric}`
    if (await tx.staffingTarget.findUnique({ where: { id }, select: { id: true } })) continue
    await tx.staffingTarget.create({ data: { id, communityId, source: t.source, metric: t.metric, value: t.value, status: t.status, ruleRef: t.ruleRef, effectiveFrom: day(t.from), effectiveTo: t.to ? day(t.to) : null, note: t.note } })
    auditCreate(uow, actor, 'StaffingTarget', id, 'staffing.target_loaded', { metric: t.metric, value: t.value, status: t.status }, seedMeta)
    created.targets += 1
  }
  return created
}
