
-- Allow authenticated users to delete email captures
create policy "Allow authenticated delete" on public.email_captures for delete to authenticated using (true);
-- Allow authenticated users to delete demo events
create policy "Allow authenticated delete" on public.demo_events for delete to authenticated using (true);
-- Allow authenticated users to delete demo sessions
create policy "Allow authenticated delete" on public.demo_sessions for delete to authenticated using (true);

