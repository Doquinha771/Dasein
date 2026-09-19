-- Verify registration still works with receipt-pruning trigger; no data persists.
do $test$
declare a uuid; c text:='EQ021SMOKE-'||left(gen_random_uuid()::text,8); out_json jsonb;
begin
 select id into a from public.profiles where role='admin'::public.app_role and is_active limit 1;
 if a is null then raise exception 'EQUIPA_TEST_ADMIN_MISSING';end if;
 begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  out_json:=public.equipa_register_equipment_batch(
    jsonb_build_array(jsonb_build_object('code',c,'brand','Teste','model','Modelo de teste')),
    gen_random_uuid());
  if jsonb_array_length(out_json)<>1 then raise exception 'EQUIPA_RECEIPT_TRIGGER_FAILED';end if;
  raise exception 'EQUIPA_TEST_ROLLBACK';
 exception when others then
  if sqlerrm='EQUIPA_TEST_ROLLBACK' then raise notice 'EQUIPA_BATCH_AFTER_RETENTION_PASS';
  else raise;end if;
 end;
end $test$;
