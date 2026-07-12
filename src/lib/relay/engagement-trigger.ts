// ABOUT: Relay Stage 2.3b — the engagement-gated archive-hook. Classifies a newly-archived item
// ABOUT: react/skip off existing engagement data, and drives the self-healing trigger-eval sync phase.
//
// Two exports:
//   classifyEngagement — a PURE filter (react iff a strong engagement signal AND not a 🤷 veto).
//   evaluateRelayTriggers — the owner-scoped, self-healing orchestration run as sync's final phase.
//
// Gate-blindness / rating-bias (spec §D): the rating is used ONLY here, server-side, to decide
// whether to react. It is never placed in the prompt — the enqueue payload is just { readerId }, and
// the orchestrator re-fetches + assembles the stimulus itself (which excludes ratings). So the §D
// guarantee holds by construction, not by convention.

import type { SupabaseClient } from '@supabase/supabase-js';

// ── The pure filter ────────────────────────────────────────────────────────

export interface EngagementInput {
  /** reader_items.rating (live column): 4 = interesting, 1 = not-interesting (veto), null = neutral. */
  rating: number | null;
  /** Ansible-authored note (document_note). */
  documentNote: string | null;
  /** Reader-authored note retained from the archive response (reader_note). */
  readerNote: string | null;
  /** Highlight count retained from the archive response. */
  highlightsCount: number | null;
}

/**
 * The engagement signals, as stable machine codes. Shared vocabulary between the classifier (which
 * produces them) and the admin activity log (which humanises them) — a single source of truth so a
 * rename can't silently desync stored data from its display. Order here is the stable display order.
 */
export const GATE_SIGNALS = ['rated_interesting', 'note_ansible', 'note_reader', 'highlight'] as const;
export type GateSignal = (typeof GATE_SIGNALS)[number];

/** Human labels for the `reason` string (worker logs/debugging). Keyed by signal code. The admin UI has
 *  its own SIGNAL_LABEL map (RelayAgent.tsx); both derive from GATE_SIGNALS — keep all three in sync. */
const SIGNAL_REASON_LABEL: Record<GateSignal, string> = {
  rated_interesting: 'rated interesting',
  note_ansible: 'note (Ansible)',
  note_reader: 'note (Reader)',
  highlight: 'highlight',
};

export interface EngagementDecision {
  react: boolean;
  /** Machine outcome code. 'reacted' = pass; 'no_signal' / 'vetoed' = skip (the reason). Persisted on
   *  the item as relay_gate_code and drives the activity-log display. */
  code: 'reacted' | 'no_signal' | 'vetoed';
  /** The signal codes present at eval time — populated even on a veto (a veto overriding a highlight
   *  still records the highlight). Persisted as relay_gate_signals. */
  signals: GateSignal[];
  /** Human-readable why, for logs/debugging — never fed to the agent. */
  reason: string;
}

/**
 * React iff the item carries ≥1 strong engagement signal (💡 rating, a note from either source, or
 * ≥1 highlight) AND is not explicitly vetoed. A 🤷 not-interesting rating vetoes even a highlighted
 * item — respect the verdict (consistent with gate-blindness). Click-through and generated
 * commentariat never qualify (they are not inputs here).
 *
 * The rating is read from the LIVE reader_items.rating column (not the append-only item_signals log):
 * clearing a rating truly clears it, so a lifted veto lifts. This mirrors how notes are read live
 * (spec §B), decided 2026-07-10 (deviation from the spec's original "ignore legacy rating column").
 *
 * Signals are collected FIRST, then the outcome is decided, so a veto still reports the signals it
 * overrode (Stage 2.3c — the activity log shows "highlight present, but vetoed").
 */
export function classifyEngagement(input: EngagementInput): EngagementDecision {
  const signals: GateSignal[] = [];
  if (input.rating === 4) signals.push('rated_interesting');
  if (input.documentNote?.trim()) signals.push('note_ansible');
  if (input.readerNote?.trim()) signals.push('note_reader');
  if ((input.highlightsCount ?? 0) >= 1) signals.push('highlight');

  // 🤷 veto wins outright — but the overridden signals are still recorded.
  if (input.rating === 1) return { react: false, code: 'vetoed', signals, reason: 'vetoed: rated not-interesting' };
  if (signals.length === 0) return { react: false, code: 'no_signal', signals, reason: 'no engagement signal' };
  return { react: true, code: 'reacted', signals, reason: signals.map((s) => SIGNAL_REASON_LABEL[s]).join(' + ') };
}

// ── The orchestration ──────────────────────────────────────────────────────

/** Minimal shape of the RELAY_ORCHESTRATOR Durable Object namespace binding (matches the run route). */
export interface RelayOrchestratorLike {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => {
    fetch: (input: string, init?: RequestInit) => Promise<{ ok: boolean; text: () => Promise<string> }>;
  };
}

export interface EvaluateRelayTriggersDeps {
  supabase: SupabaseClient;
  /** The user this sync ran for. */
  userId: string;
  /** Relay's configured owner (RELAY_OWNER_USER_ID). undefined ⟹ unconfigured ⟹ never triggers. */
  ownerId: string | undefined;
  /** The DO namespace binding; undefined in local dev (no Workers runtime). */
  orchestrator: RelayOrchestratorLike | undefined;
  /** Injectable clock (ISO string) for deterministic tests. */
  now?: () => string;
  log?: (msg: string) => void;
}

export interface EvaluateRelayTriggersResult {
  /** Set when a guard short-circuited the whole phase. */
  skipped?: 'not-owner' | 'no-orchestrator' | 'disabled';
  scanned: number;
  enqueued: number;
  /** Permanently-stamped skips (no engagement / veto). */
  skippedItems: number;
  /** Left NULL for retry next sync (summary not ready, or enqueue failed). */
  deferred: number;
}

