-- Real authorization identities; all fixtures and changes roll back.
begin;
create temp table own_roster_fixture as
select username,auth_user_id as uid,class_name from public.teacher_accounts
where active and auth_user_id is not null and username not in ('quran17')
and not exists(select 1 from public.admin_accounts a where a.auth_user_id=teacher_accounts.auth_user_id and a.active)
order by username limit 1;
do $$begin if not exists(select 1 from own_roster_fixture) then raise exception 'An activated ordinary teacher is required'; end if; end;$$;
create temp table own_roster_ids as select gen_random_uuid() as student,gen_random_uuid() as term,gen_random_uuid() as review,
 (select id from public.students where teacher_username<>(select username from own_roster_fixture) limit 1) as other_student;
insert into public.school_terms(id,name,starts_on,ends_on,active) select term,'اختبار مؤقت لإدارة الحلقة','2026-09-27','2026-10-01',false from own_roster_ids;
insert into public.students(id,teacher_username,full_name,student_code,source_class) select student,f.username,'اختبار تاريخ محفوظ','OWN-ROSTER-'||student::text,f.class_name from own_roster_ids,own_roster_fixture f;
insert into public.weekly_reviews(id,teacher_username,term_id,week_start,status,knight_student_id)
select review,f.username,term,'2026-09-27','submitted',student from own_roster_ids,own_roster_fixture f;
insert into public.weekly_evaluations(review_id,teacher_username,student_id,memorization,revision,improvement,commitment)
select review,f.username,student,4,2,2,2 from own_roster_ids,own_roster_fixture f;
create temp table own_roster_snapshot as select
 md5(coalesce((select jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text from public.weekly_evaluations e),'')) as grades,
 md5(coalesce((select jsonb_agg(to_jsonb(e) order by e.report_id,e.student_id)::text from public.monthly_entries e),'')) as monthly,
 md5(coalesce((select jsonb_agg(to_jsonb(s) order by s.id)::text from public.students s where teacher_username<>(select username from own_roster_fixture)),'')) as others;
grant select on own_roster_fixture,own_roster_ids,own_roster_snapshot to authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from own_roster_fixture),true);
set local role authenticated;
do $$declare added jsonb; row jsonb; affected integer; before_count integer; begin
 if public.is_roster_manager() then raise exception 'Teacher gained supervisor access'; end if;
 if exists(select 1 from public.students where teacher_username<>(select username from own_roster_fixture)) then raise exception 'Other rosters leaked'; end if;
 added:=public.add_own_students('[{"full_name":"اختبار إضافة طالب خاص","student_code":"000123-ROSTER"}]');
 if jsonb_array_length(added)<>1 or not exists(select 1 from public.students where id=(added->0->>'id')::uuid and teacher_username=(select username from own_roster_fixture) and source_class=(select class_name from own_roster_fixture) and active) then raise exception 'Owner/class inference failed'; end if;
 begin perform public.add_own_students('[{"full_name":"محاولة توجيه","teacher_username":"quran17"}]'); raise exception 'Teacher override accepted'; exception when insufficient_privilege then null; end;
 select count(*) into before_count from public.students;
 begin perform public.add_own_students('[{"full_name":"يجب التراجع عنه"},{"full_name":""}]'); raise exception 'Invalid batch accepted'; exception when check_violation then null; end;
 if (select count(*) from public.students)<>before_count then raise exception 'Batch was partially inserted'; end if;
 begin perform public.add_own_students('[{"full_name":"اختبار إضافة طالب خاص","student_code":"000123-ROSTER"}]'); raise exception 'Duplicate accepted'; exception when unique_violation then null; end;
 row:=public.manage_own_student((select student from own_roster_ids),'اختبار اسم معدل',true);
 if row->>'full_name'<>'اختبار اسم معدل' then raise exception 'Rename failed'; end if;
 row:=public.manage_own_student((select student from own_roster_ids),'اختبار اسم معدل',false);
 if (row->>'active')::boolean then raise exception 'Archive failed'; end if;
 row:=public.manage_own_student((select student from own_roster_ids),'اختبار اسم معدل',true);
 if not (row->>'active')::boolean or row->>'teacher_username'<>(select username from own_roster_fixture) then raise exception 'Restore changed ownership'; end if;
 begin perform public.manage_own_student((select other_student from own_roster_ids),'ممنوع',false); raise exception 'Other student editable'; exception when insufficient_privilege then null; end;
 begin perform public.manage_student((select student from own_roster_ids),'ممنوع النقل','quran17',true); raise exception 'Teacher can transfer'; exception when insufficient_privilege then null; end;
 begin perform public.manage_own_student((select student from own_roster_ids),' ',true); raise exception 'Blank name accepted'; exception when check_violation then null; end;
 update public.students set teacher_username='quran17' where id=(select student from own_roster_ids);
 get diagnostics affected=row_count; if affected<>0 then raise exception 'Direct ownership reassignment succeeded'; end if;
end;$$;
reset role;
do $$begin
 if not (select relrowsecurity from pg_class where oid='public.students'::regclass) then raise exception 'Students RLS disabled'; end if;
 if has_function_privilege('anon','public.add_own_students(jsonb)','EXECUTE') or has_function_privilege('anon','public.manage_own_student(uuid,text,boolean)','EXECUTE') then raise exception 'Anonymous write allowed'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text,'')) from public.weekly_evaluations e)<>(select grades from own_roster_snapshot) then raise exception 'Grades changed'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.report_id,e.student_id)::text,'')) from public.monthly_entries e)<>(select monthly from own_roster_snapshot) then raise exception 'Monthly data changed'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.students s where teacher_username<>(select username from own_roster_fixture))<>(select others from own_roster_snapshot) then raise exception 'Other roster changed'; end if;
 if not exists(select 1 from public.weekly_reviews where id=(select review from own_roster_ids) and knight_student_id=(select student from own_roster_ids)) then raise exception 'Champion lost'; end if;
end;$$;
update public.teacher_accounts set active=false where username=(select username from own_roster_fixture);
set local role authenticated;
do $$begin
 begin perform public.add_own_students('[{"full_name":"ممنوع حساب غير نشط"}]'); raise exception 'Inactive account can add'; exception when insufficient_privilege then null; end;
 begin perform public.manage_own_student((select student from own_roster_ids),'ممنوع',false); raise exception 'Inactive account can edit'; exception when insufficient_privilege then null; end;
end;$$;
reset role;
rollback;
select 'PASS: own add/rename/archive/restore; cross-ring and transfer denied; atomic validation; inactive/anon denied; grades, monthly data, champion and other rosters preserved; all tests rolled back' as result;
