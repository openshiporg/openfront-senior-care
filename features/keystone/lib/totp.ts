import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { derivedSessionSecret } from './derivedSessionSecret'

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the family portal. No dependency: node:crypto only. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const TOTP_STEP_SECONDS = 30

export function newTotpSecret() {
  const bytes = randomBytes(20)
  let bits = 0, value = 0, out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  return out
}

function decodeBase32(secret: string) {
  let bits = 0, value = 0
  const out: number[] = []
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Bad secret.')
    value = (value << 5) | index; bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return Buffer.from(out)
}

export function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', decodeBase32(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 15
  const binary = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(binary % 1_000_000).padStart(6, '0')
}

/** The matching time step within one step either side, or null. The caller refuses a step it has already accepted. */
export function matchTotp(secret: string, code: string, nowMs: number) {
  const clean = String(code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const now = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS)
  for (const step of [now, now - 1, now + 1]) {
    const expected = Buffer.from(totpCode(secret, step))
    if (timingSafeEqual(expected, Buffer.from(clean))) return step
  }
  return null
}

const key = () => {
  const base = process.env.PORTAL_MFA_SECRET?.trim() || derivedSessionSecret('portal-mfa')
  if (Buffer.byteLength(base, 'utf8') < 32) throw new Error('MFA secret must be at least 32 bytes. Set SESSION_SECRET.')
  return createHmac('sha256', base).update('aes-256-gcm').digest()
}
export function sealSecret(secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map(part => part.toString('base64url')).join('.')
}
export function openSecret(sealed: string) {
  const [iv, tag, body] = sealed.split('.').map(part => Buffer.from(part, 'base64url'))
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
