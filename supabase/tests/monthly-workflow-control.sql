-- Run on the installed project. Temporary gates and saves are rolled back.
begin;
do $$begin
 if not (select relrowsecurity from pg_class where oid='public.monthly_workflow_access'::regclass)
 or has_table_privilege('anon','public.monthly_workflow_access','select')
 or has_table_privilege('authenticated','public.monthly_workflow_access','insert')
 or has_table_privilege('authenticated','public.monthly_workflow_access','update')
 or has_function_privilege('anon','public.set_month_workflow_open(uuid,date,boolean)','execute')
 or has_function_privilege('authenticated','quran_private.guard_monthly_report_write()','execute')
 then raise exception 'Monthly workflow grants or RLS are unsafe';end if;
end;$$;
create temp table month_test_ids as select
 (select auth_user_id from public.admin_accounts where active and auth_user_id is not null limit 1) admin_uid,
 (select auth_user_id from public.teacher_accounts where active and auth_user_id is not null and username='quran06') teacher_uid,
 (select id from public.school_terms where active order by starts_on desc limit 1) term_id;
grant select on month_test_ids to authenticated;
do $$begin if exists(select 1 from month_test_ids where admin_uid is null or teacher_uid is null or term_id is null) then raise exception 'Activated admin, teacher and term required';end if;end;$$;
select set_config('request.jwt.claim.sub',(select admin_uid::text from month_test_ids),true);
set local role authenticated;
select public.set_month_workflow_open((select term_id from month_test_ids),'2026-09-01',false);
reset role;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from month_test_ids),true);
set local role authenticated;
do $$declare payload jsonb; v integer; failed boolean:=false; before_report jsonb; begin
 if not exists(select 1 from public.monthly_workflow_access where term_id=(select term_id from month_test_ids) and month_start='2026-09-01' and not is_open) then raise exception 'Teacher cannot read month gate';end if;
 begin perform public.set_month_workflow_open((select term_id from month_test_ids),'2026-09-01',true);raise exception 'Teacher changed gate';exception when insufficient_privilege then null;end;
 select to_jsonb(r),version into before_report,v from public.monthly_reports r where teacher_username='quran06' and term_id=(select term_id from month_test_ids) and month_start='2026-09-01';
 select jsonb_agg(jsonb_build_object('student_id',s.id,'memorization',jsonb_build_object('none',true,'text',''),'revision',jsonb_build_object('none',true,'text',''),'note','ROLLBACK test')) into payload
 from public.students s where s.teacher_username='quran06' and (s.active or exists(select 1 from public.monthly_entries e join public.monthly_reports r on r.id=e.report_id where e.student_id=s.id and r.month_start='2026-09-01' and r.term_id=(select term_id from month_test_ids)));
 begin perform public.save_monthly_report('quran06',(select term_id from month_test_ids),'2026-09-01',payload,coalesce(v,0));exception when insufficient_privilege then if sqlerrm like '%هذا الشهر مغلق%' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'Closed month accepted a teacher save';end if;
 if before_report is distinct from (select to_jsonb(r) from public.monthly_reports r where teacher_username='quran06' and term_id=(select term_id from month_test_ids) and month_start='2026-09-01') then raise exception 'Rejected save changed report';end if;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_uid::text from month_test_ids),true);
set local role authenticated;
select public.set_month_workflow_open((select term_id from month_test_ids),'2026-09-01',true);
reset role;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from month_test_ids),true);
set local role authenticated;
do $$declare payload jsonb; v integer; saved jsonb;begin
 select version into v from public.monthly_reports where teacher_username='quran06' and term_id=(select term_id from month_test_ids) and month_start='2026-09-01';
 select jsonb_agg(jsonb_build_object('student_id',s.id,'memorization',jsonb_build_object('none',true,'text',''),'revision',jsonb_build_object('none',true,'text',''),'note','ROLLBACK test')) into payload
 from public.students s where s.teacher_username='quran06' and (s.active or exists(select 1 from public.monthly_entries e join public.monthly_reports r on r.id=e.report_id where e.student_id=s.id and r.month_start='2026-09-01' and r.term_id=(select term_id from month_test_ids)));
 saved:=public.save_monthly_report('quran06',(select term_id from month_test_ids),'2026-09-01',payload,coalesce(v,0));
 if saved->>'status'<>'complete' then raise exception 'Reopened monthly save failed';end if;
end;$$;
reset role;
rollback;
select 'PASS: admin-only switch, teacher gate visibility, blocked closed-month save, unchanged report, reopened save; all temporary changes rolled back' result;
