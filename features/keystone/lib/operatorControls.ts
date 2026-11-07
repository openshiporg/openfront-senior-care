import { DomainError, Codes } from './errors'
import { registerApplier } from './approvalAppliers'
import { requestApproval } from './approval'
import type { Actor } from './actor'
import type { UnitOfWork } from './unitOfWork'

/**
 * Operator-wide controls (inference policy, break-glass window, re-auth, bed-hold notice grace,
 * approval thresholds, agent-owner separation) change only through maker-checker: one person
 * requests, a second with canApproveCompliance approves, then the change applies against the
 * version that was approved (STATE-MACHINES §0, SCHEMA §1.1).
 */

export type OperatorControls = {
  inferencePolicy?: 'self_hosted_only' | 'self_hosted_or_baa' | 'any_registered'
  breakGlassMaxHours?: number
  reauthMinutes?: number
  bedHoldNoticeGraceHours?: number
  writeOffApprovalThresholdMinor?: string
  refundApprovalThresholdMinor?: string
  trustApprovalThresholdMinor?: string
  strictAgentOwnerSoD?: boolean
}

const KEYS = ['inferencePolicy', 'breakGlassMaxHours', 'reauthMinutes', 'bedHoldNoticeGraceHours', 'writeOffApprovalThresholdMinor', 'refundApprovalThresholdMinor', 'trustApprovalThresholdMinor', 'strictAgentOwnerSoD'] as const
const INTS: Record<string, [number, number]> = { breakGlassMaxHours: [1, 24], reauthMinutes: [1, 60], bedHoldNoticeGraceHours: [0, 72] }

export function validateOperatorControls(input: OperatorControls): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const keys = Object.keys(input ?? {})
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to change.')
  for (const key of keys) {
    if (!(KEYS as readonly string[]).includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not an operator control.`, { field: key })
    const value = (input as Record<string, unknown>)[key]
    if (key in INTS) {
      const [min, max] = INTS[key]
      if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new DomainError(Codes.INVALID_INPUT, `${key} must be a whole number from ${min} to ${max}.`, { field: key })
      out[key] = value
    } else if (key.endsWith('Minor')) {
      if (typeof value !== 'string' || !/^\d{1,15}$/.test(value)) throw new DomainError(Codes.INVALID_INPUT, `${key} must be a whole number of cents.`, { field: key })
      out[key] = BigInt(value)
    } else if (key === 'inferencePolicy') {
      if (!['self_hosted_only', 'self_hosted_or_baa', 'any_registered'].includes(String(value))) throw new DomainError(Codes.INVALID_INPUT, 'Unknown inference policy.', { field: key })
      out[key] = value
    } else {
      if (typeof value !== 'boolean') throw new DomainError(Codes.INVALID_INPUT, `${key} must be true or false.`, { field: key })
      out[key] = value
    }
  }
  return out
}

export async function requestOperatorControlsChange(uow: UnitOfWork, actor: Actor, input: OperatorControls, reason: string) {
  const changes = validateOperatorControls(input)
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 } })
  if (!settings) throw new DomainError(Codes.NOT_FOUND, 'Operator settings are not set up yet.')
  return requestApproval(uow, actor, {
    action: 'operator.controls',
    targetList: 'OperatorSettings',
    targetId: '1',
    payload: { changes, baseVersion: settings.version },
    requiredPermission: 'canApproveCompliance',
    summary: `Change operator controls: ${Object.keys(changes).join(', ')}${reason ? ` (${reason})` : ''}`,
  })
}

registerApplier('operator.controls', async (uow, actor, request) => {
  const [row] = await uow.tx.$queryRaw<{ version: number }[]>`SELECT version FROM "OperatorSettings" WHERE id = 1 FOR UPDATE`
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Operator settings are not set up yet.')
  const { changes, baseVersion } = request.payload as { changes: Record<string, unknown>; baseVersion: number }
  if (row.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, 'Operator settings changed after this was approved. Request the change again.', { currentVersion: row.version })
  const data = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, key.endsWith('Minor') ? BigInt(String(value)) : value]))
  const before = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: Object.fromEntries(Object.keys(data).map(key => [key, true])) as never })
  const updated = await uow.tx.operatorSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...data, version: { increment: 1 } } as never })
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'Operator settings changed while applying.')
  uow.audit({ eventType: 'operator.controls_changed', entityType: 'OperatorSettings', entityId: '1', actorUserId: actor.kind === 'user' ? actor.userId : null, before, after: changes })
  return { applied: Object.keys(changes) }
})
