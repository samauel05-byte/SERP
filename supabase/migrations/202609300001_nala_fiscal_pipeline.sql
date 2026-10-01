-- NALA: flujo fiscal carga → extracción → validación → auditoría → aprobación →
-- exportación 606/607. Migración aditiva: no modifica ni borra datos existentes.
-- Todas las tablas pertenecen a un tenant (empresa operadora) y las empresas
-- clientes son los registros existentes de direct_clients.

create extension if not exists pgcrypto;

-- Permite claves foráneas compuestas (tenant_id, client_id) para que ninguna
-- fila de NALA pueda apuntar a un cliente de otra empresa operadora.
create unique index if not exists direct_clients_tenant_id_id_key on public.direct_clients (tenant_id, id);

create table if not exists public.nala_settings (
  tenant_id uuid primary key references public.direct_tenants(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.nala_members (
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nala_role text not null default 'oficial' check (nala_role in ('supervisor', 'oficial', 'auditor', 'lectura')),
  all_clients boolean not null default true,
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.nala_member_clients (
  tenant_id uuid not null,
  user_id uuid not null,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id, client_id),
  foreign key (tenant_id, client_id) references public.direct_clients (tenant_id, id) on delete cascade,
  foreign key (tenant_id, user_id) references public.nala_members (tenant_id, user_id) on delete cascade
);

create table if not exists public.nala_client_settings (
  client_id uuid primary key,
  tenant_id uuid not null,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, client_id) references public.direct_clients (tenant_id, id) on delete cascade
);

create table if not exists public.nala_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  client_id uuid not null,
  format text not null check (format in ('606', '607')),
  period text not null check (period ~ '^20[0-9]{2}(0[1-9]|1[0-2])$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'queued', 'processing', 'review', 'completed', 'failed')),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 128),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (tenant_id, idempotency_key),
  unique (tenant_id, id),
  foreign key (tenant_id, client_id) references public.direct_clients (tenant_id, id) on delete restrict
);
create index if not exists nala_batches_tenant_client_period_idx on public.nala_batches (tenant_id, client_id, period desc);
create index if not exists nala_batches_tenant_status_idx on public.nala_batches (tenant_id, status);

create table if not exists public.nala_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  batch_id uuid not null,
  parent_id uuid references public.nala_documents(id) on delete cascade,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null,
  kind text not null check (kind in ('image', 'pdf', 'zip')),
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  page_count integer check (page_count is null or page_count >= 0),
  status text not null default 'pending_upload' check (status in ('pending_upload', 'uploaded', 'queued', 'processing', 'processed', 'failed', 'duplicate', 'unsupported', 'purged')),
  duplicate_of uuid references public.nala_documents(id) on delete set null,
  error text,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  processed_at timestamptz,
  purged_at timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, batch_id) references public.nala_batches (tenant_id, id) on delete cascade
);
create index if not exists nala_documents_batch_idx on public.nala_documents (batch_id, created_at);
create index if not exists nala_documents_tenant_sha_idx on public.nala_documents (tenant_id, sha256) where sha256 is not null;

create table if not exists public.nala_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  batch_id uuid not null references public.nala_batches(id) on delete cascade,
  document_id uuid references public.nala_documents(id) on delete cascade,
  kind text not null check (kind in ('prepare', 'extract')),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer
);
create index if not exists nala_jobs_ready_idx on public.nala_jobs (status, run_after) where status in ('queued', 'running');
create index if not exists nala_jobs_batch_idx on public.nala_jobs (batch_id);

