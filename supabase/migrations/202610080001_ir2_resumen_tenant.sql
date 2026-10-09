-- Aislamiento multiempresa para ir2_resumen (IR-2 y Estimación Fiscal).
-- Antes, las filas se consultaban solo por (rnc, anio, tipo), lo que permitía
-- que un usuario de otra firma leyera, modificara o borrara datos por RNC
-- (IDOR entre tenants). Se añade tenant_id y la clave única pasa a incluirlo.

alter table public.ir2_resumen
  add column if not exists tenant_id uuid references public.direct_tenants(id) on delete cascade;

update public.ir2_resumen
set tenant_id = (select id from public.direct_tenants where slug = 'save')
where tenant_id is null;

alter table public.ir2_resumen
  alter column tenant_id set not null;

alter table public.ir2_resumen
  drop constraint if exists ir2_resumen_rnc_anio_tipo_key;

alter table public.ir2_resumen
  add constraint ir2_resumen_tenant_rnc_anio_tipo_key unique (tenant_id, rnc, anio, tipo);

create index if not exists ir2_resumen_tenant_idx on public.ir2_resumen (tenant_id);

-- Recarga la caché de esquema de PostgREST para que el nuevo onConflict
-- (tenant_id, rnc, anio, tipo) sea reconocido de inmediato por supabase-js.
notify pgrst, 'reload schema';
