-- The insert-then-update pattern doesn't need anon SELECT at all.
-- Remove the scoped policy we just created — it's not needed.
DROP POLICY IF EXISTS "Allow anonymous select own session" ON public.demo_sessions;
