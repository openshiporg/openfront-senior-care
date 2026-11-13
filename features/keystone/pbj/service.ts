import { actorUserId, type Actor } from '../lib/actor'
import { addDays, localDate } from '../lib/calendar'
import { sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import { assertCanDecide, assertIndependentComplianceReview } from '../lib/separationOfDuties'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { buildPbjXml, fiscalQuarter, PAY_TYPE_CODE, PBJ_JOB_TITLES, validatePbj, weekStartOf, workedMinutes, type PbjFile, type PbjHourRow, type Punch } from './pbj'
import { NHSN_TEMPLATE_NOTE, rpvCsv, rpvRow, seasonStart, validateRpv, vaccinatedSet, weekEnd, type RpvInput } from '../nhsn/rpv'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
const KINDS = ['in', 'out', 'break_start', 'break_end']

async function zoneOf(tx: Tx, communityId: string) {
  return (await tx.community.findUniqueOrThrow({ where: { id: communityId }, select: { timeZone: true } })).timeZone || 'America/New_York'
}

/* ---- Staff and job codes ----------------------------------------------------------------------------------------- */

export async function saveJobCode(uow: UnitOfWork, actor: Actor, input: { communityId: string; code: string; title: string; pbjJobTitleCode?: string | null; countsTowardNursing?: boolean }) {
  const code = input.code.trim()
  if (!code || !input.title.trim()) throw new DomainError(Codes.INVALID_INPUT, 'A job code needs a code and a title.')
  if (input.pbjJobTitleCode && !PBJ_JOB_TITLES[input.pbjJobTitleCode]) throw new DomainError(Codes.INVALID_INPUT, 'The CMS job title code must be 1 to 40.', { field: 'pbjJobTitleCode' })
  const existing = await uow.tx.jobCode.findFirst({ where: { communityId: input.communityId, code } })
  const data = { title: input.title.trim(), pbjJobTitleCode: input.pbjJobTitleCode ?? '', countsTowardNursing: Boolean(input.countsTowardNursing) }
  const row = existing ? await uow.tx.jobCode.update({ where: { id: existing.id }, data }) : await uow.tx.jobCode.create({ data: { communityId: input.communityId, code, ...data } })
  auditCreate(uow, actor, 'JobCode', row.id, existing ? 'jobcode.updated' : 'jobcode.created', { code, ...data })
  return { jobCodeId: row.id }
}

export async function saveStaffMember(uow: UnitOfWork, actor: Actor, input: { communityId: string; employeeId: string; name: string; jobCodeId: string; payType: string; agency?: boolean; hireDate?: string | null; terminationDate?: string | null; userId?: string | null }) {
  if (!['exempt', 'non_exempt', 'contract'].includes(input.payType)) throw new DomainError(Codes.INVALID_INPUT, 'Pay type must be exempt, non_exempt or contract.', { field: 'payType' })
  if (!/^[a-zA-Z0-9_,.\-\\ ]{1,30}$/.test(input.employeeId)) throw new DomainError(Codes.INVALID_INPUT, 'The employee id may use letters, digits and _ , . - \\ space, up to 30 characters. Never use a Social Security number.', { field: 'employeeId' })
  const job = await uow.tx.jobCode.findFirst({ where: { id: input.jobCodeId, communityId: input.communityId } })
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Job code not found.')
  const existing = await uow.tx.staffMember.findFirst({ where: { communityId: input.communityId, employeeId: input.employeeId } })
  const data = { name: input.name.trim(), jobCodeId: job.id, payType: input.payType, agency: Boolean(input.agency), hireDate: input.hireDate ? day(input.hireDate) : null, terminationDate: input.terminationDate ? day(input.terminationDate) : null, userId: input.userId ?? null, status: input.terminationDate ? 'terminated' : 'active' }
  const row = existing ? await uow.tx.staffMember.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } }) : await uow.tx.staffMember.create({ data: { communityId: input.communityId, employeeId: input.employeeId, ...data } })
  auditCreate(uow, actor, 'StaffMember', row.id, existing ? 'staff.updated' : 'staff.created', { employeeId: input.employeeId, jobCode: job.code })
  return { staffMemberId: row.id }
}

