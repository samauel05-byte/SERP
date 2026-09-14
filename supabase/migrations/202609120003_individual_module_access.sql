-- Individual module permissions. Existing CAMI users retain access to IR-2 and
-- Estimación Fiscal; existing profiles retain access to Clientes.
alter table public.direct_profiles add column if not exists access_ir2 boolean not null default false;
alter table public.direct_profiles add column if not exists access_estimacion boolean not null default false;
alter table public.direct_profiles add column if not exists access_clientes boolean not null default true;

update public.direct_profiles
set access_ir2 = true, access_estimacion = true
where access_cami = true;

update public.direct_profiles
set access_clientes = true
where access_clientes is null;
