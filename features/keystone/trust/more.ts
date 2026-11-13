import { actorUserId, type Actor } from '../lib/actor'
import { requestApproval } from '../lib/approval'
import { registerApplier } from '../lib/approvalAppliers'
import { addDays, localDate } from '../lib/calendar'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { nextReference } from '../lib/sequence'
import type { UnitOfWork } from '../lib/unitOfWork'
import { assertBalanced, assertHistoricalMinimumBalances, linesFor, TrustLedgerError, type TrustLine } from './ledger'
import { linesOfAccount, statedThrough } from './service'
export { assertAuthorised } from './authorisation'
import { allocateInterest, bondStatus, dailyBalanceSums, monthEndOf, quarterEnd, quarterStart, quarterStatement, resourceAlert, trustRules, type StatementTx } from './extras'

/**
 * Phase 3b trust operations (SCHEMA §11.3, §11.5; STATE-MACHINES §13.1, §13.3, §13.5). Every one is a staff button; the clocks and
 * alerts are read, never run. Trust lines always balance and no resident ledger goes negative at any date (checked here and by the
 * database triggers from phase 3 r1).
 */

const iso = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '')
const day = (date: string) => new Date(`${date}T00:00:00Z`)
const DATE = /^\d{4}-\d{2}-\d{2}$/
const asDomain = (error: unknown): never => {
  if (error instanceof TrustLedgerError) throw new DomainError(error.reason === 'overdrawn' ? Codes.GUARD_FAILED : Codes.INVALID_INPUT, error.message, { reason: error.reason })
  if (error instanceof RangeError) throw new DomainError(Codes.INVALID_INPUT, error.message)
  throw error
}

async function packRules(tx: Tx, communityId: string | null) {
  const community = communityId ? await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true, jurisdictionPack: { select: { rules: true } } } }) : null
  return { ...trustRules(community?.jurisdictionPack?.rules), timeZone: community?.timeZone ?? 'America/New_York' }
}

/* ---- TrustAuthorisation ---------------------------------------------------------------------------------------- */

export const AUTHORISATION_KINDS = ['deposit', 'withdrawal_cash', 'withdrawal_purchase', 'liability_transfer'] as const

/**
 * Records the written authorisation the resident or representative signed. With no per-withdrawal limit, or a limit over the pack's
 * threshold, it waits for a second person with canApproveTrust (never the recorder) before withdrawals can rely on it.
 */
export async function recordAuthorisation(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; representativeId?: string | null; signedOn: string; kinds: string[]; perWithdrawalLimitMinor?: bigint | null; documentId?: string | null }) {
  if (!DATE.test(String(input.signedOn ?? ''))) throw new DomainError(Codes.INVALID_INPUT, 'The signed date is a date, like 2026-10-01.', { field: 'signedOn' })
  const kinds = [...new Set((input.kinds ?? []).map(String))]
  if (!kinds.length || kinds.some(kind => !(AUTHORISATION_KINDS as readonly string[]).includes(kind))) throw new DomainError(Codes.INVALID_INPUT, `Choose what the authorisation covers: ${AUTHORISATION_KINDS.join(', ')}.`, { field: 'kinds' })
  const limit = input.perWithdrawalLimitMinor ?? null
  if (limit !== null && limit <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'A limit must be more than zero; leave it blank for no limit.', { field: 'perWithdrawalLimitMinor' })
  await lockRow(uow.tx, 'ResidentTrustLedger', input.ledgerId)
  const ledger = await uow.tx.residentTrustLedger.findUnique({ where: { id: input.ledgerId } })
  if (!ledger || ledger.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, 'Authorisations are recorded on an open trust ledger.')
  if (input.representativeId) {
    const rep = await uow.tx.representative.findUnique({ where: { id: input.representativeId }, select: { residentId: true } })
    if (rep?.residentId !== ledger.residentId) throw new DomainError(Codes.INVALID_INPUT, 'That representative is not this resident\'s.', { field: 'representativeId' })
  }
  const rules = await packRules(uow.tx, ledger.communityId)
  const needsSecond = limit === null || limit > rules.authorisationOverMinor
  // One active authorisation per ledger (a partial unique index): the older one is revoked first, in the same transaction.
  if (!needsSecond) await supersedeOthers(uow, '', ledger.id)
  const created = await uow.tx.trustAuthorisation.create({
    data: {
      communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, representativeId: input.representativeId ?? null, signedOn: day(input.signedOn), kinds,
      perWithdrawalLimitMinor: limit, documentId: input.documentId ?? null, status: needsSecond ? 'pending_approval' : 'active', recordedById: actorUserId(actor),
    },
  })
  auditCreate(uow, actor, 'TrustAuthorisation', created.id, 'trust.authorisation_recorded', { kinds, perWithdrawalLimitMinor: limit?.toString() ?? null, needsSecond })
  if (!needsSecond) {
    return { authorisationId: created.id, status: 'active', approvalRequestId: null }
  }
  const approval = await requestApproval(uow, actor, {
    action: 'trust.authorise', targetList: 'TrustAuthorisation', targetId: created.id, payload: { authorisationId: created.id, ledgerId: ledger.id, kinds, perWithdrawalLimitMinor: limit?.toString() ?? null },
    requiredPermission: 'canApproveTrust', summary: `Trust authorisation ${limit === null ? 'with no withdrawal limit' : `up to ${limit.toString()} minor units a withdrawal`}`, communityId: ledger.communityId,
  })
  await uow.tx.trustAuthorisation.update({ where: { id: created.id }, data: { approvalId: approval.id } })
  return { authorisationId: created.id, status: 'pending_approval', approvalRequestId: approval.id }
}

