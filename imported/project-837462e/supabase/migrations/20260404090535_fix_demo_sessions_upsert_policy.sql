
-- The upsert needs select permission to check for conflicts
create policy "Allow anonymous select for upsert" on public.demo_sessions for select to anon using (true);

