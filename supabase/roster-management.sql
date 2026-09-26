-- Apply after dashboard.sql. No student names or supervisor assignments here.
begin;
alter table public.school_terms add column if not exists first_week_number integer not null default 1 check (first_week_number between 1 and 100);
alter table public.students add column if not exists source_class text not null default '';
alter table public.students add column if not exists memorization_note text not null default '';
alter table public.teacher_accounts add column if not exists ring_name text not null default '';
grant select(ring_name) on public.teacher_accounts to authenticated;

create table if not exists quran_private.roster_supervisors (
 teacher_username text primary key references public.teacher_accounts(username),
 active boolean not null default true
);
alter table quran_private.roster_supervisors enable row level security;
revoke all on quran_private.roster_supervisors from public,anon,authenticated;

create or replace function quran_private.is_roster_manager() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 exists(select 1 from public.admin_accounts a where a.auth_user_id=auth.uid() and a.active)
 or exists(select 1 from quran_private.roster_supervisors s join public.teacher_accounts t on t.username=s.teacher_username where t.auth_user_id=auth.uid() and t.active and s.active));
$$;
revoke all on function quran_private.is_roster_manager() from public,anon;
grant execute on function quran_private.is_roster_manager() to authenticated;
create or replace function public.is_roster_manager() returns boolean language sql stable security invoker set search_path='' as $$select quran_private.is_roster_manager();$$;
revoke all on function public.is_roster_manager() from public,anon;
grant execute on function public.is_roster_manager() to authenticated;

create policy roster_manager_reads_students on public.students for select to authenticated using ((select quran_private.is_roster_manager()));
create policy roster_manager_reads_teachers on public.teacher_accounts for select to authenticated using ((select quran_private.is_roster_manager()));
create policy roster_manager_adds_students on public.students for insert to authenticated with check ((select quran_private.is_roster_manager()) and exists(select 1 from public.teacher_accounts where username=teacher_username and active));

-- Transfer keeps historic evaluations linked to the original archived record.
create or replace function quran_private.manage_student(p_id uuid,p_name text,p_teacher text,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.students; changed public.students;
begin
 if not quran_private.is_roster_manager() then raise exception 'ليس لديك صلاحية إدارة الطلاب' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 150 or p_active is null then raise exception 'راجع اسم الطالب' using errcode='23514'; end if;
 if not exists(select 1 from public.teacher_accounts where username=p_teacher and active) then raise exception 'المعلم غير نشط' using errcode='23514'; end if;
 select * into old from public.students where id=p_id for update;
 if not found then raise exception 'الطالب غير موجود' using errcode='23514'; end if;
 if old.teacher_username<>p_teacher and (exists(select 1 from public.weekly_evaluations where student_id=p_id) or exists(select 1 from public.semester_honors where student_id=p_id)) then
   update public.students set active=false where id=p_id;
   insert into public.students(teacher_username,full_name,student_code,active,source_class,memorization_note)
   values(p_teacher,btrim(p_name),'TRANSFER-'||p_id::text,p_active,old.source_class,old.memorization_note) returning * into changed;
 else
   update public.students set full_name=btrim(p_name),teacher_username=p_teacher,active=p_active where id=p_id returning * into changed;
 end if;
 return to_jsonb(changed);
end;$$;
revoke all on function quran_private.manage_student(uuid,text,text,boolean) from public,anon;
grant execute on function quran_private.manage_student(uuid,text,text,boolean) to authenticated;
create or replace function public.manage_student(p_id uuid,p_name text,p_teacher text,p_active boolean) returns jsonb language sql security invoker set search_path='' as $$select quran_private.manage_student(p_id,p_name,p_teacher,p_active);$$;
revoke all on function public.manage_student(uuid,text,text,boolean) from public,anon;
grant execute on function public.manage_student(uuid,text,text,boolean) to authenticated;
commit;
