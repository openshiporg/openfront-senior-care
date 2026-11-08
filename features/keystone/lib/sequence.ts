import { randomBytes } from 'node:crypto'
import type { Tx } from './db'

/**
 * Human references for staff (RES-2026-000412, STY-…, INQ-…): sequential, gap-free within a
 * committed transaction, under the sequence row's lock (SCHEMA G10). Family- and public-visible codes use
 * publicCode() instead, which is random and reveals no volume.
 */
export async function nextReference(tx: Tx, prefix: string, now = new Date(), width = 6) {
  if (!/^[A-Z]{2,5}$/.test(prefix)) throw new Error('Reference prefix must be 2-5 capital letters')
  const key = `${prefix}-${now.getUTCFullYear()}`
  // One INSERT … ON CONFLICT DO UPDATE: its row lock serialises callers until commit, so values stay
  // gap-free across committed transactions without a separate advisory lock round trip.
  const row = await tx.sequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } })
  const value = row.nextValue - 1
  return `${key}-${String(value).padStart(width, '0')}`
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Random Crockford base32 code with a prefix, e.g. INV-7K2Q-9MXD. */
export function publicCode(prefix: string, groups = 2) {
  const bytes = randomBytes(groups * 4)
  const chars = Array.from(bytes, byte => CROCKFORD[byte % 32])
  const parts = Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join(''))
  return `${prefix}-${parts.join('-')}`
}
