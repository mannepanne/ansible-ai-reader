-- ABOUT: Relay Stage 2.1 fact-grounding — capture research provenance on every decision
-- ABOUT: Adds relay_decisions.sources (jsonb) so both writes AND declines record what the agent read

-- Provenance the agent consulted this session, extracted from the transcript by the orchestrator and
-- stored behind the bridge (the agent stays blind to the gate). Captured for BOTH verdicts: on a
-- 'declined' this is the only record of what informed the silence ("someone I admire already made this
-- point better" — the north-star's highest-value decline). Shape mirrors a piece's source links:
-- [{ quote, source_url, source_title }].
ALTER TABLE relay_decisions
  ADD COLUMN sources jsonb NOT NULL DEFAULT '[]'::jsonb;