/* ---- Punch import ------------------------------------------------------------------------------------------------ */

/** CSV: employeeId,kind,observedAt(ISO 8601 with zone),source. The same punch twice is written once (punchHash is unique). */
export async function importPunches(uow: UnitOfWork, actor: Actor, input: { communityId: string; csv: string }) {
  const lines = input.csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2 || !/^employeeId\s*,\s*kind\s*,\s*observedAt/i.test(lines[0])) throw new DomainError(Codes.INVALID_INPUT, 'The first line must be: employeeId,kind,observedAt,source', { field: 'csv' })
  const staff = new Map((await uow.tx.staffMember.findMany({ where: { communityId: input.communityId } })).map(s => [s.employeeId, s.id]))
  const batch = sha256(input.csv).slice(0, 16)
  let added = 0, repeated = 0
  const rejected: { line: number; reason: string }[] = []
  for (const [i, line] of lines.slice(1).entries()) {
    const [employeeId, kind, observed, source = 'import'] = line.split(',').map(s => s.trim())
    const staffMemberId = staff.get(employeeId)
    const at = new Date(observed)
    if (!staffMemberId) { rejected.push({ line: i + 2, reason: `Unknown employee id ${employeeId || '(blank)'}.` }); continue }
    if (!KINDS.includes(kind)) { rejected.push({ line: i + 2, reason: `Kind ${kind} is not in, out, break_start or break_end.` }); continue }
    if (!/(Z|[+-]\d\d:?\d\d)$/.test(observed) || Number.isNaN(at.getTime())) { rejected.push({ line: i + 2, reason: 'The time needs a date, time and zone, e.g. 2026-08-03T07:02:00-04:00.' }); continue }
    if (at.getTime() > uow.now.getTime() + 5 * 60_000) { rejected.push({ line: i + 2, reason: 'A punch cannot be in the future.' }); continue }
    const punchHash = sha256(`${input.communityId}|${staffMemberId}|${kind}|${at.toISOString()}`)
    if (await uow.tx.timePunch.findUnique({ where: { punchHash } })) { repeated += 1; continue }
    await uow.tx.timePunch.create({ data: { communityId: input.communityId, staffMemberId, kind, observedAt: at, source: ['kiosk', 'mobile', 'geofence'].includes(source) ? source : 'import', punchHash, batch, recordedById: actorUserId(actor) } })
    added += 1
  }
  auditCreate(uow, actor, 'TimePunch', batch, 'timepunch.imported', { added, repeated, rejected: rejected.length })
  return { added, repeated, rejected, batch }
}

