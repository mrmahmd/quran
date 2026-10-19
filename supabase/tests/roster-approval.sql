-- Approval and RLS integration tests. Every fixture and decision rolls back.
begin;
select set_config('request.jwt.claim.sub','',true);
create temp table approval_people as select
 (select username from public.teacher_accounts where active and auth_user_id is not null and username<>'quran17' order by username limit 1) as teacher,
 (select auth_user_id from public.teacher_accounts where active and auth_user_id is not null and username<>'quran17' order by username limit 1) as teacher_uid,
 (select auth_user_id from public.teacher_accounts where active and username='quran17') as supervisor_uid,
 (select auth_user_id from public.admin_accounts where active and auth_user_id is not null limit 1) as admin_uid;
do $$begin if exists(select 1 from approval_people where teacher_uid is null or supervisor_uid is null or admin_uid is null) then raise exception 'Activated teacher, supervisor and admin required'; end if; end;$$;
create temp table approval_original_ids as select id from public.students;
create temp table approval_snapshot as select
 (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.students s) as students,
 (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text,'')) from public.weekly_evaluations e) as grades,
 (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.report_id,e.student_id)::text,'')) from public.monthly_entries e) as monthly;
create temp table approval_ids as select gen_random_uuid() as student,gen_random_uuid() as inactive,gen_random_uuid() as review,gen_random_uuid() as term;
insert into public.students(id,teacher_username,full_name,student_code,active) select student,p.teacher,'اختبار موافقة أصلي','APPROVAL-'||student,true from approval_ids,approval_people p;
insert into public.students(id,teacher_username,full_name,student_code,active) select inactive,p.teacher,'اختبار استعادة','APPROVAL-'||inactive,false from approval_ids,approval_people p;
insert into public.school_terms(id,name,starts_on,ends_on,active) select term,'اختبار موافقات','2026-09-27','2026-10-01',false from approval_ids;
insert into public.weekly_reviews(id,teacher_username,term_id,week_start,status,knight_student_id) select review,p.teacher,term,'2026-09-27','submitted',student from approval_ids,approval_people p;
insert into public.weekly_evaluations(review_id,teacher_username,student_id,memorization,revision,improvement,commitment) select review,p.teacher,student,4,2,2,2 from approval_ids,approval_people p;
create temp table approval_requests(kind text,id uuid);
grant select on approval_people,approval_original_ids,approval_ids,approval_snapshot to authenticated;
grant select,insert on approval_requests to authenticated;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from approval_people),true);
set local role authenticated;
do $$declare added jsonb; req jsonb; before_count integer; begin
 begin perform public.add_own_students('[{"full_name":"ممنوع مباشر"}]'); raise exception 'Legacy addition bypassed approval'; exception when insufficient_privilege then null; end;
 begin perform public.manage_own_student((select student from approval_ids),'اختبار موافقة أصلي',false); raise exception 'Legacy archive bypassed approval'; exception when insufficient_privilege then null; end;
 req:=public.manage_own_student((select student from approval_ids),'اسم مصحح مباشر',true);
 if req->>'full_name'<>'اسم مصحح مباشر' then raise exception 'Name correction blocked'; end if;
 select count(*) into before_count from public.students;
 added:=public.request_roster_additions('[{"full_name":"اختبار إضافة موافق","student_code":"APPROVAL-ADD-1"},{"full_name":"اختبار إضافة مرفوض","student_code":"APPROVAL-ADD-2"}]');
 insert into approval_requests values('add',(added->0->>'id')::uuid),('reject',(added->1->>'id')::uuid);
 req:=public.request_roster_status((select student from approval_ids),false); insert into approval_requests values('archive',(req->>'id')::uuid);
 req:=public.request_roster_status((select inactive from approval_ids),true); insert into approval_requests values('restore',(req->>'id')::uuid);
 if (select count(*) from public.students)<>before_count or not (select active from public.students where id=(select student from approval_ids)) or (select active from public.students where id=(select inactive from approval_ids)) then raise exception 'Pending request changed roster'; end if;
 begin perform public.request_roster_status((select student from approval_ids),false); raise exception 'Duplicate pending request allowed'; exception when unique_violation then null; end;
 begin perform public.request_roster_additions('[{"full_name":"ممنوع حلقة أخرى"}]','quran17'); raise exception 'Cross-ring request allowed'; exception when insufficient_privilege then null; end;
 begin perform public.decide_roster_request((select id from approval_requests where kind='add'),true); raise exception 'Teacher approved own request'; exception when insufficient_privilege then null; end;
 begin insert into public.roster_change_requests(teacher_username,kind,student_name) values((select teacher from approval_people),'add','حقن مباشر'); raise exception 'Direct request insert allowed'; exception when insufficient_privilege then null; end;
 select count(*) into before_count from public.roster_change_requests;
 begin perform public.request_roster_additions('[{"full_name":"يجب التراجع عنه"},{"full_name":""}]'); raise exception 'Invalid batch accepted'; exception when check_violation then null; end;
 if (select count(*) from public.roster_change_requests)<>before_count then raise exception 'Request batch partially committed'; end if;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select supervisor_uid::text from approval_people),true);
