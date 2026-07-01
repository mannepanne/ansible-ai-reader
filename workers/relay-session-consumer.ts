// ABOUT: Cloudflare Queue consumer that runs one Relay Managed-Agent session per message
// ABOUT: Mind rented (Anthropic MA API), memory owned — finalizes the verdict through the bridge

import { createClient } from '@supabase/supabase-js';
import { runSession, formatStimulus, type MaClient, type RunResourceIds } from '../src/lib/relay/session-run';
import { readSession } from '../src/lib/relay/session-readout';
import type { MessageBatch } from '@cloudflare/workers-types';

// Bindings: resource IDs are vars (created once via the CLI); the API key + control token are secrets.
interface Env {
  NEXT_PUBLIC_SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  ANTHROPIC_API_KEY: string;
  RELAY_CONTROL_TOKEN: string;
  RELAY_AGENT_ID: string;
  RELAY_ENV_ID: string;
  RELAY_VAULT_ID: string;
  RELAY_BRIDGE_URL?: string;
  RELAY_POLL_INTERVAL_MS?: string; // optional override of the 3s poll cadence (ops tuning / tests)
}

interface RelayRunMessage {
  readerId: string;
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

// Durable, diagnosable trail for a run that never reached a verdict (mirrors the summary consumer's
// sync_log failure rows). user_id is nullable — the relay subsystem is user-less.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped service-role client (matches consumer.ts)
async function breadcrumb(supabase: any, readerId: string, note: string): Promise<void> {
  try {
    await supabase.from('sync_log').insert({
      user_id: null,
      sync_type: 'relay_session_failed',
      items_failed: 1,
      errors: { reader_id: readerId, error: note, timestamp: new Date().toISOString() },
    });
  } catch (e) {
    console.error('[relay-session] breadcrumb insert failed:', e);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped service-role client (matches consumer.ts)
async function runOne(readerId: string, env: Env, supabase: any): Promise<void> {
  const { data: row, error } = await supabase
    .from('reader_items')
    .select('title, short_summary, commentariat_summary')
    .eq('reader_id', readerId)
    .maybeSingle();
  if (error) throw new Error(`stimulus fetch: ${error.message}`);
  if (!row) throw new Error(`no reader_item with reader_id ${readerId}`);

  const stimulus = formatStimulus(row as { title: string | null; short_summary: string | null; commentariat_summary: string | null });
  const ids: RunResourceIds = { agentId: env.RELAY_AGENT_ID, environmentId: env.RELAY_ENV_ID, vaultId: env.RELAY_VAULT_ID };
  const ma = makeMaClient(env.ANTHROPIC_API_KEY);

  // T0 is stamped HERE, immediately before the session starts — never at enqueue (a message may wait
  // behind another run). The backward margin absorbs consumer↔DB clock skew; safe because the queue
  // runs serially (max_concurrency = 1), so no other session writes a piece inside this window.
  const startedAt = new Date(Date.now() - 30_000).toISOString();

  const pollIntervalMs = env.RELAY_POLL_INTERVAL_MS ? Number(env.RELAY_POLL_INTERVAL_MS) : undefined;
  const { status, events } = await runSession(ma, ids, stimulus, { readerId, pollIntervalMs });
  if (status !== 'idle') {
    await breadcrumb(supabase, readerId, `session did not complete (status: ${status ?? 'timeout'}) — no verdict recorded`);
    return;
  }

  const readout = readSession(events);
  const base = env.RELAY_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const res = await fetch(`${base}/decision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RELAY_CONTROL_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      stimulus_ref: [readerId],
      started_at: startedAt,
      reason: readout.closingText,
      degraded: readout.degraded,
    }),
  });
  if (!res.ok) throw new Error(`decision finalize → ${res.status}: ${await res.text()}`);
}

export default {
  async queue(batch: MessageBatch<RelayRunMessage>, env: Env): Promise<void> {
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Serial by config (max_concurrency = 1) AND by this loop — the T0 attribution window requires it.
    for (const message of batch.messages) {
      const readerId = message.body?.readerId;
      try {
        if (!readerId) throw new Error('message missing readerId');
        await runOne(readerId, env, supabase);
      } catch (e) {
        // max_retries = 0: never auto-retry — a retry re-runs create-session (not idempotent) → a
        // duplicate agent session + a second in-window piece → cross-attribution. Breadcrumb + ack.
        await breadcrumb(supabase, readerId ?? '(unknown)', e instanceof Error ? e.message : String(e));
      } finally {
        message.ack();
      }
    }
  },
};
