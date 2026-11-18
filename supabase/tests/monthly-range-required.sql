-- Run on the installed project after monthly-range-required.sql. Every change is rolled back.
begin;
do $$begin
 if not (select relrowsecurity from pg_class where oid='public.monthly_range_requirements'::regclass)
 or has_table_privilege('anon','public.monthly_range_requirements','select')
 or has_table_privilege('authenticated','public.monthly_range_requirements','insert')
 or has_table_privilege('authenticated','public.monthly_range_requirements','delete')
 or has_function_privilege('authenticated','quran_private.guard_monthly_range()','execute')
 then raise exception 'Range rule grants or RLS are unsafe';end if;
end;$$;
create temp table range_test_ids as select q.term_id,q.month_start,q.teacher_username,
 (select auth_user_id from public.teacher_accounts where username=q.teacher_username) teacher_uid,
 (select auth_user_id from public.admin_accounts where active and auth_user_id is not null limit 1) admin_uid
 from public.monthly_range_requirements q join public.school_terms s on s.id=q.term_id and s.active limit 1;
grant select on range_test_ids to authenticated;
do $$begin if (select count(*) from range_test_ids where teacher_uid is not null and admin_uid is not null)<>1 then raise exception 'An activated teacher with a range rule and an admin are required';end if;end;$$;
-- Open the month inside this transaction so the gate does not hide the rule being tested.
select set_config('request.jwt.claim.sub',(select admin_uid::text from range_test_ids),true);
set local role authenticated;
select public.set_month_workflow_open((select term_id from range_test_ids),(select month_start from range_test_ids),true);
reset role;
select set_config('request.jwt.claim.sub',(select teacher_uid::text from range_test_ids),true);
set local role authenticated;
do $$declare t record; payload jsonb; first_id uuid; v integer; rejected boolean:=false;
 range_amount jsonb:='{"none":false,"text":"من سورة الفاتحة آية 1 إلى سورة الفاتحة آية 7","range":{"from_surah":1,"from_ayah":1,"to_surah":1,"to_ayah":7}}';
begin
 select * into t from range_test_ids;
 if not exists(select 1 from public.monthly_range_requirements where teacher_username=t.teacher_username) then raise exception 'Teacher cannot read own range rule';end if;
 select r.version into v from public.monthly_reports r where r.teacher_username=t.teacher_username and r.term_id=t.term_id and r.month_start=t.month_start;
 -- Keep every saved amount as it is (legacy free text included); new students get "none".
 select jsonb_agg(jsonb_build_object('student_id',s.id,
   'memorization',coalesce(e.memorization,'{"none":true,"text":""}'::jsonb),
   'revision',coalesce(e.revision,'{"none":true,"text":""}'::jsonb),'note',coalesce(e.note,'')) order by s.id),min(s.id::text)::uuid
 into payload,first_id
 from public.students s
 left join public.monthly_reports r on r.teacher_username=t.teacher_username and r.term_id=t.term_id and r.month_start=t.month_start
 left join public.monthly_entries e on e.report_id=r.id and e.student_id=s.id
 where s.teacher_username=t.teacher_username and (s.active or e.student_id is not null);
 perform public.save_monthly_report(t.teacher_username,t.term_id,t.month_start,payload,coalesce(v,0));
 v:=coalesce(v,0)+1;
 begin
  perform public.save_monthly_report(t.teacher_username,t.term_id,t.month_start,
   (select jsonb_agg(case when (x->>'student_id')::uuid=first_id then jsonb_set(x,'{memorization}','{"none":false,"text":"ROLLBACK free text"}') else x end) from jsonb_array_elements(payload) x),v);
 exception when raise_exception then if sqlerrm like '%بتحديد سورة وآية%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'New free text was accepted for a range-required month';end if;
 perform public.save_monthly_report(t.teacher_username,t.term_id,t.month_start,
  (select jsonb_agg(case when (x->>'student_id')::uuid=first_id then jsonb_set(jsonb_set(x,'{memorization}',range_amount),'{revision}',range_amount) else x end) from jsonb_array_elements(payload) x),v);
end;$$;
reset role;
rollback;
select 'PASS: read-only rule, unchanged legacy amounts kept, new free text rejected, verse ranges saved; all changes rolled back' result;
