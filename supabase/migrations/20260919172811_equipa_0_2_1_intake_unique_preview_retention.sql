create unique index if not exists equipa_equipment_asset_normalized_unique
 on public.equipments(lower(btrim(asset_tag)))
 where asset_tag is not null and btrim(asset_tag)<>'';
create unique index if not exists equipa_equipment_serial_normalized_unique
 on public.equipments(lower(btrim(serial_number)))
 where serial_number is not null and btrim(serial_number)<>'';
create index if not exists equipa_models_creator_idx on public.equipment_models(created_by);
create index if not exists equipa_registration_actor_idx on public.equipment_registration_actions(actor_id);
drop policy if exists equipa_registration_receipts_hidden on public.equipment_registration_actions;
create policy equipa_registration_receipts_hidden on public.equipment_registration_actions
for select to authenticated using(false);
create or replace function private.prune_registration_receipts()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.equipment_registration_actions where created_at<now()-interval '14 days';
 return new;
end;$$;
revoke all on function private.prune_registration_receipts() from public,anon,authenticated;
drop trigger if exists equipa_prune_registration_receipts on public.equipment_registration_actions;
create trigger equipa_prune_registration_receipts after insert on public.equipment_registration_actions
for each statement execute function private.prune_registration_receipts();
create or replace function public.equipa_existing_codes(p_codes text[])
returns text[] language plpgsql stable security invoker set search_path='' as $$
declare v_result text[];
begin
 if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role
 then raise exception 'EQUIPA_ADMIN_REQUIRED';end if;
 if p_codes is null or coalesce(array_length(p_codes,1),0) not between 1 and 200
 then raise exception 'EQUIPA_BATCH_SIZE_INVALID';end if;
 select coalesce(array_agg(e.code),'{}'::text[]) into v_result
 from public.equipments e
 where lower(btrim(e.code))=any(array(select lower(btrim(x)) from unnest(p_codes) x));
 return v_result;
end;$$;
revoke all on function public.equipa_existing_codes(text[]) from public,anon;
grant execute on function public.equipa_existing_codes(text[]) to authenticated;
notify pgrst,'reload schema';