set local role authenticated;
do $$begin
 begin perform public.manage_student((select student from approval_ids),'اسم مصحح مباشر',(select teacher from approval_people),false); raise exception 'Supervisor legacy archive bypassed approval'; exception when insufficient_privilege then null; end;
 begin insert into public.students(teacher_username,full_name) values((select teacher from approval_people),'ممنوع إضافة مشرف مباشرة'); raise exception 'Supervisor direct addition bypassed approval'; exception when insufficient_privilege then null; end;
 begin perform public.decide_roster_request((select id from approval_requests where kind='archive'),true); raise exception 'Supervisor can approve'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.roster_change_requests where id in(select id from approval_requests)) then raise exception 'Other teacher request history leaked to supervisor'; end if;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_uid::text from approval_people),true);
set local role authenticated;
do $$declare req jsonb; begin
 if (select count(*) from public.roster_change_requests where id in(select id from approval_requests))<>4 then raise exception 'Admin cannot see all requests'; end if;
 req:=public.decide_roster_request((select id from approval_requests where kind='add'),true,'تمت المراجعة');
 if req->>'status'<>'approved' or not exists(select 1 from public.students where id=(req->>'student_id')::uuid and active and teacher_username=(select teacher from approval_people)) then raise exception 'Approved addition not applied'; end if;
 req:=public.decide_roster_request((select id from approval_requests where kind='reject'),false,'مكرر');
 if req->>'status'<>'rejected' or exists(select 1 from public.students where student_code='APPROVAL-ADD-2') then raise exception 'Rejected addition applied'; end if;
 perform public.decide_roster_request((select id from approval_requests where kind='archive'),true);
 if (select active from public.students where id=(select student from approval_ids)) then raise exception 'Approved archive not applied'; end if;
 if (select full_name from public.students where id=(select student from approval_ids))<>'اسم مصحح مباشر' then raise exception 'Approval overwrote name correction'; end if;
 perform public.decide_roster_request((select id from approval_requests where kind='restore'),true);
 if not (select active from public.students where id=(select inactive from approval_ids)) then raise exception 'Approved restoration not applied'; end if;
 begin perform public.decide_roster_request((select id from approval_requests where kind='add'),true); raise exception 'Double approval accepted'; exception when serialization_failure then null; end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from approval_people),true);
set local role authenticated;
do $$declare req jsonb; begin
 req:=public.request_roster_status((select student from approval_ids),true);insert into approval_requests values('stale',(req->>'id')::uuid);
 if (select count(*) from public.roster_change_requests where id in(select id from approval_requests))<>5 then raise exception 'Teacher lost decision history'; end if;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_uid::text from approval_people),true);
set local role authenticated;
update public.students set active=true where id=(select student from approval_ids);
do $$begin
 begin perform public.decide_roster_request((select id from approval_requests where kind='stale'),true); raise exception 'Stale status request applied'; exception when check_violation then null; end;
 perform public.decide_roster_request((select id from approval_requests where kind='stale'),false,'حالة الطالب تغيرت');
end;$$;
reset role;
do $$begin
 if has_table_privilege('anon','public.roster_change_requests','SELECT') or has_function_privilege('anon','public.decide_roster_request(uuid,boolean,text)','EXECUTE') then raise exception 'Anonymous access'; end if;
 if not (select relrowsecurity from pg_class where oid='public.roster_change_requests'::regclass) then raise exception 'Request RLS missing'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'')) from public.students s where id in(select id from approval_original_ids))<>(select students from approval_snapshot) then raise exception 'Original students changed'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.review_id,e.student_id)::text,'')) from public.weekly_evaluations e where student_id in(select id from approval_original_ids))<>(select grades from approval_snapshot) then raise exception 'Original evaluations changed'; end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(e) order by e.report_id,e.student_id)::text,'')) from public.monthly_entries e)<>(select monthly from approval_snapshot) then raise exception 'Monthly reports changed'; end if;
 if not exists(select 1 from public.weekly_reviews where id=(select review from approval_ids) and knight_student_id=(select student from approval_ids)) or not exists(select 1 from public.weekly_evaluations where review_id=(select review from approval_ids)) then raise exception 'Student history lost'; end if;
end;$$;
rollback;
select 'PASS: requests do not mutate rosters; admin-only atomic approval/rejection; duplicate, stale and cross-ring requests blocked; old teacher/supervisor paths blocked; names stay editable; records preserved; all tests rolled back' as result;
