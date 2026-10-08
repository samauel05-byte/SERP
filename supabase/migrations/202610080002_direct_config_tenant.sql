-- Aislamiento multiempresa para direct_config. Guarda la config de portales
-- (URLs y nombres de campos) y el verificador de bóveda (vaultSalt, verifierCt,
-- verifierIv). Al escalar a varias firmas, cada una debe tener su propia config
-- y su propio verificador; antes era un único espacio global compartido.

alter table public.direct_config
  add column if not exists tenant_id uuid references public.direct_tenants(id) on delete cascade;

update public.direct_config
set tenant_id = (select id from public.direct_tenants where slug = 'save')
where tenant_id is null;

alter table public.direct_config
  alter column tenant_id set not null;

alter table public.direct_config
  drop constraint if exists direct_config_pkey;

alter table public.direct_config
  add primary key (tenant_id, key);
