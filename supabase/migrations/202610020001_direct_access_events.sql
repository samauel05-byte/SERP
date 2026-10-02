-- Direct: history of portal entries and login results, and per-company access.
--  * direct_access_events: every "Entrar" (open) and the login result the relay
--    reports back (login_ok / login_failed). It feeds the entry history for
--    administrators and the "contraseña por actualizar" warning.
--  * direct_profiles.companies_direct: credential ids a user may see. NULL means
--    every company (the behaviour before this migration).
create table if not exists public.direct_access_events (
  id bigserial primary key,
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  user_id uuid,
  username text,
  credential_id text not null,
  institution text not null,
  event text not null check (event in ('open', 'login_ok', 'login_failed')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists direct_access_events_tenant_created_idx
  on public.direct_access_events (tenant_id, created_at desc);
create index if not exists direct_access_events_tenant_credential_idx
  on public.direct_access_events (tenant_id, credential_id, created_at desc);

alter table public.direct_access_events enable row level security;
drop policy if exists "deny_jwt" on public.direct_access_events;
create policy "deny_jwt" on public.direct_access_events for all using (false);

alter table public.direct_profiles add column if not exists companies_direct text[];
