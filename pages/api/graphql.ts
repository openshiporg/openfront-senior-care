import { randomUUID } from 'node:crypto'
import { GraphQLError } from 'graphql'
import { createYoga } from 'graphql-yoga'
import { type NextApiRequest, type NextApiResponse } from 'next'
import { keystoneContext } from '../../features/keystone/context'
import { useMcpScopeGuard as mcpScopeGuardPlugin } from '../../features/keystone/mcp-oauth/guard'
import { mcpSessionMarker } from '../../features/keystone/mcp-oauth/session'
import { phiReadAuditDescriptor, phiReferenceSecret, recordPhiReadAudit } from '../../features/keystone/security/phiReadAudit'
import { breakGlassResidents } from '../../features/keystone/models/phi'

export const config = {
  api: {
    bodyParser: false,
  },
}

const MAX_BODY_BYTES = 1_000_000
const EXECUTION_TIMEOUT_MS = 15_000

/**
 * The one GraphQL endpoint. File uploads are disabled (documents go through signed URLs).
 * Every operation that resolves PHI writes a value-free PhiReadAudit row before the result is
 * returned; if that write fails the result is withheld (fail closed, DOMAIN I-PR1).
 */
const yoga = createYoga({
  graphqlEndpoint: '/api/graphql',
  schema: keystoneContext.graphql.schema,
  context: async ({ req, res }: { req: any; res: any }) => {
    const requestContext = (await keystoneContext.withRequest(req, res)) as any
    requestContext.openfrontCorrelationReference = req.openfrontCorrelationReference || randomUUID()
    return requestContext
  },
  multipart: false,
  graphiql: process.env.NODE_ENV !== 'production',
  plugins: [
    // MCP OAuth scopes only narrow: read-only tokens can't mutate, no token can manage credentials.
    mcpScopeGuardPlugin(),
    {
      onExecute({ args, executeFn, setExecuteFn }: any) {
        setExecuteFn(async (executionArgs: any) => {
          let timeout: ReturnType<typeof setTimeout> | undefined
          try {
            return await Promise.race([
              Promise.resolve(executeFn(executionArgs)),
              new Promise((_, reject) => {
                timeout = setTimeout(() => reject(new GraphQLError('GraphQL execution timed out.')), EXECUTION_TIMEOUT_MS)
              }),
            ]) as any
          } finally {
            if (timeout) clearTimeout(timeout)
          }
        })
        return {
          async onExecuteDone({ result, setResult }: any) {
            if (result && typeof result === 'object' && Symbol.asyncIterator in result) return
            const context = args.contextValue
            const session = context?.session
            if (!session?.itemId) return
            const role = session?.data?.role || {}
            const isMcp = Boolean(mcpSessionMarker(session))
            try {
              const descriptor = phiReadAuditDescriptor(args.document, args.operationName, result, {
                schema: keystoneContext.graphql.schema,
                referenceSecret: phiReferenceSecret(),
                variables: args.variableValues || {},
                authority: { roleReference: typeof role.id === 'string' ? role.id : null, roleName: typeof role.name === 'string' ? role.name.slice(0, 120) : null },
                purpose: isMcp ? 'operations' : 'treatment_operations',
                correlationReference: context?.openfrontCorrelationReference || 'unavailable',
              })
              if (!descriptor) return
              const glass = await breakGlassResidents(session, context)
              await recordPhiReadAudit(keystoneContext.prisma as any, { reference: String(session.itemId), kind: isMcp ? 'mcp' : String(session.data?.kind ?? 'staff'), breakGlass: glass.size > 0 }, descriptor)
            } catch {
              setResult({ errors: [new GraphQLError('Protected data auditing is unavailable.')] })
            }
          },
        }
      },
    },
  ],
})

function reject(res: NextApiResponse, status: number, message: string) {
  res.setHeader('cache-control', 'no-store')
  return res.status(status).json({ errors: [{ message }] })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const contentLength = Number(req.headers['content-length'] || 0)
  if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) return reject(res, 413, 'GraphQL request body is too large')
  if (String(req.headers['content-type'] || '').toLowerCase().startsWith('multipart/form-data')) return reject(res, 415, 'GraphQL file uploads are not enabled')
  ;(req as any).openfrontCorrelationReference = randomUUID()
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  return yoga(req, res)
}
