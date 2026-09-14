-- One active application session per user. A new login replaces the previous
-- browser session for that user without revoking the Supabase account itself.
create table if not exists public.direct_active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid not null,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.direct_active_sessions enable row level security;
revoke all on public.direct_active_sessions from anon, authenticated;
drop policy if exists deny_jwt on public.direct_active_sessions;
create policy deny_jwt on public.direct_active_sessions
  for all to authenticated using (false) with check (false);
