
create or replace function public.increment_session_events(sid text)
returns void
language sql
security definer
as $$
  update public.demo_sessions
  set total_events = total_events + 1,
      last_active_at = now()
  where session_id = sid;
$$;

-- Allow anon to call this function
grant execute on function public.increment_session_events(text) to anon;

