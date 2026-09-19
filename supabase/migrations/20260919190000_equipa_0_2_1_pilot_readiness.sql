-- Equipa 0.2.1 Alpha: paginação administrativa, relatórios agregados e preparação do piloto.
-- Esta migration não apaga histórico e não cria dados fictícios.

create index if not exists audit_events_occurred_desc_idx
  on public.audit_events (occurred_at desc);
create index if not exists audit_events_entity_action_occurred_idx
  on public.audit_events (entity_type, action, occurred_at desc);
create index if not exists profiles_role_active_name_idx
  on public.profiles (role, is_active, lower(full_name));

create or replace function private.admin_user_page_internal(
  p_page integer, p_page_size integer, p_role text, p_search text
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_page integer:=greatest(coalesce(p_page,0),0);
  v_size integer:=least(greatest(coalesce(p_page_size,20),1),50);
  v_role public.app_role;
  v_search text:=nullif(lower(btrim(coalesce(p_search,''))),'');
  v_total bigint; v_active bigint; v_roles integer; v_filtered bigint; v_rows jsonb;
begin
  if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role
    then raise exception 'EQUIPA_ADMIN_REQUIRED'; end if;
  if length(coalesce(p_search,''))>80 then raise exception 'EQUIPA_SEARCH_TOO_LONG'; end if;
  if nullif(p_role,'') is not null then
    if p_role not in ('student','teacher','admin') then raise exception 'EQUIPA_ROLE_INVALID'; end if;
    v_role:=p_role::public.app_role;
  end if;

  select count(*),
    count(*) filter(where p.is_active and (u.banned_until is null or u.banned_until<=now())),
    count(distinct p.role)::integer
  into v_total,v_active,v_roles
  from public.profiles p join auth.users u on u.id=p.id;

  select count(*) into v_filtered
  from public.profiles p
  where (v_role is null or p.role=v_role)
    and (v_search is null or lower(coalesce(p.full_name,'')) like '%'||v_search||'%');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_active desc,lower(x.full_name),x.id),'[]'::jsonb)
  into v_rows from (
    select p.id,p.full_name,p.role,
      case when u.email is null then '—'
       else left(split_part(u.email,'@',1),2)
        ||repeat('*',least(5,greatest(2,length(split_part(u.email,'@',1))-2)))
        ||'@'||split_part(u.email,'@',2) end as masked_email,
      p.is_active,u.banned_until,p.created_at,p.updated_at
    from public.profiles p join auth.users u on u.id=p.id
    where (v_role is null or p.role=v_role)
      and (v_search is null or lower(coalesce(p.full_name,'')) like '%'||v_search||'%')
    order by p.is_active desc,lower(coalesce(p.full_name,'')),p.id
    limit v_size offset v_page*v_size
  ) x;
  return jsonb_build_object('rows',v_rows,'total',v_total,'active',v_active,'roles',v_roles,'filtered_total',v_filtered,'page',v_page,'page_size',v_size);
end;$$;

