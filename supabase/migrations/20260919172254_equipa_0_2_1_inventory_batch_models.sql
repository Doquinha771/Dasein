-- Equipa 0.2.1 Alpha: cadastro atômico e catálogo reutilizável de modelos
-- Database currently represents one school. Codes are unique throughout its inventory.
create unique index if not exists equipa_equipment_code_normalized_unique
  on public.equipments (lower(btrim(code)));

alter table public.equipments
  add column if not exists processor text,
  add column if not exists ram_gb smallint,
  add column if not exists storage_gb integer,
  add column if not exists operating_system text;

create table if not exists public.equipment_models (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) between 2 and 120),
  school_group text check (school_group is null or school_group in
    ('chromebook','positivo_novo','positivo_tecnico','positivo_antigo','thinkpad_lenovo','tablet','outro')),
  manufacturer text not null check (length(btrim(manufacturer)) between 1 and 100),
  processor text check (processor is null or length(processor) <= 120),
  ram_gb smallint check (ram_gb is null or ram_gb between 1 and 1024),
  storage_gb integer check (storage_gb is null or storage_gb between 1 and 1048576),
  operating_system text check (operating_system is null or length(operating_system) <= 120),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists equipa_model_normalized_name_uniq
  on public.equipment_models(lower(btrim(name)));
alter table public.equipment_models enable row level security;
revoke all on public.equipment_models from anon,authenticated;
grant select,insert,update,delete on public.equipment_models to authenticated;
grant usage,select on sequence public.equipment_models_id_seq to authenticated;
create policy equipa_models_admin_read on public.equipment_models for select to authenticated
  using ((select private.current_role())='admin'::public.app_role);
create policy equipa_models_admin_insert on public.equipment_models for insert to authenticated
  with check ((select private.current_role())='admin'::public.app_role
    and created_by=(select auth.uid()));
create policy equipa_models_admin_update on public.equipment_models for update to authenticated
  using ((select private.current_role())='admin'::public.app_role)
  with check ((select private.current_role())='admin'::public.app_role);
create policy equipa_models_admin_delete on public.equipment_models for delete to authenticated
  using ((select private.current_role())='admin'::public.app_role);

