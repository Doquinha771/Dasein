-- Transactional test: 30 devices, model filling, idempotent retry, duplicate rollback.
-- The inner exception rolls back every synthetic record in this block.
do $test$
declare
 v_admin uuid; v_template bigint; v_code text:='EQ021-'||left(gen_random_uuid()::text,8);
 v_items jsonb:='[]'::jsonb;v_out jsonb;v_prev jsonb;v_id uuid:=gen_random_uuid();v_i int;
begin
 select id into v_admin from public.profiles where role='admin'::public.app_role and is_active limit 1;
 if v_admin is null then raise exception 'NO_TEST_ADMIN';end if;
 begin
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.equipment_models(name,manufacturer,school_group,ram_gb,storage_gb,operating_system,created_by)
   values('Modelo teste '||v_code,'Positivo','positivo_novo',8,128,'Windows',v_admin)
   returning id into v_template;
  for v_i in 1..30 loop
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'code',v_code||'-'||lpad(v_i::text,3,'0'),'location_text','TESTE',
      'template_id',case when v_i<30 then v_template else null end,
      'brand',case when v_i=30 then 'Lenovo' else null end,
      'model',case when v_i=30 then 'ThinkPad teste' else null end));
  end loop;
  v_out:=public.equipa_register_equipment_batch(v_items,v_id);
  if jsonb_array_length(v_out)<>30 then raise exception 'BATCH_COUNT_MISMATCH';end if;
  if (select count(distinct qr_token) from public.equipments where code like v_code||'-%')<>30 then raise exception 'QR_NOT_UNIQUE';end if;
  if (select count(*) from public.equipments where code like v_code||'-%' and ram_gb=8)<>29 then raise exception 'TEMPLATE_FILL_FAIL';end if;
  v_prev:=public.equipa_register_equipment_batch(v_items,v_id);
  if v_prev<>v_out then raise exception 'IDEMPOTENCY_FAIL';end if;
  begin
    perform public.equipa_register_equipment_batch(jsonb_build_array(
      jsonb_build_object('code',v_code||'-NEW','brand','Teste','model','Teste'),
      jsonb_build_object('code',lower(v_code||'-001'),'brand','Teste','model','Teste')
    ),gen_random_uuid());
    raise exception 'EXPECTED_DUPLICATE';
  exception when others then
    if sqlerrm<>'EQUIPA_EQUIPMENT_DUPLICATE' then raise;end if;
  end;
  if exists(select 1 from public.equipments where code=v_code||'-NEW') then raise exception 'PARTIAL_BATCH';end if;
  raise exception 'ROLLBACK_TEST';
 exception when others then
  if sqlerrm='ROLLBACK_TEST' then raise notice 'PASS: 30 unique QR, 29 presets, one manual, retry, duplicate rollback';
  else raise;end if;
 end;
end $test$;
