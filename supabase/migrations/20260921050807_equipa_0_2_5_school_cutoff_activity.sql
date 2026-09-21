-- Aplicada ao Supabase do Equipa em 2026-09-21. Idempotente e sem apagar registros.
-- A data da devolução é escolhida pelo usuário, mas o horário não pode superar
-- 21:15:00 em America/Sao_Paulo. A restrição vale também para RPCs legadas.
create or replace function private.equipa_enforce_daily_cutoff()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.due_at is not null
    and (new.due_at at time zone 'America/Sao_Paulo')::time > time '21:15:00'
 then raise exception 'EQUIPA_DUE_AFTER_SCHOOL_CLOSE'
    using errcode = '22023';
 end if;
 return new;
end $$;
drop trigger if exists equipa_withdrawal_daily_cutoff on public.withdrawals;
create trigger equipa_withdrawal_daily_cutoff
before insert or update of due_at on public.withdrawals
for each row execute function private.equipa_enforce_daily_cutoff();
revoke all on function private.equipa_enforce_daily_cutoff() from public, anon, authenticated;

-- Informações operacionais mínimas: sem e-mail, RA, aniversário ou dados de sessão.
-- Apenas perfis autenticados com acesso ativo obtêm informações de ocupação.
create or replace function private.equipa_school_activity_internal(p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
 v_events jsonb;
 v_occupancy jsonb;
 v_limit integer := least(greatest(coalesce(p_limit,30),1),60);
begin
 if auth.uid() is null or private.current_role() is null then
   raise exception 'EQUIPA_ACCOUNT_DISABLED';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.event_at desc,x.event_id desc),'[]'::jsonb)
 into v_events from (
    select 'out-'||wi.id::text as event_id, 'checkout'::text as event_type,
      w.withdrawn_at as event_at,e.code as equipment_code,
      coalesce(nullif(w.custodian_name,''),nullif(w.responsible_name,''),'Não identificado') as holder_name,
      w.custodian_role as holder_role,(w.custody_mode='delegate') as declared
    from public.withdrawal_items wi
    join public.withdrawals w on w.id=wi.withdrawal_id
    join public.equipments e on e.id=wi.equipment_id
    where w.withdrawn_at>=now()-interval '7 days'
    union all
    select 'back-'||wi.id::text as event_id, 'return'::text as event_type,
      wi.returned_at as event_at,e.code as equipment_code,
      coalesce(nullif(w.custodian_name,''),nullif(w.responsible_name,''),'Não identificado') as holder_name,
      w.custodian_role as holder_role,(w.custody_mode='delegate') as declared
    from public.withdrawal_items wi
    join public.withdrawals w on w.id=wi.withdrawal_id
    join public.equipments e on e.id=wi.equipment_id
    where wi.returned_at is not null and wi.returned_at>=now()-interval '7 days'
    order by event_at desc limit v_limit
 ) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
 into v_occupancy from (
   select wi.equipment_id,
     coalesce(nullif(w.custodian_name,''),nullif(w.responsible_name,''),'Não identificado') as holder_name,
     w.custodian_role as holder_role,(w.custody_mode='delegate') as declared
   from public.withdrawal_items wi
   join public.withdrawals w on w.id=wi.withdrawal_id
   join public.equipments e on e.id=wi.equipment_id
   where w.status='open' and wi.returned_at is null
     and e.is_active and e.status='in_use'
   order by w.withdrawn_at desc
   limit 10000
 ) x;
 return jsonb_build_object('events',v_events,'occupancy',v_occupancy);
end $$;
revoke all on function private.equipa_school_activity_internal(integer)
 from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.equipa_school_activity_internal(integer) to authenticated;
create or replace function public.equipa_school_activity(p_limit integer default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
select private.equipa_school_activity_internal(p_limit);
$$;
revoke all on function public.equipa_school_activity(integer)
 from public,anon,service_role;
grant execute on function public.equipa_school_activity(integer) to authenticated;
notify pgrst, 'reload schema';
