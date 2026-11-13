import { actorUserId, type Actor } from '../lib/actor'
import { addDays } from '../lib/calendar'
import { sha256 } from '../lib/canonical'
import { auditCreate, lockRow, transition } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import { assertCanDecide } from '../lib/separationOfDuties'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import { monthEnd } from '../billing/derive'
import { deriveCensusRange } from '../lib/censusDay'
import { build837I } from './edi837'
import { detectKind, parse277CA, parse835, parse999, type Remit835 } from './parsers'
import { frequencyFor, scrub, validNpi, type ScrubInput } from './scrubber'

/**
 * Part A claims (STATE-MACHINES §12.7-§12.8). A claim is derived from the live per-diem charges of one stay and month; nothing is
 * transmitted from here: the 837I is a file a person uploads, and a claim is only `accepted` or `paid` because a 277CA or 835 said so.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const AFTER_ACCEPT = ['accepted', 'paid', 'partially_paid', 'denied', 'appealed', 'finalised']
const CAN_PAY = ['submitted', 'accepted', 'partially_paid']
const DISCHARGE_STATUS: Record<string, string> = { community_home: '01', acute_hospital: '02', another_nursing_facility: '03', assisted_living: '04', psychiatric_hospital: '65', irf: '62', ltch: '63', hospice: '51', deceased: '20', other: '01' }
type Ids = Record<string, string>

const idsOf = (v: unknown) => (v && typeof v === 'object' ? (v as Ids) : {})

/* ---- Create from live billing lines ------------------------------------------------------------------------------ */

export async function createClaimsForMonth(uow: UnitOfWork, actor: Actor, input: { communityId: string; month: string }) {
  if (!/^\d{4}-\d{2}-01$/.test(input.month)) throw new DomainError(Codes.INVALID_INPUT, 'Month must be the first day of the month, YYYY-MM-01.', { field: 'month' })
  const from = input.month
  const to = monthEnd(input.month)
  const charges = await uow.tx.charge.findMany({
    where: { communityId: input.communityId, kind: { in: ['per_diem_claim', 'coinsurance'] }, status: { in: ['open', 'posted'] }, date: { gte: day(from), lte: day(to) }, payer: { kind: 'medicare_a' } , OR: [{ responsibility: 'payer' }, { kind: 'coinsurance' }] },
    orderBy: [{ stayId: 'asc' }, { date: 'asc' }],
  })
  // Coinsurance carries no payer id (it is the resident's share), so pull it for the same stays by their per-diem days.
  const stayIds = [...new Set(charges.filter(c => c.kind === 'per_diem_claim').map(c => c.stayId).filter((s): s is string => Boolean(s)))]
  const coins = await uow.tx.charge.findMany({ where: { stayId: { in: stayIds }, kind: 'coinsurance', status: { in: ['open', 'posted'] }, date: { gte: day(from), lte: day(to) } } })
  const created: string[] = []
  const existing: string[] = []
  for (const stayId of stayIds) {
    const perDiems = charges.filter(c => c.stayId === stayId && c.kind === 'per_diem_claim')
    const stay = await uow.tx.stay.findUniqueOrThrow({ where: { id: stayId } })
    const payerId = perDiems[0].payerId!
    const dup = await uow.tx.claim.findFirst({ where: { stayId, payerId, periodFrom: { gte: day(from), lte: day(to) }, status: { not: 'cancelled' } } })
    if (dup) { existing.push(dup.reference); continue }
    const days = perDiems.map(c => {
      const hipps = String((c.derivation as { hipps?: string } | null)?.hipps ?? '')
      const coin = coins.find(k => k.stayId === stayId && iso(k.date) === iso(c.date))
      return { date: iso(c.date), hipps, amount: c.amountMinor + (coin?.amountMinor ?? 0n), ids: [c.id, ...(coin ? [coin.id] : [])] }
    })
    const groups: { hipps: string; from: string; to: string; units: number; amount: bigint; ids: string[] }[] = []
    for (const d of days) {
      const last = groups[groups.length - 1]
      if (last && last.hipps === d.hipps && addDays(last.to, 1) === d.date) { last.to = d.date; last.units += 1; last.amount += d.amount; last.ids.push(...d.ids) }
      else groups.push({ hipps: d.hipps, from: d.date, to: d.date, units: 1, amount: d.amount, ids: [...d.ids] })
    }
    const total = groups.reduce((n, g) => n + g.amount, 0n)
    const cov = stay.residentId ? await uow.tx.coveragePeriod.findFirst({ where: { stayId, payerId, status: { in: ['active', 'ended'] } }, orderBy: { startDate: 'desc' } }) : null
    const prior = await uow.tx.claim.findFirst({ where: { stayId, payerId, periodTo: { lt: day(from) }, status: { not: 'cancelled' } }, orderBy: { periodTo: 'desc' } })
    const admitMonth = stay.admittedAt ? iso(stay.admittedAt).slice(0, 7) === from.slice(0, 7) : false
    const lastMonth = Boolean(stay.dischargedAt && iso(stay.dischargedAt).slice(0, 7) === from.slice(0, 7)) || Boolean(cov?.endDate && iso(cov.endDate).slice(0, 7) === from.slice(0, 7))
    const frequency = frequencyFor({ firstMonth: admitMonth || !prior, lastMonth })
    const dx = await uow.tx.diagnosis.findMany({ where: { residentId: stay.residentId, status: 'active' }, orderBy: [{ rank: 'asc' }, { onsetDate: 'asc' }] })
    const principal = dx.find(d => d.rank === 'primary') ?? dx[0]
    const covered = days.length
    const periodFrom = days[0].date
    const periodTo = days[days.length - 1].date
    const reference = await nextReference(uow.tx, 'CLM', uow.now)
    const claim = await uow.tx.claim.create({
      data: {
        communityId: input.communityId, residentId: stay.residentId, stayId, payerId, coverageId: cov?.id ?? null, reference,
        periodFrom: day(periodFrom), periodTo: day(periodTo), typeOfBill: `021${frequency}`, frequencyCode: frequency,
        occurrenceCodes: lastMonth && iso(stay.dischargedAt) ? [{ code: '22', date: iso(stay.dischargedAt) }] : [],
        occurrenceSpans: cov?.qualifyingStayFrom && cov.qualifyingStayTo ? [{ code: '70', from: iso(cov.qualifyingStayFrom), to: iso(cov.qualifyingStayTo) }] : [],
        valueCodes: [{ code: '80', quantity: covered }], conditionCodes: [],
        diagnoses: { principal: principal?.icd10 ?? null, other: dx.filter(d => d !== principal).map(d => d.icd10) } as never,
        totalChargesMinor: total, paidMinor: 0n, status: 'draft', previousClaimId: prior?.id ?? null, ackStatus: 'none', denialStatus: 'none',
        lines: { create: groups.map((g, i) => ({ communityId: input.communityId, residentId: stay.residentId, lineNumber: i + 1, revenueCode: '0022', hippsCode: g.hipps, serviceFrom: day(g.from), serviceTo: day(g.to), units: g.units, chargeMinor: g.amount, paidMinor: 0n, chargeIds: g.ids as never })) },
      },
    })
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.created', { reference, stayId, period: [periodFrom, periodTo], totalChargesMinor: total.toString(), typeOfBill: claim.typeOfBill })
    created.push(reference)
  }
  return { created, existing, month: input.month }
}

