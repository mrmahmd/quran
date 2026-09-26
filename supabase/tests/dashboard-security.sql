-- Integration tests on existing activated accounts, with all fixtures rolled
-- back. Run in a SQL session capable of SET ROLE. No account is activated here.
begin;
create temporary table dashboard_fixture(term_id uuid,s1 uuid,s2 uuid,t1 text,t2 text,w date);
create temporary table dashboard_results(test text,passed boolean);
grant select on dashboard_fixture to authenticated;
grant insert,select on dashboard_results to authenticated;
insert into dashboard_fixture select gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),
 (select username from public.teacher_accounts where auth_user_id is not null and active order by username limit 1),
 (select username from public.teacher_accounts where auth_user_id is not null and active order by username offset 1 limit 1),
 current_date-extract(dow from current_date)::integer;
insert into public.school_terms(id,name,starts_on,ends_on) select term_id,'TEST - ROLLBACK',w-7,w+7 from dashboard_fixture;
insert into public.students(id,teacher_username,full_name) select s1,t1,'TEST A - ROLLBACK' from dashboard_fixture
 union all select s2,t2,'TEST B - ROLLBACK' from dashboard_fixture;
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.teacher_accounts where username=(select t1 from dashboard_fixture)),true);
set local role authenticated;
do $$
declare f record; r jsonb; rows jsonb;
begin
 select * into f from dashboard_fixture;
 insert into dashboard_results values('teacher sees own roster only',(select count(*)=1 from public.students where id in(f.s1,f.s2)));
 insert into dashboard_results values('no direct result writes',not has_table_privilege('authenticated','public.weekly_evaluations','INSERT') and not has_table_privilege('authenticated','public.weekly_reviews','UPDATE'));
 begin
  insert into public.students(teacher_username,full_name) values(f.t1,'DENIED');
  insert into dashboard_results values('teacher cannot add students',false);
 exception when insufficient_privilege then insert into dashboard_results values('teacher cannot add students',true); end;
 begin
  perform public.save_weekly_evaluation(f.t2,f.term_id,f.w,'[]',false,0);
  insert into dashboard_results values('cross teacher write blocked',false);
 exception when insufficient_privilege then insert into dashboard_results values('cross teacher write blocked',true); end;
 begin
  perform public.save_weekly_evaluation(f.t1,f.term_id,f.w,null,true,0);
  insert into dashboard_results values('null payload cannot submit',false);
 exception when others then insert into dashboard_results values('null payload cannot submit',true); end;
 rows:=jsonb_build_array(jsonb_build_object('student_id',f.s1,'memorization',4,'revision',2,'improvement',2,'commitment',2,'bonus_memorization',1,'bonus_revision',1));
 begin
  perform public.save_weekly_evaluation(f.t1,f.term_id,f.w,jsonb_set(rows,'{0,memorization}','5'),true,0);
  insert into dashboard_results values('score bounds enforced',false);
 exception when check_violation then insert into dashboard_results values('score bounds enforced',true); end;
 r:=public.save_weekly_evaluation(f.t1,f.term_id,f.w,rows,false,0);
 insert into dashboard_results values('draft round trip',(select total=12 from public.weekly_evaluations where review_id=(r->>'id')::uuid));
 begin
  perform public.save_weekly_evaluation(f.t1,f.term_id,f.w,rows,false,0);
  insert into dashboard_results values('stale version blocked',false);
 exception when others then insert into dashboard_results values('stale version blocked',true); end;
 begin
  perform public.save_weekly_evaluation(f.t1,f.term_id,f.w,jsonb_set(rows,'{0,commitment}','null'),true,1);
  insert into dashboard_results values('incomplete submission blocked',false);
 exception when others then insert into dashboard_results values('incomplete submission blocked',true); end;
 r:=public.save_weekly_evaluation(f.t1,f.term_id,f.w,rows,true,1);
 insert into dashboard_results values('submission stores approved state',r->>'status'='submitted' and (r->>'version')::int=2);
 begin
  perform public.save_weekly_evaluation(f.t1,f.term_id,f.w,rows,false,2);
  insert into dashboard_results values('approved week locked',false);
 exception when others then insert into dashboard_results values('approved week locked',true); end;
 begin
  perform public.choose_weekly_knight((r->>'id')::uuid,f.s2,'',2);
  insert into dashboard_results values('foreign knight blocked',false);
 exception when others then insert into dashboard_results values('foreign knight blocked',true); end;
 r:=public.choose_weekly_knight((r->>'id')::uuid,f.s1,'TEST',2);
 insert into dashboard_results values('knight round trip',r->>'knight_student_id'=f.s1::text);
 perform public.save_semester_honors(f.t1,f.term_id,array[f.s1],'TEST');
 insert into dashboard_results values('honors round trip',(select count(*)=1 from public.semester_honors where term_id=f.term_id));
 begin
  perform public.save_semester_honors(f.t1,f.term_id,array[f.s2],'TEST');
  insert into dashboard_results values('foreign honor blocked',false);
 exception when others then insert into dashboard_results values('foreign honor blocked',true); end;
 begin
  perform public.reopen_weekly_evaluation((r->>'id')::uuid,3);
  insert into dashboard_results values('teacher cannot reopen',false);
 exception when insufficient_privilege then insert into dashboard_results values('teacher cannot reopen',true); end;
end; $$;
reset role;
-- Existing second teacher temporarily represents an admin inside this
-- uncommitted test transaction. The original mapping is restored by ROLLBACK.
update public.admin_accounts set auth_user_id=(select auth_user_id from public.teacher_accounts where username=(select t2 from dashboard_fixture)),activated_at=now() where email='mbaazeem@as.edu.sa';
select set_config('request.jwt.claim.sub',(select auth_user_id::text from public.teacher_accounts where username=(select t2 from dashboard_fixture)),true);
set local role authenticated;
do $$
declare f record; r record;
begin
 select * into f from dashboard_fixture;
 insert into dashboard_results values('admin sees both rosters',(select count(*)=2 from public.students where id in(f.s1,f.s2)));
 select * into r from public.weekly_reviews where teacher_username=f.t1 and term_id=f.term_id;
 perform public.reopen_weekly_evaluation(r.id,r.version);
 insert into dashboard_results values('admin can reopen',(select status='draft' and knight_student_id is null from public.weekly_reviews where id=r.id));
end; $$;
reset role;
insert into dashboard_results values('anonymous has no table or RPC access',
 not has_table_privilege('anon','public.students','SELECT') and
 not has_function_privilege('anon','public.save_weekly_evaluation(text,uuid,date,jsonb,boolean,integer)','EXECUTE'));
select test,passed from dashboard_results order by test;
rollback;
