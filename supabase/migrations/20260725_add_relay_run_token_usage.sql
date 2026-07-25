-- ABOUT: Relay run ledger — capture per-session Managed-Agent token usage for cost/cache observability.
-- ABOUT: Four additive columns on agent_session_runs. No new table; names mirror the session .usage payload.
--
-- Apply via the Supabase SQL editor (not `db push`), consistent with the other relay_* migrations.
-- Re-run-safe (ADD COLUMN IF NOT EXISTS). There is NO baseline UPDATE: pre-existing rows keep the columns
-- NULL, which reads as "usage not measured" (the ledger only populates them on the idle-finalize path;
-- terminated / poll-cap / stale-release runs deliberately leave them NULL).
--
-- Values are the server-computed session totals from GET /v1/sessions/{id} `.usage` (equal to the sum of
-- the session's span.model_request_end model_usage blocks). `.usage.cache_creation` is reported split by
-- TTL bucket (ephemeral_5m + ephemeral_1h); the two are collapsed into cache_creation_input_tokens.
-- cache_read_input_tokens is the key signal for "was the cache warm this session?".

ALTER TABLE agent_session_runs ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE agent_session_runs ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE agent_session_runs ADD COLUMN IF NOT EXISTS cache_creation_input_tokens integer;
ALTER TABLE agent_session_runs ADD COLUMN IF NOT EXISTS cache_read_input_tokens integer;