/* ---- Scrub and validate ------------------------------------------------------------------------------------------ */

async function loadForExport(tx: Tx, claimId: string) {
  const claim = await tx.claim.findUniqueOrThrow({ where: { id: claimId }, include: { lines: { orderBy: { lineNumber: 'asc' } }, payer: true, community: true, resident: true, coverage: true, stay: true } })
  return claim
}

export async function scrubInput(tx: Tx, claimId: string): Promise<{ input: ScrubInput; claim: Awaited<ReturnType<typeof loadForExport>>; ids: Ids }> {
  const claim = await loadForExport(tx, claimId)
  const ids = idsOf(claim.community?.identifiers)
  const dx = (claim.diagnoses ?? {}) as { principal?: string | null; other?: string[] }
  let covered = 0
  if (claim.stayId && claim.periodFrom && claim.periodTo) {
    const dates: string[] = []
    for (let d = iso(claim.periodFrom); d <= iso(claim.periodTo); d = addDays(d, 1)) dates.push(d)
    const byDay = await deriveCensusRange(tx, claim.communityId!, dates)
    for (const rows of byDay.values()) if (rows.some(r => r.stayId === claim.stayId && r.presence === 'in_house' && r.payerKind === 'medicare_a')) covered += 1
  }
  const prior = claim.previousClaimId ? await tx.claim.findUnique({ where: { id: claim.previousClaimId }, select: { status: true } }) : null
  const lines = claim.lines.map(l => ({ revenueCode: l.revenueCode, hippsCode: l.hippsCode, from: iso(l.serviceFrom), to: iso(l.serviceTo), units: l.units, chargeMinor: l.chargeMinor }))
  const cov = claim.coverage
  return {
    claim, ids,
    input: {
      billingNpi: ids.npi ?? '', attendingNpi: claim.attendingName.trim() ? claim.attendingNpi : '', taxonomy: ids.taxonomy ?? '', ccn: ids.ccn ?? '', taxId: ids.taxId ?? '', zip: ids.zip4 ?? claim.community?.postalCode ?? '', mbi: cov?.memberReference || null,
      typeOfBill: claim.typeOfBill, from: iso(claim.periodFrom), to: iso(claim.periodTo), admittedOn: claim.stay?.admittedAt ? iso(claim.stay.admittedAt) : null,
      principal: dx.principal ?? null, otherDiagnoses: dx.other ?? [],
      occurrenceCodes: (claim.occurrenceCodes ?? []) as never, occurrenceSpans: (claim.occurrenceSpans ?? []) as never, valueCodes: (claim.valueCodes ?? []) as never, conditionCodes: (claim.conditionCodes ?? []) as never,
      lines, totalMinor: claim.totalChargesMinor, coveredDays: covered, previousMonthStatus: prior?.status ?? null, hasPreviousMonth: Boolean(claim.previousClaimId),
      qualifyingStay: cov?.qualifyingStayFrom && cov.qualifyingStayTo ? { from: iso(cov.qualifyingStayFrom), to: iso(cov.qualifyingStayTo) } : null,
      skilledCertOk: Boolean(cov?.skilledCertSignedAt),
    },
  }
}

