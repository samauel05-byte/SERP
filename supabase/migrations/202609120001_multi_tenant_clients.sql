-- Multi-tenant client management. Run with `supabase db push` or in the
-- Supabase SQL editor before enabling the Clientes module in production.
-- The existing installation is assigned to the initial tenant, Save.

create table if not exists public.direct_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9-]{2,80}$'),
  created_at timestamptz not null default now()
);

insert into public.direct_tenants (name, slug)
values ('Save', 'save')
on conflict (slug) do nothing;

alter table public.direct_profiles
  add column if not exists tenant_id uuid references public.direct_tenants(id) on delete restrict;

update public.direct_profiles
set tenant_id = (select id from public.direct_tenants where slug = 'save')
where tenant_id is null;

alter table public.direct_profiles
  alter column tenant_id set not null;

create index if not exists direct_profiles_tenant_id_idx
  on public.direct_profiles (tenant_id);

-- Credentials are encrypted in the browser but were previously stored in one
-- shared namespace. Move them into the Save tenant and use a composite key so
-- two tenants can safely use the same client/portal identifier.
alter table public.direct_credentials
  add column if not exists tenant_id uuid references public.direct_tenants(id) on delete cascade;

update public.direct_credentials
set tenant_id = (select id from public.direct_tenants where slug = 'save')
where tenant_id is null;

alter table public.direct_credentials
  alter column tenant_id set not null;

alter table public.direct_credentials
  drop constraint if exists direct_credentials_pkey;
alter table public.direct_credentials
  add primary key (tenant_id, id);

create index if not exists direct_credentials_tenant_updated_idx
  on public.direct_credentials (tenant_id, updated_at desc);

create table if not exists public.direct_clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  client_key text not null check (char_length(client_key) between 2 and 180),
  legal_name text not null check (char_length(trim(legal_name)) between 2 and 180),
  rnc text,
  cedula text,
  email text,
  phone text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  source text not null default 'manual' check (source in ('manual', 'excel')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, client_key)
);

create index if not exists direct_clients_tenant_name_idx
  on public.direct_clients (tenant_id, legal_name);
create index if not exists direct_clients_tenant_rnc_idx
  on public.direct_clients (tenant_id, rnc) where rnc is not null;

create table if not exists public.direct_client_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null check (char_length(file_name) between 1 and 255),
  total_rows integer not null check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  status text not null check (status in ('completed', 'failed')),
  error_summary jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists direct_client_imports_tenant_created_idx
  on public.direct_client_imports (tenant_id, created_at desc);

alter table public.direct_tenants enable row level security;
alter table public.direct_profiles enable row level security;
alter table public.direct_credentials enable row level security;
alter table public.direct_clients enable row level security;
alter table public.direct_client_imports enable row level security;

revoke all on public.direct_tenants, public.direct_profiles, public.direct_credentials,
  public.direct_clients, public.direct_client_imports from anon, authenticated;

-- The application writes through server routes using the service role. Browser
-- access is intentionally denied. These policies retain the same fail-closed
-- behavior if a publishable key is ever used by mistake.
drop policy if exists deny_jwt on public.direct_tenants;
drop policy if exists deny_jwt on public.direct_profiles;
drop policy if exists deny_jwt on public.direct_credentials;
drop policy if exists deny_jwt on public.direct_clients;
drop policy if exists deny_jwt on public.direct_client_imports;
create policy deny_jwt on public.direct_tenants for all to authenticated using (false) with check (false);
create policy deny_jwt on public.direct_profiles for all to authenticated using (false) with check (false);
create policy deny_jwt on public.direct_credentials for all to authenticated using (false) with check (false);
create policy deny_jwt on public.direct_clients for all to authenticated using (false) with check (false);
create policy deny_jwt on public.direct_client_imports for all to authenticated using (false) with check (false);
