-- Equipa 0.2.2: guarda e finalidade da retirada.
-- Aditivo: preserva QR, equipamentos, reservas, retiradas e suas chaves.
-- Nomes de terceiros sao declarados e NAO sao tratados como identidade autenticada.
alter table public.withdrawals add column if not exists custodian_name text;
alter table public.withdrawals add column if not exists custodian_role text;
alter table public.withdrawals add column if not exists custody_mode text;
alter table public.withdrawals add column if not exists checkout_purpose text;
alter table public.withdrawals add column if not exists purpose_details text;
alter table public.withdrawals add column if not exists recorded_by_name text;
alter table public.withdrawals add column if not exists recorded_by_role text;

-- Nao adicionar indice nos campos descritivos: dados pequenos, consultas por ID existentes.
create or replace function private.equipa_save_custody_context(
  p_withdrawal_id bigint,p_holder_mode text,p_holder_name text,p_holder_role text,
  p_purpose text,p_purpose_details text
) returns void language plpgsql security invoker set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role;
  v_operator text;
  v_receiver text;
  v_receiver_role text;
  v_details text:=nullif(btrim(coalesce(p_purpose_details,'')),'');
  v_current_purpose text;
begin
  select p.role,p.full_name into v_role,v_operator
    from public.profiles p where p.id=v_uid and p.is_active;
  if v_uid is null or v_role is null then raise exception 'EQUIPA_ACCOUNT_DISABLED';end if;
  if p_holder_mode not in ('self','delegate') then raise exception 'EQUIPA_CUSTODY_INVALID';end if;
  if p_purpose not in ('lesson','assessment','project','support','other')
    or length(coalesce(v_details,''))>240
    or (p_purpose='other' and length(coalesce(v_details,''))<8)
    then raise exception 'EQUIPA_PURPOSE_REQUIRED';end if;
  if p_holder_mode='self' then
    v_receiver:=v_operator;
    v_receiver_role:=v_role::text;
  else
    if v_role='student'::public.app_role then raise exception 'EQUIPA_CUSTODY_SELF_REQUIRED';end if;
    v_receiver:=nullif(btrim(coalesce(p_holder_name,'')),'');
    v_receiver_role:=p_holder_role;
    if length(coalesce(v_receiver,'')) not between 3 and 120 or
       v_receiver_role not in ('student','teacher','staff')
      then raise exception 'EQUIPA_CUSTODY_INVALID';end if;
  end if;
  select w.checkout_purpose into v_current_purpose
    from public.withdrawals w where w.id=p_withdrawal_id and w.requested_by=v_uid for update;
  if not found then raise exception 'EQUIPA_WITHDRAWAL_NOT_FOUND_OR_FORBIDDEN';end if;
  -- Idempotencia: reenvios da mesma acao nunca reescrevem a custodia original.
  if v_current_purpose is not null then return;end if;
  update public.withdrawals w set
    custody_mode=p_holder_mode,custodian_name=v_receiver,custodian_role=v_receiver_role,
    recorded_by_name=v_operator,recorded_by_role=v_role::text,
    checkout_purpose=p_purpose,purpose_details=v_details
  where w.id=p_withdrawal_id and w.requested_by=v_uid and w.checkout_purpose is null;
end;$$;
revoke all on function private.equipa_save_custody_context(bigint,text,text,text,text,text)
 from public,anon,authenticated,service_role;

create or replace function private.equipa_checkout_with_context_internal(
 p_equipment_ids uuid[],p_class_name text,p_destination text,p_due_at timestamptz,
 p_client_action_id uuid,p_holder_mode text,p_holder_name text,p_holder_role text,
 p_purpose text,p_purpose_details text
) returns text language plpgsql security definer set search_path='' as $$
declare v_id text;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'EQUIPA_ACCOUNT_DISABLED';end if;
 -- O checkout original mantem validacoes, bloqueios de linha e idempotencia.
 v_id:=private.checkout_with_due_internal(
   p_equipment_ids,p_class_name,p_destination,
   case when p_holder_mode='delegate' and p_holder_role='student' then nullif(btrim(p_holder_name),'') else null end,
   p_due_at,p_client_action_id);
 perform private.equipa_save_custody_context(v_id::bigint,p_holder_mode,p_holder_name,p_holder_role,p_purpose,p_purpose_details);
 return v_id;
end;$$;
revoke all on function private.equipa_checkout_with_context_internal(uuid[],text,text,timestamptz,uuid,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function private.equipa_checkout_with_context_internal(uuid[],text,text,timestamptz,uuid,text,text,text,text,text) to authenticated;

create or replace function public.equipa_checkout_with_context(
 p_equipment_ids uuid[],p_class_name text,p_destination text,p_due_at timestamptz,
 p_client_action_id uuid,p_holder_mode text,p_holder_name text,p_holder_role text,
 p_purpose text,p_purpose_details text
) returns text language sql security invoker set search_path='' as $$
 select private.equipa_checkout_with_context_internal(
 p_equipment_ids,p_class_name,p_destination,p_due_at,p_client_action_id,
 p_holder_mode,p_holder_name,p_holder_role,p_purpose,p_purpose_details);
$$;
revoke all on function public.equipa_checkout_with_context(uuid[],text,text,timestamptz,uuid,text,text,text,text,text)
 from public,anon;
grant execute on function public.equipa_checkout_with_context(uuid[],text,text,timestamptz,uuid,text,text,text,text,text) to authenticated;

create or replace function private.equipa_checkout_booking_with_context_internal(
 p_reservation_id bigint,p_client_action_id uuid,p_holder_mode text,p_holder_name text,
 p_holder_role text,p_purpose text,p_purpose_details text
) returns text language plpgsql security definer set search_path='' as $$
declare v_id text;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'EQUIPA_ACCOUNT_DISABLED';end if;
 -- A confirmacao da reserva e a identificacao do recebedor ocorrem na MESMA transacao.
 v_id:=private.checkout_booking_internal(p_reservation_id,p_client_action_id);
 perform private.equipa_save_custody_context(v_id::bigint,p_holder_mode,p_holder_name,p_holder_role,p_purpose,p_purpose_details);
 return v_id;
end;$$;
revoke all on function private.equipa_checkout_booking_with_context_internal(bigint,uuid,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function private.equipa_checkout_booking_with_context_internal(bigint,uuid,text,text,text,text,text) to authenticated;

create or replace function public.equipa_checkout_booking_with_context(
 p_reservation_id bigint,p_client_action_id uuid,p_holder_mode text,p_holder_name text,
 p_holder_role text,p_purpose text,p_purpose_details text
) returns text language sql security invoker set search_path='' as $$
 select private.equipa_checkout_booking_with_context_internal(
 p_reservation_id,p_client_action_id,p_holder_mode,p_holder_name,p_holder_role,p_purpose,p_purpose_details);
$$;
revoke all on function public.equipa_checkout_booking_with_context(bigint,uuid,text,text,text,text,text)
 from public,anon;
grant execute on function public.equipa_checkout_booking_with_context(bigint,uuid,text,text,text,text,text) to authenticated;

comment on column public.withdrawals.custodian_name is
 'Pessoa em posse; em modo delegate nome apenas declarado pelo registrador, nao validado por autenticacao.';
comment on column public.withdrawals.recorded_by_name is
 'Snapshot do nome da conta autenticada que realizou a operacao; preservado se conta for excluida.';
notify pgrst,'reload schema';
