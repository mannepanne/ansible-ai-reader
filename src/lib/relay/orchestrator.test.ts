// ABOUT: Tests for the Relay orchestrator state machine — serial start, alarm-driven poll/finalize/advance,
// ABOUT: attempt cap, terminated, idempotency (already-finalized), and failed-start skip.

import { describe, it, expect, vi } from 'vitest';
import { enqueue, onAlarm, type RunStore, type CurrentRun } from './orchestrator';

function makeStore() {
  const s = { _q: [] as string[], _cur: null as CurrentRun | null, _alarm: null as number | null };
  const store: RunStore = {
    getQueue: async () => s._q.slice(),
    setQueue: async (q) => {
      s._q = q;
    },
    getCurrent: async () => s._cur,
    setCurrent: async (c) => {
      s._cur = c;
    },
    setAlarm: async (t) => {
      s._alarm = t;
    },
  };
  return { store, s };
}

function makeSupabase(item: unknown = { title: 'T', short_summary: 's', commentariat_summary: 'c' }) {
  const runs: any[] = [];
  let idc = 0;
  const agentRuns = {
    insert: (row: any) => ({ select: () => ({ single: async () => { const r = { id: `run-${++idc}`, ...row }; runs.push(r); return { data: r, error: null }; } }) }),
    update: (patch: any) => ({ eq: async (_c: string, id: string) => { const r = runs.find((x) => x.id === id); if (r) Object.assign(r, patch); return { error: null }; } }),
    select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: runs.find((x) => x.id === id) ?? null, error: null }) }) }),
  };
  const supabase: any = {
    from: (t: string) => {
      if (t === 'reader_items') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) }) };
      if (t === 'agent_session_runs') return agentRuns;
      return {};
    },
    __runs: runs,
  };
  return supabase;
}

// The session .usage shape GET /sessions/{id} returns; readUsage collapses cache_creation to 100.
const DEFAULT_USAGE = {
  cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 100 },
  cache_read_input_tokens: 500,
  input_tokens: 10,
  output_tokens: 200,
};

// `usage: null` models a session with no usage on it (getSessionUsage → readUsage(null) → null).
function makeMa({ status = 'idle', closing = 'done', usage = DEFAULT_USAGE as unknown } = {}) {
  let sidc = 0;
  return vi.fn(async (method: string, path: string) => {
    if (method === 'POST' && path === '/sessions') return { id: `sess-${++sidc}` };
    if (path.endsWith('/events?beta=true') && method === 'POST') return null;
    if (method === 'GET' && /\/sessions\/[^/]+$/.test(path)) return { status, usage };
    if (method === 'GET' && path.includes('/events')) return { data: [{ type: 'agent.message', content: [{ type: 'text', text: closing }] }] };
    return {};
  });
}

function mkDeps(over: { item?: unknown; ma?: any; finalize?: any; maxAttempts?: number; now?: () => number } = {}) {
  const { store, s } = makeStore();
  const supabase = makeSupabase('item' in over ? over.item : undefined);
  const ma = over.ma ?? makeMa();
  const finalize = over.finalize ?? vi.fn(async () => ({ verdict: 'wrote', piece_id: 'p1' }));
  const deps = {
    store,
    ma,
    supabase,
    finalize,
    ids: { agentId: 'a', environmentId: 'e', vaultId: 'v' },
    now: over.now ?? (() => 1_000_000),
    log: () => {},
    pollIntervalMs: 1000,
    maxAttempts: over.maxAttempts ?? 3,
  };
  return { deps, s, supabase, ma, finalize };
}

