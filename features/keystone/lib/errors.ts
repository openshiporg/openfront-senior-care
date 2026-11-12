/** A business-rule failure with a stable code. Messages reach the caller; database detail never does. */
export class DomainError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.details = details
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError

export const Codes = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  STALE_STATE: 'STALE_STATE',
  GUARD_FAILED: 'GUARD_FAILED',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IN_PROGRESS: 'IN_PROGRESS',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  SELF_APPROVAL: 'SELF_APPROVAL',
  AGENT_CANNOT_APPROVE: 'AGENT_CANNOT_APPROVE',
  APPROVAL_MISMATCH: 'APPROVAL_MISMATCH',
  LEASE_LOST: 'LEASE_LOST',
  STALE_FENCING_TOKEN: 'STALE_FENCING_TOKEN',
  AUDIT_CHAIN_BROKEN: 'AUDIT_CHAIN_BROKEN',
  PLACE_UNAVAILABLE: 'PLACE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  PROJECTION_MISMATCH: 'PROJECTION_MISMATCH',
  /** Protected data would reach a provider that may not receive it (no_phi, sandbox with real subjects, lapsed BAA). */
  INFERENCE_PHI_BLOCKED: 'INFERENCE_PHI_BLOCKED',
  /** OperatorSettings.inferencePolicy does not allow this provider class. */
  INFERENCE_POLICY_REFUSED: 'INFERENCE_POLICY_REFUSED',
} as const