/** One active authorisation per ledger: activating a new one revokes the one before. */
async function supersedeOthers(uow: UnitOfWork, keepId: string, ledgerId: string) {
  await uow.tx.trustAuthorisation.updateMany({ where: { ledgerId, status: 'active', id: { not: keepId } }, data: { status: 'revoked', revokedReason: 'Replaced by a newer authorisation.', version: { increment: 1 } } })
}

// The second person's approval activates it in the same transaction (the approval checks the approver is not the requester).
registerApplier('trust.authorise', async (uow, actor, request) => {
  const payload = request.payload as { authorisationId: string; ledgerId: string }
  await lockRow(uow.tx, 'TrustAuthorisation', payload.authorisationId)
  const row = await uow.tx.trustAuthorisation.findUniqueOrThrow({ where: { id: payload.authorisationId } })
  // decideApprovalRequest has already consumed the approval against this exact payload; read who approved it.
  if (row.approvalId !== request.id) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The approval was given for a different authorisation.')
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: request.id, decision: 'approve' }, orderBy: { at: 'desc' }, select: { decidedById: true } })
  const approved = { approverId: decision?.decidedById ?? null }
  if (!approved.approverId || approved.approverId === row.recordedById) throw new DomainError(Codes.SELF_APPROVAL, 'The person who recorded an authorisation cannot approve it.')
  await supersedeOthers(uow, row.id, payload.ledgerId)
  await casUpdate(uow, { model: 'TrustAuthorisation', id: row.id, version: row.version, from: ['pending_approval'], to: 'active', actor, eventType: 'trust.authorisation_approved', approverId: approved.approverId })
  return { authorisationId: row.id, status: 'active' }
}, { applyOnApprove: true })

export async function revokeAuthorisation(uow: UnitOfWork, actor: Actor, input: { authorisationId: string; reason: string }) {
  const reason = String(input.reason ?? '').trim()
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the authorisation is revoked.', { field: 'reason' })
  const row = await lockRow<any>(uow.tx, 'TrustAuthorisation', input.authorisationId)
  await casUpdate(uow, { model: 'TrustAuthorisation', id: row.id, version: row.version, from: ['active', 'pending_approval'], to: 'revoked', actor, eventType: 'trust.authorisation_revoked', reason, data: { revokedReason: reason } })
  return { authorisationId: row.id, status: 'revoked' }
}

/* ---- Interest allocation --------------------------------------------------------------------------------------- */

/**
 * Posts one month's bank interest to the resident ledgers of an account by average daily balance (largest remainder). One
 * `interest` transaction per resident share, each with balanced lines (bank control debit, resident credit); the run row is unique
 * per account and month, so pressing the button twice cannot pay interest twice.
 */
