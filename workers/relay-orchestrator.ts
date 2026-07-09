// ABOUT: RelayOrchestrator Durable Object — the single-threaded serial runner for Relay sessions.
// ABOUT: Wraps src/lib/relay/orchestrator (the tested state machine) with DO storage + alarms + env; the
// ABOUT: DO's single-threadedness IS the serialization, its alarms ARE the polling (no held invocation).

import { createClient } from '@supabase/supabase-js';
import { enqueue, onAlarm, type RunStore, type CurrentRun, type OrchestratorDeps, type FinalizeFn } from '../src/lib/relay/orchestrator';
import type { MaClient, RunResourceIds } from '../src/lib/relay/session-run';
import type { DurableObjectState } from '@cloudflare/workers-types';

interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  ANTHROPIC_API_KEY: string;
  RELAY_CONTROL_TOKEN: string;
  RELAY_AGENT_ID: string;
  RELAY_ENV_ID: string;
  RELAY_VAULT_ID: string;
  RELAY_BRIDGE_URL?: string;
  RELAY_POLL_INTERVAL_MS?: string;
}

const DEFAULT_BRIDGE_URL = 'https://ansible-relay-bridge.herrings.workers.dev';

function makeMaClient(apiKey: string): MaClient {
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'managed-agents-2026-04-01',
    'content-type': 'application/json',
  };
  return async (method, path, body) => {
    const res = await fetch(`https://api.anthropic.com/v1${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`MA ${method} ${path} → ${res.status}: ${await res.text()}`);
    return res.status === 202 ? null : res.json();
  };
}

export class RelayOrchestrator {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private deps(): OrchestratorDeps {
    const storage = this.state.storage;
    const store: RunStore = {
      getQueue: async () => (await storage.get<string[]>('queue')) ?? [],
      setQueue: (q) => storage.put('queue', q),
      getCurrent: async () => (await storage.get<CurrentRun | null>('current')) ?? null,
      setCurrent: (c) => storage.put('current', c),
      setAlarm: (at) => storage.setAlarm(at),
    };
    const supabase = createClient(this.env.NEXT_PUBLIC_SUPABASE_URL, this.env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const base = this.env.RELAY_BRIDGE_URL || DEFAULT_BRIDGE_URL;
    // Finalize stays behind the bridge (sole owned-memory writer); the DO only orchestrates.
    const finalize: FinalizeFn = async ({ stimulusRef, startedAt, reason, degraded, sources }) => {
      const res = await fetch(`${base}/decision`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.env.RELAY_CONTROL_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify({ stimulus_ref: stimulusRef, started_at: startedAt, reason, degraded, sources }),
      });
      if (!res.ok) throw new Error(`decision → ${res.status}: ${await res.text()}`);
      return res.json() as Promise<{ verdict: string; piece_id: string | null }>;
    };
    const ids: RunResourceIds = {
      agentId: this.env.RELAY_AGENT_ID,
      environmentId: this.env.RELAY_ENV_ID,
      vaultId: this.env.RELAY_VAULT_ID,
    };
    return {
      store,
      supabase,
      finalize,
      ids,
      ma: makeMaClient(this.env.ANTHROPIC_API_KEY),
      now: () => Date.now(),
      log: (m) => console.log(`[relay-do] ${m}`),
      pollIntervalMs: this.env.RELAY_POLL_INTERVAL_MS ? Number(this.env.RELAY_POLL_INTERVAL_MS) : undefined,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/enqueue') {
      const { readerId } = (await request.json()) as { readerId?: string };
      if (!readerId) return new Response(JSON.stringify({ error: 'readerId required' }), { status: 400 });
      // blockConcurrencyWhile makes the check-then-claim in enqueue/startNext atomic. DOs do NOT
      // serialise a handler across its awaits by default (a fetch() await is not storage-gated), so
      // without this two enqueues could both see "no run in flight" and start two sessions → overlapping
      // T0 windows. The critical section is only seconds (session start); the 5-min poll lives in alarm().
      await this.state.blockConcurrencyWhile(async () => {
        await enqueue(this.deps(), readerId);
      });
      return new Response(JSON.stringify({ queued: true, readerId }), { status: 202 });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.state.blockConcurrencyWhile(async () => {
      await onAlarm(this.deps());
    });
  }
}

// Host worker default export — the DO is reached only via its binding, so this is a liveness stub.
export default {
  async fetch(): Promise<Response> {
    return new Response('relay-orchestrator: DO host', { status: 200 });
  },
};
