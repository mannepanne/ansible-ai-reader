// ABOUT: Tests for the Stage 2.3b engagement filter + self-healing trigger-eval sync phase.
// ABOUT: Covers the pure classifier, the three no-op guards, and every stamp/defer/enqueue outcome.

import { describe, it, expect, vi } from 'vitest';
import {
  classifyEngagement,
  evaluateRelayTriggers,
  type RelayOrchestratorLike,
} from './engagement-trigger';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── classifyEngagement (pure) ────────────────────────────────────────────────

describe('classifyEngagement', () => {
  const base = { rating: null, documentNote: null, readerNote: null, highlightsCount: 0 };

  it('reacts on an interesting rating alone', () => {
    const d = classifyEngagement({ ...base, rating: 4 });
    expect(d.react).toBe(true);
    expect(d.reason).toContain('interesting');
  });

  it('reacts on an Ansible note alone', () => {
    expect(classifyEngagement({ ...base, documentNote: 'my thought' }).react).toBe(true);
  });

  it('reacts on a Reader note alone', () => {
    expect(classifyEngagement({ ...base, readerNote: 'reader note' }).react).toBe(true);
  });

  it('reacts on ≥1 highlight alone', () => {
    expect(classifyEngagement({ ...base, highlightsCount: 1 }).react).toBe(true);
  });

  it('skips a bare archive (no signal)', () => {
    const d = classifyEngagement(base);
    expect(d.react).toBe(false);
    expect(d.reason).toContain('no engagement');
  });

  it('a 🤷 not-interesting rating vetoes even a highlighted item', () => {
    const d = classifyEngagement({ ...base, rating: 1, highlightsCount: 5, documentNote: 'x' });
    expect(d.react).toBe(false);
    expect(d.reason).toContain('vetoed');
  });

  it('treats whitespace-only notes as absent', () => {
    expect(classifyEngagement({ ...base, documentNote: '   ', readerNote: '\n' }).react).toBe(false);
  });

  it('treats null highlightsCount as zero', () => {
    expect(classifyEngagement({ ...base, highlightsCount: null }).react).toBe(false);
  });

  it('combines multiple signals in the reason', () => {
    const d = classifyEngagement({ rating: 4, documentNote: 'n', readerNote: null, highlightsCount: 2 });
    expect(d.react).toBe(true);
    expect(d.reason).toContain('interesting');
    expect(d.reason).toContain('note');
    expect(d.reason).toContain('highlight');
  });

  // --- Stage 2.3c: structured output (machine code + signal codes) for the activity log ---

  it('reports code "reacted" and the present signal codes on a pass', () => {
    const d = classifyEngagement({ ...base, rating: 4 });
    expect(d.code).toBe('reacted');
    expect(d.signals).toEqual(['rated_interesting']);
  });

  it('reports code "no_signal" with empty signals for a bare archive', () => {
    const d = classifyEngagement(base);
    expect(d.code).toBe('no_signal');
    expect(d.signals).toEqual([]);
  });

  it('reports code "vetoed" but still lists the signals the veto overrode', () => {
    // rating:1 vetoes; rating is not 4 so 'rated_interesting' is absent, but the highlight + note remain.
    const d = classifyEngagement({ ...base, rating: 1, highlightsCount: 5, documentNote: 'x' });
    expect(d.code).toBe('vetoed');
    expect(d.signals).toEqual(['note_ansible', 'highlight']);
    expect(d.signals).not.toContain('rated_interesting');
  });

  it('lists every present signal code, in a stable order', () => {
    const d = classifyEngagement({ rating: 4, documentNote: 'n', readerNote: 'r', highlightsCount: 2 });
    expect(d.signals).toEqual(['rated_interesting', 'note_ansible', 'note_reader', 'highlight']);
  });
});

// ── evaluateRelayTriggers (orchestration) ────────────────────────────────────

type Row = {
  id: string;
  reader_id: string;
  short_summary: string | null;
  rating: number | null;
  document_note: string | null;
  reader_note: string | null;
  highlights_count: number | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'i1',
    reader_id: 'r1',
    short_summary: 'a summary',
    rating: null,
    document_note: null,
    reader_note: null,
    highlights_count: 0,
    ...over,
  };
}

