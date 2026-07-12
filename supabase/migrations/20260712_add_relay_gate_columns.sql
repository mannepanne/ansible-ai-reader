-- ABOUT: Relay Stage 2.3c — the gate activity log: record the engagement gate's per-item outcome.
-- ABOUT: Two additive columns on reader_items. No new table (see the 2.3c spec for why columns win).
--
-- Apply via the Supabase SQL editor (not `db push`), consistent with the other relay_* migrations.
-- The DDL is re-run-safe (ADD COLUMN IF NOT EXISTS). There is NO baseline UPDATE here: pre-existing
-- archived rows deliberately keep relay_gate_code = NULL so history is neither a pass nor a skip.
--
-- reader_items.relay_gate_code:     the engagement-gate outcome for this archived item, set once by
--                                   evaluateRelayTriggers. Mirrors classifyEngagement's machine code:
--                                     'reacted'    → passed the gate (a session was enqueued)
--                                     'no_signal'  → skipped: no engagement signal present
--                                     'vetoed'     → skipped: a 🤷 not-interesting rating overrode any signal
--                                   NULL ⟹ NOT gate-evaluated — either never archived-and-scanned, or a row
--                                   baselined by the 2.3b migration (relay_triggered_at stamped, but the
--                                   item was never actually classified). NULL is load-bearing: it is what
--                                   keeps baselined history out of BOTH the pass-rate and the skip list.
--                                   The CHECK admits NULL (a NULL check expression is not a violation in
--                                   Postgres), so unevaluated rows and the absence of a default are fine.
-- reader_items.relay_gate_signals:  the engagement signals present at gate-eval time, as machine codes,
--                                   e.g. ["rated_interesting","highlight"]. [] = none present. Populated
--                                   for both pass and skip (a vetoed skip may still list the signals the
--                                   veto overrode); only the skip rows are surfaced in the activity log.

ALTER TABLE reader_items ADD COLUMN IF NOT EXISTS relay_gate_code text
  CHECK (relay_gate_code IN ('reacted', 'no_signal', 'vetoed'));
ALTER TABLE reader_items ADD COLUMN IF NOT EXISTS relay_gate_signals jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Partial index for the activity-log skip query + the skip-count stat (both filter on the skip codes,
-- ordered newest-first by the existing stamp). Kept small: only skipped rows are indexed.
CREATE INDEX IF NOT EXISTS reader_items_relay_skip_idx
  ON reader_items (relay_triggered_at DESC)
  WHERE relay_gate_code IN ('no_signal', 'vetoed');