create table if not exists public.nala_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  batch_id uuid not null,
  document_id uuid references public.nala_documents(id) on delete set null,
  extraction_key text not null unique,
  page_from integer,
  page_to integer,
  format text not null check (format in ('606', '607')),
  period text not null check (period ~ '^20[0-9]{2}(0[1-9]|1[0-2])$'),
  status text not null default 'pending_review' check (status in ('pending_review', 'reviewed', 'approved', 'excluded')),
  fields jsonb not null default '{}'::jsonb check (jsonb_typeof(fields) = 'object'),
  extracted jsonb not null default '{}'::jsonb,
  extraction_meta jsonb not null default '{}'::jsonb,
  corrected_fields text[] not null default '{}',
  issues jsonb not null default '[]'::jsonb,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  rules_version text,
  ncf text,
  counterpart_id text,
  counterpart_name text,
  invoice_date date,
  currency text,
  subtotal_dop numeric(18, 2),
  itbis_dop numeric(18, 2),
  total_dop numeric(18, 2),
  version integer not null default 1,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approval_reason text,
  approval_warnings jsonb,
  edit_lock_user uuid references auth.users(id) on delete set null,
  edit_lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, client_id) references public.direct_clients (tenant_id, id) on delete restrict,
  foreign key (tenant_id, batch_id) references public.nala_batches (tenant_id, id) on delete restrict
);
create index if not exists nala_invoices_scope_idx on public.nala_invoices (tenant_id, client_id, format, period, status);
create index if not exists nala_invoices_batch_idx on public.nala_invoices (batch_id, status);
create index if not exists nala_invoices_ncf_idx on public.nala_invoices (tenant_id, client_id, format, ncf) where ncf is not null;
-- Un mismo comprobante no puede quedar aprobado dos veces para la misma empresa.
create unique index if not exists nala_invoices_approved_unique on public.nala_invoices (tenant_id, client_id, format, coalesce(counterpart_id, ''), ncf)
  where status = 'approved' and ncf is not null;

create table if not exists public.nala_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null,
  format text not null check (format in ('606', '607')),
  period text not null check (period ~ '^20[0-9]{2}(0[1-9]|1[0-2])$'),
  scope text not null check (scope in ('period', 'batches')),
  batch_ids uuid[],
  status text not null default 'generated' check (status in ('generated', 'submitted', 'accepted', 'rejected', 'superseded')),
  schema_version text not null,
  rules_version text not null,
  line_count integer not null check (line_count >= 0),
  totals jsonb not null default '{}'::jsonb,
  snapshot jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  accepted_warnings jsonb not null default '[]'::jsonb,
  acceptance_reason text,
  file_name text not null,
  txt_path text,
  txt_sha256 text,
  xlsx_path text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submission_reference text,
  result_by uuid references auth.users(id) on delete set null,
  result_at timestamptz,
  result_notes text,
  superseded_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, client_id) references public.direct_clients (tenant_id, id) on delete restrict
);
create index if not exists nala_exports_scope_idx on public.nala_exports (tenant_id, client_id, format, period, created_at desc);

create table if not exists public.nala_export_lines (
  export_id uuid not null references public.nala_exports(id) on delete cascade,
  line_no integer not null check (line_no > 0),
  invoice_id uuid not null references public.nala_invoices(id) on delete restrict,
  primary key (export_id, line_no)
);
create index if not exists nala_export_lines_invoice_idx on public.nala_export_lines (invoice_id);

-- Historial inmutable de cargas, correcciones, aprobaciones, movimientos y exportaciones.
create table if not exists public.nala_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.direct_tenants(id) on delete cascade,
  entity text not null check (entity in ('batch', 'document', 'invoice', 'export', 'client', 'settings', 'member', 'job', 'rnc')),
  entity_id text,
  batch_id uuid,
  invoice_id uuid,
  client_id uuid,
  action text not null,
  actor uuid references auth.users(id) on delete set null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nala_events_invoice_idx on public.nala_events (invoice_id, id) where invoice_id is not null;
create index if not exists nala_events_batch_idx on public.nala_events (batch_id, id) where batch_id is not null;
create index if not exists nala_events_tenant_idx on public.nala_events (tenant_id, id desc);

create or replace function public.nala_events_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.direct_tenants where id = old.tenant_id) then
    return old; -- borrado en cascada de un tenant eliminado
  end if;
  raise exception 'El historial de NALA es inmutable';
