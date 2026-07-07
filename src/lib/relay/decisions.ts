// ABOUT: Relay decision capture — the backend-observed verdict for one stimulus session
// ABOUT: Derives verdict + real piece_id from DB state (pending pieces in the T0 window), agent stays blind

import type { ToolDeps } from './tools';

export interface FinalizeDecisionInput {
  // The reader_id(s) that seeded this session — recorded for traceability.
  stimulus_ref?: string[];
  // T0: an ISO timestamp captured by the orchestrator BEFORE the stimulus was sent. The window anchor.
  started_at: string;
  // The agent's closing text — primarily the reasoning behind a silence (a 'declined' verdict).
  reason?: string;
  // e.g. 'summary_only' when a mid-session fetch degraded to stored content.
  degraded?: string;
}

export interface DecisionResult {
  verdict: 'wrote' | 'declined';
  piece_id: string | null;
}

/**
 * Finalize one stimulus session's decision — backend-observed, because LLMs are unreliable at
 * "log before you stop" and a backend check also catches crashes (no row at all = crash, spec §6).
 *
 * The verdict and the *real* piece id come from DATABASE STATE, not the session transcript: a
 * `pending_review` piece created at/after T0 means the agent wrote (and hands us its true id);
 * none means it stayed silent. T0 (`started_at`) is stamped before the stimulus is sent, so the
 * window is exact for the serial, manual Stage-1 sessions — concurrent sessions would blur it, and
 * a session is expected to write at most one piece (we take the newest in-window if more appear).
 * The agent never crosses this boundary: it has no decision tool and never learns the piece id.
 */
export async function finalizeDecision(
  deps: ToolDeps,
  input: FinalizeDecisionInput,
): Promise<DecisionResult> {
  const startedAt = input?.started_at;
  if (!startedAt) {
    throw new Error('finalizeDecision: started_at (the T0 window anchor) is required');
  }
  if (Number.isNaN(Date.parse(startedAt))) {
    throw new Error('finalizeDecision: started_at must be an ISO timestamp');
  }

  // Pieces already claimed by a prior decision — a piece belongs to exactly ONE session. The serial
  // orchestrator finalizes run N (claiming its piece) before run N+1 starts, but the T0 window reaches
  // ~30s back into run N's tail; a *declining* N+1 could otherwise scoop run N's still-pending piece and
  // mis-record 'wrote'. Excluding claimed pieces closes that, and makes finalize idempotent on re-run.
  const { data: claimedRows, error: claimedError } = await deps.supabase
    .from('relay_decisions')
    .select('piece_id')
    .not('piece_id', 'is', null);
  if (claimedError) {
    throw new Error(`finalizeDecision: ${claimedError.message}`);
  }
  const claimed = ((claimedRows ?? []) as Array<{ piece_id: string | null }>)
    .map((r) => r.piece_id)
    .filter((x): x is string => !!x);

  let query = deps.supabase
    .from('relay_pieces')
    .select('id, created_at')
    .eq('state', 'pending_review')
    .gte('created_at', startedAt);
  if (claimed.length) {
    query = query.not('id', 'in', `(${claimed.join(',')})`);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1);
  if (error) {
    throw new Error(`finalizeDecision: ${error.message}`);
  }

  const piece = ((data ?? []) as Array<{ id: string }>)[0];
  const verdict: DecisionResult['verdict'] = piece ? 'wrote' : 'declined';
  const pieceId = piece ? piece.id : null;

  const { error: insertError } = await deps.supabase.from('relay_decisions').insert({
    stimulus_ref: Array.isArray(input.stimulus_ref) ? input.stimulus_ref : [],
    verdict,
    reason: input.reason ?? null,
    piece_id: pieceId,
    degraded: input.degraded ?? null,
  });
  if (insertError) {
    throw new Error(`finalizeDecision: ${insertError.message}`);
  }

  return { verdict, piece_id: pieceId };
}