create or replace function public.equipa_admin_user_page(
  p_page integer default 0,p_page_size integer default 20,p_role text default null,p_search text default null
) returns jsonb language sql stable security invoker set search_path=''
as $$select private.admin_user_page_internal(p_page,p_page_size,p_role,p_search);$$;
revoke all on function private.admin_user_page_internal(integer,integer,text,text) from public,anon;
revoke all on function public.equipa_admin_user_page(integer,integer,text,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.admin_user_page_internal(integer,integer,text,text) to authenticated;
grant execute on function public.equipa_admin_user_page(integer,integer,text,text) to authenticated;

create or replace function private.admin_audit_page_internal(
  p_page integer,p_page_size integer,p_entity text,p_action text,p_search text
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_page integer:=greatest(coalesce(p_page,0),0);
  v_size integer:=least(greatest(coalesce(p_page_size,25),1),100);
  v_search text:=nullif(lower(btrim(coalesce(p_search,''))),'');
  v_total bigint;v_rows jsonb;
begin
  if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role
    then raise exception 'EQUIPA_ADMIN_REQUIRED';end if;
  if length(coalesce(p_search,''))>100 then raise exception 'EQUIPA_SEARCH_TOO_LONG';end if;
  select count(*) into v_total from public.audit_events a
   where (nullif(p_entity,'') is null or a.entity_type=p_entity)
    and (nullif(p_action,'') is null or a.action=p_action)
    and (v_search is null or lower(coalesce(a.actor_name,'')||' '||coalesce(a.summary,'')||' '||coalesce(a.entity_id,'')) like '%'||v_search||'%');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]'::jsonb)
  into v_rows from (
    select a.id,a.occurred_at,a.actor_name,a.action,a.entity_type,a.entity_id,a.summary,a.details
    from public.audit_events a
    where (nullif(p_entity,'') is null or a.entity_type=p_entity)
      and (nullif(p_action,'') is null or a.action=p_action)
      and (v_search is null or lower(coalesce(a.actor_name,'')||' '||coalesce(a.summary,'')||' '||coalesce(a.entity_id,'')) like '%'||v_search||'%')
    order by a.occurred_at desc,a.id desc limit v_size offset v_page*v_size
  ) x;
  return jsonb_build_object('rows',v_rows,'total',v_total,'page',v_page,'page_size',v_size);
end;$$;

create or replace function public.equipa_admin_audit_page(
 p_page integer default 0,p_page_size integer default 25,p_entity text default null,p_action text default null,p_search text default null
) returns jsonb language sql stable security invoker set search_path=''
as $$select private.admin_audit_page_internal(p_page,p_page_size,p_entity,p_action,p_search);$$;
revoke all on function private.admin_audit_page_internal(integer,integer,text,text,text) from public,anon;
revoke all on function public.equipa_admin_audit_page(integer,integer,text,text,text) from public,anon;
grant execute on function private.admin_audit_page_internal(integer,integer,text,text,text) to authenticated;
grant execute on function public.equipa_admin_audit_page(integer,integer,text,text,text) to authenticated;

create or replace function private.admin_report_dashboard_internal(
 p_from timestamptz,p_to timestamptz,p_class text,p_group text,p_status text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_base jsonb;v_inventory jsonb;v_days jsonb;v_chart_from timestamptz;
begin
 if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role then raise exception 'EQUIPA_ADMIN_REQUIRED';end if;
 if p_from is null or p_to is null or p_from>=p_to or p_to>now()+interval '1 day' or p_to-p_from>interval '370 days' then raise exception 'EQUIPA_REPORT_RANGE_INVALID';end if;
 if p_group is not null and p_group not in ('chromebook','positivo_novo','positivo_tecnico','positivo_antigo','thinkpad_lenovo','tablet','outro') then raise exception 'EQUIPA_GROUP_INVALID';end if;
 if p_status is not null and p_status not in ('available','in_use','maintenance','unavailable') then raise exception 'EQUIPA_STATUS_INVALID';end if;
 v_base:=private.reports_internal(p_from,p_to);
 select jsonb_build_object(
   'total',count(*),
   'available',count(*) filter(where e.status='available'::public.equipment_status),
   'in_use',count(*) filter(where e.status='in_use'::public.equipment_status),
   'maintenance',count(*) filter(where e.status='maintenance'::public.equipment_status),
   'unavailable',count(*) filter(where e.status='unavailable'::public.equipment_status)
 ) into v_inventory from public.equipments e where e.is_active
   and (p_group is null or e.school_group=p_group)
   and (p_status is null or e.status::text=p_status);
 v_chart_from:=greatest(p_from,p_to-interval '60 days');
 with activity as (
   select date_trunc('day',w.withdrawn_at)::date day,count(*)::bigint n
   from public.withdrawals w
   where w.withdrawn_at>=v_chart_from and w.withdrawn_at<p_to
    and (p_class is null or lower(coalesce(w.class_name,'')) like '%'||lower(p_class)||'%')
   group by 1
   union all
   select date_trunc('day',r.start_at)::date day,count(distinct coalesce(r.batch_id::text||':'||r.start_at::text,r.id::text))::bigint n
   from public.reservations r join public.equipments e on e.id=r.equipment_id
   where r.start_at>=v_chart_from and r.start_at<p_to
    and (p_class is null or lower(coalesce(r.class_name,'')) like '%'||lower(p_class)||'%')
    and (p_group is null or e.school_group=p_group)
   group by 1
 ), grouped as (select day,sum(n)::bigint total from activity group by day)
 select coalesce(jsonb_agg(jsonb_build_object('day',day,'total',total) order by day),'[]'::jsonb) into v_days from grouped;
 return v_base||jsonb_build_object('inventory',v_inventory,'activity_days',v_days);
end;$$;

create or replace function public.equipa_admin_report_dashboard(
 p_from timestamptz,p_to timestamptz,p_class text default null,p_group text default null,p_status text default null
) returns jsonb language sql stable security invoker set search_path=''
as $$select private.admin_report_dashboard_internal(p_from,p_to,p_class,p_group,p_status);$$;
revoke all on function private.admin_report_dashboard_internal(timestamptz,timestamptz,text,text,text) from public,anon;
revoke all on function public.equipa_admin_report_dashboard(timestamptz,timestamptz,text,text,text) from public,anon;
grant execute on function private.admin_report_dashboard_internal(timestamptz,timestamptz,text,text,text) to authenticated;
grant execute on function public.equipa_admin_report_dashboard(timestamptz,timestamptz,text,text,text) to authenticated;

-- Retenção continua deliberadamente não destrutiva: o painel informa o volume por faixa,
-- mas a escola precisa aprovar a política antes de qualquer exclusão.
create or replace function public.equipa_admin_audit_retention_preview()
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or private.current_role() is distinct from 'admin'::public.app_role then raise exception 'EQUIPA_ADMIN_REQUIRED';end if;
 return jsonb_build_object(
  'total',(select count(*) from public.audit_events),
  'older_than_365_days',(select count(*) from public.audit_events where occurred_at<now()-interval '365 days'),
  'oldest_event',(select min(occurred_at) from public.audit_events),
  'destructive_cleanup_enabled',false
 );
end;$$;
revoke all on function public.equipa_admin_audit_retention_preview() from public,anon;
grant execute on function public.equipa_admin_audit_retention_preview() to authenticated;

notify pgrst,'reload schema';