end $$;
drop trigger if exists nala_events_no_update on public.nala_events;
create trigger nala_events_no_update before update or delete on public.nala_events
  for each row execute function public.nala_events_immutable();

-- Resultados de la Consulta RNC oficial de la DGII (dato público, no por tenant).
create table if not exists public.nala_rnc_cache (
  rnc text primary key check (rnc ~ '^([0-9]{9}|[0-9]{11})$'),
  found boolean not null,
  data jsonb,
  source text not null,
  source_url text,
  fetched_at timestamptz not null default now()
);

-- ─── Cola de trabajos ──────────────────────────────────────────────────────
-- Reclama trabajos listos o con arrendamiento vencido (recuperación tras un
-- corte). FOR UPDATE SKIP LOCKED evita que dos procesos tomen el mismo trabajo.
create or replace function public.nala_claim_jobs(p_worker text, p_limit integer, p_tenant uuid default null, p_lease_seconds integer default 120)
returns setof public.nala_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  with ready as (
    select j.id from public.nala_jobs j
    where (p_tenant is null or j.tenant_id = p_tenant)
      and ((j.status = 'queued' and j.run_after <= now())
        or (j.status = 'running' and j.locked_until < now()))
    order by j.run_after, j.created_at
    limit greatest(1, least(p_limit, 20))
    for update skip locked
  )
  update public.nala_jobs j
     set status = 'running', attempts = j.attempts + 1, locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds), started_at = now(), last_error = case when j.status = 'running' then 'Recuperado tras arrendamiento vencido' else j.last_error end
    from ready where j.id = ready.id
  returning j.*;
end $$;

create or replace function public.nala_finish_job(p_job uuid, p_worker text, p_ok boolean, p_error text default null, p_retry_seconds integer default 30)
returns public.nala_jobs
language plpgsql security definer set search_path = public as $$
declare j public.nala_jobs;
begin
  select * into j from public.nala_jobs where id = p_job for update;
  if not found or j.status <> 'running' or j.locked_by is distinct from p_worker then
    return null; -- otro proceso recuperó el trabajo; se descarta este resultado
  end if;
  if p_ok then
    update public.nala_jobs set status = 'succeeded', finished_at = now(), locked_until = null, last_error = null,
      duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int where id = p_job returning * into j;
  elsif j.attempts >= j.max_attempts then
    update public.nala_jobs set status = 'failed', finished_at = now(), locked_until = null, last_error = left(p_error, 2000),
      duration_ms = (extract(epoch from (now() - started_at)) * 1000)::int where id = p_job returning * into j;
  else
    update public.nala_jobs set status = 'queued', locked_until = null, locked_by = null, last_error = left(p_error, 2000),
      run_after = now() + make_interval(secs => p_retry_seconds * power(2, j.attempts - 1)::int) where id = p_job returning * into j;
  end if;
  return j;
end $$;