function makeSupabase({
  gateEnabled = true,
  rows = [] as Row[],
  scanError = null as null | { message: string },
  stampError = null as null | { message: string },
}: {
  gateEnabled?: boolean | null;
  rows?: Row[];
  scanError?: null | { message: string };
  stampError?: null | { message: string };
} = {}) {
  const stamps: Array<{ id: string; ts: string; code?: string; signals?: string[] }> = [];
  let usersQueried = false;
  let scanned = false;
  const supabase = {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                usersQueried = true;
                return {
                  data: gateEnabled === null ? null : { relay_engagement_gate_enabled: gateEnabled },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === 'reader_items') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: async () => {
                  scanned = true;
                  return { data: rows, error: scanError };
                },
              }),
            }),
          }),
          update: (patch: { relay_triggered_at: string; relay_gate_code?: string; relay_gate_signals?: string[] }) => ({
            eq: async (_col: string, id: string) => {
              stamps.push({ id, ts: patch.relay_triggered_at, code: patch.relay_gate_code, signals: patch.relay_gate_signals });
              return { error: stampError };
            },
          }),
        };
      }
      return {};
    },
  } as unknown as SupabaseClient;
  return { supabase, stamps, flags: () => ({ usersQueried, scanned }) };
}

function makeOrchestrator({ ok = true, throws = false } = {}) {
  const bodies: string[] = [];
  const orchestrator: RelayOrchestratorLike = {
    idFromName: (name: string) => ({ name }),
    get: () => ({
      fetch: async (_input: string, init?: RequestInit) => {
        if (throws) throw new Error('DO unreachable');
        bodies.push(init!.body as string);
        return { ok, text: async () => 'detail' };
      },
    }),
  };
  return { orchestrator, bodies, enqueuedReaderIds: () => bodies.map((b) => JSON.parse(b).readerId) };
}

const NOW = '2026-07-10T00:00:00.000Z';
const deps = (over: Partial<Parameters<typeof evaluateRelayTriggers>[0]>) => ({
  userId: 'owner',
  ownerId: 'owner',
  now: () => NOW,
  log: () => {},
  ...over,
} as Parameters<typeof evaluateRelayTriggers>[0]);

describe('evaluateRelayTriggers — guards', () => {
  it('no-ops for a non-owner user (never touches the DB)', async () => {
    const { supabase, flags } = makeSupabase();
    const { orchestrator } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator, userId: 'someone-else' }));
    expect(res.skipped).toBe('not-owner');
    expect(flags().usersQueried).toBe(false);
  });

  it('no-ops when the owner is unconfigured', async () => {
    const { supabase } = makeSupabase();
    const { orchestrator } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator, ownerId: undefined }));
    expect(res.skipped).toBe('not-owner');
  });

  it('no-ops when the DO binding is unavailable (local dev)', async () => {
    const { supabase, flags } = makeSupabase();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator: undefined }));
    expect(res.skipped).toBe('no-orchestrator');
    expect(flags().usersQueried).toBe(false);
  });

  it('no-ops when the enable-toggle is off (default), without scanning items', async () => {
    const { supabase, flags } = makeSupabase({ gateEnabled: false });
    const { orchestrator } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res.skipped).toBe('disabled');
    expect(flags().scanned).toBe(false);
  });

  it('treats a missing owner row as disabled', async () => {
    const { supabase } = makeSupabase({ gateEnabled: null });
    const { orchestrator } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res.skipped).toBe('disabled');
  });
});

