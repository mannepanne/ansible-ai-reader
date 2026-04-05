-- ABOUT: Fix analytics tables to allow inserts from authenticated users
-- ABOUT: The tracking client picks up Ansible auth sessions, sending as authenticated role

-- The @supabase/ssr browser client stores auth tokens in localStorage.
-- The plain @supabase/supabase-js tracking client reads from the same localStorage,
-- so logged-in Ansible users send analytics requests as `authenticated`, not `anon`.
-- The original policies were `TO anon` only — authenticated users were silently blocked.

-- ============================================================================
-- email_captures: allow authenticated users to insert (same rules as anon)
-- ============================================================================

CREATE POLICY "Authenticated users can insert email captures"
  ON email_captures FOR INSERT
  TO authenticated
  WITH CHECK (consented = true);

-- ============================================================================
-- demo_sessions: allow authenticated users to insert
-- ============================================================================

CREATE POLICY "Authenticated users can insert demo sessions"
  ON demo_sessions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- demo_events: allow authenticated users to insert
-- ============================================================================

CREATE POLICY "Authenticated users can insert demo events"
  ON demo_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- RPC EXECUTE grants
-- ============================================================================

-- In Supabase, SECURITY DEFINER functions still require explicit EXECUTE grants.
-- Grant to both anon (unauthenticated visitors) and authenticated (logged-in users).
GRANT EXECUTE ON FUNCTION increment_session_events(text) TO anon;
GRANT EXECUTE ON FUNCTION increment_session_events(text) TO authenticated;

GRANT EXECUTE ON FUNCTION update_session_heartbeat(text) TO anon;
GRANT EXECUTE ON FUNCTION update_session_heartbeat(text) TO authenticated;
