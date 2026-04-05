
alter table public.email_captures add column consented boolean not null default false;
alter table public.email_captures add column consented_at timestamptz;

