-- Applied 2026-11-20: class names without a slash, ring names removed, Mohamed Saeed (quran03) and
-- Jamal Abdelrahim (quran09) swap classes 7B/6B with students following the class (the platform's
-- manage_student archives each moved student's record with its history and starts a new one),
-- Mohamed Nimr (quran17) on leave, and every student's source_class written as 1A/9B. One transaction
-- with checks: saved evaluations, reports, nominations and honors unchanged. Do not run again.
begin;
-- Act as the administration for the platform's own roster function (archive + new record when history exists).
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.admin_accounts where email like 'mr.mahmd@%' and active),true);
select set_config('request.jwt.claims',json_build_object('sub',(select auth_user_id::text from public.admin_accounts where email like 'mr.mahmd@%' and active),'role','authenticated')::text,true);
create temp table before_counts on commit drop as select
 (select count(*) from public.weekly_reviews) wr,(select count(*) from public.weekly_evaluations) we,(select count(*) from public.monthly_reports) mr,
 (select count(*) from public.monthly_entries) me,(select count(*) from public.khairkom_nominations) kn,(select count(*) from public.semester_honors) sh,
 (select count(*) from public.students where active) active_students;
-- 1) Students follow the class: Jamal's 6/B students -> Mohamed Saeed; Mohamed Saeed's students -> Jamal.
create temp table move_list on commit drop as
 select id, full_name, teacher_username from_t, case teacher_username when 'quran09' then 'quran03' else 'quran09' end to_t
 from public.students where teacher_username in ('quran03','quran09') and active;
select count(*) filter (where from_t='quran09') from_jamal, count(*) filter (where from_t='quran03') from_saeed from move_list;
select count(*) moved from (select quran_private.manage_student(id, full_name, to_t, true) from move_list) m;
-- 2) Class names without a slash; ring names removed; Mohamed Nimr on leave. Two steps for the unique class names.
update public.teacher_accounts set class_name='TMP-'||username;
update public.teacher_accounts t set class_name=v.c, ring_name='' from (values
 ('quran01','1A'),('quran12','1B'),('quran08','2A'),('quran04','3A'),('quran20','3B'),('quran02','4A'),('quran07','4B'),
 ('quran06','5A'),('quran14','5B'),('quran10','6A'),('quran03','6B'),('quran11','7A'),('quran09','7B'),('quran13','8A'),
 ('quran15','8B'),('quran19','9B'),('quran16','10A'),('quran18','10B'),('quran17','إجازة')) v(u,c) where t.username=v.u;
-- 3) Every student's own class written the same way: 1/A, 9a, "8 A" -> 1A, 9A, 8A.
update public.students set source_class=upper(regexp_replace(source_class,'[\s/]','','g'))
 where source_class ~* '^\s*\d{1,2}\s*/?\s*[a-z]\s*$' and source_class <> upper(regexp_replace(source_class,'[\s/]','','g'));
-- Checks: nothing saved changed, the two rings swapped, every class set.
do $$declare b record; begin
 select * into b from before_counts;
 if (select count(*) from public.weekly_reviews)<>b.wr or (select count(*) from public.weekly_evaluations)<>b.we or (select count(*) from public.monthly_reports)<>b.mr
  or (select count(*) from public.monthly_entries)<>b.me or (select count(*) from public.khairkom_nominations)<>b.kn or (select count(*) from public.semester_honors)<>b.sh
  then raise exception 'Saved history changed'; end if;
 if (select count(*) from public.students where active)<>b.active_students then raise exception 'Active student count changed'; end if;
 if (select count(*) from public.students s join move_list m on s.full_name=m.full_name and s.teacher_username=m.to_t and s.active)<>(select count(*) from move_list) then raise exception 'A student did not reach the new teacher'; end if;
 if exists(select 1 from public.teacher_accounts where class_name like 'TMP-%') then raise exception 'A class name was not set'; end if;
end$$;
select username, full_name, class_name, ring_name, (select count(*) from public.students s where s.teacher_username=t.username and s.active) active_students,
 (select string_agg(distinct coalesce(nullif(s.source_class,''),'—'),', ') from public.students s where s.teacher_username=t.username and s.active) student_classes
from public.teacher_accounts t order by username;
commit;
