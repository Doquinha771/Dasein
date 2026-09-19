-- Simulador por MEDIDAS DO BANCO, sem ler nomes ou dados pessoais.
-- Ajustar somente os numeros no CTE cenarios, sem editar tabelas.
-- Distingue historico de retiradas (permanente) das auditorias (descartaveis sob pressao).
with cenarios as (
  select * from (values
    ('20 retiradas/dia',20::numeric,1.0::numeric),
    ('100 retiradas/dia',100::numeric,1.0::numeric),
    ('250 retiradas/dia',250::numeric,1.0::numeric)
  ) v(cenario,retiradas_por_dia,itens_por_retirada)
), tamanhos as (
  select
    pg_database_size(current_database())::numeric atual_bytes,
    coalesce((select pg_total_relation_size('public.withdrawals'::regclass)::numeric /
      nullif((select count(*) from public.withdrawals),0)),2048) retirada_bytes,
    coalesce((select pg_total_relation_size('public.withdrawal_items'::regclass)::numeric /
      nullif((select count(*) from public.withdrawal_items),0)),1024) item_bytes,
    coalesce((select pg_total_relation_size('public.audit_events'::regclass)::numeric /
      nullif((select count(*) from public.audit_events),0)),768) auditoria_bytes
), projecoes as (
 select c.*,t.*,
   round((retiradas_por_dia*3650*(retirada_bytes+itens_por_retirada*item_bytes)))::bigint as historico_novo_10_anos,
   round(retiradas_por_dia*30*2*auditoria_bytes)::bigint as auditorias_30_dias
 from cenarios c cross join tamanhos t
)
select cenario,round(atual_bytes/1e6,1) atual_mb,
       round(retirada_bytes) bytes_por_retirada,
       round(item_bytes) bytes_por_item,
       round(auditoria_bytes) bytes_por_auditoria,
       round(historico_novo_10_anos/1e6,1) historico_adicional_10_anos_mb,
       round(auditorias_30_dias/1e6,1) auditorias_30_dias_mb,
       round((atual_bytes+historico_novo_10_anos+auditorias_30_dias)/1e6,1) projecao_minima_mb,
       case when atual_bytes+historico_novo_10_anos+auditorias_30_dias>=350000000
         then 'RISCO: auditoria sozinha nao garante limite; revisar volume/infraestrutura'
         else 'Abaixo do gatilho de 350 MB neste cenario simplificado' end conclusao
from projecoes;
-- Hipoteses: 365 dias/ano, 10 anos, dois eventos de auditoria por retirada,
-- nenhum crescimento de Auth, indices adicionais, carrinhos, backups, WAL ou reservas.
-- Use pg_total_relation_size por linha COMO MEDIA observada; NAO e garantia.
