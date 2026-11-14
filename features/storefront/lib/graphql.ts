import { GraphQLClient } from 'graphql-request'
import { getAuthHeaders } from '@/features/dashboard/lib/cookies'
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl'
import { PUBLIC_REQUEST_ERROR, publicGraphQLErrorMessage, safeErrorSummary } from '@/features/dashboard/lib/security'
import { Codes } from '@/features/keystone/lib/errors'

/**
 * The storefront's GraphQL call. It goes to the same endpoint, with the visitor's own session and
 * address, as every other server render. What differs is the refusal: a business rule ("That tour time
 * is full.", "Tick the box so the community may contact you.") is written for the person who hit it,
 * so its message is shown to them word for word. Anything else stays a plain "please try again".
 */

export type Refusal = { ok: false; error: string; code: string | null; reason: string | null }
export type Result<T> = { ok: true; data: T } | Refusal

const TRY_AGAIN = 'Something went wrong on our side. Please try again, or call us.'
const RULE_CODES = new Set<string>(Object.values(Codes))

type GraphQLFailure = { message?: unknown; extensions?: { code?: unknown; reason?: unknown } }

function refusal(error: unknown): Refusal {
  const errors = (error as { response?: { errors?: unknown } } | null)?.response?.errors
  const rules = (Array.isArray(errors) ? (errors as GraphQLFailure[]) : []).filter(
    entry => typeof entry?.extensions?.code === 'string' && RULE_CODES.has(entry.extensions.code) && typeof entry.message === 'string' && entry.message.trim().length > 0 && entry.message.length <= 400,
  )
  if (rules.length) {
    const first = rules[0].extensions!
    return {
      ok: false,
      error: [...new Set(rules.map(entry => String(entry.message).trim()))].join('\n'),
      code: String(first.code),
      reason: typeof first.reason === 'string' ? first.reason : null,
    }
  }
  const message = publicGraphQLErrorMessage(error)
  return { ok: false, error: message === PUBLIC_REQUEST_ERROR ? TRY_AGAIN : message, code: null, reason: null }
}

export async function storefrontGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<Result<T>> {
  try {
    const { endpoint, fetch: internalFetch } = await getServerGraphQLTarget()
    const client = new GraphQLClient(endpoint, { credentials: 'include', redirect: 'error', ...(internalFetch ? { fetch: internalFetch } : {}), headers: (await getAuthHeaders()) || {} })
    return { ok: true, data: await client.request<T>(query, variables) }
  } catch (error) {
    const result = refusal(error)
    // A refused request is an answer, not a fault; only real failures are logged.
    if (!result.code) console.error('Storefront request failed:', safeErrorSummary(error))
    return result
  }
}