-- Recalcula el estado del lote a partir de sus trabajos y facturas.
create or replace function public.nala_refresh_batch(p_batch uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  pending_jobs integer; running_jobs integer; failed_jobs integer; total_jobs integer;
  open_invoices integer; total_invoices integer; docs_pending integer; next_status text; current_status text;
begin
  select status into current_status from public.nala_batches where id = p_batch for update;
  if not found then return null; end if;
  select count(*) filter (where status = 'queued'), count(*) filter (where status = 'running'),
         count(*) filter (where status = 'failed'), count(*)
    into pending_jobs, running_jobs, failed_jobs, total_jobs
    from public.nala_jobs where batch_id = p_batch;
  select count(*) filter (where status in ('pending_review', 'reviewed')), count(*)
    into open_invoices, total_invoices from public.nala_invoices where batch_id = p_batch;
  select count(*) into docs_pending from public.nala_documents where batch_id = p_batch and status = 'pending_upload';
  if current_status = 'draft' and total_jobs = 0 then
    next_status := 'draft';
  elsif running_jobs > 0 then next_status := 'processing';
  elsif pending_jobs > 0 then next_status := case when current_status = 'processing' then 'processing' else 'queued' end;
  elsif total_invoices = 0 and failed_jobs > 0 then next_status := 'failed';
  elsif open_invoices > 0 or failed_jobs > 0 then next_status := 'review';
  elsif total_invoices > 0 then next_status := 'completed';
  else next_status := 'review';
  end if;
  update public.nala_batches set status = next_status, updated_at = now(),
    started_at = coalesce(started_at, case when next_status in ('queued', 'processing') then now() end),
    finished_at = case when next_status in ('review', 'completed', 'failed') and pending_jobs + running_jobs = 0 then coalesce(finished_at, now()) else null end
   where id = p_batch;
  return next_status;
end $$;

-- ─── Indicadores únicos ────────────────────────────────────────────────────
-- Todas las pantallas (panel, dashboard, lotes, auditoría y exportación) usan
-- esta función para que los números coincidan.
create or replace function public.nala_stats(p_tenant uuid, p_clients uuid[] default null, p_period_from text default null,
  p_period_to text default null, p_format text default null, p_batch uuid default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  with inv as (
    select i.* from public.nala_invoices i
     where i.tenant_id = p_tenant
       and (p_clients is null or i.client_id = any(p_clients))
       and (p_period_from is null or i.period >= p_period_from)
       and (p_period_to is null or i.period <= p_period_to)
       and (p_format is null or i.format = p_format)
       and (p_batch is null or i.batch_id = p_batch)
  ), bat as (
    select b.* from public.nala_batches b
     where b.tenant_id = p_tenant
       and (p_clients is null or b.client_id = any(p_clients))
       and (p_period_from is null or b.period >= p_period_from)
       and (p_period_to is null or b.period <= p_period_to)
       and (p_format is null or b.format = p_format)
       and (p_batch is null or b.id = p_batch)
  ), exp as (
    select e.* from public.nala_exports e
     where e.tenant_id = p_tenant
       and (p_clients is null or e.client_id = any(p_clients))
       and (p_period_from is null or e.period >= p_period_from)
       and (p_period_to is null or e.period <= p_period_to)
       and (p_format is null or e.format = p_format)
       and (p_batch is null or p_batch = any(coalesce(e.batch_ids, '{}')))
  )
  select jsonb_build_object(
    'invoices', (select count(*) from inv where status <> 'excluded'),
    'pending', (select count(*) from inv where status in ('pending_review', 'reviewed')),
    'reviewed', (select count(*) from inv where status = 'reviewed'),
    'approved', (select count(*) from inv where status = 'approved'),
    'excluded', (select count(*) from inv where status = 'excluded'),
    'with_errors', (select count(*) from inv where status in ('pending_review', 'reviewed') and critical_count > 0),
    'with_warnings', (select count(*) from inv where status <> 'excluded' and warning_count > 0),
    'duplicates', (select count(*) from inv where status <> 'excluded' and issues @> '[{"code":"DUPLICADO"}]'),
    'foreign_currency', (select count(*) from inv where status <> 'excluded' and currency is not null and currency <> 'DOP'),
    'approved_subtotal_dop', (select coalesce(sum(subtotal_dop), 0) from inv where status = 'approved'),
    'approved_itbis_dop', (select coalesce(sum(itbis_dop), 0) from inv where status = 'approved'),
    'approved_total_dop', (select coalesce(sum(total_dop), 0) from inv where status = 'approved'),
    'batches', (select count(*) from bat),
    'batches_active', (select count(*) from bat where status in ('draft', 'queued', 'processing')),
    'batches_review', (select count(*) from bat where status = 'review'),
    'batches_completed', (select count(*) from bat where status = 'completed'),
    'batches_failed', (select count(*) from bat where status = 'failed'),
    'documents', (select count(*) from public.nala_documents d join bat on bat.id = d.batch_id where d.kind <> 'zip'),
    'documents_failed', (select count(*) from public.nala_documents d join bat on bat.id = d.batch_id where d.status = 'failed'),
    'jobs_pending', (select count(*) from public.nala_jobs j join bat on bat.id = j.batch_id where j.status in ('queued', 'running')),
    'jobs_failed', (select count(*) from public.nala_jobs j join bat on bat.id = j.batch_id where j.status = 'failed'),
    'exports', (select count(*) from exp where status <> 'superseded'),
    'exports_generated', (select count(*) from exp where status = 'generated'),
    'exports_submitted', (select count(*) from exp where status = 'submitted'),
    'exports_accepted', (select count(*) from exp where status = 'accepted'),
    'exports_rejected', (select count(*) from exp where status = 'rejected'),
    'by_period', coalesce((select jsonb_agg(x order by x->>'period') from (
        select jsonb_build_object('period', period, 'format', format,
          'invoices', count(*) filter (where status <> 'excluded'),
          'approved', count(*) filter (where status = 'approved'),
          'pending', count(*) filter (where status in ('pending_review', 'reviewed')),
          'approved_total_dop', coalesce(sum(total_dop) filter (where status = 'approved'), 0),
          'approved_itbis_dop', coalesce(sum(itbis_dop) filter (where status = 'approved'), 0)) as x
        from inv group by period, format) s), '[]'::jsonb),
    'by_client', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('client_id', client_id,
          'invoices', count(*) filter (where status <> 'excluded'),
          'approved', count(*) filter (where status = 'approved'),
          'pending', count(*) filter (where status in ('pending_review', 'reviewed')),
          'with_errors', count(*) filter (where status in ('pending_review', 'reviewed') and critical_count > 0),
          'approved_total_dop', coalesce(sum(total_dop) filter (where status = 'approved'), 0)) as x
        from inv group by client_id) s), '[]'::jsonb)
  );