export async function allocateAccountInterest(uow: UnitOfWork, actor: Actor, input: { accountId: string; month: string; interestMinor: bigint }) {
  if (!/^\d{4}-\d{2}-01$/.test(String(input.month ?? ''))) throw new DomainError(Codes.INVALID_INPUT, 'The month is the first day of the month, like 2026-10-01.', { field: 'month' })
  if (typeof input.interestMinor !== 'bigint' || input.interestMinor <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The interest must be more than zero.', { field: 'interestMinor' })
  await lockRow(uow.tx, 'TrustAccount', input.accountId)
  const account = await uow.tx.trustAccount.findUnique({ where: { id: input.accountId } })
  if (!account || account.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'Trust account not found.')
  const rules = await packRules(uow.tx, account.communityId)
  const end = monthEndOf(input.month)
  const today = localDate(rules.timeZone, uow.now)
  if (end >= today) throw new DomainError(Codes.GUARD_FAILED, 'Allocate a month\'s interest after the month has ended.', { reason: 'month_not_over' })
  if (await uow.tx.interestAllocationRun.findFirst({ where: { accountId: account.id, month: day(input.month) }, select: { id: true } })) throw new DomainError(Codes.GUARD_FAILED, 'Interest for this month was already allocated. Reverse its entries to correct it.', { reason: 'already_allocated' })
  const ledgers = await uow.tx.residentTrustLedger.findMany({ where: { accountId: account.id }, select: { id: true, residentId: true, communityId: true, status: true } })
  const existing = await linesOfAccount(uow.tx, account.id)
  // Interest is earned by the funds held during the month; a ledger closed before the month ends still earns its share, posted on the month's last day
  // (or today, when that quarter's statement is already made).
  let shares
  try {
    shares = allocateInterest(input.interestMinor, dailyBalanceSums(existing, ledgers.map(l => l.id), input.month))
  } catch (error) {
    asDomain(error)
  }
  const proposed: TrustLine[] = []
  const out: { ledgerId: string; amountMinor: string; transactionId: string; weightMinorDays: string }[] = []
  for (const share of shares!) {
    const ledger = ledgers.find(l => l.id === share.ledgerId)!
    // A month already on a frozen quarterly statement for this ledger: the interest is dated today, so it shows on the next statement.
    const through = await statedThrough(uow.tx, ledger.id)
    const on = through && end <= through ? today : end
    const lines = linesFor('interest', { ledgerId: ledger.id, amountMinor: share.amountMinor, effectiveOn: on })
    assertBalanced(lines)
    const tx = await uow.tx.trustTransaction.create({
      data: {
        communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, accountId: account.id, reference: await nextReference(uow.tx, 'TRX', uow.now, 6), kind: 'interest',
        amountMinor: share.amountMinor, purpose: `Interest for ${input.month.slice(0, 7)}`, status: 'posted', preparedById: actorUserId(actor), effectiveOn: day(on), postedAt: uow.now,
      },
    })
    await uow.tx.trustLedgerLine.createMany({ data: lines.map(line => ({ communityId: ledger.communityId, residentId: ledger.residentId, transactionId: tx.id, ledgerId: line.ledgerId, accountId: account.id, bucket: line.bucket, side: line.side, amountMinor: line.amountMinor, effectiveOn: day(line.effectiveOn) })) })
    proposed.push(...lines)
    out.push({ ledgerId: ledger.id, amountMinor: share.amountMinor.toString(), transactionId: tx.id, weightMinorDays: share.weightMinorDays.toString() })
  }
  try {
    // Interest only adds money, but the check costs nothing and keeps the rule in one place.
    assertHistoricalMinimumBalances(existing, proposed)
  } catch (error) {
    asDomain(error)
  }
  const total = out.reduce((sum, row) => sum + BigInt(row.amountMinor), 0n)
  if (total !== input.interestMinor) throw new DomainError(Codes.GUARD_FAILED, 'Interest shares do not add up to the interest.')
  const run = await uow.tx.interestAllocationRun.create({ data: { communityId: account.communityId, accountId: account.id, month: day(input.month), interestMinor: input.interestMinor, method: 'average_daily_balance', residualRule: 'largest_remainder', allocations: out, postedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'InterestAllocationRun', run.id, 'trust.interest_allocated', { month: input.month, interestMinor: input.interestMinor.toString(), shares: out.length })
  return { runId: run.id, interestMinor: input.interestMinor.toString(), allocations: out }
}

/* ---- Quarterly statements -------------------------------------------------------------------------------------- */

/** Builds and freezes one resident's statement for a finished quarter. Pressing it again returns the one already made. */
export async function generateQuarterlyStatement(uow: UnitOfWork, actor: Actor, input: { ledgerId: string; quarter: string }) {
  const start = quarterStart(String(input.quarter ?? '').slice(0, 10))
  if (!DATE.test(start)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the quarter, like 2026-07-01.', { field: 'quarter' })
  await lockRow(uow.tx, 'ResidentTrustLedger', input.ledgerId)
  const ledger = await uow.tx.residentTrustLedger.findUnique({ where: { id: input.ledgerId } })
  if (!ledger?.accountId) throw new DomainError(Codes.NOT_FOUND, 'Trust ledger not found.')
  const rules = await packRules(uow.tx, ledger.communityId)
  if (quarterEnd(start) >= localDate(rules.timeZone, uow.now)) throw new DomainError(Codes.GUARD_FAILED, 'A quarterly statement is made after the quarter ends.', { reason: 'quarter_not_over' })
  const existing = await uow.tx.trustStatement.findFirst({ where: { ledgerId: ledger.id, quarter: day(start) }, select: { id: true } })
  if (existing) return { statementId: existing.id, created: false }
  const txs = await uow.tx.trustTransaction.findMany({ where: { ledgerId: ledger.id, status: 'posted' }, select: { reference: true, kind: true, purpose: true, effectiveOn: true, ledgerId: true, lines: { select: { ledgerId: true, bucket: true, side: true, amountMinor: true, effectiveOn: true } } } })
  const mapped: StatementTx[] = txs.map(tx => ({
    reference: tx.reference ?? '', kind: tx.kind ?? '', purpose: tx.purpose ?? '', effectiveOn: iso(tx.effectiveOn), ledgerId: tx.ledgerId ?? '',
    lines: tx.lines.map(line => ({ ledgerId: line.ledgerId, bucket: line.bucket as TrustLine['bucket'], side: line.side as TrustLine['side'], amountMinor: line.amountMinor, effectiveOn: iso(line.effectiveOn) })),
  }))
  const s = quarterStatement(ledger.id, mapped, start)
  const created = await uow.tx.trustStatement.create({
    data: { communityId: ledger.communityId, residentId: ledger.residentId, ledgerId: ledger.id, quarter: day(start), openingMinor: s.openingMinor, inMinor: s.inMinor, outMinor: s.outMinor, closingMinor: s.closingMinor, lines: s.lines, generatedById: actorUserId(actor), generatedAt: uow.now },
  })
  auditCreate(uow, actor, 'TrustStatement', created.id, 'trust.statement_generated', { quarter: start, closingMinor: s.closingMinor.toString() })
  return { statementId: created.id, created: true }
}

/** Every open (or recently closed) ledger on an account for one quarter: the staff button on the Trust page. */
export async function generateQuarterForAccount(uow: UnitOfWork, actor: Actor, input: { accountId: string; quarter: string }) {
  const start = quarterStart(String(input.quarter ?? '').slice(0, 10))
  const ledgers = await uow.tx.residentTrustLedger.findMany({ where: { accountId: input.accountId, OR: [{ status: 'open' }, { closedOn: { gte: day(start) } }] }, select: { id: true }, orderBy: { reference: 'asc' } })
  let created = 0
  for (const ledger of ledgers) if ((await generateQuarterlyStatement(uow, actor, { ledgerId: ledger.id, quarter: start })).created) created += 1
  return { quarter: start, ledgers: ledgers.length, created }
}

/* ---- Surety bond ----------------------------------------------------------------------------------------------- */

export async function recordSuretyBond(uow: UnitOfWork, actor: Actor, input: { accountId: string; carrier: string; bondNumber: string; amountMinor: bigint; effectiveFrom: string; expiresOn: string }) {
  if (!String(input.carrier ?? '').trim() || !String(input.bondNumber ?? '').trim()) throw new DomainError(Codes.INVALID_INPUT, 'Enter the carrier and the bond number.')
  if (typeof input.amountMinor !== 'bigint' || input.amountMinor <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The bond amount must be more than zero.', { field: 'amountMinor' })
  if (!DATE.test(String(input.effectiveFrom ?? '')) || !DATE.test(String(input.expiresOn ?? '')) || input.expiresOn <= input.effectiveFrom) throw new DomainError(Codes.INVALID_INPUT, 'Enter the dates the bond runs from and to; it must end after it starts.')
  await lockRow(uow.tx, 'TrustAccount', input.accountId)
  const account = await uow.tx.trustAccount.findUnique({ where: { id: input.accountId }, select: { id: true, communityId: true } })
  if (!account) throw new DomainError(Codes.NOT_FOUND, 'Trust account not found.')
  const prior = await uow.tx.suretyBond.findFirst({ where: { accountId: account.id, status: 'active' } })
  // One active bond per account (a partial unique index): the old one is marked replaced first, then pointed at the new one.
  if (prior) await casUpdate(uow, { model: 'SuretyBond', id: prior.id, version: prior.version, from: ['active'], to: 'replaced', actor, eventType: 'trust.bond_replaced' })
  const bond = await uow.tx.suretyBond.create({ data: { communityId: account.communityId, accountId: account.id, carrier: input.carrier.trim(), bondNumber: input.bondNumber.trim(), amountMinor: input.amountMinor, effectiveFrom: day(input.effectiveFrom), expiresOn: day(input.expiresOn), status: 'active', recordedById: actorUserId(actor) } })
  if (prior) await uow.tx.suretyBond.update({ where: { id: prior.id }, data: { replacedById: bond.id, version: { increment: 1 } } })
  auditCreate(uow, actor, 'SuretyBond', bond.id, 'trust.bond_recorded', { amountMinor: input.amountMinor.toString(), expiresOn: input.expiresOn, replaces: prior?.id ?? null })
  return { bondId: bond.id, replaces: prior?.id ?? null }
}

/* ---- Reads (computed on read) ---------------------------------------------------------------------------------- */

/** Resource alerts for every open ledger on an account and the bond status, worked out now. */
export async function trustAlerts(tx: Tx, accountId: string, today: string) {
  const account = await tx.trustAccount.findUnique({ where: { id: accountId }, select: { communityId: true } })
  const rules = await packRules(tx, account?.communityId ?? null)
  const ledgers = await tx.residentTrustLedger.findMany({ where: { accountId, status: 'open' }, select: { id: true, residentId: true } })
  const lines = await linesOfAccount(tx, accountId)
  const residentIds = ledgers.map(l => l.residentId).filter((id): id is string => Boolean(id))
  const medicaid = new Set(
    (await tx.coveragePeriod.findMany({
      where: { status: 'active', startDate: { lte: day(today) }, OR: [{ endDate: null }, { endDate: { gte: day(today) } }], payer: { kind: { in: ['medicaid_ffs', 'medicaid_mco'] } }, stay: { residentId: { in: residentIds } } },
      select: { stay: { select: { residentId: true } } },
    })).map(row => row.stay?.residentId).filter(Boolean) as string[],
  )
  const alerts = ledgers.map(ledger => {
    let balance = 0n
    for (const line of lines) if (line.ledgerId === ledger.id && line.bucket === 'client_liability' && line.effectiveOn <= today) balance += line.side === 'credit' ? line.amountMinor : -line.amountMinor
    return { ledgerId: ledger.id, residentId: ledger.residentId, balanceMinor: balance, ...resourceAlert(balance, medicaid.has(ledger.residentId ?? ''), rules.resource) }
  })
  let funds = 0n
  for (const line of lines) if (line.bucket === 'client_liability' && line.effectiveOn <= today) funds += line.side === 'credit' ? line.amountMinor : -line.amountMinor
  const bond = await tx.suretyBond.findFirst({ where: { accountId, status: 'active' }, select: { id: true, carrier: true, bondNumber: true, amountMinor: true, expiresOn: true } })
  return {
    rule: rules.resource,
    alerts,
    bond: bond ? { ...bond, expiresOn: iso(bond.expiresOn) } : null,
    bondStatus: bondStatus(bond ? { amountMinor: bond.amountMinor, expiresOn: iso(bond.expiresOn) || null } : null, funds, today),
    fundsMinor: funds,
    nextQuarterDue: addDays(quarterEnd(quarterStart(today)), 1),
  }
}
