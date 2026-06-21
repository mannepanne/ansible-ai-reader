// ABOUT: Relay bridge Worker — the owned-memory gateway and swappable seam
// ABOUT: Stage 1 surface: shared-secret-gated /backfill endpoint over service-role Supabase + Workers AI

import { createClient } from '@supabase/supabase-js';
import { runBackfill } from '../src/lib/relay/backfill';
import type { AiBinding } from '../src/lib/relay/embed';

export interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  // Shared secret guarding the bridge's HTTP surface. The bridge is the only thing that
  // touches the relay_* tables; nothing unauthenticated may reach it.
  RELAY_BRIDGE_TOKEN: string;
  // Workers AI binding (declared as [ai] in wrangler-relay-bridge.toml).
  AI: AiBinding;
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

    return new Response('Not found', { status: 404 });
  },
};