describe('orchestrator', () => {
  it('enqueue on idle starts a run (session created, ledger row, current + alarm set)', async () => {
    const { deps, s, supabase } = mkDeps();
    await enqueue(deps, 'r1');
    expect(s._cur?.readerId).toBe('r1');
    expect(s._cur?.sessionId).toMatch(/^sess-/);
    expect(s._alarm).toBeGreaterThan(0);
    expect(supabase.__runs).toHaveLength(1);
    expect(supabase.__runs[0]).toMatchObject({ reader_id: 'r1', state: 'running' });
  });

  it('enqueue while busy only queues — no second session', async () => {
    const { deps, s, ma } = mkDeps();
    await enqueue(deps, 'r1');
    const creates = () => ma.mock.calls.filter((c: any[]) => c[1] === '/sessions').length;
    const before = creates();
    await enqueue(deps, 'r2');
    expect(creates()).toBe(before);
    expect(s._q).toContain('r2');
    expect(s._cur?.readerId).toBe('r1');
  });

  it('alarm on idle finalizes, updates the ledger, and advances to the next run', async () => {
    const { deps, s, supabase, finalize } = mkDeps();
    await enqueue(deps, 'r1');
    await enqueue(deps, 'r2');
    await onAlarm(deps);
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ stimulusRef: ['r1'] }));
    expect(supabase.__runs.find((r: any) => r.reader_id === 'r1')).toMatchObject({ state: 'wrote', piece_id: 'p1' });
    expect(s._cur?.readerId).toBe('r2'); // advanced to the queued run
  });

  it('captures the session token usage onto the ledger on finalize', async () => {
    const { deps, supabase } = mkDeps();
    await enqueue(deps, 'r1');
    await onAlarm(deps);
    expect(supabase.__runs.find((r: any) => r.reader_id === 'r1')).toMatchObject({
      input_tokens: 10,
      output_tokens: 200,
      cache_read_input_tokens: 500,
      cache_creation_input_tokens: 100, // 0 (1h) + 100 (5m)
    });
  });

  it('leaves the usage columns unset when the session reports no usage (not measured, not zero)', async () => {
    const { deps, supabase } = mkDeps({ ma: makeMa({ usage: null }) });
    await enqueue(deps, 'r1');
    await onAlarm(deps);
    const row = supabase.__runs.find((r: any) => r.reader_id === 'r1');
    expect(row).toMatchObject({ state: 'wrote' }); // still finalizes normally
    expect(row.input_tokens).toBeUndefined();
    expect(row.cache_read_input_tokens).toBeUndefined();
  });

  it('alarm while running reschedules and bumps attempt (no finalize)', async () => {
    const { deps, s, finalize } = mkDeps({ ma: makeMa({ status: 'running' }) });
    await enqueue(deps, 'r1');
    s._alarm = null;
    await onAlarm(deps);
    expect(finalize).not.toHaveBeenCalled();
    expect(s._cur?.attempt).toBe(1);
    expect(s._alarm).toBeGreaterThan(0);
  });

  it('alarm gives up at the attempt cap (marks failed, advances)', async () => {
    const { deps, s, supabase } = mkDeps({ ma: makeMa({ status: 'running' }), maxAttempts: 2 });
    await enqueue(deps, 'r1');
    await onAlarm(deps); // attempt 1 → reschedule
    await onAlarm(deps); // attempt 2 = cap → failed
    expect(supabase.__runs.find((r: any) => r.reader_id === 'r1').state).toBe('failed');
    expect(s._cur).toBeNull();
  });

  it('alarm on terminated marks failed and advances', async () => {
    const { deps, s, supabase } = mkDeps({ ma: makeMa({ status: 'terminated' }) });
    await enqueue(deps, 'r1');
    await onAlarm(deps);
    expect(supabase.__runs.find((r: any) => r.reader_id === 'r1').state).toBe('failed');
    expect(s._cur).toBeNull();
  });

  it('alarm skips finalize when the run is already terminal in the ledger (idempotency)', async () => {
    const { deps, s, supabase, finalize } = mkDeps();
    await enqueue(deps, 'r1');
    supabase.__runs.find((r: any) => r.reader_id === 'r1').state = 'wrote'; // a prior alarm already finalized
    await onAlarm(deps);
    expect(finalize).not.toHaveBeenCalled();
    expect(s._cur).toBeNull();
  });

  it('releases a stale in-flight run on a later enqueue (lost-alarm recovery)', async () => {
    let t = 1_000_000;
    const { deps, s, supabase } = mkDeps({ now: () => t });
    await enqueue(deps, 'r1');
    expect(s._cur?.readerId).toBe('r1');
    t += 16 * 60_000; // > STALE_MS (15 min)
    await enqueue(deps, 'r2');
    expect(supabase.__runs.find((r: any) => r.reader_id === 'r1').state).toBe('failed');
    expect(s._cur?.readerId).toBe('r2'); // machine moved on
  });

  it('records a failed run and skips ahead when the stimulus item is missing', async () => {
    const { deps, s, supabase } = mkDeps({ item: null });
    await enqueue(deps, 'ghost');
    expect(supabase.__runs.find((r: any) => r.reader_id === 'ghost').state).toBe('failed');
    expect(s._cur).toBeNull();
  });
});
