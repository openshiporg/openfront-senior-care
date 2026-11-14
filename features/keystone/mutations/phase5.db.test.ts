import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { ALL_DEFAULT, ctx, type Ctx } from '../../../tests/helpers/sessions'
import { ROLES, COMMUNITY } from '../seed/operator'
import type { Permission } from '../access'
import { loadOperatorSetup, loadWorkforceSetup } from './setup'
import { admitResidentMutation } from './census'
import { billingCommand } from './billing'
import { answerShiftOffer, shiftOfferQuery } from './shiftOffer'
import { addDays, localDate } from '../lib/calendar'

/**
 * Phase 5 exit gate against a real database: credential check at assignment, LEIE match, staffing below target,
 * open-shift offer by link, overlap, payroll lock. Every person is invented.
 */
const roleOf = (id: string) => ROLES.find(role => role.id === id)!.permissions as Permission[]
const DAY = (n: number) => addDays(localDate('America/New_York', new Date()), n)
const BRANDVOLD = 'seed_staff_cna_brandvold'
const ABARA = 'seed_staff_cna_abara'

describe.skipIf(!hasTestDatabase)('workforce depth (database)', { timeout: 240_000 }, () => {
  let prisma: PrismaClient
  let admin: Ctx, scheduler: Ctx, hr: Ctx
  const bc = (c: Ctx, op: string, input: Record<string, unknown>, key = uniqueKey(op.replace(/\./g, '-'))) => billingCommand(null, { op, input, idempotencyKey: key }, c as never) as Promise<any>
  const refused = async (p: Promise<unknown>) => p.then(() => { throw new Error('expected a refusal') }, (e: Error) => e.message)
  const shiftOn = async (date: string, role = 'cna', start = '07:00', end = '15:00') => (await bc(scheduler, 'shift.create', { communityId: COMMUNITY.id, role, date, startTime: start, endTime: end })).shiftId as string

  beforeAll(async () => {
    process.env.PHI_AUDIT_SECRET ||= 'test-only-phi-audit-secret-0123456789abcdef'
    process.env.RATE_LIMIT_SECRET ||= 'test-only-rate-limit-secret-0123456789abcdef'
    process.env.SHIFT_OFFER_SECRET ||= 'test-only-shift-offer-secret-0123456789abcdef'
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const owner = await prisma.user.create({ data: { name: 'Owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    admin = ctx(prisma, owner.id, ALL_DEFAULT)
    await loadOperatorSetup(null, { idempotencyKey: uniqueKey('setup') }, admin as never)
    await loadWorkforceSetup(null, { idempotencyKey: uniqueKey('wf') }, admin as never)
    scheduler = ctx(prisma, 'seed_user_durand', roleOf('seed_role_scheduler'))
    hr = ctx(prisma, 'seed_user_marchetti', roleOf('seed_role_hr'))
    await admitResidentMutation(null, {
      input: {
        communityId: COMMUNITY.id, bedId: 'seed_room_bir_110_a', payerId: 'seed_payer_medicare_a', admissionSource: 'acute_hospital', effectiveAt: '2026-08-05T15:00:00Z',
        qualifyingStayFrom: '2026-08-01', qualifyingStayTo: '2026-08-04', pasrrLevel1: { completedAt: '2026-08-03', result: 'Level I negative: Level II not required.' },
        resident: { firstName: 'Odessa', lastName: 'Marlowe', dateOfBirth: '1940-02-11', sex: 'female' }, selfRepresented: true,
      } as never,
      idempotencyKey: uniqueKey('adm'),
    }, admin as never)
  }, 600_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('gate 1: an uncredentialed CNA cannot be assigned, and the refusal names the missing credential', async () => {
    const shift = await shiftOn(DAY(5))
    const message = await refused(bc(scheduler, 'shift.assign', { shiftId: shift, staffMemberId: BRANDVOLD }))
    expect(message).toMatch(/Missing credential/)
    expect(message).toMatch(/CNA registry/)
    expect(await prisma.shiftAssignment.count({ where: { shiftId: shift } })).toBe(0)
    // A credentialed CNA takes the same shift, and the check is kept on the assignment.
    const ok = await bc(scheduler, 'shift.assign', { shiftId: shift, staffMemberId: ABARA })
    const row = await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: ok.assignmentId } })
    expect((row.credentialCheck as { ok: boolean }).ok).toBe(true)
  })

  it('a CNA with the registry entry pending verification is still refused; a clear verification with evidence unlocks them', async () => {
    const cred = await bc(hr, 'credential.save', { staffMemberId: BRANDVOLD, kind: 'cna_registry', jurisdiction: 'OH', number: 'OH-CNA-1', expiresAt: DAY(400) })
    const shift = await shiftOn(DAY(6))
    expect(await refused(bc(scheduler, 'shift.assign', { shiftId: shift, staffMemberId: BRANDVOLD }))).toMatch(/CNA registry \(state nurse aide registry\) \(not verified yet\)/)
    expect(await refused(bc(hr, 'credential.verify', { credentialId: cred.credentialId, source: 'state_registry', result: 'clear', reference: '' }))).toMatch(/evidence/)
    for (const kind of ['cpr', 'background_check_state', 'oig_exclusion']) {
      const c = await bc(hr, 'credential.save', { staffMemberId: BRANDVOLD, kind, expiresAt: kind === 'cpr' ? DAY(300) : null })
      await bc(hr, 'credential.verify', { credentialId: c.credentialId, source: 'manual', result: 'clear', reference: `REF-${kind}` })
    }
    await bc(hr, 'credential.verify', { credentialId: cred.credentialId, source: 'state_registry', result: 'clear', reference: 'OH-REG-CONF-77' })
    await bc(scheduler, 'shift.assign', { shiftId: shift, staffMemberId: BRANDVOLD })
    // A credential cannot be marked verified behind the service's back.
    const pending = await prisma.credential.create({ data: { communityId: COMMUNITY.id, staffMemberId: ABARA, kind: 'tb_screen', status: 'pending_verification' } })
    await expect(prisma.credential.update({ where: { id: pending.id }, data: { status: 'verified' } })).rejects.toThrow()
  })

  it('refuses an overlapping assignment, and the database refuses it too', async () => {
    const early = await shiftOn(DAY(8), 'cna', '07:00', '15:00')
    const overlapping = await shiftOn(DAY(8), 'cna', '11:00', '19:00')
    await bc(scheduler, 'shift.assign', { shiftId: early, staffMemberId: ABARA })
    expect(await refused(bc(scheduler, 'shift.assign', { shiftId: overlapping, staffMemberId: ABARA }))).toMatch(/Already assigned/)
    const first = await prisma.shiftAssignment.findFirstOrThrow({ where: { shiftId: early } })
    await expect(prisma.shiftAssignment.create({ data: { communityId: COMMUNITY.id, shiftId: overlapping, staffMemberId: ABARA, status: 'assigned', startsAt: first.startsAt, endsAt: first.endsAt } })).rejects.toThrow()
  })

  it('open-shift offer: a link the scheduler copies, accepted in the request, once', async () => {
    const shift = await shiftOn(DAY(9), 'cna', '15:00', '23:00')
    const offer = await bc(scheduler, 'shift.offer', { shiftId: shift, staffMemberId: 'seed_staff_cna_lindgren' })
    const token = String(offer.link).replace('/shift-offer/', '')
    const stored = await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: offer.assignmentId } })
    expect(stored.offerTokenHash).not.toBe(token)
    expect(stored.offerTokenHash).toHaveLength(64)
    const anon = { session: undefined, prisma, req: { headers: {}, socket: { remoteAddress: `10.0.0.${Math.floor(Math.random() * 200)}` } } }
    expect((await shiftOfferQuery(null, { token }, anon as never) as any).valid).toBe(true)
    expect((await shiftOfferQuery(null, { token: `${token}x` }, anon as never) as any).valid).toBe(false)
    expect((await answerShiftOffer(null, { token, answer: 'accept' }, anon as never) as any).status).toBe('assigned')
    expect(await refused(answerShiftOffer(null, { token, answer: 'accept' }, anon as never) as Promise<unknown>)).toMatch(/already accepted|no longer valid|not valid/)
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift } })).status).toBe('filled')
  })

  it('gate 2: an LEIE match blocks scheduling that person and creates an HR task', async () => {
    const future = await shiftOn(DAY(10), 'cna', '07:00', '15:00')
    await bc(scheduler, 'shift.assign', { shiftId: future, staffMemberId: 'seed_staff_cna_petrov' })
    const header = 'LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE'
    const file = `${header}\n"Petrov","Gideon","","","NURSING SERVICES","NURSE/NURSES AIDE","","","19900101","1 MAIN ST","COLUMBUS","OH","43215","1128a1","20260301","00000000","00000000",""\n"Nobody","Else","","","","","","","","","","","","1128b4","20200101","00000000","00000000",""\n`
    const result = await bc(hr, 'leie.import', { communityId: COMMUNITY.id, month: '2026-11', text: file })
    expect(result.matches.map((m: { name: string }) => m.name)).toEqual(['Gideon Petrov, CNA'])
    const cred = await prisma.credential.findFirstOrThrow({ where: { staffMemberId: 'seed_staff_cna_petrov', kind: 'oig_exclusion' } })
    expect(cred.status).toBe('revoked')
    const hrTask = await prisma.task.findFirst({ where: { dedupeKey: { startsWith: 'leie:2026-11:seed_staff_cna_petrov:hr' } } })
    expect(hrTask?.ownerRole).toBe('Human Resources')
    expect(hrTask?.title).toMatch(/OIG exclusion list match/)
    const moved = await prisma.shiftAssignment.findFirstOrThrow({ where: { shiftId: future, staffMemberId: 'seed_staff_cna_petrov' } })
    expect(moved.status).toBe('needs_coverage')
    const other = await shiftOn(DAY(11))
    const message = await refused(bc(scheduler, 'shift.assign', { shiftId: other, staffMemberId: 'seed_staff_cna_petrov' }))
    expect(message).toMatch(/OIG exclusion check \(revoked\)/)
    expect(await refused(bc(hr, 'leie.import', { communityId: COMMUNITY.id, month: '2026-11', text: file }))).toMatch(/already imported/)
    await expect(prisma.credentialVerification.deleteMany({})).rejects.toThrow()
  })

  it('gate 3: a staffing day below target raises a Finding and a task to the scheduler', async () => {
    const date = DAY(12)
    const shift = await shiftOn(date, 'cna', '07:00', '09:00')
    await bc(scheduler, 'shift.assign', { shiftId: shift, staffMemberId: 'seed_staff_cna_halloran' })
    const out = await bc(scheduler, 'staffing.compute', { communityId: COMMUNITY.id, from: date, days: 1 })
    expect(out.days[0].status).toBe('breached')
    const day = await prisma.staffingDay.findFirstOrThrow({ where: { communityId: COMMUNITY.id, date: new Date(`${date}T00:00:00Z`) } })
    expect(day.status).toBe('breached')
    const finding = await prisma.finding.findFirstOrThrow({ where: { dedupeKey: `staffing:${COMMUNITY.id}:${date}` } })
    expect(finding.status).toBe('open')
    const task = await prisma.task.findFirstOrThrow({ where: { subjectType: 'Finding', subjectId: finding.id } })
    expect(task.ownerRole).toBe('Scheduler')
    // The Scheduler cannot open the Finding, so the task carries the facts itself.
    expect(task.title).toContain(date)
    expect(task.title).toMatch(/Direct care HPRD \d\.\d\d against 2\.50 \(Ohio\), census 1\b/)
    expect(task.detail).toMatch(/Census 1 residents/)
    expect(task.detail).toMatch(/operator policy/)
    expect(finding.taskId).toBe(task.id)
    expect(JSON.stringify(day.breaches)).toMatch(/jurisdiction_pack/)
    // The repealed federal rule never raises a breach.
    const fed = await prisma.staffingTarget.findMany({ where: { status: 'repealed' } })
    expect(fed.length).toBeGreaterThan(0)
    expect(JSON.stringify(day.breaches)).not.toMatch(/3\.48/)
    // Running it again does not duplicate.
    await bc(scheduler, 'staffing.compute', { communityId: COMMUNITY.id, from: date, days: 1 })
    expect(await prisma.finding.count({ where: { dedupeKey: `staffing:${COMMUNITY.id}:${date}` } })).toBe(1)
    expect(await prisma.task.count({ where: { subjectType: 'Finding', subjectId: finding.id } })).toBe(1)
  })

  it('payroll: only a finished Monday-to-Sunday period with approved timecards locks, once', async () => {
    const future = await refused(bc(hr, 'payroll.export', { communityId: COMMUNITY.id, periodStart: '2030-01-07', periodEnd: '2030-01-13' }))
    expect(future).toMatch(/not ended/)
    expect(await refused(bc(hr, 'payroll.export', { communityId: COMMUNITY.id, periodStart: '2026-08-04', periodEnd: '2026-08-09' }))).toMatch(/Monday/)
    expect(await refused(bc(hr, 'payroll.export', { communityId: COMMUNITY.id, periodStart: '2026-08-03', periodEnd: '2026-08-09' }))).toMatch(/no approved hours/)
  })
})
