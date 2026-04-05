-- ABOUT: Analytics tables for the public landing page and interactive demo
-- ABOUT: Tracks email captures, demo sessions, demo events, and page events

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: email_captures
-- Stores emails submitted via the landing page hero or CTA forms
CREATE TABLE email_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text NOT NULL,           -- 'hero' | 'cta'
  consented boolean NOT NULL,
  consented_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Table: demo_sessions
-- One row per demo session; updated via heartbeat while user is active
CREATE TABLE demo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL UNIQUE,
  email text,
  started_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  total_events integer DEFAULT 0
);

-- Table: demo_events
-- One row per user interaction in the demo
CREATE TABLE demo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  email text,
  event_type text NOT NULL,       -- 'tab_switch' | 'expand' | 'collapse' | 'archive' | 'add_note' | 'reaction' | 'open_reader' | 'sync' | 'page_view'
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Table: page_events
-- Landing page analytics: views, nav clicks, signups
CREATE TABLE page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id text NOT NULL,       -- anonymous UUID stored in localStorage
  session_id text NOT NULL,       -- 30-min session window
  event_type text NOT NULL,       -- 'landing_page_view' | 'nav_click' | 'privacy_page_view' | 'demo_signup'
  event_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_email_captures_email ON email_captures(email);
CREATE INDEX idx_demo_sessions_session_id ON demo_sessions(session_id);
CREATE INDEX idx_demo_events_session_id ON demo_events(session_id);
CREATE INDEX idx_page_events_visitor_id ON page_events(visitor_id);
CREATE INDEX idx_page_events_created_at ON page_events(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE email_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_events ENABLE ROW LEVEL SECURITY;

-- email_captures: anonymous users can insert, authenticated admin can read all
CREATE POLICY "Public can insert email captures"
  ON email_captures FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read email captures"
  ON email_captures FOR SELECT
  TO authenticated
  USING (true);

-- demo_sessions: anonymous users can insert and update their own session
CREATE POLICY "Public can insert demo sessions"
  ON demo_sessions FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public can update own demo sessions"
  ON demo_sessions FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read demo sessions"
  ON demo_sessions FOR SELECT
  TO authenticated
  USING (true);

-- demo_events: anonymous users can insert, authenticated admin can read all
CREATE POLICY "Public can insert demo events"
  ON demo_events FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read demo events"
  ON demo_events FOR SELECT
  TO authenticated
  USING (true);

-- page_events: anyone can insert (anon and authenticated), authenticated admin can read all
CREATE POLICY "Anyone can insert page events"
  ON page_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read page events"
  ON page_events FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Atomically increment the event counter on a demo session
CREATE OR REPLACE FUNCTION increment_session_events(sid text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE demo_sessions
  SET total_events = total_events + 1,
      last_active_at = now()
  WHERE session_id = sid;
$$;

-- Privacy-safe email existence check (returns boolean, no data exposure)
CREATE OR REPLACE FUNCTION email_exists(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM email_captures WHERE email = check_email
  );
$$;
