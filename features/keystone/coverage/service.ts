import { actorUserId, type Actor } from '../lib/actor'
import { addDays, localDate } from '../lib/calendar'
import { canonicalJson, sha256 } from '../lib/canonical'
import { auditCreate, casUpdate } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { benefitDays, stretchDates } from '../billing/medicare'
import { counterSummary, noticeState, qualifyingStay } from './medicare'

/**
 * Medicare Part A depth and the other coverages (STATE-MACHINES §5.5): payer changes, the qualifying-stay evidence, the
 * physician's skilled certification, prior benefit days, the last covered day with its NOMNC/SNFABN (the 2-day clock is
 * worked out on read), hospice election and revocation, Medicare Advantage authorisations and concurrent reviews, and the
 * benefit-period recount. Every one is a staff button.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const fail = (message: string, field?: string): never => { throw new DomainError(Codes.INVALID_INPUT, message, field ? { field } : {}) }
const guard = (message: string, reason: string, extra: Record<string, unknown> = {}): never => { throw new DomainError(Codes.GUARD_FAILED, message, { reason, ...extra }) }
const dateIn = (value: unknown, field: string) => {
  const v = typeof value === 'string' ? value.slice(0, 10) : ''
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) fail(`${field} must be a date.`, field)
  return v
}
const textIn = (value: unknown, field: string, required = true) => {
  const v = typeof value === 'string' ? value.trim() : ''
  if (required && !v) fail(`${field} is required.`, field)
  if (v.length > 2000) fail(`${field} is too long.`, field)
  return v
}

async function lockCoverage(tx: Tx, id: string) {
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "CoveragePeriod" WHERE "id" = $1 FOR UPDATE`, id)
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, 'Coverage not found.')
  return tx.coveragePeriod.findUniqueOrThrow({ where: { id }, include: { payer: { select: { kind: true, name: true } }, stay: { select: { id: true, residentId: true, communityId: true, admittedAt: true, status: true } } } })
}
const today = async (tx: Tx, communityId: string, now: Date) => {
  const c = await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } })
  return localDate(c?.timeZone ?? 'America/New_York', now)
}

/** Ends the current primary coverage the day before `from` and opens the new payer from `from` (the census day picks it up). */
export async function changePayer(uow: UnitOfWork, actor: Actor, input: { stayId: string; payerId: string; from: unknown; memberReference?: unknown; endReason?: unknown; endOverrideReason?: unknown; qualifyingStayFrom?: unknown; qualifyingStayTo?: unknown; qualifyingStayHospital?: unknown; hospiceAgency?: unknown; hospiceRoomBoardBps?: unknown }) {
  const from = dateIn(input.from, 'from')
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true, status: true, admittedAt: true } })
  if (!stay?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  if (stay.status !== 'admitted') guard('Only an admitted stay changes payer.', 'not_admitted')
  const payer = await uow.tx.payer.findUnique({ where: { id: input.payerId }, select: { id: true, kind: true, name: true } })
  if (!payer) fail('Choose a payer.', 'payerId')
  const current = await uow.tx.coveragePeriod.findFirst({ where: { stayId: stay.id, rank: 'primary', status: { in: ['active', 'ending', 'pending', 'retro_approved'] }, startDate: { lt: day(from) }, OR: [{ endDate: null }, { endDate: { gt: day(from) } }] }, include: { payer: { select: { kind: true } } } })
  if (current) {
    if (current.payerId === payer!.id) guard('That payer is already primary.', 'same_payer')
    // Ending Part A: the NOMNC must be on file 2 days ahead, unless an override reason applies (STATE-MACHINES §5.5).
    if (current.payer?.kind === 'medicare_a') await assertNoticeGiven(uow.tx, current, addDays(from, -1), input.endOverrideReason)
    const reason = String(input.endReason ?? (payer!.kind === 'hospice_agency' ? 'payer_change' : 'payer_change'))
    await casUpdate(uow, { model: 'CoveragePeriod', id: current.id, version: current.version, from: [current.status], to: 'ended', actor, eventType: 'coverage.ended', data: { endDate: day(from), endReason: reason, endOverrideReason: input.endOverrideReason ? String(input.endOverrideReason) : null, ...(current.payer?.kind === 'medicare_a' && !current.lastCoveredDay ? { lastCoveredDay: day(addDays(from, -1)) } : {}) } })
  }
  const bps = input.hospiceRoomBoardBps === undefined || input.hospiceRoomBoardBps === null || input.hospiceRoomBoardBps === '' ? null : Number(input.hospiceRoomBoardBps)
  if (payer!.kind === 'hospice_agency') {
    if (bps === null || !Number.isInteger(bps) || bps < 0 || bps > 10_000) fail('The room-and-board share is a whole number of basis points (9500 = 95%).', 'hospiceRoomBoardBps')
    textIn(input.hospiceAgency, 'hospiceAgency')
  }
  const created = await uow.tx.coveragePeriod.create({
    data: {
      stayId: stay.id, payerId: payer!.id, rank: 'primary', startDate: day(from), status: 'active', memberReference: textIn(input.memberReference, 'memberReference', false),
      qualifyingStayFrom: input.qualifyingStayFrom ? day(dateIn(input.qualifyingStayFrom, 'qualifyingStayFrom')) : null, qualifyingStayTo: input.qualifyingStayTo ? day(dateIn(input.qualifyingStayTo, 'qualifyingStayTo')) : null,
      qualifyingStayHospital: textIn(input.qualifyingStayHospital, 'qualifyingStayHospital', false),
      ...(payer!.kind === 'hospice_agency' ? { hospiceAgency: textIn(input.hospiceAgency, 'hospiceAgency'), hospiceElectionOn: day(from), hospiceRoomBoardBps: bps } : {}),
    },
  })
  auditCreate(uow, actor, 'CoveragePeriod', created.id, payer!.kind === 'hospice_agency' ? 'coverage.hospice_elected' : 'coverage.opened', { payerKind: payer!.kind, startDate: from, replaces: current?.id ?? null })
  return { coverageId: created.id, endedCoverageId: current?.id ?? null }
}

