-- ABOUT: Relay Stage 2.2a — capture the human gate's taste signal on each piece.
-- ABOUT: review_note (the "why" of a decision) + original_body (write-once pre-edit body, the "fix" delta).
--
-- Two nullable columns, additive, no backfill. relay_pieces is service-role-only (RLS zero-policy),
-- so no policy change is needed. Apply via the Supabase SQL editor (not `db push`), consistent with
-- the other relay_* migrations.
--
-- review_note:    free-text reviewer note captured at decision time (reject reason, or a note on an
--                 approve). NULL when no note was given. Marks fold into this free text in 2.2a.
-- original_body:  the piece exactly as Relay first wrote it, set ONCE the first time a human edits the
--                 body on approval (write-once, enforced in approvePiece). NULL ⟹ never edited. The
--                 edit delta is original_body vs body — no separate diff stored.
--
-- Neither column is ever read on the writing-session path (recall / relay_recall / system-prompt
-- assembly) — gate-blindness (stage-1-technical-spec §7/A4). See spec §H.

ALTER TABLE relay_pieces ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE relay_pieces ADD COLUMN IF NOT EXISTS original_body text;