create table if not exists public.equipment_registration_actions (
  id uuid primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  request_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists equipa_registration_actions_created_idx
 on public.equipment_registration_actions(created_at);
alter table public.equipment_registration_actions enable row level security;
revoke all on public.equipment_registration_actions from anon,authenticated;
-- This table is only written/read by the validated private RPC.

create or replace function private.register_equipment_batch_internal(
  p_items jsonb, p_action_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid:=auth.uid();
  v_item jsonb;
  v_model public.equipment_models%rowtype;
  v_code text;
  v_asset text;
  v_serial text;
  v_brand text;
  v_model_name text;
  v_group text;
  v_name text;
  v_loc text;
  v_notes text;
  v_processor text;
  v_os text;
  v_ram integer;
  v_storage integer;
  v_template_id bigint;
  v_hash text;
  v_previous public.equipment_registration_actions%rowtype;
  v_output jsonb:='[]'::jsonb;
  v_id uuid;
  v_qr uuid;
  v_seen_codes text[]:=array[]::text[];
  v_seen_tags text[]:=array[]::text[];
  v_seen_serials text[]:=array[]::text[];
  v_index integer:=0;
begin
  if v_user is null or private.current_role() is distinct from 'admin'::public.app_role
    then raise exception 'EQUIPA_ADMIN_REQUIRED'; end if;
  if p_action_id is null or p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items) not between 1 and 200
    then raise exception 'EQUIPA_BATCH_SIZE_INVALID'; end if;
  v_hash:=md5(p_items::text);
  perform pg_advisory_xact_lock(hashtext(p_action_id::text));
  select * into v_previous from public.equipment_registration_actions where id=p_action_id;
  if found then
    if v_previous.actor_id<>v_user or v_previous.request_hash<>v_hash
      then raise exception 'EQUIPA_BATCH_ACTION_CONFLICT'; end if;
    return v_previous.result;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_index:=v_index+1;
    if jsonb_typeof(v_item)<>'object' then raise exception 'EQUIPA_INVALID_ROW_%',v_index; end if;
    v_code:=btrim(coalesce(v_item->>'code',''));
    v_asset:=nullif(btrim(coalesce(v_item->>'asset_tag','')),'');
    v_serial:=nullif(btrim(coalesce(v_item->>'serial_number','')),'');
    v_name:=nullif(btrim(coalesce(v_item->>'label','')),'');
    v_loc:=nullif(btrim(coalesce(v_item->>'location_text','')),'');
    v_notes:=nullif(btrim(coalesce(v_item->>'notes','')),'');
    if length(v_code) not between 1 and 80 or v_code<>btrim(v_code)
       or (v_asset is not null and length(v_asset)>80)
       or (v_serial is not null and length(v_serial)>120)
       or (v_name is not null and length(v_name)>120)
       or (v_loc is not null and length(v_loc)>160)
       or (v_notes is not null and length(v_notes)>1200)
       then raise exception 'EQUIPA_INVALID_ROW_%',v_index; end if;
    if lower(v_code)=any(v_seen_codes) then raise exception 'EQUIPA_DUPLICATE_IN_BATCH'; end if;
    v_seen_codes:=array_append(v_seen_codes,lower(v_code));
    if v_asset is not null then
      if lower(v_asset)=any(v_seen_tags) then raise exception 'EQUIPA_DUPLICATE_IN_BATCH'; end if;
      v_seen_tags:=array_append(v_seen_tags,lower(v_asset));
    end if;
    if v_serial is not null then
      if lower(v_serial)=any(v_seen_serials) then raise exception 'EQUIPA_DUPLICATE_IN_BATCH'; end if;
      v_seen_serials:=array_append(v_seen_serials,lower(v_serial));
    end if;
    begin
      v_template_id:=nullif(v_item->>'template_id','')::bigint;
    exception when others then raise exception 'EQUIPA_INVALID_ROW_%',v_index; end;
    v_model:=null;
    if v_template_id is not null then
      select * into v_model from public.equipment_models where id=v_template_id;
      if not found then raise exception 'EQUIPA_MODEL_NOT_FOUND'; end if;
    end if;
    v_brand:=btrim(coalesce(v_model.manufacturer,v_item->>'brand',''));
    v_model_name:=btrim(coalesce(v_model.name,v_item->>'model',''));
    v_group:=nullif(btrim(coalesce(v_model.school_group,v_item->>'school_group','')),'');
    v_processor:=nullif(btrim(coalesce(v_model.processor,v_item->>'processor','')),'');
    v_os:=nullif(btrim(coalesce(v_model.operating_system,v_item->>'operating_system','')),'');
    begin
      v_ram:=coalesce(v_model.ram_gb::integer,nullif(v_item->>'ram_gb','')::integer);
      v_storage:=coalesce(v_model.storage_gb,nullif(v_item->>'storage_gb','')::integer);
    exception when others then raise exception 'EQUIPA_INVALID_ROW_%',v_index; end;
    if length(v_brand) not between 1 and 100 or length(v_model_name) not between 1 and 120
      or (v_group is not null and v_group not in
       ('chromebook','positivo_novo','positivo_tecnico','positivo_antigo','thinkpad_lenovo','tablet','outro'))
      or (v_processor is not null and length(v_processor)>120)
      or (v_os is not null and length(v_os)>120)
      or (v_ram is not null and v_ram not between 1 and 1024)
      or (v_storage is not null and v_storage not between 1 and 1048576)
      then raise exception 'EQUIPA_INVALID_ROW_%',v_index; end if;
    insert into public.equipments(
      code,asset_tag,serial_number,label,location_text,notes,brand,model,
      school_group,processor,ram_gb,storage_gb,operating_system,status,is_active,created_by
    ) values (
      v_code,v_asset,v_serial,v_name,v_loc,v_notes,v_brand,v_model_name,
      v_group,v_processor,v_ram,v_storage,v_os,'available'::public.equipment_status,true,v_user
    ) returning id,qr_token into v_id,v_qr;
    v_output:=v_output||jsonb_build_array(jsonb_build_object('id',v_id,'code',v_code,'qr_token',v_qr,'location_text',v_loc));
  end loop;
  insert into public.equipment_registration_actions(id,actor_id,request_hash,result)
  values(p_action_id,v_user,v_hash,v_output);
  -- One request: one PostgreSQL transaction. Any exception rolls back every insert.
  return v_output;
exception when unique_violation then
  raise exception 'EQUIPA_EQUIPMENT_DUPLICATE';
end;
$$;
revoke all on function private.register_equipment_batch_internal(jsonb,uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.register_equipment_batch_internal(jsonb,uuid) to authenticated;
create or replace function public.equipa_register_equipment_batch(p_items jsonb,p_action_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.register_equipment_batch_internal(p_items,p_action_id);
$$;
revoke all on function public.equipa_register_equipment_batch(jsonb,uuid) from public,anon;
grant execute on function public.equipa_register_equipment_batch(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
