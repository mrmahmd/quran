-- All fixtures, account mappings and student edits are rolled back.
begin;
create temp table roster_fixture as select auth_user_id as uid,username as original_teacher from public.teacher_accounts where auth_user_id is not null and username<>'quran17' limit 1;
do $$begin if not exists(select 1 from roster_fixture) then raise exception 'An activated teacher is required'; end if; end;$$;
create temp table roster_ids as select gen_random_uuid() as student,gen_random_uuid() as review,(select id from public.school_terms limit 1) as term;
insert into public.students(id,teacher_username,full_name,student_code) select student,'quran02','اختبار مؤقت','ROLLBACK-FIXTURE' from roster_ids;
insert into public.weekly_reviews(id,teacher_username,term_id,week_start) select review,'quran02',term,'2026-09-27' from roster_ids;
insert into public.weekly_evaluations(review_id,student_id,teacher_username,memorization,revision,improvement,commitment) select review,student,'quran02',4,2,2,2 from roster_ids;
grant select on roster_fixture,roster_ids to authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from roster_fixture),true);
set local role authenticated;
do $$begin
 if public.is_roster_manager() then raise exception 'Ordinary teacher was granted manager access'; end if;
 begin
  perform public.manage_student((select student from roster_ids),'ممنوع','quran03',true);
  raise exception 'Ordinary teacher can edit rosters';
 exception when insufficient_privilege then null; end;
end;$$;
reset role;
-- Temporarily bind the test session to the supervisor without activating an account.
update public.teacher_accounts set auth_user_id=null,activated_at=null where username=(select original_teacher from roster_fixture);
update public.teacher_accounts set auth_user_id=(select uid from roster_fixture),activated_at=now() where username='quran17';
set local role authenticated;
do $$declare moved jsonb; restored jsonb; begin
 if not public.is_roster_manager() then raise exception 'Supervisor permission missing'; end if;
 if (select count(*) from public.teacher_accounts)<18 then raise exception 'Supervisor cannot see teachers'; end if;
 if (select count(*) from public.students)<234 then raise exception 'Supervisor cannot see rosters'; end if;
 if exists(select 1 from public.weekly_reviews where teacher_username<>'quran17') then raise exception 'Supervisor can read other teacher evaluations'; end if;
 moved:=public.manage_student((select student from roster_ids),'اختبار نقل','quran03',true);
 if (moved->>'id')::uuid=(select student from roster_ids) then raise exception 'Historic identity was changed'; end if;
 if (select active from public.students where id=(select student from roster_ids)) then raise exception 'Original student was not archived'; end if;
 restored:=public.manage_student((moved->>'id')::uuid,'اختبار تعديل','quran03',false);
 if (restored->>'active')::boolean then raise exception 'Archive failed'; end if;
 restored:=public.manage_student((moved->>'id')::uuid,'اختبار تعديل','quran03',true);
 if not (restored->>'active')::boolean then raise exception 'Restore failed'; end if;
 insert into public.students(teacher_username,full_name) values('quran03','إضافة اختبار');
 begin
  perform public.save_weekly_evaluation('quran03',(select term from roster_ids),'2026-09-27','[]'::jsonb,false,0);
  raise exception 'Supervisor can write another teacher scores';
 exception when insufficient_privilege then null; end;
end;$$;
reset role;
do $$begin if (select count(*) from public.weekly_evaluations where student_id=(select student from roster_ids))<>1 then raise exception 'Historic score lost'; end if; end;$$;
rollback;
select 'PASS: teacher denied; supervisor read/add/edit/archive/restore/transfer; scores isolated; history preserved; all test data rolled back' as result;
