import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { derivedSessionSecret } from './derivedSessionSecret'

/**
 * Signed, expiring bearer tokens for people without an account: a family member managing a tour
 * booking, accepting a waitlist offer or a portal invitation (scheduling guestBookingToken donor).
 * Only the SHA-256 of the token is stored on the row, so a database read never yields a usable token.
 */
export type PublicTokenPurpose = 'tour-manage' | 'waitlist-offer' | 'portal-invite' | 'shift-offer'

export type PublicTokenPayload = { version: 1; purpose: PublicTokenPurpose; subjectId: string; expiresAtMs: number; nonce: string }

const ENV: Record<PublicTokenPurpose, string> = { 'tour-manage': 'TOUR_MANAGE_SECRET', 'waitlist-offer': 'WAITLIST_OFFER_SECRET', 'portal-invite': 'PORTAL_INVITE_SECRET', 'shift-offer': 'SHIFT_OFFER_SECRET' }

export function publicTokenSecret(purpose: PublicTokenPurpose) {
  const secret = process.env[ENV[purpose]]?.trim() || derivedSessionSecret(purpose)
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Token secret must be at least 32 bytes. Set SESSION_SECRET.')
  return secret
}

const sign = (encoded: string, secret: string) => createHmac('sha256', secret).update(encoded).digest('base64url')

export function createPublicToken(purpose: PublicTokenPurpose, subjectId: string, expiresAtMs: number, secret = publicTokenSecret(purpose)) {
  if (!subjectId || !Number.isSafeInteger(expiresAtMs)) throw new Error('Invalid token payload.')
  const payload: PublicTokenPayload = { version: 1, purpose, subjectId, expiresAtMs, nonce: randomBytes(18).toString('base64url') }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${sign(encoded, secret)}`
}

export function verifyPublicToken(token: string, purpose: PublicTokenPurpose, secret = publicTokenSecret(purpose), nowMs = Date.now()): PublicTokenPayload | null {
  if (!token || token.length > 4096) return null
  const [encoded, signature, extra] = token.split('.')
  if (!encoded || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(encoded, secret), 'base64url')
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<PublicTokenPayload>
    if (payload.version !== 1 || payload.purpose !== purpose || typeof payload.subjectId !== 'string' || !payload.subjectId) return null
    if (typeof payload.expiresAtMs !== 'number' || !Number.isSafeInteger(payload.expiresAtMs) || payload.expiresAtMs <= nowMs) return null
    if (typeof payload.nonce !== 'string' || !payload.nonce) return null
    return payload as PublicTokenPayload
  } catch {
    return null
  }
}

export const hashPublicToken = (token: string) => createHash('sha256').update(token).digest('hex')

export function publicTokenMatches(token: string, storedHash: string | null | undefined) {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false
  const actual = Buffer.from(hashPublicToken(token), 'hex')
  const expected = Buffer.from(storedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
