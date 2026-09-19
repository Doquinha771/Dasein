-- Equipa 0.2.1.1: somente aditivo; nao altera QR, equipamentos, reservas ou historico.
-- PRE-REQUISITO: migrations anteriores aplicadas; executar apos backup verificado.
-- Limite Supabase Free: 500 MB de database size; 350 MB e alerta antecipado, nao garantia.

-- Diagnostico privado: nunca expor tamanho e estatisticas do banco a usuarios comuns.
create or replace function private.equipa_capacity_internal()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_total bigint; v_audit bigint; v_rows bigint; v_old bigint; v_scheduled boolean:=false;
begin
  if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role
    then raise exception 'EQUIPA_ADMIN_REQUIRED'; end if;
  select pg_database_size(current_database()), pg_total_relation_size('public.audit_events'::regclass)
    into v_total, v_audit;
  select count(*),count(*) filter(where occurred_at < now()-interval '30 days')
    into v_rows,v_old from public.audit_events;
  if exists (select 1 from pg_extension where extname='pg_cron') then
    execute 'select exists(select 1 from cron.job where jobname=$1 and active)'
      into v_scheduled using 'equipa-audit-pressure';
  end if;
  return jsonb_build_object(
    'database_bytes', v_total, 'audit_bytes', v_audit,
    'other_bytes', greatest(v_total-v_audit,0),
    'audit_records', v_rows, 'audit_older_than_30_days', v_old,
    'free_tier_limit_bytes', 500000000,
    'warning_bytes', 350000000,
    'warning', v_total >= 350000000,
    'audit_only_cleanup_can_resolve', (v_total-v_audit) < 350000000,
    'retention_minimum_days', 30,
    'auto_cleanup_enabled', v_scheduled
  );
end; $$;
revoke all on function private.equipa_capacity_internal() from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.equipa_capacity_internal() to authenticated;

create or replace function public.equipa_admin_capacity()
returns jsonb language sql stable security invoker set search_path = ''
as $$select private.equipa_capacity_internal();$$;
revoke all on function public.equipa_admin_capacity() from public,anon;
grant execute on function public.equipa_admin_capacity() to authenticated;

-- Executada apenas pelo dono do banco/agendador. NUNCA dar EXECUTE a anon/authenticated.
-- O processo considera apenas auditorias com >30 dias e limita a 4000 linhas por execucao.
-- DELETE nao reduz imediatamente pg_database_size: autovacuum reutiliza as paginas.
create or replace function private.equipa_prune_audit_on_pressure()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_db_bytes bigint; v_audit_bytes bigint; v_audit_rows bigint;
  v_deleted integer:=0; v_batch integer; v_i integer;
begin
  -- Evita que chamadas concorrentes dupliquem a limpeza.
  if not pg_try_advisory_xact_lock(20260919, 21000) then return 0; end if;
  select pg_database_size(current_database()),pg_total_relation_size('public.audit_events'::regclass)
    into v_db_bytes,v_audit_bytes;
  if v_db_bytes < 350000000 and v_audit_bytes < 48000000 then return 0; end if;
  select count(*) into v_audit_rows from public.audit_events;
  -- Lote maximo de 4000; prever o tamanho logico por media observada (inclui indices).
  for v_i in 1..8 loop
    exit when (v_db_bytes < 350000000 and v_audit_bytes < 48000000);
    with oldest as (
      select id from public.audit_events
      where occurred_at < now() - interval '30 days'
      order by occurred_at,id limit 500 for update skip locked
    )
    delete from public.audit_events a using oldest o where a.id=o.id;
    get diagnostics v_batch = row_count;
    exit when v_batch = 0;
    v_deleted:=v_deleted+v_batch;
    -- Espaco fisico pode continuar alocado ate autovacuum; nao repetir sem limite.
    v_db_bytes:=greatest(0,v_db_bytes - (v_audit_bytes * v_batch / greatest(v_audit_rows,1)));
    v_audit_bytes:=greatest(0,v_audit_bytes - (v_audit_bytes * v_batch / greatest(v_audit_rows,1)));
    v_audit_rows:=greatest(0,v_audit_rows-v_batch);
  end loop;
  return v_deleted;
end; $$;
revoke all on function private.equipa_prune_audit_on_pressure() from public,anon,authenticated,service_role;

-- Se pg_cron ja estiver habilitado, o agendamento e criado sem qualquer dependencia
-- do GitHub Pages. Caso contrario, habilite a extensao e rode INSTALL-CRON.sql.
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('equipa-audit-pressure','5 2 * * *',
      'select private.equipa_prune_audit_on_pressure()');
  else
    raise notice 'EQUIPA_CRON_NOT_ENABLED: habilite Supabase Cron e execute supabase/INSTALL-CRON.sql';
  end if;
end $$;
notify pgrst, 'reload schema';
