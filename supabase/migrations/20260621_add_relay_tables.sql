-- ABOUT: Relay agent Stage 1 foundation — owned-memory schema (single-narrator namespace)
-- ABOUT: Adds pgvector + relay_pieces / relay_references / relay_decisions with RLS enabled and
-- ABOUT: ZERO policies, so only the service-role bridge can read/write (anon/authenticated denied)

-- Enable pgvector for the conceptual-nearness index (the "mind palace made queryable").
-- Available on the Supabase free tier; only uuid-ossp was enabled before this migration.
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Lifecycle of one of Relay's own pieces. 'approved' = embedded + recallable
-- (the load-bearing event); blog deployment is tracked separately (deployed_at).
CREATE TYPE relay_piece_state_enum AS ENUM (
  'pending_review',
  'approved',
  'rejected'
);

-- Outcome of one stimulus session — the restraint instrument. 'declined' = genuine
-- silence (with reason); absence of any row for a run = the session crashed.
CREATE TYPE relay_decision_verdict_enum AS ENUM (
  'wrote',
  'declined'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: relay_pieces — Relay's own published work (the "self" corpus).
-- Not user-scoped: Relay is one voice. Reached only via the service-role bridge.
CREATE TABLE relay_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  body text NOT NULL,
  summary text,
  concepts text[] DEFAULT '{}',
  -- Machine-resolvable provenance: the reference/piece ids that fed this piece.
  -- Cheap to capture now, impossible to reconstruct later; the Stage 2 fact-prune needs it.
  links jsonb DEFAULT '[]'::jsonb,

  state relay_piece_state_enum NOT NULL DEFAULT 'pending_review',
  -- The hook the committed Stage 2 re-verification/prune pass will filter on.
  verification_status text NOT NULL DEFAULT 'unverified',

  -- Null until approval. Recall-as-self filters state = 'approved', so pending/rejected
  -- pieces are never returned as the narrator's own prior reasoning.
  embedding vector(1024),

  slug text,
  -- Decoupled from approval: a piece is recallable when approved; deploying it to the
  -- blog is a separate, later, idempotent step (the blog is built last in Stage 1).
  deployed_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),
  decided_at timestamp with time zone
);

-- Table: relay_references — ingested reference material (the "world reporting in").
-- Seeded by the one-time back-fill of Ansible summaries/commentary; later, live research.
CREATE TABLE relay_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  origin text NOT NULL,              -- 'ansible_backfill' | 'research'
  source_ref text,                   -- e.g. the originating reader_id
  title text,
  content text NOT NULL,             -- the summary/commentary text used as the reference body

  embedding vector(1024),

  created_at timestamp with time zone DEFAULT now(),

  -- Dedup key for the idempotent back-fill: re-running never double-ingests an item.
  UNIQUE (origin, source_ref)
);

-- Table: relay_decisions — one row per stimulus session (write or silence + reason).
-- Backend-observed from the session outcome; the agent never writes here (stays blind).
CREATE TABLE relay_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  stimulus_ref text[] DEFAULT '{}',  -- the reader_id(s) fed this run
  verdict relay_decision_verdict_enum NOT NULL,
  reason text,                       -- for 'declined': the agent's own closing reasoning
  piece_id uuid REFERENCES relay_pieces(id) ON DELETE SET NULL,  -- set when verdict = 'wrote'
  degraded text,                     -- e.g. 'summary_only' when the body fetch failed

  created_at timestamp with time zone DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- ANN indexes for conceptual-nearness search (cosine, matching bge-m3 dense embeddings).
-- Brute force is fine at Stage 1 corpus size; these are cheap insurance as it grows.
CREATE INDEX idx_relay_pieces_embedding ON relay_pieces USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_relay_references_embedding ON relay_references USING hnsw (embedding vector_cosine_ops);

-- Recall-as-self filters on state; the decision log is read newest-first in the admin tab.
CREATE INDEX idx_relay_pieces_state ON relay_pieces(state, created_at DESC);
CREATE INDEX idx_relay_decisions_created ON relay_decisions(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS with ZERO policies on every relay_* table. The service-role key (used only by
-- the Relay bridge Worker) has BYPASSRLS, so the bridge reads/writes freely; the publishable
-- anon/authenticated key shipped in the client bundle is denied everything. This keeps
-- pending_review and rejected pieces — and the whole single-narrator namespace — invisible
-- to any browser client. (Disabling RLS would instead EXPOSE these tables via PostgREST.)
ALTER TABLE relay_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE relay_decisions ENABLE ROW LEVEL SECURITY;
