// ABOUT: Tests for the relay session consumer — happy-path finalize, stamped started_at, breadcrumb on failure

import { describe, it, expect, vi, beforeEach } from 'vitest';
import consumer from './relay-session-consumer';

const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

global.fetch = vi.fn();

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SECRET_KEY: 'k',
  ANTHROPIC_API_KEY: 'ak',
  RELAY_CONTROL_TOKEN: 'ctl',
  RELAY_AGENT_ID: 'agent-1',
  RELAY_ENV_ID: 'env-1',
  RELAY_VAULT_ID: 'vault-1',
  RELAY_BRIDGE_URL: 'https://bridge.test',
  RELAY_POLL_INTERVAL_MS: '0', // no real sleeps in tests
};

const okJson = (obj: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => obj,
  text: async () => JSON.stringify(obj),
});

function wireSupabase(row: unknown, readerItemsError: unknown = null) {
  const inserts: any[] = [];
  mockFrom.mockImplementation((table: string) => {
    if (table === 'reader_items') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: readerItemsError }) }) }) };
    }
    if (table === 'sync_log') {
      return { insert: async (v: any) => (inserts.push(v), { error: null }) };
    }
    return {};
  });
  return inserts;
}

function maFetch({ status = 'idle', closing = 'I wrote it.', decisionStatus = 200 } = {}) {
  (global.fetch as any).mockImplementation(async (url: string, init?: any) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.endsWith('/v1/sessions') && method === 'POST') return okJson({ id: 'sess-1' });
    if (u.includes('/sessions/sess-1/events') && method === 'POST') return { ok: true, status: 202, json: async () => null, text: async () => '' };
    if (u.endsWith('/sessions/sess-1') && method === 'GET') return okJson({ status });
    if (u.includes('/sessions/sess-1/events')) return okJson({ data: [{ type: 'agent.message', content: [{ type: 'text', text: closing }] }] });
    if (u.endsWith('/decision')) return okJson({ verdict: 'wrote', piece_id: 'p1' }, decisionStatus);
    return okJson({});
  });
}

const msg = (readerId?: string) => {
  const ack = vi.fn();
  const retry = vi.fn();
  return { m: { body: readerId ? { readerId } : {}, ack, retry }, ack, retry };
};

const stimRow = { title: 'T', short_summary: 'A point worth reacting to.', commentariat_summary: 'A counter.' };

describe('relay session consumer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs a session and finalizes the verdict via the bridge with a stamped started_at', async () => {
    wireSupabase(stimRow);
    maFetch({ status: 'idle' });
    const { m, ack } = msg('r1');

    await consumer.queue({ messages: [m] } as any, baseEnv as any);

    const decisionCall = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith('/decision'));
    expect(decisionCall).toBeTruthy();
    const body = JSON.parse(decisionCall[1].body);
    expect(body.stimulus_ref).toEqual(['r1']);
    expect(body.started_at).toEqual(expect.any(String));
    expect(body.reason).toContain('I wrote it.');
    expect(decisionCall[1].headers.authorization).toBe('Bearer ctl');
    expect(ack).toHaveBeenCalled();
  });

  it('does NOT finalize and leaves a breadcrumb when the session never reaches idle', async () => {
    const inserts = wireSupabase(stimRow);
    maFetch({ status: 'terminated' });
    const { m, ack } = msg('r1');

    await consumer.queue({ messages: [m] } as any, baseEnv as any);

    const decisionCall = (global.fetch as any).mock.calls.find((c: any[]) => String(c[0]).endsWith('/decision'));
    expect(decisionCall).toBeUndefined();
    expect(inserts.some((i) => i.sync_type === 'relay_session_failed')).toBe(true);
    expect(ack).toHaveBeenCalled();
  });

  it('breadcrumbs and acks (never retries) when the stimulus item is missing', async () => {
    const inserts = wireSupabase(null);
    maFetch();
    const { m, ack, retry } = msg('ghost');

    await consumer.queue({ messages: [m] } as any, baseEnv as any);

    expect(inserts.some((i) => i.errors?.reader_id === 'ghost')).toBe(true);
    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });
});