async function assertNoticeGiven(tx: Tx, coverage: { id: string; stayId: string | null; lastCoveredDay: Date | null }, lastDay: string, override: unknown) {
  if (override) {
    if (!['resident_refused_notice', 'death', 'emergency_transfer', 'other'].includes(String(override))) fail('Choose a valid reason the notice was not given.', 'endOverrideReason')
    return
  }
  const lcd = iso(coverage.lastCoveredDay) ?? lastDay
  const notice = await tx.noticeDelivery.findFirst({ where: { subjectType: 'CoveragePeriod', subjectId: coverage.id, kind: { in: ['nomnc', 'snfabn'] }, deliveredAt: { not: null } }, orderBy: { deliveredAt: 'asc' } })
  const state = noticeState(lcd, notice ? iso(notice.deliveredAt)! : null, lcd)
  if (state.status !== 'delivered_in_time') guard(`The NOMNC must be delivered by ${state.dueBy} (2 days before the last covered day ${lcd}). Record it, or give the reason it could not be.`, 'nomnc_missing', { dueBy: state.dueBy, status: state.status })
}

export async function recordQualifyingStay(uow: UnitOfWork, actor: Actor, input: { coverageId: string; from: unknown; to: unknown; hospital: unknown; evidenceNote?: unknown; documentTitle?: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  if (cov.payer?.kind !== 'medicare_a') guard('Qualifying-stay evidence is for Medicare Part A coverage.', 'not_part_a')
  const from = dateIn(input.from, 'from'), to = dateIn(input.to, 'to')
  const hospital = textIn(input.hospital, 'hospital')
  const note = textIn(input.evidenceNote, 'evidenceNote', false)
  const doc = await uow.tx.document.create({ data: { title: textIn(input.documentTitle, 'documentTitle', false) || `Hospital record: ${hospital} ${from} to ${to}`, kind: 'qualifying_stay', communityId: cov.stay?.communityId ?? null, residentId: cov.stay?.residentId ?? null, phiTier: 'clin', status: 'final' } })
  auditCreate(uow, actor, 'Document', doc.id, 'document.filed', { kind: 'qualifying_stay' })
  const check = qualifyingStay({ inpatientFrom: from, inpatientTo: to, snfAdmission: iso(cov.startDate)!, hasEvidence: true })
  await casUpdate(uow, { model: 'CoveragePeriod', id: cov.id, version: cov.version, from: [cov.status], to: cov.status, actor, eventType: 'coverage.qualifying_stay_recorded', data: { qualifyingStayFrom: day(from), qualifyingStayTo: day(to), qualifyingStayHospital: hospital, qualifyingStayEvidenceId: doc.id, qualifyingStayEvidenceNote: note || `Document ${doc.id}` }, audit: { from, to, hospital, ok: check.ok, problems: check.problems } })
  return { coverageId: cov.id, ok: check.ok, problems: check.problems, documentId: doc.id }
}

export async function recordSkilledCert(uow: UnitOfWork, actor: Actor, input: { coverageId: string; signedOn: unknown; signedBy: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  if (cov.payer?.kind !== 'medicare_a') guard('The skilled certification is for Medicare Part A coverage.', 'not_part_a')
  const signedOn = dateIn(input.signedOn, 'signedOn')
  const by = textIn(input.signedBy, 'signedBy')
  if (signedOn > (await today(uow.tx, cov.stay!.communityId!, uow.now))) fail('The signing date cannot be in the future.', 'signedOn')
  await casUpdate(uow, { model: 'CoveragePeriod', id: cov.id, version: cov.version, from: [cov.status], to: cov.status, actor, eventType: 'coverage.skilled_cert_recorded', data: { skilledCertSignedAt: day(signedOn), skilledCertBy: by }, audit: { signedOn, signedBy: by } })
  return { coverageId: cov.id }
}

export async function recordPriorDays(uow: UnitOfWork, actor: Actor, input: { residentId: string; source: unknown; daysUsed: unknown; asOf: unknown; spellStart?: unknown; note?: unknown }) {
  const resident = await uow.tx.resident.findUnique({ where: { id: input.residentId }, select: { id: true, communityId: true } })
  if (!resident) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
  const source = String(input.source ?? '')
  if (!['hets', 'cwf_manual', 'hospital_record', 'resident_report'].includes(source)) fail('Choose where the figure came from.', 'source')
  const days = Number(input.daysUsed)
  if (!Number.isInteger(days) || days < 0 || days > 100) fail('Days used is a whole number from 0 to 100.', 'daysUsed')
  const row = await uow.tx.priorSnfDaysObservation.create({ data: { residentId: resident.id, communityId: resident.communityId, source, daysUsed: days, asOf: day(dateIn(input.asOf, 'asOf')), spellStart: input.spellStart ? day(dateIn(input.spellStart, 'spellStart')) : null, note: textIn(input.note, 'note', false), recordedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'PriorSnfDaysObservation', row.id, 'coverage.prior_days_recorded', { source, daysUsed: days })
  return { observationId: row.id }
}

/** Sets the last covered day (skilled need ends, benefit runs out, or an MA plan's last covered day). The notice clock starts. */
export async function setLastCoveredDay(uow: UnitOfWork, actor: Actor, input: { coverageId: string; lastCoveredDay: unknown; reason?: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  if (!['medicare_a', 'medicare_advantage'].includes(cov.payer?.kind ?? '')) guard('A last covered day is for Medicare Part A or Medicare Advantage.', 'not_medicare')
  if (!['active', 'ending'].includes(cov.status)) guard('This coverage is not active.', 'not_active')
  const lcd = dateIn(input.lastCoveredDay, 'lastCoveredDay')
  if (lcd < iso(cov.startDate)!) fail('The last covered day is before the coverage starts.', 'lastCoveredDay')
  await casUpdate(uow, { model: 'CoveragePeriod', id: cov.id, version: cov.version, from: ['active', 'ending'], to: 'ending', actor, eventType: 'coverage.last_covered_day_set', data: { lastCoveredDay: day(lcd) }, reason: textIn(input.reason, 'reason', false) || null, audit: { lastCoveredDay: lcd, noticeDueBy: addDays(lcd, -2) } })
  return { coverageId: cov.id, lastCoveredDay: lcd, noticeDueBy: addDays(lcd, -2) }
}

/** Records NOMNC (CMS-10123) or SNFABN (CMS-10055) delivery against the coverage. */
export async function recordCoverageNotice(uow: UnitOfWork, actor: Actor, input: { coverageId: string; kind: unknown; deliveredOn: unknown; method: unknown; acknowledgement?: unknown; recipientRepresentativeId?: unknown; note?: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  const kind = String(input.kind ?? '')
  if (!['nomnc', 'snfabn'].includes(kind)) fail('Choose NOMNC or SNFABN.', 'kind')
  const method = String(input.method ?? '')
  if (!['in_person', 'mail', 'email', 'portal', 'phone_then_mail'].includes(method)) fail('Choose how it was delivered.', 'method')
  const deliveredOn = dateIn(input.deliveredOn, 'deliveredOn')
  if (deliveredOn > (await today(uow.tx, cov.stay!.communityId!, uow.now))) fail('The delivery date cannot be in the future.', 'deliveredOn')
  const ack = String(input.acknowledgement ?? 'signed')
  if (!['signed', 'refused_witnessed', 'not_required'].includes(ack)) fail('Choose the acknowledgement.', 'acknowledgement')
  const repId = input.recipientRepresentativeId ? String(input.recipientRepresentativeId) : null
  if (repId) {
    const rep = await uow.tx.representative.findUnique({ where: { id: repId }, select: { residentId: true } })
    if (rep?.residentId !== cov.stay?.residentId) fail('That representative does not represent this resident.', 'recipientRepresentativeId')
  }
  const notice = await uow.tx.noticeDelivery.create({ data: { kind, subjectType: 'CoveragePeriod', subjectId: cov.id, residentId: cov.stay?.residentId ?? null, recipientRepresentativeId: repId, method, deliveredAt: day(deliveredOn), deliveredById: actorUserId(actor), acknowledgement: ack, note: textIn(input.note, 'note', false) } })
  const lcd = iso(cov.lastCoveredDay)
  const state = lcd ? noticeState(lcd, deliveredOn, deliveredOn) : null
  auditCreate(uow, actor, 'NoticeDelivery', notice.id, 'notice.delivered', { kind, method, deliveredOn, coverageId: cov.id, clock: state?.status ?? null })
  return { noticeId: notice.id, clock: state }
}

/** Revokes a hospice election: the hospice coverage ends and the stay goes back to the payer chosen (no gap). */
export async function revokeHospice(uow: UnitOfWork, actor: Actor, input: { coverageId: string; revokedOn: unknown; nextPayerId: string; memberReference?: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  if (cov.payer?.kind !== 'hospice_agency') guard('This is not a hospice election.', 'not_hospice')
  if (!['active', 'ending'].includes(cov.status)) guard('This election is not active.', 'not_active')
  const on = dateIn(input.revokedOn, 'revokedOn')
  if (on <= iso(cov.startDate)!) fail('The revocation is on or before the election.', 'revokedOn')
  const v = await casUpdate(uow, { model: 'CoveragePeriod', id: cov.id, version: cov.version, from: [cov.status], to: 'ended', actor, eventType: 'coverage.hospice_revoked', data: { endDate: day(on), endReason: 'hospice_revoked' } })
  void v
  const payer = await uow.tx.payer.findUnique({ where: { id: input.nextPayerId }, select: { id: true, kind: true } })
  if (!payer || payer.kind === 'hospice_agency') fail('Choose the payer after the revocation.', 'nextPayerId')
  const created = await uow.tx.coveragePeriod.create({ data: { stayId: cov.stayId, payerId: payer!.id, rank: 'primary', startDate: day(on), status: 'active', memberReference: textIn(input.memberReference, 'memberReference', false) } })
  auditCreate(uow, actor, 'CoveragePeriod', created.id, 'coverage.opened', { payerKind: payer!.kind, startDate: on, after: 'hospice_revoked' })
  return { coverageId: created.id }
}

/* ---------------------------------------------------------------- Medicare Advantage */

export async function requestAuthorisation(uow: UnitOfWork, actor: Actor, input: { coverageId: string; requestedOn: unknown; levelOfCare?: unknown; payerAuthNumber?: unknown; reviewIntervalDays?: unknown; note?: unknown }) {
  const cov = await lockCoverage(uow.tx, input.coverageId)
  if (!['medicare_advantage', 'medicaid_mco', 'commercial'].includes(cov.payer?.kind ?? '')) guard('Authorisations are for managed plans.', 'not_managed')
  const interval = input.reviewIntervalDays === undefined || input.reviewIntervalDays === '' ? 7 : Number(input.reviewIntervalDays)
  if (!Number.isInteger(interval) || interval < 1 || interval > 60) fail('The review interval is 1 to 60 days.', 'reviewIntervalDays')
  const row = await uow.tx.authorisation.create({
    data: { reference: await nextReference(uow.tx, 'AUTH', uow.now), residentId: cov.stay?.residentId ?? null, communityId: cov.stay?.communityId ?? null, stayId: cov.stayId, coverageId: cov.id, payerId: cov.payerId, requestedOn: day(dateIn(input.requestedOn, 'requestedOn')), payerAuthNumber: textIn(input.payerAuthNumber, 'payerAuthNumber', false), levelOfCare: textIn(input.levelOfCare, 'levelOfCare', false), reviewIntervalDays: interval, status: 'requested', note: textIn(input.note, 'note', false) },
  })
  auditCreate(uow, actor, 'Authorisation', row.id, 'authorisation.requested', { coverageId: cov.id })
  return { authorisationId: row.id, reference: row.reference }
}

export async function decideAuthorisation(uow: UnitOfWork, actor: Actor, input: { authorisationId: string; decision: unknown; authFrom?: unknown; authTo?: unknown; payerAuthNumber?: unknown }) {
  const row = await uow.tx.authorisation.findUnique({ where: { id: input.authorisationId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Authorisation not found.')
  const decision = String(input.decision ?? '')
  if (decision === 'approved') {
    const from = dateIn(input.authFrom, 'authFrom'), to = dateIn(input.authTo, 'authTo')
    if (to < from) fail('The authorised days end before they start.', 'authTo')
    await casUpdate(uow, { model: 'Authorisation', id: row.id, version: row.version, from: ['requested'], to: 'approved', actor, eventType: 'authorisation.approved', data: { authFrom: day(from), authTo: day(to), ...(input.payerAuthNumber ? { payerAuthNumber: textIn(input.payerAuthNumber, 'payerAuthNumber') } : {}) }, audit: { authFrom: from, authTo: to } })
  } else if (decision === 'denied') {
    await casUpdate(uow, { model: 'Authorisation', id: row.id, version: row.version, from: ['requested'], to: 'denied', actor, eventType: 'authorisation.denied' })
  } else fail('Choose approved or denied.', 'decision')
  return { authorisationId: row.id, status: decision }
}

/** A concurrent review: continue, extend the authorised days, or set the plan's last covered day (which starts the NOMNC clock). */
export async function recordReview(uow: UnitOfWork, actor: Actor, input: { authorisationId: string; reviewedOn: unknown; outcome: unknown; newAuthTo?: unknown; reviewer?: unknown; note?: unknown }) {
  const auth = await uow.tx.authorisation.findUnique({ where: { id: input.authorisationId } })
  if (!auth) throw new DomainError(Codes.NOT_FOUND, 'Authorisation not found.')
  if (auth.status !== 'approved') guard('Reviews are recorded against an approved authorisation.', 'not_approved')
  const outcome = String(input.outcome ?? '')
  if (!['continued', 'extended', 'last_covered_day_set', 'denied'].includes(outcome)) fail('Choose the outcome.', 'outcome')
  const reviewedOn = dateIn(input.reviewedOn, 'reviewedOn')
  const newTo = outcome === 'extended' || outcome === 'last_covered_day_set' ? dateIn(input.newAuthTo, 'newAuthTo') : null
  if (newTo && auth.authFrom && newTo < iso(auth.authFrom)!) fail('The new date is before the authorisation starts.', 'newAuthTo')
  const review = await uow.tx.concurrentReview.create({ data: { residentId: auth.residentId, communityId: auth.communityId, authorisationId: auth.id, reviewedOn: day(reviewedOn), outcome, newAuthTo: newTo ? day(newTo) : null, reviewer: textIn(input.reviewer, 'reviewer', false), note: textIn(input.note, 'note', false), recordedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'ConcurrentReview', review.id, 'authorisation.reviewed', { authorisationId: auth.id, outcome, newAuthTo: newTo })
  if (outcome === 'extended') await casUpdate(uow, { model: 'Authorisation', id: auth.id, version: auth.version, from: ['approved'], to: 'approved', actor, eventType: 'authorisation.extended', data: { authTo: day(newTo!) } })
  if (outcome === 'last_covered_day_set' || outcome === 'denied') {
    await casUpdate(uow, { model: 'Authorisation', id: auth.id, version: auth.version, from: ['approved'], to: 'ended', actor, eventType: 'authorisation.ended', data: { authTo: day(newTo ?? reviewedOn) } })
    if (auth.coverageId) await setLastCoveredDay(uow, actor, { coverageId: auth.coverageId, lastCoveredDay: newTo ?? reviewedOn, reason: `Concurrent review ${outcome}` })
  }
  return { reviewId: review.id }
}

/* ---------------------------------------------------------------- benefit period */

/** Recounts the benefit period from the coverage history and stores the result (the derivation is the source; this is a cache). */
export async function recountBenefitPeriod(uow: UnitOfWork, actor: Actor, input: { residentId: string }) {
  const resident = await uow.tx.resident.findUnique({ where: { id: input.residentId }, select: { id: true, communityId: true } })
  if (!resident?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Resident not found.')
  const asOf = await today(uow.tx, resident.communityId, uow.now)
  const summary = await benefitSummary(uow.tx, resident.id, asOf)
  const hash = sha256(canonicalJson(summary))
  const existing = await uow.tx.benefitPeriodCounter.findFirst({ where: { residentId: resident.id }, orderBy: { createdAt: 'desc' } })
  if (existing?.derivedFromHash === hash) return { counterId: existing.id, unchanged: true, ...summary }
  const row = await uow.tx.benefitPeriodCounter.create({ data: { residentId: resident.id, communityId: resident.communityId, spellStart: summary.spellStart ? day(summary.spellStart) : null, fullDaysUsed: summary.fullDaysUsed, coinsuranceDaysUsed: summary.coinsuranceDaysUsed, priorDaysUsed: summary.priorDaysUsed, lastCoveredDay: summary.lastCountedDate ? day(summary.lastCountedDate) : null, derivedFromHash: hash, computedAt: uow.now } })
  auditCreate(uow, actor, 'BenefitPeriodCounter', row.id, 'coverage.benefit_recounted', summary)
  return { counterId: row.id, unchanged: false, ...summary }
}

/** Benefit-period summary for a resident as of a date (read side; the screens and the recount use it). */
export async function benefitSummary(tx: Tx, residentId: string, asOf: string) {
  const covs = await tx.coveragePeriod.findMany({ where: { stay: { residentId }, payer: { kind: 'medicare_a' }, status: { in: ['active', 'ending', 'ended', 'retro_approved'] } }, orderBy: { startDate: 'asc' }, select: { startDate: true, endDate: true } })
  const stretches = covs.map(c => ({ from: iso(c.startDate)!, to: c.endDate ? addDays(iso(c.endDate)!, -1) : null }))
  const firstFrom = stretches[0]?.from ?? asOf
  const prior = await tx.priorSnfDaysObservation.findFirst({ where: { residentId, asOf: { lte: day(firstFrom) } }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }], select: { daysUsed: true } })
  const priorDaysUsed = prior?.daysUsed ?? 0
  const counted = [...benefitDays({ stayId: '', stretches, priorDaysUsed, classifications: [], qualifyingStayOk: true, skilledCertOk: true }, asOf).values()]
  const s = counterSummary(counted)
  const spell = counted.length ? counted[counted.length - 1].spell : 0
  const spellDays = counted.filter(d => d.spell === spell)
  return {
    asOf, priorDaysUsed, spellStart: spellDays[0]?.date ?? null, fullDaysUsed: s.fullDaysUsed, coinsuranceDaysUsed: s.coinsuranceDaysUsed, exhaustedDays: s.exhaustedDays,
    lastCountedDate: spellDays[spellDays.length - 1]?.date ?? null, lastCountedDay: s.lastCountedDay, daysLeft: Math.max(0, 100 - (s.lastCountedDay ?? priorDaysUsed)), coveredDates: stretchDates(stretches, asOf).length,
  }
}

export { coverageClocks } from './clocks'
