-- CONSULTAS APENAS. Executar no SQL Editor do projeto Equipa, nao no Feedback.
-- 1. Limite e tamanho real: 500 MB; controle preventivo em 350 MB.
select now() as checked_at, current_database() as database_name,
       pg_database_size(current_database()) as database_bytes,
       round(pg_database_size(current_database()) / 1000000.0,2) as database_mb,
       current_setting('default_transaction_read_only') as default_read_only;

-- 2. Existencia dos objetos essenciais (nao exige que eles ja existam).
select n.nspname as schema_name, c.relname as object_name, c.relkind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','private')
 and c.relname in ('profiles','equipments','audit_events','reservations','withdrawals','withdrawal_items','maintenance_events')
order by 1,2;

-- 3. Funcoes RPC esperadas na versao 0.2.1, e status das migrations.
select n.nspname, p.proname,pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and p.proname in (
  'scan_qr','home_withdrawals','equipa_booking_summary','equipa_admin_user_page',
  'equipa_admin_audit_page','equipa_admin_report_dashboard',
  'equipa_register_equipment_batch','equipa_admin_capacity')
order by 1,2;
select version,name from supabase_migrations.schema_migrations order by version desc limit 15;

-- 4. Consumo detalhado por tabela, incluindo indices (dados agregados, sem dados pessoais).
select schemaname,relname,pg_size_pretty(pg_total_relation_size(relid)) as size,
       pg_total_relation_size(relid) as bytes,n_live_tup as estimated_rows
from pg_stat_user_tables order by bytes desc limit 30;

-- 5. Politicas de RLS no schema exposto e atividades do agendador, quando instaladas.
select schemaname,tablename,rowsecurity from pg_tables where schemaname='public'
  and tablename in ('profiles','equipments','audit_events','reservations','withdrawals');
select extname from pg_extension where extname='pg_cron';