export async function requestCorrection(uow: UnitOfWork, actor: Actor, input: { staffMemberId: string; kind: string; observedAt: string; reason: string }) {
  if (!KINDS.includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Kind must be in, out, break_start or break_end.', { field: 'kind' })
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the punch is being added.', { field: 'reason' })
  const at = new Date(input.observedAt)
  if (Number.isNaN(at.getTime()) || !/(Z|[+-]\d\d:?\d\d)$/.test(input.observedAt)) throw new DomainError(Codes.INVALID_INPUT, 'The time needs a date, time and zone.', { field: 'observedAt' })
  const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: input.staffMemberId } })
  const row = await uow.tx.timeCorrection.create({ data: { communityId: staff.communityId, staffMemberId: staff.id, kind: input.kind, observedAt: at, reason: input.reason.trim(), status: 'requested', requestedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'TimeCorrection', row.id, 'timecorrection.requested', { staff: staff.employeeId, kind: input.kind })
  return { correctionId: row.id }
}

/** Requester ≠ approver. An approved correction adds one punch (source "correction") and reopens an approved timecard for that week. */
export async function decideCorrection(uow: UnitOfWork, actor: Actor, input: { correctionId: string; decision: 'approved' | 'rejected'; note?: string }) {
  if (!['approved', 'rejected'].includes(input.decision)) throw new DomainError(Codes.INVALID_INPUT, 'Decide approved or rejected.', { field: 'decision' })
  const row = await transition(uow, {
    model: 'TimeCorrection', id: input.correctionId, from: ['requested'], to: input.decision, actor, eventType: `timecorrection.${input.decision}`, reason: input.note ?? null,
    data: { decidedById: actorUserId(actor), decidedAt: uow.now, decisionNote: input.note?.trim() ?? '' },
    guard: r => assertCanDecide(actor, r.requestedById as string | null),
  })
  if (input.decision === 'approved') {
    const c = row as unknown as { id: string; communityId: string; staffMemberId: string; kind: string; observedAt: Date }
    const punchHash = sha256(`${c.communityId}|${c.staffMemberId}|${c.kind}|${c.observedAt.toISOString()}`)
    if (!(await uow.tx.timePunch.findUnique({ where: { punchHash } }))) {
      await uow.tx.timePunch.create({ data: { communityId: c.communityId, staffMemberId: c.staffMemberId, kind: c.kind, observedAt: c.observedAt, source: 'correction', punchHash, correctionId: c.id, recordedById: actorUserId(actor) } })
    }
    const zone = await zoneOf(uow.tx, c.communityId)
    const week = weekStartOf(localDate(zone, c.observedAt))
    const card = await uow.tx.timecard.findFirst({ where: { staffMemberId: c.staffMemberId, weekStart: day(week) } })
    if (card && card.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, `The week of ${week} is already ${card.status}. Rebuild it after the exported file is superseded.`, { reason: 'week_closed' })
  }
  return { correctionId: input.correctionId, status: input.decision }
}

/* ---- Timecards --------------------------------------------------------------------------------------------------- */

/** Builds (or rebuilds while open) one person's week from the punches. */
export async function buildTimecard(uow: UnitOfWork, actor: Actor, input: { staffMemberId: string; weekStart: string }) {
  const week = weekStartOf(input.weekStart)
  if (week !== input.weekStart) throw new DomainError(Codes.INVALID_INPUT, 'A week starts on a Monday.', { field: 'weekStart' })
  const staff = await uow.tx.staffMember.findUniqueOrThrow({ where: { id: input.staffMemberId } })
  const zone = await zoneOf(uow.tx, staff.communityId!)
  const existing = await uow.tx.timecard.findFirst({ where: { staffMemberId: staff.id, weekStart: day(week) } })
  if (existing && existing.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, `This week is ${existing.status}.`, { reason: 'not_open' })
  // A shift that began in the previous week can end in this one, so start from the Sunday before and keep only this week's days.
  const from = new Date(`${addDays(week, -1)}T00:00:00Z`)
  const to = new Date(`${addDays(week, 8)}T00:00:00Z`)
  const punches = await uow.tx.timePunch.findMany({ where: { staffMemberId: staff.id, observedAt: { gte: from, lt: to } }, orderBy: { observedAt: 'asc' } })
  const result = workedMinutes(punches.map(p => ({ kind: p.kind as Punch['kind'], observedAt: p.observedAt })), zone)
  const dayMinutes: Record<string, number> = {}
  for (let i = 0; i < 7; i += 1) { const d = addDays(week, i); if (result.minutes[d]) dayMinutes[d] = result.minutes[d] }
  const total = Object.values(dayMinutes).reduce((n, m) => n + m, 0)
  const data = { dayMinutes: dayMinutes as never, totalMinutes: total, issues: result.issues as never }
  const card = existing
    ? await uow.tx.timecard.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : await uow.tx.timecard.create({ data: { communityId: staff.communityId, staffMemberId: staff.id, weekStart: day(week), status: 'open', ...data } })
  if (!existing) auditCreate(uow, actor, 'Timecard', card.id, 'timecard.built', { staff: staff.employeeId, week, totalMinutes: total })
  return { timecardId: card.id, totalMinutes: total, issues: result.issues }
}

export async function submitTimecard(uow: UnitOfWork, actor: Actor, input: { timecardId: string }) {
  await transition(uow, {
    model: 'Timecard', id: input.timecardId, from: ['open'], to: 'submitted', actor, eventType: 'timecard.submitted', data: { submittedById: actorUserId(actor) },
    guard: row => { if (((row.issues ?? []) as unknown[]).length) throw new DomainError(Codes.GUARD_FAILED, 'Fix the punch problems on this timecard first (add a correction).', { reason: 'issues', issues: row.issues }) },
  })
  return { timecardId: input.timecardId, status: 'submitted' }
}

/** Submitter ≠ approver (service guard and database check), and nobody approves their own card. */
export async function approveTimecard(uow: UnitOfWork, actor: Actor, input: { timecardId: string }) {
  await transition(uow, {
    model: 'Timecard', id: input.timecardId, from: ['submitted'], to: 'approved', actor, eventType: 'timecard.approved', data: { approvedById: actorUserId(actor), approvedAt: uow.now },
    guard: async row => {
      assertCanDecide(actor, row.submittedById as string | null)
      const staff = await uow.tx.staffMember.findUnique({ where: { id: row.staffMemberId as string }, select: { userId: true } })
      assertIndependentComplianceReview('Timecard', staff?.userId, actorUserId(actor) ?? '', 'approved')
    },
  })
  return { timecardId: input.timecardId, status: 'approved' }
}

export async function reopenTimecard(uow: UnitOfWork, actor: Actor, input: { timecardId: string; reason: string }) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the timecard is reopened.', { field: 'reason' })
  const card = await uow.tx.timecard.findUniqueOrThrow({ where: { id: input.timecardId } })
  if (card.status === 'exported') throw new DomainError(Codes.GUARD_FAILED, 'This week is in an exported PBJ file. Reopen it only after replacing that file.', { reason: 'exported' })
  await transition(uow, { model: 'Timecard', id: input.timecardId, from: ['submitted', 'approved'], to: 'open', actor, eventType: 'timecard.reopened', reason: input.reason.trim(), data: { approvedById: null, approvedAt: null, submittedById: null } })
  return { timecardId: input.timecardId, status: 'open' }
}

