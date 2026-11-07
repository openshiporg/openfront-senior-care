import { getBaseUrl } from '@/features/dashboard/lib/getBaseUrl';
import { keystoneContext } from '@/features/keystone/context';
import { authorizeMcpRequest } from '@/features/keystone/mcp-oauth/http';
import { internalGraphqlEndpoint } from '@/features/keystone/lib/internal-origin';
import { DOMAIN_TOOLS, runDomainTool } from '@/features/keystone/mcp/registry';

/**
 * MCP over stateless Streamable HTTP (INTEGRATIONS §7). There are no generic schema or CRUD tools:
 * agents see an allow-list of named domain queries and commands. Every call runs as the token's
 * principal through /api/graphql, so list access, PHI field tiers, agent grants and the PHI read
 * audit (purpose=operations) all apply. Human-only actions (approvals, signing, break-glass, portal
 * scope grants, closed-period corrections) have no tool.
 */

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export async function POST(request: Request) {
  let id: unknown = null;
  try {
    const graphqlEndpoint = internalGraphqlEndpoint() ?? `${await getBaseUrl()}/api/graphql`;
    const body = await request.json();
    id = body?.id ?? null;

    const authorization = await authorizeMcpRequest(keystoneContext, request, body);
    if (authorization instanceof Response) return authorization;
    const auth = authorization.forwardHeaders;

    if (typeof body.method === 'string' && body.method.startsWith('notifications/')) return new Response(null, { status: 202 });

    if (body.method === 'initialize') {
      return json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'openfront-senior-care', version: '0.1.0' } } });
    }
    if (body.method === 'ping') return json({ jsonrpc: '2.0', id, result: {} });
    if (body.method === 'tools/list') {
      return json({ jsonrpc: '2.0', id, result: { tools: DOMAIN_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } });
    }
    if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params ?? {};
      const domain = DOMAIN_TOOLS.find((tool) => tool.name === name);
      if (!domain) return json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${String(name).slice(0, 80)}` } });
      try {
        const output = await runDomainTool(domain, args ?? {}, { graphqlEndpoint, auth });
        return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], isError: !output.ok } }, 200, domain.writes ? { 'X-Data-Changed': 'true' } : {});
      } catch (error) {
        return json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: error instanceof Error ? error.message.slice(0, 500) : 'Tool failed.' }], isError: true } });
      }
    }
    return json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch {
    return json({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } }, 500);
  }
}

// Stateless Streamable HTTP: no server-initiated SSE stream, so GET is 405 (MCP spec).
export async function GET() {
  return json({ error: 'Method not allowed. POST JSON-RPC to this endpoint.' }, 405, { Allow: 'POST' });
}
