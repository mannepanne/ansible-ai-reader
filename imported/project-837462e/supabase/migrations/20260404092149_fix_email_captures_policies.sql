-- Allow anon to check if their email exists (needed by verifyStoredEmail)
CREATE POLICY "Allow anonymous select own email"
  ON public.email_captures FOR SELECT TO anon
  USING (true);

-- Allow authenticated role to insert (admin browser session stays active)
CREATE POLICY "Allow authenticated insert"
  ON public.email_captures FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated insert"
  ON public.demo_events FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated insert"
  ON public.demo_sessions FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated update"
  ON public.demo_sessions FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);