/* ---- PBJ quarter ------------------------------------------------------------------------------------------------- */

export async function openPbjQuarter(uow: UnitOfWork, actor: Actor, input: { communityId: string; date: string }) {
  const q = fiscalQuarter(input.date)
  const existing = await uow.tx.pbjQuarter.findFirst({ where: { communityId: input.communityId, federalFiscalYear: q.fiscalYear, quarter: q.quarter } })
  if (existing) return { quarterId: existing.id, reference: existing.reference, existing: true }
  const reference = `PBJ-FY${q.fiscalYear}-Q${q.quarter}`
  const row = await uow.tx.pbjQuarter.create({ data: { communityId: input.communityId, reference, federalFiscalYear: q.fiscalYear, quarter: q.quarter, startDate: day(q.start), endDate: day(q.end), dueOn: day(q.dueOn), status: 'open' } })
  auditCreate(uow, actor, 'PbjQuarter', row.id, 'pbj.opened', { reference, dueOn: q.dueOn })
  return { quarterId: row.id, reference, existing: false }
}

async function pbjFileFor(tx: Tx, quarterId: string) {
  const quarter = await tx.pbjQuarter.findUniqueOrThrow({ where: { id: quarterId } })
  const community = await tx.community.findUniqueOrThrow({ where: { id: quarter.communityId! } })
  const ids = (community.identifiers ?? {}) as Record<string, string>
  const start = iso(quarter.startDate), end = iso(quarter.endDate)
  const staff = await tx.staffMember.findMany({ where: { communityId: quarter.communityId! }, include: { jobCode: true } })
  const cards = await tx.timecard.findMany({ where: { communityId: quarter.communityId!, weekStart: { gte: day(addDays(start, -6)), lte: day(end) } } })
  const inQuarter = (c: { weekStart: Date | null }) => iso(c.weekStart) >= addDays(start, -6) && iso(c.weekStart) <= end
  const approved = cards.filter(c => inQuarter(c) && ['approved', 'exported'].includes(c.status))
  const unapproved = cards.filter(c => inQuarter(c) && !['approved', 'exported'].includes(c.status) && c.totalMinutes! > 0).length
  const hours: PbjHourRow[] = []
  const unmapped = new Set<string>()
  const agencyNoId = new Set<string>()
  const used = new Set<string>()
  for (const card of approved) {
    const person = staff.find(s => s.id === card.staffMemberId)
    if (!person) continue
    const code = person.jobCode?.pbjJobTitleCode ?? ''
    for (const [date, minutes] of Object.entries((card.dayMinutes ?? {}) as Record<string, number>)) {
      if (date < start || date > end || minutes <= 0) continue
      if (!PBJ_JOB_TITLES[code]) { unmapped.add(person.jobCode?.code ?? '(no job code)'); continue }
      if (person.agency && !person.employeeId) agencyNoId.add(person.name)
      hours.push({ employeeId: person.employeeId, date, minutes, jobTitleCode: code, payTypeCode: PAY_TYPE_CODE[person.payType as keyof typeof PAY_TYPE_CODE] ?? '2' })
      used.add(person.id)
    }
  }
  // Census days in the quarter that have residents (PBJ expects hours on every day the building is open).
  const censusRows = await tx.censusDay.groupBy({ by: ['date'], where: { communityId: quarter.communityId!, presence: 'in_house', date: { gte: quarter.startDate!, lte: quarter.endDate! }, supersededById: null } })
  const file: PbjFile = {
    facilityId: ids.ccn ?? '', stateCode: community.region || '',
    fiscalYear: quarter.federalFiscalYear, quarter: quarter.quarter,
    employees: staff.filter(s => used.has(s.id)).map(s => ({ employeeId: s.employeeId, hireDate: s.hireDate ? iso(s.hireDate) : null, terminationDate: s.terminationDate ? iso(s.terminationDate) : null })),
    hours, vendor: { name: 'Openfront', product: 'Senior Care', version: '1.0' },
  }
  return { quarter, file, ctx: { unmappedJobCodes: [...unmapped], agencyWithoutId: [...agencyNoId], unapprovedTimecards: unapproved, censusDates: censusRows.map(r => iso(r.date)), hoursDates: [...new Set(hours.map(h => h.date))] } }
}

