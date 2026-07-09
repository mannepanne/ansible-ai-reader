-- ABOUT: Relay Stage 2.1 fact-grounding — capture research provenance + constrain the status vocabulary
-- ABOUT: Adds relay_decisions.sources (jsonb) and a CHECK on relay_pieces.verification_status

-- Provenance the agent consulted this session, extracted from the transcript by the orchestrator and
-- stored behind the bridge (the agent stays blind to the gate). Captured for BOTH verdicts: on a
-- 'declined' this is the only record of what informed the silence ("someone I admire already made this
-- point better" — the north-star's highest-value decline). Shape mirrors a piece's source links:
-- [{ quote, source_url, source_title }].
ALTER TABLE relay_decisions
  ADD COLUMN sources jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Pin the verification_status vocabulary at the DB (it was a bare text column). The three-value model
-- lives in app code (write_pending derives 'sourced' vs 'unverified' from links); this constraint
-- documents the reserved 'verified' value — the deferred re-verification pass — and stops a typo or a
-- future writer bypassing that derivation from persisting a status the admin badge would silently read
-- as "unverified". All existing rows default to 'unverified', so this validates cleanly.
ALTER TABLE relay_pieces
  ADD CONSTRAINT relay_pieces_verification_status_check
  CHECK (verification_status IN ('unverified', 'sourced', 'verified'));
