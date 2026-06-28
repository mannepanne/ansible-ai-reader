// ABOUT: Relay bridge Worker — the owned-memory gateway and swappable seam
// ABOUT: Stage 1 surface: shared-secret-gated /backfill endpoint over service-role Supabase + Workers AI

import { createClient } from '@supabase/supabase-js';
import { runBackfill } from '../src/lib/relay/backfill';
import type { AiBinding } from '../src/lib/relay/embed';
import { handleMcpMessage } from '../src/lib/relay/mcp';
import { finalizeDecision, type FinalizeDecisionInput } from '../src/lib/relay/decisions';

export interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  // Shared secret guarding the bridge's HTTP surface. The bridge is the only thing that
  // touches the relay_* tables; nothing unauthenticated may reach it.
  RELAY_BRIDGE_TOKEN: string;
  // Workers AI binding (declared as [ai] in wrangler-relay-bridge.toml).
  AI: AiBinding;
  // The bridge's own Reader API token — lets the `fetch` MCP tool pull full article bodies.
  // Optional: without it, `fetch` returns stored reference content rather than the full body.
  READER_API_TOKEN?: string;
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get('authorization');
  return Boolean(env.RELAY_BRIDGE_TOKEN) && header === `Bearer ${env.RELAY_BRIDGE_TOKEN}`;
}

function serviceRoleClient(env: Env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/backfill') {
      const result = await runBackfill({ supabase: serviceRoleClient(env), ai: env.AI });
      return Response.json(result);
    }

    // The MCP surface: a single Streamable HTTP endpoint speaking JSON-RPC. The shared-secret gate
    // above already protects it; the Managed Agent supplies that bearer via its vault credential.
    if (request.method === 'POST' && url.pathname === '/mcp') {
      let message: unknown;
      try {
        message = await request.json();
      } catch {
        return Response.json(
          { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
          { status: 400 },
        );
      }
      const response = await handleMcpMessage(message, {
        supabase: serviceRoleClient(env),
        ai: env.AI,
        readerToken: env.READER_API_TOKEN,
      });
      // Notifications get no body; everything else returns its JSON-RPC response.
      if (response === null) {
        return new Response(null, { status: 202 });
      }
      return Response.json(response);
    }

    // Decision finalize: orchestrator-only, NOT part of the MCP tool surface — the agent stays blind
    // to the gate (it has no decision tool and never learns a piece's fate). The session orchestrator
    // calls this once a session reaches idle; the verdict is derived from DB state behind the seam.
    if (request.method === 'POST' && url.pathname === '/decision') {
      let input: unknown;
      try {
        input = await request.json();
      } catch {
        return Response.json({ error: 'invalid JSON body' }, { status: 400 });
      }
      try {
        const result = await finalizeDecision(
          { supabase: serviceRoleClient(env), ai: env.AI, readerToken: env.READER_API_TOKEN },
          input as FinalizeDecisionInput,
        );
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 400 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
