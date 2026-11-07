import { createHmac } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { derivedSessionSecret } from './derivedSessionSecret'
import { DomainError, Codes } from './errors'
import { verifiedInternalIdentity } from '../security/internalIdentity'

/**
 * Fixed-window limits for the public storefront mutations (scheduling publicRateLimit donor). The
 * client address is HMAC'd before it is stored, so the bucket table holds no IP addresses.
 * Behind Railway set TRUSTED_PROXY_HOPS=1 so the address comes from the proxy's forwarded entry.
 */

function signingSecret() {
  const value = process.env.RATE_LIMIT_SECRET?.trim() || derivedSessionSecret('rate-limit')
  if (Buffer.byteLength(value, 'utf8') < 32) throw new Error('Rate-limit secret must be at least 32 bytes.')
  return value
}

const normalized = (value: string) => value.trim().replace(/^::ffff:/, '').slice(0, 200) || 'unknown'

export function requesterAddress(req: IncomingMessage | undefined, trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)) {
  if (!req) return null
  const internal = verifiedInternalIdentity(req.headers ?? {}, req.socket?.remoteAddress, String(process.env.SESSION_SECRET || ''), Date.now())
  if (internal) return internal
  const remote = normalized(req.socket?.remoteAddress ?? 'unknown')
  const header = req.headers['x-forwarded-for']
  const forwarded = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map(normalized).filter(Boolean)
  const hops = Number.isInteger(trustedProxyHops) ? Math.max(0, Math.min(10, trustedProxyHops)) : 0
  if (hops === 0 || forwarded.length === 0) return remote
  const chain = [...forwarded, remote]
  return chain[Math.max(0, chain.length - 1 - hops)]
}

export async function consumeRateLimit(prisma: any, input: { address: string | null; operation: string; limit: number; windowMs: number; now?: Date }) {
  if (!input.address) return { count: 0, limited: false }
  const now = input.now ?? new Date()
  const windowMs = Math.max(60_000, Math.min(24 * 3_600_000, Math.floor(input.windowMs)))
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs
  const identity = createHmac('sha256', signingSecret()).update(normalized(input.address)).digest('hex')
  const bucketKey = createHmac('sha256', signingSecret()).update(`${input.operation}:${windowStartMs}:${identity}`).digest('hex')
  const row = await prisma.requestRateLimitBucket.upsert({
    where: { bucketKey },
    create: { bucketKey, count: 1, windowStartsAt: new Date(windowStartMs), expiresAt: new Date(windowStartMs + windowMs + 3_600_000) },
    update: { count: { increment: 1 } },
    select: { count: true },
  })
  return { count: row.count as number, limited: row.count > input.limit }
}

export async function enforceRateLimit(context: { prisma: any; req?: IncomingMessage }, operation: string, limit: number, windowMs = 10 * 60_000) {
  const result = await consumeRateLimit(context.prisma, { address: requesterAddress(context.req), operation, limit, windowMs })
  if (result.limited) throw new DomainError(Codes.RATE_LIMITED, 'Too many requests. Please wait and try again.')
  return result
}

export const deleteExpiredRateLimits = (prisma: any, now = new Date()) => prisma.requestRateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })
