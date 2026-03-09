-- ABOUT: Initial database schema for Ansible AI Reader
-- ABOUT: Creates users, reader_items, sync_log, processing_jobs tables with RLS

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Job type enum for processing_jobs
CREATE TYPE job_type_enum AS ENUM (
  'summary_generation',
  'archive_sync'
);

-- Job status enum for processing_jobs
CREATE TYPE job_status_enum AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  summary_prompt text
);

-- Table: reader_items
CREATE TABLE reader_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reader_id text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  author text,
  source text,
  content_type text,
  content text,

  short_summary text,
  long_summary text,
  tags text[],
  perplexity_model text,

  document_note text,
  rating integer,
  archived boolean DEFAULT false,
  archived_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  UNIQUE(user_id, reader_id)
);

-- Table: sync_log
CREATE TABLE sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  sync_type text,
  items_fetched integer,
  items_created integer,
  items_failed integer DEFAULT 0,
  errors jsonb,
  token_usage jsonb,
  estimated_cost decimal(10, 4),
  created_at timestamp with time zone DEFAULT now()
);

-- Table: processing_jobs
CREATE TABLE processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  reader_item_id uuid REFERENCES reader_items(id) ON DELETE CASCADE,
  job_type job_type_enum NOT NULL,
  status job_status_enum NOT NULL DEFAULT 'pending',
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  started_at timestamp with time zone,
  completed_at timestamp with time zone
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_user_archived ON reader_items(user_id, archived, created_at DESC);
CREATE INDEX idx_user_tags ON reader_items USING GIN(tags);
CREATE INDEX idx_processing_jobs_status ON processing_jobs(status, created_at);
CREATE INDEX idx_processing_jobs_user ON processing_jobs(user_id, status);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reader_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users table
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies: reader_items table
CREATE POLICY "Users can view own items"
  ON reader_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
  ON reader_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
  ON reader_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
  ON reader_items FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies: sync_log table
CREATE POLICY "Users can view own sync logs"
  ON sync_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync logs"
  ON sync_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies: processing_jobs table
CREATE POLICY "Users can view own processing jobs"
  ON processing_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own processing jobs"
  ON processing_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Queue consumers can update jobs"
  ON processing_jobs FOR UPDATE
  USING (true);  -- Queue consumer uses service role key
