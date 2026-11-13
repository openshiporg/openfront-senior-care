import type { Tx } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'

const WITHDRAWAL_KINDS = new Set(['withdrawal_cash', 'withdrawal_purchase'])

/**
 * A withdrawal relies on the ledger's active authorisation: it must cover withdrawals and the amount must be within its limit.
 * Called by prepareWithdrawal (conveyance on discharge or death is a legal duty and does not need one).
 */
export async function assertAuthorised(tx: Tx, ledgerId: string, amountMinor: bigint) {
  const auth = await tx.trustAuthorisation.findFirst({ where: { ledgerId, status: 'active' }, select: { kinds: true, perWithdrawalLimitMinor: true } })
  if (!auth) throw new DomainError(Codes.GUARD_FAILED, 'There is no active written authorisation to handle this resident\'s funds. Record one first.', { reason: 'no_authorisation' })
  const kinds = Array.isArray(auth.kinds) ? (auth.kinds as string[]) : []
  if (!kinds.some(kind => WITHDRAWAL_KINDS.has(kind))) throw new DomainError(Codes.GUARD_FAILED, 'The resident\'s authorisation does not cover withdrawals.', { reason: 'not_authorised' })
  if (auth.perWithdrawalLimitMinor !== null && auth.perWithdrawalLimitMinor !== undefined && amountMinor > auth.perWithdrawalLimitMinor) {
    throw new DomainError(Codes.GUARD_FAILED, `That is over the authorised limit of ${auth.perWithdrawalLimitMinor.toString()} minor units a withdrawal.`, { reason: 'over_authorised_limit' })
  }
}
