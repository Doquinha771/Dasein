-- Aplicada ao projeto oxcfbsrukzfnzkivatsn. Usa apenas a função privada de auditoria.
-- No banco atual a migration ja foi instalada: NAO e necessario executa-la novamente.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('equipa-audit-pressure','5 2 * * *',
  'select private.equipa_prune_audit_on_pressure()');