describe('evaluateRelayTriggers — outcomes', () => {
  it('enqueues a qualifying item with a summary, then stamps it', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row({ rating: 4 })] });
    const { orchestrator, enqueuedReaderIds } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ scanned: 1, enqueued: 1, skippedItems: 0, deferred: 0 });
    expect(enqueuedReaderIds()).toEqual(['r1']);
    // The stamp UPDATE also records the gate outcome: 'reacted' + the triggering signals.
    expect(stamps).toEqual([{ id: 'i1', ts: NOW, code: 'reacted', signals: ['rated_interesting'] }]);
  });

  it('records the pass outcome and every triggering signal in the stamp', async () => {
    const { supabase, stamps } = makeSupabase({
      rows: [row({ rating: 4, document_note: 'n', reader_note: 'r', highlights_count: 2 })],
    });
    const { orchestrator } = makeOrchestrator();
    await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(stamps).toEqual([
      { id: 'i1', ts: NOW, code: 'reacted', signals: ['rated_interesting', 'note_ansible', 'note_reader', 'highlight'] },
    ]);
  });

  it('the enqueue payload is ONLY { readerId } — no rating leaks (gate-blindness)', async () => {
    const { supabase } = makeSupabase({ rows: [row({ rating: 4, id: 'i1', reader_id: 'r1' })] });
    const { orchestrator, bodies } = makeOrchestrator();
    await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(JSON.parse(bodies[0])).toEqual({ readerId: 'r1' });
  });

  it('defers a qualifying item whose summary is not ready (leaves it unstamped)', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row({ rating: 4, short_summary: null })] });
    const { orchestrator, enqueuedReaderIds } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ enqueued: 0, deferred: 1, skippedItems: 0 });
    expect(enqueuedReaderIds()).toEqual([]);
    expect(stamps).toEqual([]);
  });

  it('stamps a non-engaged item as a permanent skip (no enqueue)', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row()] });
    const { orchestrator, enqueuedReaderIds } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ enqueued: 0, skippedItems: 1, deferred: 0 });
    expect(enqueuedReaderIds()).toEqual([]);
    // Skip outcome recorded in the same stamp: 'no_signal', no signals present.
    expect(stamps).toEqual([{ id: 'i1', ts: NOW, code: 'no_signal', signals: [] }]);
  });

  it('stamps a vetoed (🤷) item as a permanent skip even with a highlight', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row({ rating: 1, highlights_count: 3 })] });
    const { orchestrator, enqueuedReaderIds } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ skippedItems: 1, enqueued: 0 });
    expect(enqueuedReaderIds()).toEqual([]);
    // 'vetoed', and the overridden highlight is still recorded so the log can show it.
    expect(stamps).toEqual([{ id: 'i1', ts: NOW, code: 'vetoed', signals: ['highlight'] }]);
  });

  it('leaves an item unstamped when the enqueue returns non-ok (retry next sync)', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row({ rating: 4 })] });
    const { orchestrator } = makeOrchestrator({ ok: false });
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ enqueued: 0, deferred: 1 });
    expect(stamps).toEqual([]);
  });

  it('leaves an item unstamped when the enqueue throws (retry next sync)', async () => {
    const { supabase, stamps } = makeSupabase({ rows: [row({ rating: 4 })] });
    const { orchestrator } = makeOrchestrator({ throws: true });
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ enqueued: 0, deferred: 1 });
    expect(stamps).toEqual([]);
  });

  it('throws when the standing scan errors (non-fatal handling lives in the caller)', async () => {
    const { supabase } = makeSupabase({ rows: [], scanError: { message: 'db exploded' } });
    const { orchestrator } = makeOrchestrator();
    await expect(evaluateRelayTriggers(deps({ supabase, orchestrator }))).rejects.toThrow('db exploded');
  });

  it('does not throw when a stamp update errors (the standing scan self-heals next sync)', async () => {
    const { supabase } = makeSupabase({ rows: [row({ rating: 4 })], stampError: { message: 'stamp failed' } });
    const { orchestrator } = makeOrchestrator();
    // Enqueue succeeds; the stamp fails but is swallowed (console.error), so the phase completes.
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ enqueued: 1 });
  });

  it('handles a mixed batch: enqueues qualifiers, skips the rest, defers summary-less', async () => {
    const rows = [
      row({ id: 'a', reader_id: 'ra', rating: 4 }),                       // enqueue
      row({ id: 'b', reader_id: 'rb' }),                                  // skip (no signal)
      row({ id: 'c', reader_id: 'rc', rating: 1, highlights_count: 2 }),  // skip (veto)
      row({ id: 'd', reader_id: 'rd', document_note: 'n', short_summary: null }), // defer (no summary)
      row({ id: 'e', reader_id: 're', highlights_count: 1 }),             // enqueue
    ];
    const { supabase, stamps } = makeSupabase({ rows });
    const { orchestrator, enqueuedReaderIds } = makeOrchestrator();
    const res = await evaluateRelayTriggers(deps({ supabase, orchestrator }));
    expect(res).toMatchObject({ scanned: 5, enqueued: 2, skippedItems: 2, deferred: 1 });
    expect(enqueuedReaderIds().sort()).toEqual(['ra', 're']);
    // stamped: the two enqueued + the two skipped; NOT the deferred one.
    expect(stamps.map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'e']);
  });
});
