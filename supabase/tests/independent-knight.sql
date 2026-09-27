-- Integration fixtures and temporary auth mappings are ALWAYS rolled back.
begin;
create temp table reporting_fixture as select auth_user_id as uid,username as original_teacher from public.teacher_accounts where auth_user_id is not null and username<>'quran17' limit 1;
do $$begin if not exists(select 1 from reporting_fixture) then raise exception 'An activated teacher is required'; end if; end;$$;
create temp table reporting_ids as select gen_random_uuid() as term,gen_random_uuid() as student1,gen_random_uuid() as student2,gen_random_uuid() as other_student;
insert into public.school_terms(id,name,starts_on,ends_on) select term,'ROLLBACK reporting fixture','2026-09-27','2026-10-01' from reporting_ids;
update public.teacher_accounts set auth_user_id=null,activated_at=null where username=(select original_teacher from reporting_fixture);
insert into public.teacher_accounts(username,full_name,class_name,activation_hash,auth_user_id,activated_at) select 'quran90','اختبار تقرير مؤقت','ROLLBACK90','not-an-activation-code',uid,now() from reporting_fixture;
insert into public.teacher_accounts(username,full_name,class_name,activation_hash) values('quran91','اختبار حلقة أخرى','ROLLBACK91','not-an-activation-code');
insert into public.students(id,teacher_username,full_name) select student1,'quran90','طالب اختبار أول' from reporting_ids union all select student2,'quran90','طالب اختبار ثان' from reporting_ids union all select other_student,'quran91','طالب حلقة أخرى' from reporting_ids;
grant select on reporting_fixture,reporting_ids to authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from reporting_fixture),true);
set local role authenticated;
do $$declare payload jsonb; saved jsonb; wk jsonb; amount jsonb := '{"none":false,"text":"من سورة البقرة آية ١ إلى آية ٢٠"}'; none_amount jsonb := '{"none":true,"text":""}'; failed boolean; begin
 if quran_private.valid_monthly_amount('{"none":false,"text":" "}') then raise exception 'Empty amount accepted'; end if;
 if quran_private.valid_monthly_amount('{"none":true,"text":"hidden"}') then raise exception 'Hidden amount accepted'; end if;
 select jsonb_agg(jsonb_build_object('student_id',id,'memorization',amount,'revision',none_amount,'note','')) into payload from public.students where teacher_username='quran90';
 failed:=false;
 begin perform public.save_monthly_report('quran90',(select term from reporting_ids),'2026-09-01',payload-0,0); exception when others then if sqlerrm like '%التقرير غير مكتمل للطالب%' then failed:=true; else raise; end if; end;
 if not failed or exists(select 1 from public.monthly_reports where teacher_username='quran90') then raise exception 'Incomplete monthly save was not atomic'; end if;
 saved:=public.save_monthly_report('quran90',(select term from reporting_ids),'2026-09-01',payload,0);
 if (saved->>'version')::integer<>1 or (select count(*) from public.monthly_entries where teacher_username='quran90')<>2 then raise exception 'Monthly save failed'; end if;
 failed:=false;
 begin perform public.save_monthly_report('quran90',(select term from reporting_ids),'2026-09-01',payload,0); exception when others then if sqlerrm like '%تم تحديث التقرير%' then failed:=true; else raise; end if; end;
 if not failed then raise exception 'Stale monthly version accepted'; end if;
 begin perform public.save_monthly_report('quran91',(select term from reporting_ids),'2026-09-01','[]',0); raise exception 'Other teacher write allowed'; exception when insufficient_privilege then null; end;
 begin perform public.weekly_champions((select term from reporting_ids),'2026-09-27'); raise exception 'Ordinary teacher read all champions'; exception when insufficient_privilege then null; end;
 if exists(select 1 from public.monthly_entries where teacher_username<>'quran90') then raise exception 'Other teacher report exposed'; end if;
 select jsonb_agg(jsonb_build_object('student_id',id,'memorization',0,'revision',0,'improvement',0,'commitment',0,'bonus_memorization',0,'bonus_revision',0)) into payload from public.students where teacher_username='quran90';
 wk:=public.select_manual_weekly_knight('quran90',(select term from reporting_ids),'2026-09-27',(select student2 from reporting_ids),'اختيار يدوي',0);
 if exists(select 1 from public.weekly_evaluations where review_id=(wk->>'id')::uuid) then raise exception 'Knight required scores'; end if;
end;$$;
reset role;
update public.teacher_accounts set auth_user_id=null,activated_at=null where username='quran90';
update public.teacher_accounts set auth_user_id=(select uid from reporting_fixture),activated_at=now() where username='quran17';
set local role authenticated;
do $$begin
 if not exists(select 1 from public.weekly_champions((select term from reporting_ids),'2026-09-27') where teacher_username='quran90' and student_name='طالب اختبار ثان' and note='اختيار يدوي') then raise exception 'Supervisor champion summary missing'; end if;
 if exists(select 1 from public.weekly_reviews where teacher_username='quran90') or exists(select 1 from public.weekly_evaluations where teacher_username='quran90') then raise exception 'Supervisor gained private score access'; end if;
 if exists(select 1 from public.monthly_reports where teacher_username='quran90') or exists(select 1 from public.monthly_entries where teacher_username='quran90') then raise exception 'Supervisor gained monthly access'; end if;
 begin perform public.save_monthly_report('quran90',(select term from reporting_ids),'2026-09-01','[]',1); raise exception 'Supervisor gained report editing'; exception when insufficient_privilege then null; end;
end;$$;
reset role;
-- Administrator sees both the report and minimal champion summary.
update public.teacher_accounts set auth_user_id=null,activated_at=null where username='quran17';
update public.admin_accounts set auth_user_id=(select uid from reporting_fixture),activated_at=now() where email='mbaazeem@as.edu.sa';
set local role authenticated;
do $$begin
 if not exists(select 1 from public.monthly_reports where teacher_username='quran90') or (select count(*) from public.monthly_entries where teacher_username='quran90')<>2 then raise exception 'Administrator cannot read monthly report'; end if;
 if not exists(select 1 from public.weekly_champions((select term from reporting_ids),'2026-09-27') where teacher_username='quran90' and student_name='طالب اختبار ثان') then raise exception 'Administrator champion summary missing'; end if;
end;$$;
reset role;
-- Monthly-only history must survive transfer.
insert into public.students(teacher_username,full_name,student_code) values('quran90','طالب تقرير شهري فقط','MONTHLY-ONLY-FIXTURE');
insert into public.monthly_entries(report_id,teacher_username,student_id,memorization,revision,note)
select r.id,'quran90',s.id,'{"none":true,"text":""}','{"none":true,"text":""}',''
from public.monthly_reports r cross join public.students s where r.teacher_username='quran90' and s.student_code='MONTHLY-ONLY-FIXTURE';
do $$declare moved jsonb; begin
 moved:=quran_private.manage_student((select id from public.students where student_code='MONTHLY-ONLY-FIXTURE'),'طالب اختبار منقول','quran91',true);
 if (moved->>'id')::uuid=(select id from public.students where student_code='MONTHLY-ONLY-FIXTURE') then raise exception 'Monthly history identity changed'; end if;
 if not exists(select 1 from public.monthly_entries where student_id=(select id from public.students where student_code='MONTHLY-ONLY-FIXTURE')) then raise exception 'Monthly history lost'; end if;
end;$$;
rollback;
select 'PASS: atomic complete-roster save, text validation, manual champion without any scores, version conflicts, teacher isolation, minimal supervisor access, history preservation; all fixtures rolled back' as result;

