-- One administrative switch per term/week for every teacher's weekly work.
-- Existing weeks are open by default; this migration does not change any score or nomination.
begin;

create table if not exists public.weekly_workflow_access (
  term_id uuid not null references public.school_terms(id) on delete cascade,
  week_start date not null check (extract(dow from week_start) = 0),
  is_open boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (term_id, week_start)
);
alter table public.weekly_workflow_access enable row level security;
revoke all on public.weekly_workflow_access from public, anon, authenticated;
grant select on public.weekly_workflow_access to authenticated;
grant all on public.weekly_workflow_access to service_role;
create policy weekly_workflow_read on public.weekly_workflow_access
  for select to authenticated using (
    exists (select 1 from public.teacher_accounts t where t.auth_user_id = (select auth.uid()) and t.active)
    or exists (select 1 from public.admin_accounts a where a.auth_user_id = (select auth.uid()) and a.active)
  );

create function quran_private.assert_week_workflow_open(p_term uuid, p_week date)
returns void language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if exists (select 1 from public.admin_accounts a where a.auth_user_id = auth.uid() and a.active) then return; end if;
  select w.is_open into allowed from public.weekly_workflow_access w
    where w.term_id = p_term and w.week_start = p_week for share;
  if allowed is false then
    raise exception 'أغلقت الإدارة هذا الأسبوع أمام المعلمين. حدّث الصفحة.' using errcode = '42501';
  end if;
end; $$;
revoke all on function quran_private.assert_week_workflow_open(uuid,date) from public, anon, authenticated;

create function quran_private.guard_weekly_review_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform quran_private.assert_week_workflow_open(new.term_id, new.week_start);
  return new;
end; $$;
revoke all on function quran_private.guard_weekly_review_write() from public, anon, authenticated;
create trigger guard_weekly_review_write before insert or update on public.weekly_reviews
  for each row execute function quran_private.guard_weekly_review_write();

create function quran_private.guard_khairkom_set_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare current_day date; current_week date;
begin
  current_day := (current_timestamp at time zone 'Asia/Riyadh')::date;
  current_week := current_day - extract(dow from current_day)::integer;
  perform quran_private.assert_week_workflow_open(new.term_id, current_week);
  return new;
end; $$;
revoke all on function quran_private.guard_khairkom_set_write() from public, anon, authenticated;
create trigger guard_khairkom_set_write before insert or update on public.khairkom_nomination_sets
  for each row execute function quran_private.guard_khairkom_set_write();

create function public.set_week_workflow_open(p_term uuid, p_week date, p_open boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_accounts a where a.auth_user_id = auth.uid() and a.active
  ) then raise exception 'إدارة المدرسة فقط تستطيع فتح الأسبوع أو إغلاقه' using errcode = '42501'; end if;
  if p_open is null or p_week is null or extract(dow from p_week) <> 0 or not exists (
    select 1 from public.school_terms t where t.id = p_term and t.active
      and p_week <= t.ends_on and p_week + 6 >= t.starts_on
  ) then raise exception 'اختر أسبوعًا صحيحًا من الفصل الدراسي النشط' using errcode = '23514'; end if;
  insert into public.weekly_workflow_access(term_id,week_start,is_open,updated_by)
    values(p_term,p_week,p_open,auth.uid())
    on conflict(term_id,week_start) do update set
      is_open = excluded.is_open, updated_at = now(), updated_by = excluded.updated_by;
end; $$;
revoke all on function public.set_week_workflow_open(uuid,date,boolean) from public, anon;
grant execute on function public.set_week_workflow_open(uuid,date,boolean) to authenticated;

commit;
