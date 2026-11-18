-- For a chosen teacher and month, written memorization and revision amounts must name
-- start and end verses (surah + ayah); free text is no longer accepted.
-- Existing entries stay untouched. Only new or changed amounts are checked, so the teacher
-- can convert the old free-written amounts one student at a time with the current saves.
-- Apply after monthly-partial-drafts.sql. First rule: Mr. Jamal Abdelrahim, first month.
begin;
create table public.monthly_range_requirements (
 term_id uuid not null references public.school_terms(id),
 month_start date not null check(extract(day from month_start)=1),
 teacher_username text not null references public.teacher_accounts(username),
 created_at timestamptz not null default now(),
 primary key(term_id,month_start,teacher_username)
);
alter table public.monthly_range_requirements enable row level security;
revoke all on public.monthly_range_requirements from public,anon,authenticated;
grant select on public.monthly_range_requirements to authenticated;
grant all on public.monthly_range_requirements to service_role;
-- Same readers as the monthly reports: the teacher, the administration, and quran17.
create policy monthly_range_requirements_read on public.monthly_range_requirements for select to authenticated using (
 exists(select 1 from public.teacher_accounts t where t.username=teacher_username and t.auth_user_id=(select auth.uid()) and t.active)
 or exists(select 1 from public.teacher_accounts t where t.username='quran17' and t.auth_user_id=(select auth.uid()) and t.active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);

-- An amount written as text, without a structured start/end range.
create function quran_private.monthly_free_text(value jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(value->>'none','')='false' and length(btrim(coalesce(value->>'text','')))>0
  and jsonb_typeof(value->'range') is distinct from 'object';
$$;
revoke all on function quran_private.monthly_free_text(jsonb) from public,anon;
grant execute on function quran_private.monthly_free_text(jsonb) to authenticated,service_role;

create function quran_private.guard_monthly_range() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_mem jsonb; old_rev jsonb; student text;
begin
 if not exists(select 1 from public.monthly_reports r join public.monthly_range_requirements q
  on q.term_id=r.term_id and q.month_start=r.month_start and q.teacher_username=r.teacher_username
  where r.id=new.report_id) then return new; end if;
 -- The stored row (also seen by the INSERT step of save_monthly's ON CONFLICT upsert).
 select e.memorization,e.revision into old_mem,old_rev from public.monthly_entries e
  where e.report_id=new.report_id and e.student_id=new.student_id;
 if (quran_private.monthly_free_text(new.memorization) and new.memorization is distinct from old_mem)
 or (quran_private.monthly_free_text(new.revision) and new.revision is distinct from old_rev) then
  select s.full_name into student from public.students s where s.id=new.student_id;
  -- Default SQLSTATE (P0001): the dashboard shows Arabic messages as written; 23514 would be replaced.
  raise exception 'في هذا الشهر يُكتب الحفظ والمراجعة بتحديد سورة وآية البداية والنهاية. حدّد الآيات للطالب: %',coalesce(student,'');
 end if;
 return new;
end;$$;
revoke all on function quran_private.guard_monthly_range() from public,anon,authenticated;
create trigger guard_monthly_range before insert or update on public.monthly_entries
 for each row execute function quran_private.guard_monthly_range();

-- First rule: the first month of the active term for Mr. Jamal Abdelrahim.
do $$
declare teachers integer; terms integer;
begin
 select count(*) into teachers from public.teacher_accounts
  where active and replace(full_name,' ','') like '%جمالعبدالرحيم%';
 select count(*) into terms from public.school_terms where active;
 if teachers<>1 or terms<>1 then
  raise exception 'توقع حسابًا نشطًا واحدًا باسم جمال عبد الرحيم وفصلًا نشطًا واحدًا (وُجد % و%)',teachers,terms;
 end if;
 insert into public.monthly_range_requirements(term_id,month_start,teacher_username)
 select s.id,date_trunc('month',s.starts_on)::date,t.username
 from public.school_terms s cross join public.teacher_accounts t
 where s.active and t.active and replace(t.full_name,' ','') like '%جمالعبدالرحيم%';
end;$$;
commit;
