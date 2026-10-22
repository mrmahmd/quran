-- Integration test on activated accounts. All fixtures and changes roll back.
begin isolation level repeatable read;
select set_config('request.jwt.claim.sub','',true);
create temp table edit_original as select
 (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'')) from public.weekly_reviews r) reviews,
 (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text,'')) from public.weekly_evaluations e) scores;
create temp table edit_fixture as select gen_random_uuid() term_id,gen_random_uuid() review_id,
 gen_random_uuid() s1,gen_random_uuid() s2,gen_random_uuid() later_student,
 (select username from public.teacher_accounts where active and auth_user_id is not null order by username limit 1) teacher,
 (select auth_user_id from public.teacher_accounts where active and auth_user_id is not null order by username limit 1) teacher_uid,
 (select username from public.teacher_accounts where active and auth_user_id is not null order by username offset 1 limit 1) other_teacher,
 ((current_timestamp at time zone 'Asia/Riyadh')::date-extract(dow from current_timestamp at time zone 'Asia/Riyadh')::int) w;
do $$begin if exists(select 1 from edit_fixture where teacher_uid is null or other_teacher is null) then raise exception 'Two activated teachers required'; end if; end;$$;
insert into public.school_terms(id,name,starts_on,ends_on,active) select term_id,'TEST WEEKLY EDIT - ROLLBACK',w-7,w+7,true from edit_fixture;
insert into public.students(id,teacher_username,full_name,active)
 select s1,teacher,'TEST EDIT ACTIVE',true from edit_fixture union all
 select s2,teacher,'TEST EDIT ARCHIVED',false from edit_fixture union all
 select later_student,teacher,'TEST EDIT LATER STUDENT',true from edit_fixture;
insert into public.weekly_reviews(id,teacher_username,term_id,week_start,status,submitted_at,version,knight_student_id,knight_note)
 select review_id,teacher,term_id,w,'submitted',now()-interval '2 days',7,s1,'TEST MANUAL CHAMPION' from edit_fixture;
insert into public.weekly_evaluations(review_id,teacher_username,student_id,memorization,revision,improvement,commitment,bonus_memorization,bonus_revision)
 select review_id,teacher,s1,2,2,2,2,0,0 from edit_fixture union all select review_id,teacher,s2,2,2,2,2,0,0 from edit_fixture;
