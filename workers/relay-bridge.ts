// ABOUT: Relay bridge Worker — the owned-memory gateway and swappable seam
// ABOUT: Routes (all shared-secret-gated): /mcp + /backfill (agent/ingest token); /decision, /approve,
// ABOUT: /reject (separate operator control token — the human-gate control plane the agent can't reach)

import { createClient } from '@supabase/supabase-js';
import { runBackfill } from '../src/lib/relay/backfill';
import type { AiBinding } from '../src/lib/relay/embed';
import { handleMcpMessage } from '../src/lib/relay/mcp';
import { finalizeDecision, type FinalizeDecisionInput } from '../src/lib/relay/decisions';
import { approvePiece, rejectPiece } from '../src/lib/relay/approval';

export interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  // The agent-surface secret: gates /mcp (the Managed Agent supplies it via its vault credential)
  // and /backfill (operator ingest). It can read the corpus and write references — but NOT bypass
  // the human gate.
  RELAY_BRIDGE_TOKEN: string;
  // The control-plane secret: gates /decision, /approve, /reject — the routes that finalize a verdict
  // and promote a piece to recallable. Held separately so a compromise of the agent token cannot also
  // self-approve pieces and collapse the human gate (the one Stage-1 safety layer).
  RELAY_CONTROL_TOKEN: string;
  // Workers AI binding (declared as [ai] in wrangler-relay-bridge.toml).
  AI: AiBinding;
  // The bridge's own Reader API token — lets the `fetch` MCP tool pull full article bodies.
  // Optional: without it, `fetch` returns stored reference content rather than the full body.
  READER_API_TOKEN?: string;
}

// The gate-bypassing control plane. These need the separate operator token; everything else (the
// agent-facing /mcp and operator /backfill) uses the bridge token.
const CONTROL_ROUTES = new Set(['/decision', '/approve', '/reject']);

function expectedToken(pathname: string, env: Env): string | undefined {
  return CONTROL_ROUTES.has(pathname) ? env.RELAY_CONTROL_TOKEN : env.RELAY_BRIDGE_TOKEN;
}

function isAuthorized(request: Request, expected: string | undefined): boolean {
  const header = request.headers.get('authorization');
  return Boolean(expected) && header === `Bearer ${expected}`;
}

function serviceRoleClient(env: Env) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// A fresh service-role dep bundle per request (Workers isolates don't share a client across requests).
function bridgeDeps(env: Env) {
  return { supabase: serviceRoleClient(env), ai: env.AI, readerToken: env.READER_API_TOKEN };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Route-aware auth: the control plane requires the operator token, the rest the bridge token.
    if (!isAuthorized(request, expectedToken(url.pathname, env))) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (request.method === 'POST' && url.pathname === '/backfill') {
      const result = await runBackfill(bridgeDeps(env));
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
      const response = await handleMcpMessage(message, bridgeDeps(env));
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
        const result = await finalizeDecision(bridgeDeps(env), input as FinalizeDecisionInput);
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 400 });
      }
    }

    // Approve / reject: operator-only (NOT the agent — promotion to recallable happens backend-side
    // on approval; the agent stays blind). Approve embeds the body with the sealed fn (AI binding lives
    // here) then flips the piece to approved; reject marks it rejected, never embedded.
    if (request.method === 'POST' && (url.pathname === '/approve' || url.pathname === '/reject')) {
      let input: { id?: string };
      try {
        input = (await request.json()) as { id?: string };
      } catch {
        return Response.json({ error: 'invalid JSON body' }, { status: 400 });
      }
      const deps = bridgeDeps(env);
      try {
        const result =
          url.pathname === '/approve'
            ? await approvePiece(deps, { id: input.id as string })
            : await rejectPiece(deps, { id: input.id as string });
        return Response.json(result);
      } catch (err) {
        return Response.json({ error: (err as Error).message }, { status: 400 });
      }
    }

    return new Response('Not found', { status: 404 });
  },
};
