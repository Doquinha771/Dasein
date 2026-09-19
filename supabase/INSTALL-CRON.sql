-- ATENÇÃO: o job equipa-audit-pressure JA ESTA ATIVO no projeto oxcfbsrukzfnzkivatsn.
-- NAO execute novamente no projeto atual; este arquivo e somente para instalar em outro banco.
-- Executar no SQL Editor SOMENTE depois de habilitar Supabase Cron em Integrations > Cron.
-- O usuario do SQL Editor deve ser o dono do banco; nunca chamar pelo navegador.
select cron.schedule('equipa-audit-pressure','5 2 * * *',
  'select private.equipa_prune_audit_on_pressure()');
-- Conferencia: uma linha ativa.
select jobname, schedule, active from cron.job where jobname='equipa-audit-pressure';