create temp table edit_results(test text,passed boolean);
grant select on edit_fixture to authenticated;
grant select,insert on edit_results to authenticated;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from edit_fixture),true);
set local role authenticated;
do $$declare f record; rows jsonb; saved jsonb; blocked boolean; before_hash text; after_hash text; stamp timestamptz;
begin
 select * into f from edit_fixture;
 rows:=jsonb_build_array(jsonb_build_object('student_id',f.s1,'memorization',0,'revision',2,'improvement',2,'commitment',2,'bonus_memorization',1,'bonus_revision',0),jsonb_build_object('student_id',f.s2,'memorization',4,'revision',2,'improvement',2,'commitment',2,'bonus_memorization',0,'bonus_revision',0));
 select submitted_at into stamp from public.weekly_reviews where id=f.review_id;
 saved:=public.save_weekly_evaluation(f.teacher,f.term_id,f.w,rows,true,7);
 if saved->>'status'<>'submitted' or (saved->>'version')::int<>8 or saved->>'id'<>f.review_id::text then raise exception 'Saved submitted edit/version failed'; end if;
 if saved->>'knight_student_id'<>f.s1::text or saved->>'knight_note'<>'TEST MANUAL CHAMPION' or (saved->>'submitted_at')::timestamptz<>stamp then raise exception 'Champion or submission history changed'; end if;
 if (select count(*) from public.weekly_evaluations where review_id=f.review_id)<>2 or not exists(select 1 from public.weekly_evaluations where review_id=f.review_id and student_id=f.s2 and total=10) or not exists(select 1 from public.weekly_evaluations where review_id=f.review_id and student_id=f.s1 and total=7) then raise exception 'Historical roster, zero or bonus was not preserved'; end if;
 insert into edit_results values('submitted edit preserves ID, champion, zero, bonus, archived roster and submission stamp',true);
 blocked:=false;begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,rows,true,7);exception when others then blocked:=position('تم تحديث' in sqlerrm)>0;end;
 if not blocked then raise exception 'Stale edit was accepted';end if;
 insert into edit_results values('stale version rejected',true);
 blocked:=false;begin perform public.save_weekly_evaluation(f.other_teacher,f.term_id,f.w,rows,true,0);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross teacher edit accepted';end if;
 insert into edit_results values('other teacher remains inaccessible',true);
 blocked:=false;begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,rows,false,8);exception when others then blocked:=position('يظل معتمد' in sqlerrm)>0;end;
 if not blocked then raise exception 'Approved record was downgraded';end if;
 insert into edit_results values('submitted record cannot be downgraded to draft',true);
 blocked:=false;begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,rows||jsonb_build_array(jsonb_set(rows->0,'{student_id}',to_jsonb(f.later_student::text))),true,8);exception when others then blocked:=position('قائمة الطلاب' in sqlerrm)>0;end;
 if not blocked then raise exception 'Later student changed historical roster';end if;
 insert into edit_results values('new students cannot rewrite submitted roster',true);
 select md5(jsonb_agg(to_jsonb(e) order by e.student_id)::text) into before_hash from public.weekly_evaluations e where review_id=f.review_id;
 blocked:=false;begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,jsonb_set(jsonb_set(rows,'{0,memorization}','3'),'{1,commitment}','null'),true,8);exception when others then blocked:=position('أكمل نقاط' in sqlerrm)>0;end;
 select md5(jsonb_agg(to_jsonb(e) order by e.student_id)::text) into after_hash from public.weekly_evaluations e where review_id=f.review_id;
 if not blocked or before_hash<>after_hash then raise exception 'Incomplete edit changed persisted scores';end if;
 insert into edit_results values('incomplete edit rolls back atomically',true);
 blocked:=false;begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,jsonb_set(rows,'{0,memorization}','5'),true,8);exception when check_violation then blocked:=true;end;
 if not blocked then raise exception 'Invalid score accepted';end if;
 insert into edit_results values('score bounds remain enforced',true);
end;$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.weekly_workflow_access(term_id,week_start,is_open) select term_id,w,false from edit_fixture;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from edit_fixture),true);
set local role authenticated;
do $$declare f record; blocked boolean:=false;begin
 select * into f from edit_fixture;
 begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,'[]',true,8);exception when insufficient_privilege then blocked:=position('أغلقت الإدارة' in sqlerrm)>0;end;
 if not blocked then raise exception 'Closed week accepted edit';end if;
 insert into edit_results values('admin closed week blocks teacher edits',true);
end;$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.school_terms set active=false where id=(select term_id from edit_fixture);
select set_config('request.jwt.claim.sub',(select teacher_uid::text from edit_fixture),true);
set local role authenticated;
do $$declare f record; blocked boolean:=false;begin
 select * into f from edit_fixture;
 begin perform public.save_weekly_evaluation(f.teacher,f.term_id,f.w,'[]',true,8);exception when others then blocked:=position('الفصل الدراسي النشط' in sqlerrm)>0;end;
 if not blocked then raise exception 'Inactive term accepted edit';end if;
 insert into edit_results values('inactive term blocks teacher edits',true);
end;$$;
reset role;
do $$declare f record; old record;begin
 select * into f from edit_fixture;select * into old from edit_original;
 if old.reviews<>(select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'')) from public.weekly_reviews r where id<>f.review_id) or old.scores<>(select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text,'')) from public.weekly_evaluations e where review_id<>f.review_id) then raise exception 'Real evaluation data changed';end if;
 insert into edit_results values('all existing real reviews and scores remain unchanged',true);
 if has_function_privilege('anon','public.save_weekly_evaluation(text,uuid,date,jsonb,boolean,integer)','EXECUTE') then raise exception 'Anonymous API access exposed';end if;
 insert into edit_results values('anonymous remains blocked',true);
end;$$;
select jsonb_build_object('passed',count(*),'results',jsonb_agg(to_jsonb(r) order by test),'fixtures','ALL ROLLED BACK') as weekly_edit_tests from edit_results r;
rollback;
