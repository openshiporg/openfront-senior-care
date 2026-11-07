import { createHmac } from 'node:crypto'

/**
 * A purpose-bound key derived from SESSION_SECRET (scheduling donor), used when a dedicated secret
 * is not configured. Each purpose gets its own key, so a token for one purpose never verifies as
 * another and the session secret never signs tokens directly. Empty when SESSION_SECRET is missing,
 * so callers' strength checks fail closed.
 */
export function derivedSessionSecret(purpose: string) {
  const session = process.env.SESSION_SECRET?.trim() ?? ''
  if (!session) return ''
  return createHmac('sha256', session).update(`openfront-senior-care:${purpose}`).digest('base64url')
}