const EMPTY = { scanned: 0, enqueued: 0, skippedItems: 0, deferred: 0 };

/**
 * The final sync phase: find archived-but-not-yet-evaluated items belonging to Relay's owner, apply
 * the engagement filter, and enqueue a session per qualifier. Self-healing by design — the standing
 * scan `archived AND relay_triggered_at IS NULL` re-detects anything a crash or enqueue-failure left
 * unstamped, so the failure mode is a delayed trigger, never a lost or double one (within a sync).
 *
 * Owner-scoping is the first guard and is load-bearing: performSyncForUser runs for EVERY auto-sync
 * user, but Relay is single-owner (singleton DO, no user_id on relay tables). Triggering for a
 * non-owner would feed someone else's private notes/highlights to Magnus's narrator — a correctness
 * and GDPR failure. See the single-owner ADR (2026-07-10).
 */
export async function evaluateRelayTriggers(
  deps: EvaluateRelayTriggersDeps
): Promise<EvaluateRelayTriggersResult> {
  const { supabase, userId, ownerId, orchestrator } = deps;
  const now = deps.now ?? (() => new Date().toISOString());
  const log = deps.log ?? (() => {});

  // Guard 1 — owner-scoping (the GDPR guard). Free string compare; must come first.
  if (!ownerId || userId !== ownerId) return { ...EMPTY, skipped: 'not-owner' };
  // Guard 2 — DO binding unavailable (local dev). Nothing to enqueue to.
  if (!orchestrator) return { ...EMPTY, skipped: 'no-orchestrator' };
  // Guard 3 — operator enable-toggle, default-off. One DB read.
  const { data: ownerRow } = await supabase
    .from('users')
    .select('relay_engagement_gate_enabled')
    .eq('id', ownerId)
    .maybeSingle();
  if (!ownerRow?.relay_engagement_gate_enabled) return { ...EMPTY, skipped: 'disabled' };

  // Standing scan — archived items not yet trigger-evaluated. This IS the recovery mechanism
  // (safe because the migration baselined all pre-existing archived rows).
  const { data: rows, error } = await supabase
    .from('reader_items')
    .select('id, reader_id, short_summary, rating, document_note, reader_note, highlights_count')
    .eq('user_id', ownerId)
    .eq('archived', true)
    .is('relay_triggered_at', null);
  if (error) throw new Error(`relay trigger-eval scan failed: ${error.message}`);

  let enqueued = 0;
  let skippedItems = 0;
  let deferred = 0;

  for (const row of rows ?? []) {
    const decision = classifyEngagement({
      rating: row.rating,
      documentNote: row.document_note,
      readerNote: row.reader_note,
      highlightsCount: row.highlights_count,
    });

    if (!decision.react) {
      // Permanent skip — stamp so we never re-evaluate this archived item. The same UPDATE records the
      // gate outcome (2.3c): the skip reason + the signals present. One write, no separate insert to
      // lose or duplicate, so the never-miss bias needs no ordering dance here.
      await stamp(supabase, row.id, now(), decision.code, decision.signals);
      skippedItems++;
      continue;
    }

    if (!row.short_summary?.trim()) {
      // Qualifies, but the async summary job hasn't landed yet. Leave NULL → retry next sync.
      // Steady state: an item whose summary NEVER lands stays unstamped and is re-scanned every sync
      // indefinitely. That's acceptable — bounded by the partial index (cheap), and it is never a missed
      // trigger, only a perpetually-deferred one. (Engagement is read once, here, at trigger-eval time:
      // once an item is stamped, later rating/note changes are not re-read.)
      deferred++;
      continue;
    }

    const ok = await enqueueSession(orchestrator, row.reader_id);
    if (ok) {
      // enqueue → stamp (unchanged order). The gate outcome ('reacted' + the triggering signals) rides
      // the same stamp UPDATE. The pass's duplicate-session risk is exactly the pre-existing one (a
      // failed stamp re-enqueues); folding the outcome in adds no new write, so it is not worsened.
      await stamp(supabase, row.id, now(), decision.code, decision.signals);
      enqueued++;
    } else {
      // Enqueue failed — leave NULL → retry next sync.
      deferred++;
    }
  }

  const scanned = rows?.length ?? 0;
  log(`[Relay] trigger-eval: scanned ${scanned}, enqueued ${enqueued}, skipped ${skippedItems}, deferred ${deferred}`);
  return { scanned, enqueued, skippedItems, deferred };
}

/** Stamp relay_triggered_at (mark an item done) AND record the gate outcome in the same UPDATE (2.3c).
 *  A stamp failure is logged, not thrown — the standing scan self-heals it next sync. */
async function stamp(
  supabase: SupabaseClient,
  id: string,
  ts: string,
  code: EngagementDecision['code'],
  signals: GateSignal[],
): Promise<void> {
  const { error } = await supabase
    .from('reader_items')
    .update({ relay_triggered_at: ts, relay_gate_code: code, relay_gate_signals: signals })
    .eq('id', id);
  if (error) console.error(`[Relay] failed to stamp relay_triggered_at for ${id}:`, error);
}

/** Enqueue one session on the singleton DO. Returns true on a 2xx from the DO, false otherwise (the
 *  caller leaves the item unstamped so it retries). The payload is ONLY { readerId } — see §D. */
async function enqueueSession(orchestrator: RelayOrchestratorLike, readerId: string): Promise<boolean> {
  try {
    const stub = orchestrator.get(orchestrator.idFromName('relay'));
    const res = await stub.fetch('https://relay-orchestrator/enqueue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ readerId }),
    });
    return res.ok;
  } catch (e) {
    console.error(`[Relay] enqueue failed for ${readerId}:`, e);
    return false;
  }
}
