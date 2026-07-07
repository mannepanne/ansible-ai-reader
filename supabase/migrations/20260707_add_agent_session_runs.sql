-- ABOUT: Run ledger for the Relay session orchestrator (RelayOrchestrator Durable Object).
-- ABOUT: Mind-specific orchestration state (session_id, polling) — deliberately NOT a relay_* owned-memory
-- ABOUT: table and NOT behind the bridge; the DO writes it via the service role. See ADR + the robustness spec.

CREATE TABLE agent_session_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_id text NOT NULL,
  session_id text,                       -- the Managed-Agent session (null until created)
  started_at timestamptz,                -- T0: stamped at session-create, the attribution window anchor
  state text NOT NULL DEFAULT 'running', -- running → wrote | declined | failed
  piece_id uuid,                         -- set on finalize (traceability)
  attempt integer NOT NULL DEFAULT 0,    -- poll (alarm) attempt count
  degraded text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_session_runs_created ON agent_session_runs (created_at DESC);
CREATE INDEX idx_agent_session_runs_state ON agent_session_runs (state);

-- Backend-only table: locked to the service role (the DO + the admin page). No anon/authenticated access.
ALTER TABLE agent_session_runs ENABLE ROW LEVEL SECURITY;