/** open/ready/validating → validating → ready (no problems) or open with the problem list. The file is built and kept. */
export async function validatePbjQuarter(uow: UnitOfWork, actor: Actor, input: { quarterId: string }) {
  await lockRow(uow.tx, 'PbjQuarter', input.quarterId)
  const current = await uow.tx.pbjQuarter.findUniqueOrThrow({ where: { id: input.quarterId } })
  if (!['open', 'ready'].includes(current.status)) throw new DomainError(Codes.INVALID_TRANSITION, `The quarter is ${current.status}.`, { currentStatus: current.status })
  const { file, ctx } = await pbjFileFor(uow.tx, input.quarterId)
  const problems = validatePbj(file, ctx)
  const blocking = problems.length > 0
  const xml = blocking ? '' : buildPbjXml(file)
  await uow.tx.pbjQuarter.update({
    where: { id: current.id },
    data: { status: blocking ? 'open' : 'ready', validation: { ok: !blocking, problems, at: uow.now.toISOString(), employees: file.employees.length, entries: file.hours.length } as never, xml, xmlHash: xml ? sha256(xml) : '', version: { increment: 1 } },
  })
  auditCreate(uow, actor, 'PbjQuarter', current.id, blocking ? 'pbj.validation_failed' : 'pbj.ready', { problems: problems.length, entries: file.hours.length })
  return { quarterId: current.id, status: blocking ? 'open' : 'ready', ok: !blocking, problems, entries: file.hours.length }
}

