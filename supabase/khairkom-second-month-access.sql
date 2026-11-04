-- Install after khairkom-periods.sql. Existing rounds start open.
begin;
set local lock_timeout = '5s';
create temporary table khairkom_access_before on commit drop as select
  (select md5(coalesce(jsonb_agg(to_jsonb(n) order by set_id,student_id)::text,'')) from public.khairkom_nominations n) nominations,
  (select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from public.khairkom_nomination_sets s) sets,
  (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from quran_private.khairkom_external_nominees e) external;
alter table public.school_terms add column if not exists khairkom_second_month_open boolean not null default true;

create or replace function public.set_khairkom_second_month_open(p_term uuid, p_open boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then
    raise exception 'إدارة المدرسة فقط تستطيع فتح ترشيحات الشهر الثاني وإغلاقها' using errcode='42501';
  end if;
  if p_open is null then raise exception 'اختر حالة الترشيح' using errcode='23514'; end if;
  update public.school_terms set khairkom_second_month_open=p_open where id=p_term and active;
  if not found then raise exception 'اختر الفصل الدراسي النشط' using errcode='23514'; end if;
  return p_open;
end; $$;
revoke all on function public.set_khairkom_second_month_open(uuid,boolean) from public,anon;
grant execute on function public.set_khairkom_second_month_open(uuid,boolean) to authenticated;

create or replace function quran_private.assert_khairkom_second_month_open(p_term uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  -- Hold a shared row lock until the save commits so a simultaneous close is ordered.
  select khairkom_second_month_open into allowed from public.school_terms where id=p_term for share;
  if allowed is distinct from true then
    raise exception 'أغلقت الإدارة ترشيحات الشهر الثاني لجمعية خيركم. يمكنك استعراض الترشيحات المحفوظة.' using errcode='42501';
  end if;
end; $$;
revoke all on function quran_private.assert_khairkom_second_month_open(uuid) from public,anon,authenticated;

create or replace function quran_private.guard_khairkom_set_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare today date := (current_timestamp at time zone 'Asia/Riyadh')::date;
begin
  if new.period_no=2 then
    perform quran_private.assert_khairkom_second_month_open(new.term_id);
  else
    perform quran_private.assert_week_workflow_open(new.term_id,today-extract(dow from today)::integer);
  end if;
  return new;
end; $$;
revoke all on function quran_private.guard_khairkom_set_write() from public,anon,authenticated;

create or replace function quran_private.guard_khairkom_second_month_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; target_term uuid; target_period integer;
begin
  if tg_op='DELETE' then row_data:=to_jsonb(old); else row_data:=to_jsonb(new); end if;
  if tg_table_name='khairkom_nominations' then
    select term_id,period_no into target_term,target_period from public.khairkom_nomination_sets where id=(row_data->>'set_id')::uuid;
  else
    target_term:=(row_data->>'term_id')::uuid;
    target_period:=(row_data->>'period_no')::integer;
  end if;
  if target_period=2 then perform quran_private.assert_khairkom_second_month_open(target_term); end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;
revoke all on function quran_private.guard_khairkom_second_month_write() from public,anon,authenticated;
create trigger guard_khairkom_second_month_write before insert or update or delete on public.khairkom_nominations
for each row execute function quran_private.guard_khairkom_second_month_write();
create trigger guard_khairkom_second_month_write before insert or update or delete on quran_private.khairkom_external_nominees
for each row execute function quran_private.guard_khairkom_second_month_write();

-- Keep the original supervised addition implementation and its existing authorization.
do $$
declare definition text; old_check text := 'perform quran_private.assert_week_workflow_open(p_term,((current_timestamp at time zone ''Asia/Riyadh'')::date - extract(dow from (current_timestamp at time zone ''Asia/Riyadh'')::date)::integer));';
begin
  definition:=pg_get_functiondef('quran_private.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[])'::regprocedure);
  if position(old_check in definition)=0 then raise exception 'Unexpected nomination addition definition'; end if;
  execute replace(definition,old_check,'if p_period=1 then '||old_check||' end if;');
end; $$;
notify pgrst,'reload schema';
do $$ begin
  if exists(select 1 from khairkom_access_before b where
    b.nominations is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(n) order by set_id,student_id)::text,'')) from public.khairkom_nominations n)
    or b.sets is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from public.khairkom_nomination_sets s)
    or b.external is distinct from (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from quran_private.khairkom_external_nominees e)
  ) then raise exception 'Nomination data changed during installation'; end if;
end; $$;
commit;
