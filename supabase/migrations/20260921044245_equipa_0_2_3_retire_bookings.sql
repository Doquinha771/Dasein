-- Equipa 0.2.3: retirar o fluxo de novas reservas sem apagar reservas históricas
-- ou afetar retiradas, devoluções, QR Codes e seus vínculos por FK.
-- Não execute DROP TABLE reservations: há histórico associado à operação escolar.
-- Nenhuma reserva pendente será cancelada por esta migration.
DO $equipa$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prokind='f'
       AND (p.proname LIKE '%reserv%' OR p.proname LIKE '%booking%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated, service_role', f.name, f.args);
  END LOOP;
END
$equipa$;
-- Para relatórios, transações e históricos: tabelas legadas continuam intocadas.
-- A interface nova não chama nenhuma função de criação/consulta de reservas.
NOTIFY pgrst, 'reload schema';