export async function pbjExportFile(tx: Tx, quarterId: string) {
  const q = await tx.pbjQuarter.findUniqueOrThrow({ where: { id: quarterId } })
  if (!q.xml) throw new DomainError(Codes.GUARD_FAILED, 'Validate the quarter first; there is no file yet.', { reason: 'no_file' })
  if (sha256(q.xml) !== q.xmlHash) throw new DomainError(Codes.GUARD_FAILED, 'The stored file no longer matches its hash.', { reason: 'hash_mismatch' })
  return { xml: q.xml, fileName: `${q.reference}.xml`, communityId: q.communityId! }
}

export async function markPbjExported(uow: UnitOfWork, actor: Actor, input: { quarterId: string }) {
  await transition(uow, { model: 'PbjQuarter', id: input.quarterId, from: ['ready'], to: 'exported', actor, eventType: 'pbj.exported', data: { exportedAt: uow.now, exportedById: actorUserId(actor) } })
  const q = await uow.tx.pbjQuarter.findUniqueOrThrow({ where: { id: input.quarterId } })
  await uow.tx.timecard.updateMany({ where: { communityId: q.communityId!, status: 'approved', weekStart: { gte: day(addDays(iso(q.startDate), -6)), lte: q.endDate! } }, data: { status: 'exported' } })
  return { quarterId: input.quarterId, status: 'exported' }
}

