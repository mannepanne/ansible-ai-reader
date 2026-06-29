// ABOUT: Tests for Relay decision capture (backend-observed verdict for one stimulus session)
// ABOUT: Verifies the DB-derived verdict + real piece_id from the T0 window, and the relay_decisions insert

import { describe, it, expect, vi } from 'vitest';
import { finalizeDecision } from './decisions';

// A Supabase stub tailored to finalizeDecision's two queries:
//  - relay_pieces: select().eq().gte().order().limit() resolving the pending-piece lookup
//  - relay_decisions: insert() resolving {error}, recording the row it was handed
function makeSupabase({
  pieces = [] as Array<{ id: string; created_at: string }>,
  piecesError = null as { message: string } | null,
  insertError = null as { message: string } | null,
} = {}) {
  const inserted: Record<string, unknown>[] = [];
  const piecesQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'gte', 'order']) {
    piecesQuery[m] = vi.fn(() => piecesQuery);
  }
  piecesQuery.limit = vi.fn(() => Promise.resolve({ data: pieces, error: piecesError }));
  const decisionsTable = {
    insert: vi.fn((row: Record<string, unknown>) => {
      inserted.push(row);
      return Promise.resolve({ error: insertError });
    }),
  };
  const supabase = {
    from: vi.fn((table: string) => (table === 'relay_pieces' ? piecesQuery : decisionsTable)),
    __inserted: inserted,
    __piecesQuery: piecesQuery,
    __decisions: decisionsTable,
  };
  return supabase as never;
}

const deps = (supabase: unknown) => ({ supabase, ai: { run: vi.fn() } }) as never;
const T0 = '2026-06-28T10:00:00.000Z';

describe('finalizeDecision', () => {
  it('records verdict=wrote with the newest pending piece id when a piece exists in the T0 window', async () => {
    const supabase = makeSupabase({ pieces: [{ id: 'piece-new', created_at: '2026-06-28T10:00:05Z' }] });
    const out = await finalizeDecision(deps(supabase), {
      stimulus_ref: ['r1'],
      started_at: T0,
      reason: 'closing text',
    });

    expect(out).toEqual({ verdict: 'wrote', piece_id: 'piece-new' });
    const q = (supabase as never as { __piecesQuery: Record<string, ReturnType<typeof vi.fn>> }).__piecesQuery;
    expect(q.eq).toHaveBeenCalledWith('state', 'pending_review');
    expect(q.gte).toHaveBeenCalledWith('created_at', T0);
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(1);
    const row = (supabase as never as { __inserted: Record<string, unknown>[] }).__inserted[0];
    expect(row).toMatchObject({ stimulus_ref: ['r1'], verdict: 'wrote', piece_id: 'piece-new', reason: 'closing text' });
  });

  it('records verdict=declined with null piece_id and the closing reason when nothing was written in the window', async () => {
    const supabase = makeSupabase({ pieces: [] });
    const out = await finalizeDecision(deps(supabase), {
      stimulus_ref: ['r1'],
      started_at: T0,
      reason: 'I have nothing new to add.',
    });

    expect(out).toEqual({ verdict: 'declined', piece_id: null });
    expect((supabase as never as { __inserted: Record<string, unknown>[] }).__inserted[0]).toMatchObject({
      verdict: 'declined',
      piece_id: null,
      reason: 'I have nothing new to add.',
    });
  });

  it('passes the degraded flag through to the decision row', async () => {
    const supabase = makeSupabase({ pieces: [{ id: 'p', created_at: 'x' }] });
    await finalizeDecision(deps(supabase), { stimulus_ref: [], started_at: T0, degraded: 'summary_only' });
    expect((supabase as never as { __inserted: Record<string, unknown>[] }).__inserted[0]).toMatchObject({
      degraded: 'summary_only',
    });
  });

  it('defaults stimulus_ref to an empty array and reason/degraded to null', async () => {
    const supabase = makeSupabase({ pieces: [] });
    await finalizeDecision(deps(supabase), { started_at: T0 } as never);
    expect((supabase as never as { __inserted: Record<string, unknown>[] }).__inserted[0]).toMatchObject({
      stimulus_ref: [],
      reason: null,
      degraded: null,
    });
  });

  it('requires started_at (the T0 window anchor)', async () => {
    await expect(finalizeDecision(deps(makeSupabase()), { stimulus_ref: [] } as never)).rejects.toThrow(/started_at/);
  });

  it('rejects a non-ISO started_at', async () => {
    await expect(finalizeDecision(deps(makeSupabase()), { started_at: 'not-a-date' } as never)).rejects.toThrow(/ISO/);
  });

  it('throws when the pending-piece query errors', async () => {
    const supabase = makeSupabase({ piecesError: { message: 'boom' } });
    await expect(finalizeDecision(deps(supabase), { started_at: T0 } as never)).rejects.toThrow(/boom/);
  });

  it('throws when the decision insert errors', async () => {
    const supabase = makeSupabase({ pieces: [], insertError: { message: 'insert failed' } });
    await expect(finalizeDecision(deps(supabase), { started_at: T0 } as never)).rejects.toThrow(/insert failed/);
  });
});
