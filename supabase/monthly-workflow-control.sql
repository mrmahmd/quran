-- One monthly switch for all teachers. Existing reports and amounts remain intact.
begin;
create table public.monthly_workflow_access (
 term_id uuid not null references public.school_terms(id),
 month_start date not null check(extract(day from month_start)=1),
 is_open boolean not null default true,
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id),
 primary key(term_id,month_start)
);
alter table public.monthly_workflow_access enable row level security;
revoke all on public.monthly_workflow_access from public,anon,authenticated;
grant select on public.monthly_workflow_access to authenticated;
grant all on public.monthly_workflow_access to service_role;
create policy monthly_workflow_read on public.monthly_workflow_access for select to authenticated using (
 exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create function public.set_month_workflow_open(p_term uuid,p_month date,p_open boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then
  raise exception 'إدارة المدرسة فقط تستطيع فتح الشهر أو إغلاقه' using errcode='42501';
 end if;
 if p_open is null or p_month is null or extract(day from p_month)<>1 or not exists(
  select 1 from public.school_terms where id=p_term and active and p_month>=date_trunc('month',starts_on)::date
  and p_month<(date_trunc('month',starts_on)+interval '4 months')::date
 ) then raise exception 'اختر شهرًا من الأول إلى الرابع للفصل الدراسي النشط';end if;
 perform pg_advisory_xact_lock(hashtextextended('monthly-access'||p_term::text||p_month::text,0));
 insert into public.monthly_workflow_access(term_id,month_start,is_open,updated_by) values(p_term,p_month,p_open,auth.uid())
 on conflict(term_id,month_start) do update set is_open=excluded.is_open,updated_at=now(),updated_by=excluded.updated_by;
end;$$;
revoke all on function public.set_month_workflow_open(uuid,date,boolean) from public,anon;
grant execute on function public.set_month_workflow_open(uuid,date,boolean) to authenticated;
create function quran_private.guard_monthly_report_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('monthly-access'||new.term_id::text||new.month_start::text,0));
 if exists(select 1 from public.monthly_workflow_access where term_id=new.term_id and month_start=new.month_start and not is_open)
 and not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then
  raise exception 'هذا الشهر مغلق من الإدارة؛ لا يمكن حفظ التقرير حتى تعيد الإدارة فتحه.' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function quran_private.guard_monthly_report_write() from public,anon,authenticated;
create trigger guard_monthly_report_write before insert or update on public.monthly_reports
 for each row execute function quran_private.guard_monthly_report_write();
commit;