/** exported → submitted → accepted/rejected: the person records what CMS's submission report said. */
export async function recordPbjOutcome(uow: UnitOfWork, actor: Actor, input: { quarterId: string; outcome: 'submitted' | 'accepted' | 'rejected'; note?: string }) {
  const from = input.outcome === 'submitted' ? ['exported'] : ['submitted']
  if (!['submitted', 'accepted', 'rejected'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Outcome must be submitted, accepted or rejected.', { field: 'outcome' })
  if (input.outcome === 'rejected' && !input.note?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Paste the rejection reason from the submission report.', { field: 'note' })
  await transition(uow, { model: 'PbjQuarter', id: input.quarterId, from, to: input.outcome, actor, eventType: `pbj.${input.outcome}`, reason: input.note ?? null, data: { reportNote: input.note?.trim() ?? '', ...(input.outcome === 'submitted' ? { submittedAt: uow.now } : {}) } })
  return { quarterId: input.quarterId, status: input.outcome }
}

/* ---- NHSN weekly respiratory export ------------------------------------------------------------------------------ */

export async function generateNhsnWeek(uow: UnitOfWork, actor: Actor, input: { communityId: string; weekStart: string; covidPositive?: number; covidPositiveUtd?: number; fluPositive?: number; fluPositiveVaccinated?: number; rsvPositive?: number; rsvPositiveVaccinated?: number; upToDateCovid?: number }) {
  const community = await uow.tx.community.findUniqueOrThrow({ where: { id: input.communityId } })
  const ids = (community.identifiers ?? {}) as Record<string, string>
  const zone = community.timeZone || 'America/New_York'
  const end = weekEnd(input.weekStart)
  const stays = await uow.tx.censusDay.findMany({ where: { communityId: input.communityId, date: { gte: day(input.weekStart), lte: day(end) }, presence: { in: ['in_house', 'on_leave_hold'] }, supersededById: null }, select: { stayId: true, stay: { select: { residentId: true } } } })
  const residents = new Set(stays.map(s => s.stay?.residentId).filter((r): r is string => Boolean(r)))
  const facts = await uow.tx.immunisation.findMany({ where: { communityId: input.communityId, residentId: { in: [...residents] } }, select: { residentId: true, vaccine: true, status: true, givenAt: true, decidedAt: true, offeredAt: true } })
  const since = seasonStart(input.weekStart)
  const flu = vaccinatedSet(facts.map(f => ({ ...f, residentId: f.residentId! })), 'influenza', end, since)
  const rsv = vaccinatedSet(facts.map(f => ({ ...f, residentId: f.residentId! })), 'rsv', end, null)
  const cov = vaccinatedSet(facts.map(f => ({ ...f, residentId: f.residentId! })), 'covid19', end, since)
  // Positives this week from infection cases (confirmed in the week).
  const cases = await uow.tx.infectionCase.findMany({ where: { communityId: input.communityId, residentId: { in: [...residents] }, status: { in: ['confirmed', 'resolved'] }, onsetAt: { gte: new Date(`${input.weekStart}T00:00:00Z`), lt: new Date(`${addDays(end, 1)}T00:00:00Z`) } }, select: { residentId: true, syndrome: true } })
  const pos = (s: string) => new Set(cases.filter(c => c.syndrome === s).map(c => c.residentId!))
  const covPos = pos('covid19'), fluPos = pos('influenza'), rsvPos = pos('respiratory')
  const inter = (a: Set<string>, b: Set<string>) => [...a].filter(x => b.has(x)).length
  const row: RpvInput = {
    orgId: ids.nhsnOrgId ?? '', weekStart: input.weekStart, numRes: residents.size,
    upToDateCovid: input.upToDateCovid ?? cov.size, fluVaccinated: flu.size, rsvVaccinated: rsv.size,
    covidPositive: input.covidPositive ?? covPos.size, covidPositiveUtd: input.covidPositiveUtd ?? inter(covPos, cov),
    fluPositive: input.fluPositive ?? fluPos.size, fluPositiveVaccinated: input.fluPositiveVaccinated ?? inter(fluPos, flu),
    rsvPositive: input.rsvPositive ?? 0, rsvPositiveVaccinated: input.rsvPositiveVaccinated ?? 0,
    today: localDate(zone, uow.now),
  }
  void rsvPos
  const problems = validateRpv(row)
  const csv = problems.length ? '' : rpvCsv(rpvRow(row))
  const existing = await uow.tx.nhsnExport.findFirst({ where: { communityId: input.communityId, weekStart: day(input.weekStart) } })
  if (existing && existing.status !== 'generated') throw new DomainError(Codes.GUARD_FAILED, `The week of ${input.weekStart} is already ${existing.status}.`, { reason: 'not_regenerable' })
  const data = { counts: row as never, problems: problems as never, csv, csvHash: csv ? sha256(csv) : '', templateNote: NHSN_TEMPLATE_NOTE, generatedById: actorUserId(actor) }
  const saved = existing
    ? await uow.tx.nhsnExport.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    : await uow.tx.nhsnExport.create({ data: { communityId: input.communityId, reference: await nextReference(uow.tx, 'NHS', uow.now), weekStart: day(input.weekStart), weekEnd: day(end), status: 'generated', ...data } })
  auditCreate(uow, actor, 'NhsnExport', saved.id, 'nhsn.generated', { week: input.weekStart, problems: problems.length, numRes: row.numRes })
  return { exportId: saved.id, ok: problems.length === 0, problems, counts: row }
}

export async function recordNhsnUpload(uow: UnitOfWork, actor: Actor, input: { exportId: string; step: 'uploaded' | 'confirmed'; confirmation?: string }) {
  if (input.step === 'confirmed' && !input.confirmation?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the confirmation text or number NHSN showed after the upload.', { field: 'confirmation' })
  const row = await uow.tx.nhsnExport.findUniqueOrThrow({ where: { id: input.exportId } })
  if (!row.csv) throw new DomainError(Codes.GUARD_FAILED, 'There is no file for this week; fix the problems and generate it again.', { reason: 'no_file' })
  await transition(uow, { model: 'NhsnExport', id: input.exportId, from: input.step === 'uploaded' ? ['generated'] : ['uploaded'], to: input.step, actor, eventType: `nhsn.${input.step}`, data: { ...(input.step === 'uploaded' ? { uploadedAt: uow.now } : { confirmation: input.confirmation!.trim() }) } })
  return { exportId: input.exportId, status: input.step }
}
