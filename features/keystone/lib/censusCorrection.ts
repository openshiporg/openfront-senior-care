import { registerApplier } from './approvalAppliers'
import { requestApproval } from './approval'
import { lockRow } from './cas'
import { appendCensusEvents } from './census'
import { DomainError, Codes } from './errors'
import type { Actor } from './actor'
import type { CensusEventKind } from './censusProjection'
import type { UnitOfWork } from './unitOfWork'
import { label } from '../../../lib/labels'

/**
 * Census corrections (STATE-MACHINES §4.3). A late entry inserts events earlier in the stream; a
 * void marks a stored event as not having happened (with a `correction` event that points at it).
 * Inside an open period a person with canRecordCensus records it directly; once the day is signed
 * off, a second person with canApproveCensusCorrections must approve the exact payload first.
 * Human-only: agents never correct census.
 */

const LATE_KINDS: CensusEventKind[] = ['room_change', 'leave_start', 'hold_release', 'leave_end', 'coverage_change']

export type CorrectionEvent = {
  kind: CensusEventKind
  effectiveAt: string
  toBedId?: string | null
  toApartmentId?: string | null
  leaveKind?: string | null
  holdElected?: boolean | null
  holdPaidBy?: string | null
  voidsEventId?: string | null
}

export type CorrectionPayload = { stayId: string; reason: string; events: CorrectionEvent[]; expectedStayVersion: number }

export function validateCorrection(payload: CorrectionPayload) {
  if (!payload?.stayId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the stay.', { field: 'stayId' })
  if (!payload.reason?.trim() || payload.reason.trim().length < 10) throw new DomainError(Codes.INVALID_INPUT, 'Explain the correction (at least 10 characters).', { field: 'reason' })
  if (!Array.isArray(payload.events) || !payload.events.length || payload.events.length > 10) throw new DomainError(Codes.INVALID_INPUT, 'A correction has 1 to 10 events.', { field: 'events' })
  for (const event of payload.events) {
    if (event.kind === 'correction') {
      if (!event.voidsEventId) throw new DomainError(Codes.INVALID_INPUT, 'A void names the event it voids.', { field: 'voidsEventId' })
    } else if (!LATE_KINDS.includes(event.kind)) {
      throw new DomainError(Codes.INVALID_INPUT, `A correction cannot record ${label(event.kind).toLowerCase()}; use the admission, discharge or death command.`, { field: 'kind' })
    }
    if (Number.isNaN(new Date(event.effectiveAt).getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Each event needs a valid time.', { field: 'effectiveAt' })
  }
}

/** Applies a correction to the stream (late group of events, re-validated in effective order). */
export async function applyCorrection(uow: UnitOfWork, actor: Actor, payload: CorrectionPayload, approvalId: string | null) {
  validateCorrection(payload)
  const stay = await lockRow<any>(uow.tx, 'Stay', payload.stayId)
  if (stay.version !== payload.expectedStayVersion) throw new DomainError(Codes.STALE_STATE, 'The stay changed after this correction was prepared. Prepare it again.', { currentStatus: stay.status, currentVersion: stay.version })
  const result = await appendCensusEvents(uow, actor, stay, payload.events.map((event, index) => ({
    kind: event.kind, effectiveAt: new Date(event.effectiveAt), toBedId: event.toBedId ?? null, toApartmentId: event.toApartmentId ?? null,
    leaveKind: event.leaveKind ?? null, holdElected: event.holdElected ?? null, holdPaidBy: event.holdPaidBy ?? null,
    voidsEventId: event.voidsEventId ?? null, correctionReason: payload.reason.trim(), approvalId, idempotencyKey: `correction:${approvalId ?? 'open'}:${index}`,
  })), { late: true })
  return { stayId: payload.stayId, events: result.events, presence: result.after.presence, version: result.version }
}

/** Opens a maker-checker request for a closed-period correction. */
export async function requestClosedPeriodCorrection(uow: UnitOfWork, actor: Actor, payload: CorrectionPayload) {
  validateCorrection(payload)
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Census corrections are requested by people only.')
  const stay = await uow.tx.stay.findUnique({ where: { id: payload.stayId }, select: { id: true, communityId: true, reference: true, version: true } })
  if (!stay) throw new DomainError(Codes.NOT_FOUND, 'Stay not found.')
  return requestApproval(uow, actor, {
    action: 'census.correct_closed_period', targetList: 'Stay', targetId: stay.id, communityId: stay.communityId,
    payload: { ...payload, reason: payload.reason.trim() }, requiredPermission: 'canApproveCensusCorrections',
    summary: `Correct the signed-off census for stay ${stay.reference}: ${payload.events.map(e => label(e.kind).toLowerCase()).join(', ')}`,
  })
}

// Applies in the approving transaction, so the approved payload is exactly what is written.
registerApplier('census.correct_closed_period', (uow, actor, request) => applyCorrection(uow, actor, request.payload as CorrectionPayload, request.id), { applyOnApprove: true })