/** draft → validated, only when the scrubber finds no errors. A failed scrub is saved on the claim and returned. */
export async function validateClaim(uow: UnitOfWork, actor: Actor, input: { claimId: string }) {
  await lockRow(uow.tx, 'Claim', input.claimId)
  const { input: sc, claim, ids } = await scrubInput(uow.tx, input.claimId)
  if (claim.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, `A ${claim.status} claim cannot be validated again.`, { currentStatus: claim.status })
  const payerId = claim.payer?.payerId ?? ''
  const result = scrub(sc)
  if (!payerId) result.issues.push({ code: 'payer_id_missing', severity: 'error', message: 'The payer has no electronic payer ID.', field: 'payer' })
  const ok = !result.issues.some(i => i.severity === 'error')
  if (!ok) {
    await uow.tx.claim.update({ where: { id: claim.id }, data: { scrubberResult: { ok: false, issues: result.issues, at: uow.now.toISOString() } as never, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Claim', claim.id, 'claim.scrub_failed', { errors: result.issues.filter(i => i.severity === 'error').map(i => i.code) })
    return { claimId: claim.id, status: 'draft', ok: false, issues: result.issues }
  }
  void ids
  await transition(uow, { model: 'Claim', id: claim.id, from: ['draft'], to: 'validated', actor, eventType: 'claim.validated', data: { scrubberResult: { ok: true, issues: result.issues, at: uow.now.toISOString() } as never, validatedById: actorUserId(actor) } })
  return { claimId: claim.id, status: 'validated', ok: true, issues: result.issues }
}

/** validated → released by someone other than the person who validated it, and only after the previous month's claim was accepted. */
export async function releaseClaim(uow: UnitOfWork, actor: Actor, input: { claimId: string }) {
  await transition(uow, {
    model: 'Claim', id: input.claimId, from: ['validated'], to: 'released', actor, eventType: 'claim.released', data: { releasedById: actorUserId(actor) },
    guard: async row => {
      assertCanDecide(actor, row.validatedById as string | null)
      if (row.previousClaimId) {
        const prior = await uow.tx.claim.findUnique({ where: { id: row.previousClaimId as string }, select: { status: true, reference: true } })
        if (prior && !AFTER_ACCEPT.includes(prior.status)) throw new DomainError(Codes.GUARD_FAILED, `The previous month's claim ${prior.reference} is ${prior.status}; it must be accepted before this one is released.`, { reason: 'previous_claim_not_accepted' })
      }
    },
  })
  return { claimId: input.claimId, status: 'released' }
}

/* ---- The 837I file ----------------------------------------------------------------------------------------------- */

/** Generates (or regenerates) the 837I for a released claim: file text and hash are stored; nothing is sent. */
export async function exportClaim(uow: UnitOfWork, actor: Actor, input: { claimId: string }) {
  await lockRow(uow.tx, 'Claim', input.claimId)
  const { input: sc, claim, ids } = await scrubInput(uow.tx, input.claimId)
  if (!['released', 'submitted'].includes(claim.status)) throw new DomainError(Codes.GUARD_FAILED, 'Release the claim before exporting the file.', { reason: 'not_released' })
  const again = scrub(sc)
  if (!again.ok) throw new DomainError(Codes.GUARD_FAILED, 'The claim no longer passes the scrubber. Fix it and validate again.', { reason: 'scrub_failed', issues: again.issues })
  const resident = claim.resident!
  const dx = (claim.diagnoses ?? {}) as { principal: string; other: string[] }
  const control = String((await uow.tx.sequence.upsert({ where: { key: 'EDI-ICN' }, create: { key: 'EDI-ICN', nextValue: 2 }, update: { nextValue: { increment: 1 } } })).nextValue - 1)
  const local = uow.now.toISOString()
  const discharged = claim.stay?.dischargedAt && claim.frequencyCode !== '3' && claim.frequencyCode !== '2' ? claim.stay.dischargedAt : null
  const file = build837I({
    controlNumber: control, sentOn: local.slice(0, 10), sentAt: local.slice(11, 13) + local.slice(14, 16),
    submitter: { name: claim.community?.name ?? '', id: ids.ccn ?? '', contact: 'Business Office', phone: claim.community?.phone ?? '' },
    receiver: { name: claim.payer?.name ?? '', id: claim.payer?.payerId ?? '' },
    billing: { name: claim.community?.name ?? '', npi: ids.npi ?? '', taxId: ids.taxId ?? '', taxonomy: ids.taxonomy ?? '', line1: claim.community?.addressLine1 ?? '', city: claim.community?.city ?? '', state: claim.community?.region ?? '', zip: ids.zip4 ?? claim.community?.postalCode ?? '' },
    subscriber: { last: resident.lastName, first: resident.firstName, mbi: sc.mbi ?? '', dob: iso(resident.dateOfBirth), sex: resident.sex === 'female' ? 'F' : resident.sex === 'male' ? 'M' : 'U' },
    payer: { name: claim.payer?.name ?? '', id: claim.payer?.payerId ?? '' },
    claim: {
      reference: claim.reference, totalMinor: claim.totalChargesMinor, typeOfBill: claim.typeOfBill, from: iso(claim.periodFrom), to: iso(claim.periodTo),
      admittedOn: iso(claim.stay?.admittedAt), admittedHour: claim.stay?.admittedAt ? claim.stay.admittedAt.toISOString().slice(11, 13) + '00' : '0000', admissionType: '9',
      pointOfOrigin: claim.stay?.admissionSource === 'acute_hospital' ? '4' : '1', patientStatus: discharged ? (DISCHARGE_STATUS[claim.stay?.dischargeDisposition ?? 'other'] ?? '01') : '30',
      dischargeHour: null, payerClaimNumber: claim.payerClaimNumber || null, principal: dx.principal, otherDiagnoses: dx.other ?? [],
      occurrenceCodes: sc.occurrenceCodes, occurrenceSpans: sc.occurrenceSpans, valueCodes: sc.valueCodes, conditionCodes: sc.conditionCodes,
    },
    attending: claim.attendingNpi ? { npi: claim.attendingNpi, last: claim.attendingName.split(',')[0] ?? '', first: claim.attendingName.split(',')[1]?.trim() ?? '' } : null,
    lines: sc.lines,
  })
  const hash = sha256(file.text)
  await uow.tx.claim.update({ where: { id: claim.id }, data: { exportText: file.text, exportHash: hash, exportedAt: uow.now, exportedById: actorUserId(actor), version: { increment: 1 } } })
  auditCreate(uow, actor, 'Claim', claim.id, 'claim.exported', { exportHash: hash, segments: file.segmentCount })
  return { claimId: claim.id, exportHash: hash, segments: file.segmentCount }
}

/** released → submitted: the person says they uploaded the file. This is the only "sent" there is, and it is a person's statement. */
export async function markSubmitted(uow: UnitOfWork, actor: Actor, input: { claimId: string; exportHash: string }) {
  await transition(uow, {
    model: 'Claim', id: input.claimId, from: ['released'], to: 'submitted', actor, eventType: 'claim.marked_submitted', data: { uploadedAt: uow.now, uploadedById: actorUserId(actor) },
    guard: row => {
      if (!row.exportHash) throw new DomainError(Codes.GUARD_FAILED, 'Export the file first.', { reason: 'not_exported' })
      if (row.exportHash !== input.exportHash) throw new DomainError(Codes.STALE_STATE, 'The file changed since you downloaded it. Download it again.', { reason: 'hash_changed' })
    },
  })
  return { claimId: input.claimId, status: 'submitted' }
}

export async function cancelClaim(uow: UnitOfWork, actor: Actor, input: { claimId: string; reason: string }) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why the claim is cancelled.', { field: 'reason' })
  await transition(uow, { model: 'Claim', id: input.claimId, from: ['draft', 'validated', 'released', 'rejected'], to: 'cancelled', actor, eventType: 'claim.cancelled', reason: input.reason.trim() })
  return { claimId: input.claimId, status: 'cancelled' }
}

/* ---- 999 / 277CA acknowledgement uploads ------------------------------------------------------------------------- */

export async function recordAcknowledgement(uow: UnitOfWork, actor: Actor, input: { communityId: string; text: string; claimId?: string | null }) {
  const kind = detectKind(input.text)
  if (kind === '999') {
    if (!input.claimId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the claim this 999 answers.', { field: 'claimId' })
    const ack = parse999(input.text)
    const claim = await uow.tx.claim.findFirst({ where: { id: input.claimId, communityId: input.communityId } })
    if (!claim) throw new DomainError(Codes.NOT_FOUND, 'Claim not found.')
    if (claim.status !== 'submitted') throw new DomainError(Codes.GUARD_FAILED, `The claim is ${claim.status}; a 999 answers a submitted claim.`, { reason: 'not_submitted' })
    if (ack.accepted) {
      await uow.tx.claim.update({ where: { id: claim.id }, data: { ackStatus: 'accepted_999', version: { increment: 1 } } })
      auditCreate(uow, actor, 'Claim', claim.id, 'claim.ack_999_accepted', { status: ack.status })
      return { kind: '999', accepted: true, claimIds: [claim.id], errors: [] as string[] }
    }
    await uow.tx.claim.update({ where: { id: claim.id }, data: { ackStatus: 'rejected_999', version: { increment: 1 } } })
    await transition(uow, { model: 'Claim', id: claim.id, from: ['submitted'], to: 'rejected', actor, eventType: 'claim.rejected_999', reason: ack.errors.join('; ').slice(0, 400) || `999 status ${ack.status}` })
    return { kind: '999', accepted: false, claimIds: [claim.id], errors: ack.errors }
  }
  if (kind === '277') {
    const ack = parse277CA(input.text)
    const moved: string[] = []
    const unmatched: string[] = []
    for (const c of ack.claims) {
      const claim = await uow.tx.claim.findFirst({ where: { communityId: input.communityId, reference: c.claimReference } })
      if (!claim) { unmatched.push(c.claimReference); continue }
      if (claim.status !== 'submitted') { unmatched.push(`${c.claimReference} (${claim.status})`); continue }
      if (c.accepted) {
        await uow.tx.claim.update({ where: { id: claim.id }, data: { ackStatus: 'accepted_277ca', payerClaimNumber: c.payerClaimNumber ?? claim.payerClaimNumber, version: { increment: 1 } } })
        await transition(uow, { model: 'Claim', id: claim.id, from: ['submitted'], to: 'accepted', actor, eventType: 'claim.accepted_277ca', metadata: { category: c.category, status: c.status } })
      } else {
        await uow.tx.claim.update({ where: { id: claim.id }, data: { ackStatus: 'rejected_277ca', version: { increment: 1 } } })
        await transition(uow, { model: 'Claim', id: claim.id, from: ['submitted'], to: 'rejected', actor, eventType: 'claim.rejected_277ca', reason: (c.message || `${c.category}:${c.status}`).slice(0, 400) })
      }
      moved.push(claim.id)
    }
    return { kind: '277CA', claimIds: moved, unmatched }
  }
  throw new DomainError(Codes.INVALID_INPUT, 'This file is not a 999 or 277CA acknowledgement.', { field: 'text' })
}

/* ---- 835 remittance ---------------------------------------------------------------------------------------------- */

type Exception = { code: string; claimReference?: string; message: string; severity: 'blocking' | 'review' }

async function matchRemittance(tx: Tx, communityId: string, remit: Remit835) {
  const exceptions: Exception[] = []
  const matches: { claimId: string; clp: Remit835['claims'][number] }[] = []
  const sum = remit.claims.reduce((n, c) => n + c.paidMinor, 0n) - remit.plbMinor
  if (sum !== remit.totalPaidMinor) exceptions.push({ code: 'total_mismatch', severity: 'blocking', message: 'The claim payments in the file do not add up to the payment total.' })
  for (const clp of remit.claims) {
    const claim = await tx.claim.findFirst({ where: { communityId, reference: clp.claimReference }, include: { lines: { select: { chargeIds: true } } } })
    if (!claim) { exceptions.push({ code: 'claim_not_found', claimReference: clp.claimReference, severity: 'blocking', message: `No claim ${clp.claimReference} in this community.` }); continue }
    if (!CAN_PAY.includes(claim.status)) { exceptions.push({ code: 'claim_status', claimReference: clp.claimReference, severity: 'blocking', message: `Claim ${clp.claimReference} is ${claim.status}; it cannot take a payment.` }); continue }
    if (clp.billedMinor !== claim.totalChargesMinor) exceptions.push({ code: 'billed_differs', claimReference: clp.claimReference, severity: 'blocking', message: `The payer billed amount ${clp.billedMinor} differs from the claim ${claim.totalChargesMinor}.` })
    const adj = clp.contractualMinor + clp.prMinor + clp.otherMinor
    if (clp.paidMinor + adj !== clp.billedMinor) exceptions.push({ code: 'claim_unbalanced', claimReference: clp.claimReference, severity: 'blocking', message: 'Paid plus adjustments do not equal the billed amount.' })
    if (clp.paidMinor > claim.totalChargesMinor - (claim.paidMinor ?? 0n)) exceptions.push({ code: 'over_credit', claimReference: clp.claimReference, severity: 'blocking', message: 'The payment is more than the claim has left to pay.' })
    const coinIds = claim.lines.flatMap(l => (l.chargeIds as string[] | null) ?? [])
    if (coinIds.length) {
      const coins = await tx.charge.aggregate({ where: { id: { in: coinIds }, kind: 'coinsurance', status: { in: ['open', 'posted'] } }, _sum: { amountMinor: true } })
      if ((coins._sum.amountMinor ?? 0n) !== clp.prMinor) exceptions.push({ code: 'pr_variance', claimReference: clp.claimReference, severity: 'review', message: `Patient responsibility ${clp.prMinor} on the 835 differs from the coinsurance billed to the resident ${coins._sum.amountMinor ?? 0n}.` })
    }
    matches.push({ claimId: claim.id, clp })
  }
  return { exceptions, matches }
}

/** Reads an uploaded 835. The same payer and trace number is imported once: a repeat returns the first import. */
export async function importRemittance(uow: UnitOfWork, actor: Actor, input: { communityId: string; payerId: string; text: string }) {
  const remit = parse835(input.text)
  const fileHash = sha256(input.text)
  const payer = await uow.tx.payer.findUnique({ where: { id: input.payerId } })
  if (!payer) throw new DomainError(Codes.NOT_FOUND, 'Payer not found.')
  const prior = await uow.tx.remittance.findFirst({ where: { payerId: payer.id, traceNumber: remit.traceNumber } })
  if (prior) {
    if (prior.fileHash !== fileHash) throw new DomainError(Codes.GUARD_FAILED, `Trace ${remit.traceNumber} was already imported from a different file.`, { reason: 'trace_reused' })
    return { remittanceId: prior.id, status: prior.status, duplicate: true, exceptions: (prior.exceptions ?? []) as unknown as Exception[] }
  }
  const { exceptions } = await matchRemittance(uow.tx, input.communityId, remit)
  const reference = remit.traceNumber
  const row = await uow.tx.remittance.create({
    data: { communityId: input.communityId, payerId: payer.id, traceNumber: reference, paymentDate: day(remit.paymentDate), totalPaidMinor: remit.totalPaidMinor, fileHash, rawText: input.text, status: 'imported', exceptions: exceptions as never, claimCount: remit.claims.length, importedById: actorUserId(actor) },
  })
  auditCreate(uow, actor, 'Remittance', row.id, 'remittance.imported', { traceNumber: reference, totalPaidMinor: remit.totalPaidMinor.toString(), claims: remit.claims.length })
  await transition(uow, { model: 'Remittance', id: row.id, from: ['imported'], to: 'matched', actor, eventType: 'remittance.matched', data: { exceptions: exceptions as never }, metadata: { blocking: exceptions.filter(e => e.severity === 'blocking').length } })
  return { remittanceId: row.id, status: 'matched', duplicate: false, exceptions }
}

/** matched → posted. All or nothing: any blocking exception keeps the whole remittance at matched. */
export async function postRemittance(uow: UnitOfWork, actor: Actor, input: { remittanceId: string }) {
  await lockRow(uow.tx, 'Remittance', input.remittanceId)
  const row = await uow.tx.remittance.findUniqueOrThrow({ where: { id: input.remittanceId } })
  if (row.status === 'posted') return { remittanceId: row.id, status: 'posted', posted: 0, replay: true }
  if (row.status !== 'matched') throw new DomainError(Codes.INVALID_TRANSITION, `The remittance is ${row.status}.`, { currentStatus: row.status })
  const remit = parse835(row.rawText)
  const { exceptions, matches } = await matchRemittance(uow.tx, row.communityId!, remit)
  const blocking = exceptions.filter(e => e.severity === 'blocking')
  if (blocking.length) {
    await uow.tx.remittance.update({ where: { id: row.id }, data: { exceptions: exceptions as never, version: { increment: 1 } } })
    throw new DomainError(Codes.GUARD_FAILED, `The remittance has ${blocking.length} exception(s) and was not posted. Nothing was credited.`, { reason: 'exceptions', exceptions })
  }
  let posted = 0
  for (const { claimId, clp } of matches) {
    await lockRow(uow.tx, 'Claim', claimId)
    const claim = await uow.tx.claim.findUniqueOrThrow({ where: { id: claimId }, include: { lines: { orderBy: { lineNumber: 'asc' } } } })
    await uow.tx.remittancePosting.create({
      data: { communityId: claim.communityId, residentId: claim.residentId, remittanceId: row.id, claimId, paidMinor: clp.paidMinor, contractualMinor: clp.contractualMinor, patientResponsibilityMinor: clp.prMinor, otherMinor: clp.otherMinor, adjustments: clp.adjustments.map(a => ({ group: a.group, reason: a.reason, amountMinor: a.amountMinor.toString() })) as never },
    })
    // Spread the payment over the lines in order, never above a line's charge.
    let left = clp.paidMinor
    for (const line of claim.lines) {
      const room = line.chargeMinor - (line.paidMinor ?? 0n)
      const take = left < room ? left : room
      if (take > 0n) { await uow.tx.claimLine.update({ where: { id: line.id }, data: { paidMinor: (line.paidMinor ?? 0n) + take } }); left -= take }
    }
    const paidTotal = (claim.paidMinor ?? 0n) + clp.paidMinor
    const denied = clp.statusCode === '4' || paidTotal === 0n
    const next = denied ? 'denied' : clp.otherMinor > 0n ? 'partially_paid' : 'paid'
    const denial = denied ? { carc: clp.adjustments.map(a => `${a.group}-${a.reason}`), amountMinor: clp.billedMinor.toString(), at: uow.now.toISOString(), remittance: row.traceNumber } : null
    await transition(uow, {
      model: 'Claim', id: claimId, from: CAN_PAY, to: next, actor, eventType: `claim.${next}`, metadata: { remittance: row.traceNumber, paidMinor: clp.paidMinor.toString() },
      data: { paidMinor: paidTotal, denial: denial as never, denialStatus: denied ? 'open' : claim.denialStatus, payerClaimNumber: clp.payerClaimNumber || claim.payerClaimNumber },
    })
    posted += 1
  }
  await transition(uow, { model: 'Remittance', id: row.id, from: ['matched'], to: 'posted', actor, eventType: 'remittance.posted', data: { postedById: actorUserId(actor), postedAt: uow.now, exceptions: exceptions as never }, metadata: { claims: posted } })
  return { remittanceId: row.id, status: 'posted', posted, replay: false }
}

/* ---- Denial work queue ------------------------------------------------------------------------------------------- */

export async function workDenial(uow: UnitOfWork, actor: Actor, input: { claimId: string; to: string; note: string }) {
  if (!['working', 'appealed', 'resolved', 'written_off'].includes(input.to)) throw new DomainError(Codes.INVALID_INPUT, 'Choose working, appealed, resolved or written_off.', { field: 'to' })
  if (!input.note?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Add a note.', { field: 'note' })
  await lockRow(uow.tx, 'Claim', input.claimId)
  const claim = await uow.tx.claim.findUniqueOrThrow({ where: { id: input.claimId } })
  const allowed: Record<string, string[]> = { open: ['working', 'appealed', 'written_off'], working: ['appealed', 'resolved', 'written_off'], appealed: ['resolved', 'written_off', 'working'] }
  if (!(allowed[claim.denialStatus] ?? []).includes(input.to)) throw new DomainError(Codes.INVALID_TRANSITION, `A denial that is ${claim.denialStatus} cannot go to ${input.to}.`, { currentStatus: claim.denialStatus })
  const denial = { ...((claim.denial ?? {}) as object), history: [...(((claim.denial as { history?: unknown[] } | null)?.history) ?? []), { to: input.to, note: input.note.trim().slice(0, 500), by: actorUserId(actor), at: uow.now.toISOString() }] }
  const status = input.to === 'appealed' ? 'appealed' : input.to === 'written_off' || input.to === 'resolved' ? 'finalised' : claim.status
  await uow.tx.claim.update({ where: { id: claim.id }, data: { denialStatus: input.to, denial: denial as never, status, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Claim', claim.id, `claim.denial_${input.to}`, { to: input.to }, { reason: input.note.trim().slice(0, 200) })
  return { claimId: claim.id, denialStatus: input.to, status }
}

/* ---- Ancillary invoices and consolidated billing ----------------------------------------------------------------- */

export async function receiveInvoice(uow: UnitOfWork, actor: Actor, input: { communityId: string; stayId: string; vendor: string; invoiceNumber: string; invoiceDate: string; serviceDate: string; category: string; description?: string; amountMinor: bigint }) {
  if (input.amountMinor <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The amount must be more than zero.', { field: 'amountMinor' })
  const stay = await uow.tx.stay.findFirst({ where: { id: input.stayId, communityId: input.communityId } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  const dup = await uow.tx.ancillaryInvoice.findFirst({ where: { vendor: input.vendor.trim(), invoiceNumber: input.invoiceNumber.trim() } })
  if (dup) return { invoiceId: dup.id, duplicate: true, consolidatedBilling: dup.consolidatedBilling }
  const partA = await uow.tx.coveragePeriod.findFirst({ where: { stayId: stay.id, payer: { kind: 'medicare_a' }, startDate: { lte: day(input.serviceDate) }, OR: [{ endDate: null }, { endDate: { gte: day(input.serviceDate) } }] } })
  const row = await uow.tx.ancillaryInvoice.create({
    data: { communityId: input.communityId, residentId: stay.residentId, stayId: stay.id, vendor: input.vendor.trim(), invoiceNumber: input.invoiceNumber.trim(), invoiceDate: day(input.invoiceDate), serviceDate: day(input.serviceDate), category: input.category, description: input.description?.trim() ?? '', amountMinor: input.amountMinor, consolidatedBilling: Boolean(partA), status: 'received', receivedById: actorUserId(actor) },
  })
  auditCreate(uow, actor, 'AncillaryInvoice', row.id, 'ancillary.received', { vendor: row.vendor, amountMinor: input.amountMinor.toString(), consolidatedBilling: Boolean(partA) })
  return { invoiceId: row.id, duplicate: false, consolidatedBilling: Boolean(partA) }
}

/** received → matched: a consolidated-billing invoice is matched to the stay's Part A claim that covers its service date. */
export async function matchInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string }) {
  const inv = await uow.tx.ancillaryInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } })
  let claimId: string | null = null
  if (inv.consolidatedBilling) {
    const claim = await uow.tx.claim.findFirst({ where: { stayId: inv.stayId, status: { not: 'cancelled' }, periodFrom: { lte: inv.serviceDate! }, periodTo: { gte: inv.serviceDate! } } })
    if (!claim) throw new DomainError(Codes.GUARD_FAILED, 'This service falls in a Part A stay but no claim covers its date yet. Create the month\'s claim first.', { reason: 'no_claim' })
    claimId = claim.id
  }
  await transition(uow, { model: 'AncillaryInvoice', id: inv.id, from: ['received'], to: 'matched', actor, eventType: 'ancillary.matched', data: { claimId } })
  return { invoiceId: inv.id, claimId }
}

export async function approveInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string }) {
  await transition(uow, { model: 'AncillaryInvoice', id: input.invoiceId, from: ['matched'], to: 'approved', actor, eventType: 'ancillary.approved', data: { approvedById: actorUserId(actor) }, guard: row => assertCanDecide(actor, row.receivedById as string | null) })
  return { invoiceId: input.invoiceId, status: 'approved' }
}

export async function payInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string }) {
  await transition(uow, { model: 'AncillaryInvoice', id: input.invoiceId, from: ['approved'], to: 'paid', actor, eventType: 'ancillary.paid', data: { paidAt: uow.now } })
  return { invoiceId: input.invoiceId, status: 'paid' }
}


/** The billing identity the 837I carries: set once by the business office, scrubbed on every claim. */
export async function saveBillingProfile(uow: UnitOfWork, actor: Actor, input: { communityId: string; npi?: string; taxId?: string; taxonomy?: string; zip4?: string; ccn?: string; payerId?: string; electronicPayerId?: string }) {
  const community = await uow.tx.community.findUniqueOrThrow({ where: { id: input.communityId } })
  const ids = { ...((community.identifiers ?? {}) as Record<string, string>) }
  const changed: string[] = []
  for (const key of ['npi', 'taxId', 'taxonomy', 'zip4', 'ccn'] as const) {
    const v = input[key]?.toString().trim()
    if (!v) continue
    if (key === 'npi' && !validNpi(v)) throw new DomainError(Codes.INVALID_INPUT, 'That NPI fails the check digit.', { field: 'npi' })
    if (key === 'zip4' && !/^\d{9}$/.test(v)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the 9-digit ZIP+4 without a dash.', { field: 'zip4' })
    if (key === 'taxonomy' && !/^[0-9A-Z]{10}$/.test(v)) throw new DomainError(Codes.INVALID_INPUT, 'A taxonomy code is 10 letters and digits.', { field: 'taxonomy' })
    if (key === 'taxId' && !/^\d{2}-?\d{7}$/.test(v)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the 9-digit EIN.', { field: 'taxId' })
    if (ids[key] !== v) { ids[key] = v; changed.push(key) }
  }
  if (changed.length) await uow.tx.community.update({ where: { id: community.id }, data: { identifiers: ids } })
  if (input.payerId && input.electronicPayerId?.trim()) {
    await uow.tx.payer.update({ where: { id: input.payerId }, data: { payerId: input.electronicPayerId.trim() } })
    changed.push('payerId')
  }
  if (changed.length) auditCreate(uow, actor, 'Community', community.id, 'claims.billing_profile', { changed })
  return { changed }
}
