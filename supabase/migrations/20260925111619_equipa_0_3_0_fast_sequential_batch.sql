-- Equipa 0.3.0: cadastro sequencial rápido em uma transação, sem apagar dados existentes.
-- O PostgreSQL gera os códigos, UUIDs e QR tokens. O processamento de até 200
-- itens reutiliza a função consolidada com autorização, idempotência e auditoria.
create or replace function public.equipa_quick_register_sequential(
  p_prefix text,
  p_start text,
  p_quantity integer,
  p_model text,
  p_action_id uuid,
  p_location_text text default null,
  p_brand text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start bigint;
  v_width integer;
  v_items jsonb;
  v_prefix text := btrim(coalesce(p_prefix, ''));
  v_model text := btrim(coalesce(p_model, ''));
  v_location text := nullif(btrim(coalesce(p_location_text, '')), '');
  v_brand text := coalesce(nullif(btrim(coalesce(p_brand, '')), ''), 'Não informado');
begin
  -- A função interna também confirma auth.uid() e perfil admin, sem abrir acesso anon.
  if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role
  then raise exception 'EQUIPA_ADMIN_REQUIRED'; end if;
  if p_action_id is null or p_quantity is null or p_quantity not between 1 and 200
     or p_start is null or p_start !~ '^[0-9]{1,8}$'
     or length(v_prefix) > 30 or length(v_model) not between 1 and 120
     or length(v_brand) > 100 or length(coalesce(v_location, '')) > 160
  then raise exception 'EQUIPA_BATCH_INPUT_INVALID'; end if;
  v_start := p_start::bigint;
  v_width := length(p_start);
  if v_start + p_quantity - 1 > 99999999
  then raise exception 'EQUIPA_BATCH_INPUT_INVALID'; end if;
  select jsonb_agg(jsonb_build_object(
    'code',v_prefix || lpad((v_start + n)::text, v_width, '0'),
    'model',v_model,'brand',v_brand,'location_text',v_location
  ) order by n) into v_items
  from generate_series(0,p_quantity - 1) as seq(n);
  return private.register_equipment_batch_internal(v_items,p_action_id);
end;
$$;
revoke all on function public.equipa_quick_register_sequential(text,text,integer,text,uuid,text,text)
 from public,anon;
grant execute on function public.equipa_quick_register_sequential(text,text,integer,text,uuid,text,text)
 to authenticated;
comment on function public.equipa_quick_register_sequential(text,text,integer,text,uuid,text,text)
 is 'Generates 1..200 numbered equipments in one atomic idempotent transaction; reuses protected registration; permanent QR tokens auto-created.';
notify pgrst,'reload schema';
