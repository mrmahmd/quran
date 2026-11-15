begin;

create table quran_private.dashboard_viewers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  teacher_username text references public.teacher_accounts(username),
  active boolean not null default true,
  constraint dashboard_viewer_scope check (teacher_username is null or teacher_username = 'quran06')
);
alter table quran_private.dashboard_viewers enable row level security;
revoke all on quran_private.dashboard_viewers from public, anon, authenticated;

create function quran_private.is_dashboard_viewer()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from quran_private.dashboard_viewers where user_id = auth.uid())
$$;

create function quran_private.dashboard_viewer_can_read(p_teacher text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from quran_private.dashboard_viewers v
    where v.user_id = auth.uid() and v.active
      and (v.teacher_username is null or v.teacher_username = p_teacher and exists (
        select 1 from public.teacher_accounts t where t.username = v.teacher_username and t.active
      ))
  )
$$;
revoke all on function quran_private.is_dashboard_viewer(), quran_private.dashboard_viewer_can_read(text) from public, anon;
grant execute on function quran_private.is_dashboard_viewer(), quran_private.dashboard_viewer_can_read(text) to authenticated;

create function public.dashboard_viewer_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when v.teacher_username is null
    then jsonb_build_object('role', 'admin', 'readOnly', true, 'full_name', 'معاينة الإدارة')
    when t.active then jsonb_build_object('role', 'teacher', 'readOnly', true,
      'username', t.username, 'full_name', t.full_name, 'ring_name', t.ring_name, 'class_name', t.class_name)
    else null end
  from quran_private.dashboard_viewers v
  left join public.teacher_accounts t on t.username = v.teacher_username
  where v.user_id = auth.uid() and v.active
$$;
revoke all on function public.dashboard_viewer_profile() from public, anon;
grant execute on function public.dashboard_viewer_profile() to authenticated;

create policy dashboard_viewer_select on public.school_terms for select to authenticated
  using ((select public.dashboard_viewer_profile()) is not null);
create policy dashboard_viewer_select on public.weekly_workflow_access for select to authenticated
  using ((select public.dashboard_viewer_profile()) is not null);
create policy dashboard_viewer_select on public.monthly_workflow_access for select to authenticated
  using ((select public.dashboard_viewer_profile()) is not null);
create policy dashboard_viewer_select on public.teacher_accounts for select to authenticated
  using (quran_private.dashboard_viewer_can_read(username));

do $$
declare target text;
begin
  foreach target in array array['students', 'weekly_reviews', 'weekly_evaluations', 'semester_honors',
    'monthly_reports', 'monthly_entries', 'khairkom_nomination_sets', 'khairkom_nominations']
  loop
    execute format('create policy dashboard_viewer_select on public.%I for select to authenticated using (quran_private.dashboard_viewer_can_read(teacher_username))', target);
  end loop;
end $$;
create policy dashboard_viewer_select on public.roster_change_requests for select to authenticated
  using ((select quran_private.dashboard_viewer_can_read(null)));

-- Reject direct writes through other data interfaces as well as REST.
do $$
declare target text;
begin
  for target in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('create policy dashboard_viewer_no_insert on public.%I as restrictive for insert to authenticated with check (not (select quran_private.is_dashboard_viewer()))', target);
    execute format('create policy dashboard_viewer_no_update on public.%I as restrictive for update to authenticated using (not (select quran_private.is_dashboard_viewer())) with check (not (select quran_private.is_dashboard_viewer()))', target);
    execute format('create policy dashboard_viewer_no_delete on public.%I as restrictive for delete to authenticated using (not (select quran_private.is_dashboard_viewer()))', target);
  end loop;
end $$;

-- Apply the gate before any PostgREST query. A viewer cannot call a write RPC
-- or send an INSERT, UPDATE, or DELETE even if another policy is added later.
create function public.enforce_dashboard_viewer_read_only()
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  method text := current_setting('request.method', true);
  path text := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/(rest/v1/)?', '');
begin
  if not quran_private.is_dashboard_viewer() then return; end if;
  if method in ('GET', 'HEAD') and path in ('school_terms', 'weekly_workflow_access',
    'monthly_workflow_access', 'teacher_accounts', 'admin_accounts', 'students',
    'weekly_reviews', 'weekly_evaluations', 'semester_honors', 'monthly_reports',
    'monthly_entries', 'khairkom_nomination_sets', 'khairkom_nominations',
    'roster_change_requests', 'teacher_preferences') then return; end if;
  if method = 'GET' and path in ('rpc/dashboard_viewer_profile', 'rpc/dashboard_viewer_report') then return; end if;
  raise exception 'هذا الحساب للاطلاع فقط.' using errcode = '42501';
end
$$;
revoke all on function public.enforce_dashboard_viewer_read_only() from public;
grant execute on function public.enforce_dashboard_viewer_read_only() to anon, authenticated, service_role;

-- Preserve any independently configured PostgREST hook. Compose the hooks
-- explicitly if the target already has one.
do $$
begin
  if exists (
    select 1 from pg_db_role_setting s
    cross join lateral unnest(s.setconfig) config
    where s.setrole = 'authenticator'::regrole and config like 'pgrst.db_pre_request=%'
  ) then
    raise exception 'Existing PostgREST pre-request hook must be reviewed before installation';
  end if;
end $$;
alter role authenticator set pgrst.db_pre_request = 'public.enforce_dashboard_viewer_read_only';

-- The only privileged reads needed by the admin dashboard. The effective admin
-- ID is scoped to this invocation and never returned to the viewer.
create function public.dashboard_viewer_report(p_kind text, p_term uuid, p_week date default null, p_period integer default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid;
  original_sub text := current_setting('request.jwt.claim.sub', true);
  original_claims text := current_setting('request.jwt.claims', true);
  report jsonb;
begin
  if not quran_private.dashboard_viewer_can_read(null) then
    raise exception 'هذا التقرير متاح لمعاينة الإدارة فقط.' using errcode = '42501';
  end if;
  select auth_user_id into actor from public.admin_accounts
    where active and auth_user_id is not null order by auth_user_id limit 1;
  if actor is null then raise exception 'لا يوجد حساب إدارة نشط'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform set_config('request.jwt.claims',
    jsonb_set(coalesce(nullif(original_claims, '')::jsonb, '{}'::jsonb), '{sub}', to_jsonb(actor::text))::text, true);
  case p_kind
    when 'champions' then
      select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) into report
        from (select * from quran_private.weekly_champions(p_term, p_week)) row;
    when 'khairkom' then
      report := quran_private.khairkom_report_snapshot_period(p_period, p_term);
    else
      raise exception 'نوع التقرير غير متاح.' using errcode = '22023';
  end case;
  perform set_config('request.jwt.claim.sub', coalesce(original_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(original_claims, ''), true);
  return report;
end
$$;
revoke all on function public.dashboard_viewer_report(text,uuid,date,integer) from public, anon;
grant execute on function public.dashboard_viewer_report(text,uuid,date,integer) to authenticated;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
