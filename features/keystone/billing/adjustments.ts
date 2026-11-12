import { type Actor } from '../lib/actor'
import { registerApplier } from '../lib/approvalAppliers'
import { requestApproval } from '../lib/approval'
import { actorUserId } from '../lib/actor'
import { auditCreate, casUpdate, lockRow } from '../lib/cas'
import { DomainError, Codes } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { balanceOf } from './payments'

/**
 * Adjustments and write-offs (BUILD-PLAN: Adjustment/WriteOff, [MC] thresholds). Both reduce what a statement still owes by a
 * positive amount. At or above OperatorSettings.writeOffApprovalThresholdMinor the row waits for a different person who holds
 * canApproveWriteOffs (approval action `balance.adjust`, applied on approval). A posted row is never edited: a correction is a
 * new row that supersedes it, and the statement's adjustedMinor moves by the difference, so the balance always reflects them.
 */

type Kind = 'adjustment' | 'write_off'

async function post(uow: UnitOfWork, actor: Actor, id: string) {
  await lockRow(uow.tx, 'BalanceAdjustment', id)
  const row = await uow.tx.balanceAdjustment.findUniqueOrThrow({ where: { id } })
  if (row.status !== 'pending_approval') throw new DomainError(Codes.GUARD_FAILED, `This ${row.kind.replace('_', ' ')} is ${row.status.replace('_', ' ')}.`)
  await lockRow(uow.tx, 'Statement', row.statementId!)
  const statement = await uow.tx.statement.findUniqueOrThrow({ where: { id: row.statementId! } })
  let freed = 0n
  if (row.supersedesId) {
    const old = await uow.tx.balanceAdjustment.findUniqueOrThrow({ where: { id: row.supersedesId } })
    if (old.status !== 'posted') throw new DomainError(Codes.GUARD_FAILED, 'The entry being corrected is no longer posted.')
    freed = old.amountMinor
  }
  const balance = balanceOf(statement) + freed
  if (row.amountMinor > balance) throw new DomainError(Codes.GUARD_FAILED, 'That is more than the statement balance.', { reason: 'over_balance' })
  if (row.supersedesId) await uow.tx.balanceAdjustment.update({ where: { id: row.supersedesId }, data: { status: 'superseded', version: { increment: 1 } } })
  const adjusted = (statement.adjustedMinor ?? 0n) - freed + row.amountMinor
  const settled = (statement.paidMinor ?? 0n) + adjusted >= (statement.totalMinor ?? 0n)
  await uow.tx.statement.update({ where: { id: statement.id }, data: { adjustedMinor: adjusted, status: settled ? 'paid' : 'issued', version: { increment: 1 } } })
  await casUpdate(uow, { model: 'BalanceAdjustment', id: row.id, version: row.version, from: ['pending_approval'], to: 'posted', actor, eventType: `balance.${row.kind}_posted`, data: { postedAt: uow.now } })
  return { adjustmentId: row.id, status: 'posted' }
}

export async function requestBalanceChange(uow: UnitOfWork, actor: Actor, input: { kind: Kind; statementId: string; amountMinor: bigint; reason: string; supersedesId?: string | null }) {
  if (input.kind !== 'adjustment' && input.kind !== 'write_off') throw new DomainError(Codes.INVALID_INPUT, 'An adjustment or a write-off.', { field: 'kind' })
  if (typeof input.amountMinor !== 'bigint' || input.amountMinor <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The amount must be more than zero.', { field: 'amount' })
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Say why.', { field: 'reason' })
  await lockRow(uow.tx, 'Statement', input.statementId)
  const statement = await uow.tx.statement.findUniqueOrThrow({ where: { id: input.statementId } })
  if (statement.status === 'void') throw new DomainError(Codes.GUARD_FAILED, 'This statement was voided.')
  let freed = 0n
  if (input.supersedesId) {
    await lockRow(uow.tx, 'BalanceAdjustment', input.supersedesId)
    const old = await uow.tx.balanceAdjustment.findUniqueOrThrow({ where: { id: input.supersedesId } })
    if (old.statementId !== statement.id || old.status !== 'posted') throw new DomainError(Codes.GUARD_FAILED, 'Only a posted entry on this statement can be corrected.')
    const pending = await uow.tx.balanceAdjustment.findFirst({ where: { supersedesId: old.id, status: 'pending_approval' }, select: { id: true } })
    if (pending) throw new DomainError(Codes.GUARD_FAILED, 'A correction of this entry is already waiting.')
    freed = old.amountMinor
  }
  if (input.amountMinor > balanceOf(statement) + freed) throw new DomainError(Codes.GUARD_FAILED, 'That is more than the statement balance.', { reason: 'over_balance' })
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { writeOffApprovalThresholdMinor: true } })
  const needsApproval = input.amountMinor >= (settings?.writeOffApprovalThresholdMinor ?? 0n)
  const row = await uow.tx.balanceAdjustment.create({
    data: { communityId: statement.communityId, residentId: statement.residentId, statementId: statement.id, kind: input.kind, amountMinor: input.amountMinor, reason: input.reason.trim(), status: 'pending_approval', supersedesId: input.supersedesId ?? null, requestedById: actorUserId(actor) },
  })
  auditCreate(uow, actor, 'BalanceAdjustment', row.id, `balance.${input.kind}_requested`, { amountMinor: input.amountMinor.toString(), needsApproval }, { reason: input.reason.trim() })
  if (!needsApproval) return { ...(await post(uow, actor, row.id)), approvalRequestId: null }
  const approval = await requestApproval(uow, actor, { action: 'balance.adjust', targetList: 'BalanceAdjustment', targetId: row.id, payload: { adjustmentId: row.id, statementId: statement.id, kind: input.kind, amountMinor: input.amountMinor.toString() }, requiredPermission: 'canApproveWriteOffs', summary: `${input.kind === 'write_off' ? 'Write off' : 'Adjust'} ${input.amountMinor.toString()} minor units: ${input.reason.trim().slice(0, 80)}`, communityId: statement.communityId })
  await uow.tx.balanceAdjustment.update({ where: { id: row.id }, data: { approvalId: approval.id } })
  return { adjustmentId: row.id, status: 'pending_approval', approvalRequestId: approval.id }
}

registerApplier('balance.adjust', async (uow, actor, request) => post(uow, actor, request.targetId))