$$;

-- ─── Seguridad ─────────────────────────────────────────────────────────────
alter table public.nala_settings enable row level security;
alter table public.nala_members enable row level security;
alter table public.nala_member_clients enable row level security;
alter table public.nala_client_settings enable row level security;
alter table public.nala_batches enable row level security;
alter table public.nala_documents enable row level security;
alter table public.nala_jobs enable row level security;
alter table public.nala_invoices enable row level security;
alter table public.nala_exports enable row level security;
alter table public.nala_export_lines enable row level security;
alter table public.nala_events enable row level security;
alter table public.nala_rnc_cache enable row level security;

revoke all on public.nala_settings, public.nala_members, public.nala_member_clients, public.nala_client_settings,
  public.nala_batches, public.nala_documents, public.nala_jobs, public.nala_invoices, public.nala_exports,
  public.nala_export_lines, public.nala_events, public.nala_rnc_cache from anon, authenticated;
revoke all on function public.nala_claim_jobs(text, integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.nala_finish_job(uuid, text, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.nala_refresh_batch(uuid) from public, anon, authenticated;
revoke all on function public.nala_stats(uuid, uuid[], text, text, text, uuid) from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['nala_settings', 'nala_members', 'nala_member_clients', 'nala_client_settings', 'nala_batches',
    'nala_documents', 'nala_jobs', 'nala_invoices', 'nala_exports', 'nala_export_lines', 'nala_events', 'nala_rnc_cache'] loop
    execute format('drop policy if exists deny_jwt on public.%I', t);
    execute format('create policy deny_jwt on public.%I for all to authenticated using (false) with check (false)', t);
  end loop;
end $$;

-- Bucket privado para originales. Sólo el servidor (rol de servicio) lo usa y
-- el navegador recibe enlaces firmados de corta duración.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('nala-documents', 'nala-documents', false, 52428800)
    on conflict (id) do update set public = false;
  end if;
end $$;
