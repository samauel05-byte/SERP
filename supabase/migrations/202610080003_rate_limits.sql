-- Rate limiting con store compartido. Las funciones serverless no comparten
-- memoria, así que un Map en proceso no limita nada real entre instancias.
create table if not exists public.rate_limits (
  key       text primary key,
  count     integer not null default 0,
  reset_at  timestamptz not null
);
alter table public.rate_limits enable row level security;
drop policy if exists "deny_jwt" on public.rate_limits;
create policy "deny_jwt" on public.rate_limits for all using (false);

-- Incrementa de forma atómica y responde si la petición está dentro del límite.
-- Reinicia la ventana cuando ya venció. El servidor usa la service role.
create or replace function public.rl_hit(p_key text, p_max integer, p_window_ms integer)
returns boolean
language plpgsql
as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  insert into public.rate_limits (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count = case when public.rate_limits.reset_at <= v_now then 1 else public.rate_limits.count + 1 end,
    reset_at = case when public.rate_limits.reset_at <= v_now then v_now + make_interval(secs => p_window_ms / 1000.0) else public.rate_limits.reset_at end
  returning count into v_count;
  return v_count <= p_max;
end;
$$;
