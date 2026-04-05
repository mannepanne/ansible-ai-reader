-- Fix 1: Remove broad anon SELECT on email_captures
-- Replace with a SECURITY DEFINER function that returns only a boolean
DROP POLICY IF EXISTS "Allow anonymous select own email" ON public.email_captures;

CREATE OR REPLACE FUNCTION public.email_exists(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM email_captures WHERE email = check_email LIMIT 1
  );
$$;

-- Grant anon access to call the function
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO authenticated;

-- Fix 2: Scope demo_sessions anon SELECT to own session only
-- The upsert needs to check if a row with the same session_id exists
DROP POLICY IF EXISTS "Allow anonymous select for upsert" ON public.demo_sessions;

CREATE POLICY "Allow anonymous select own session"
  ON public.demo_sessions FOR SELECT TO anon
  USING (session_id = current_setting('request.header.x-session-id', true));
