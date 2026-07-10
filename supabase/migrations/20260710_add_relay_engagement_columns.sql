-- ABOUT: Relay Stage 2.3b — the engagement-gated archive-hook: work-queue marker + retained signal fields.
-- ABOUT: Three additive columns on reader_items + one enable-flag on users. No new table.
--
-- Apply via the Supabase SQL editor (not `db push`), consistent with the other relay_* migrations.
--
-- ⚠️ RUN EXACTLY ONCE, at or before the deploy that ships 2.3b. The DDL is re-run-safe (ADD COLUMN IF
-- NOT EXISTS), but the baseline UPDATE below is NOT: once the feature is live, `archived = true` also
-- matches genuinely-pending rows (awaiting a summary, or mid-retry), so a second run would stamp those
-- NOW() and they would never fire — a silently missed trigger. Do not re-run after go-live.
--
-- reader_items.relay_triggered_at:  work-queue marker for the self-healing trigger-eval phase. NULL ⟹
--                                   an archived item not yet evaluated for a Relay reaction. The standing
--                                   scan `WHERE archived = true AND relay_triggered_at IS NULL` IS the
--                                   recovery mechanism (a crash between archive-stamp and enqueue leaves
--                                   the item NULL, so the next sync re-detects it). The baseline UPDATE
--                                   below stamps all EXISTING archived rows so history never fires and
--                                   there is no first-deploy flood.
-- reader_items.highlights_count:    retained from the archive API response (was discarded). Filter input:
--                                   highlights_count >= 1 is a strong engagement signal. Defaults to 0.
-- reader_items.reader_note:         the Reader-authored note retained from the archive response `notes`
--                                   field. Kept SEPARATE from the Ansible-authored `document_note` so the
--                                   two note sources never clobber each other. Filter input + stimulus
--                                   enrichment (a note = a strong engagement signal).
--
-- users.relay_engagement_gate_enabled:  operator enable-toggle for the auto-trigger, default OFF. The
--                                   trigger-eval phase no-ops unless the Relay owner's row has this true.
--                                   Admin-flippable without a deploy (single-owner system — the flag lives
--                                   on the owner's row, keyed by RELAY_OWNER_USER_ID). See the single-owner
--                                   ADR (2026-07-10) for why a global flag lives on a user row.

ALTER TABLE reader_items ADD COLUMN IF NOT EXISTS relay_triggered_at timestamptz;
ALTER TABLE reader_items ADD COLUMN IF NOT EXISTS highlights_count integer NOT NULL DEFAULT 0;
ALTER TABLE reader_items ADD COLUMN IF NOT EXISTS reader_note text;

-- Baseline: stamp all EXISTING archived rows so pre-2.3b history never triggers a reaction on first sync.
-- Newly-archived items (archived after this migration) get relay_triggered_at left NULL by the archive
-- step and are the only rows the standing scan evaluates.
--
-- The predicate is `archived = true` — IDENTICAL to the standing scan's positive predicate
-- (engagement-trigger.ts: `archived = true AND relay_triggered_at IS NULL`). Matching them exactly makes
-- the anti-flood guarantee provable: every row the scan could ever return is stamped here, so nothing in
-- history can fire. (Do NOT weaken to `archived_at IS NOT NULL` — a legacy/edge row with archived=true but
-- a null archived_at would then slip the baseline yet still be scanned, and flood on first sync.)
UPDATE reader_items SET relay_triggered_at = NOW() WHERE archived = true;

-- Partial index makes the standing scan (archived, not-yet-evaluated) cheap as the table grows.
CREATE INDEX IF NOT EXISTS reader_items_relay_pending_idx
  ON reader_items (user_id)
  WHERE archived = true AND relay_triggered_at IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS relay_engagement_gate_enabled boolean NOT NULL DEFAULT false;
