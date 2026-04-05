
-- Email captures from landing page CTA
create table public.email_captures (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  source text not null default 'hero', -- 'hero' or 'cta' section
  created_at timestamptz default now()
);

-- Demo engagement events
create table public.demo_events (
  id uuid default gen_random_uuid() primary key,
  session_id text not null, -- random ID per demo visit
  email text, -- nullable, linked if they came via email CTA
  event_type text not null, -- 'tab_switch', 'expand', 'collapse', 'archive', 'add_note', 'reaction', 'open_reader', 'page_view'
  event_data jsonb default '{}', -- extra context (article_id, tab name, etc.)
  created_at timestamptz default now()
);

-- Demo sessions for time tracking
create table public.demo_sessions (
  id uuid default gen_random_uuid() primary key,
  session_id text not null unique,
  email text,
  started_at timestamptz default now(),
  last_active_at timestamptz default now(),
  total_events int default 0
);

-- Enable RLS on all tables
alter table public.email_captures enable row level security;
alter table public.demo_events enable row level security;
alter table public.demo_sessions enable row level security;

-- Anonymous insert policies (visitors can write but not read)
create policy "Allow anonymous insert" on public.email_captures for insert to anon with check (true);
create policy "Allow anonymous insert" on public.demo_events for insert to anon with check (true);
create policy "Allow anonymous insert" on public.demo_sessions for insert to anon with check (true);
create policy "Allow anonymous upsert" on public.demo_sessions for update to anon using (true) with check (true);

-- Authenticated read policies (admin only)
create policy "Allow authenticated read" on public.email_captures for select to authenticated using (true);
create policy "Allow authenticated read" on public.demo_events for select to authenticated using (true);
create policy "Allow authenticated read" on public.demo_sessions for select to authenticated using (true);

-- Index for session lookups
create index idx_demo_events_session on public.demo_events (session_id);
create index idx_demo_sessions_session on public.demo_sessions (session_id);
create index idx_email_captures_created on public.email_captures (created_at desc);

