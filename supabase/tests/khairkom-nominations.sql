-- All fixture accounts, students and nominations are rolled back.
begin;
create temp table khairkom_fixture as select auth_user_id uid,username original_teacher from public.teacher_accounts where auth_user_id is not null and username<>'quran17' limit 1;
do $$begin if not exists(select 1 from khairkom_fixture) then raise exception 'Activated teacher required for the RLS test'; end if; end;$$;
create temp table khairkom_ids as select gen_random_uuid() term;
insert into public.school_terms(id,name,starts_on,ends_on) select term,'ROLLBACK Khairkom fixture','2026-09-27','2026-12-17' from khairkom_ids;
update public.teacher_accounts set auth_user_id=null,activated_at=null where username=(select original_teacher from khairkom_fixture);
insert into public.teacher_accounts(username,full_name,class_name,activation_hash,auth_user_id,activated_at)
select 'quran90','اختبار خيركم','ROLLBACK90','fixture',uid,now() from khairkom_fixture;
insert into public.teacher_accounts(username,full_name,class_name,activation_hash) values('quran91','معلم آخر','ROLLBACK91','fixture');
insert into public.students(teacher_username,full_name,student_code) values
('quran90','طالب ترشيح أول','KH-ONE'),('quran90','طالب ترشيح ثان','KH-TWO'),('quran91','طالب حلقة أخرى','KH-OTHER');
grant select on khairkom_fixture,khairkom_ids to authenticated;
select set_config('request.jwt.claim.sub',(select uid::text from khairkom_fixture),true);
set local role authenticated;
do $$declare t uuid:=(select term from khairkom_ids); s uuid:=(select id from public.students where student_code='KH-ONE'); other_student uuid:=(select id from public.students where student_code='KH-OTHER'); rec jsonb; failed boolean;
begin
 if exists(select 1 from public.khairkom_nominations) then raise exception 'Nomination fixture is not isolated'; end if;
 rec:=public.save_khairkom_nominations('quran90',t,jsonb_build_array(jsonb_build_object('student_id',s,'memorization_amount','من الفاتحة إلى البقرة آية ٢٠')),0);
 if (rec->>'version')::integer<>1 then raise exception 'Wrong initial version'; end if;
 if not exists(select 1 from public.khairkom_nominations where student_id=s and nominated) then raise exception 'Teacher save missing'; end if;
 begin perform public.save_khairkom_nominations('quran90',t,jsonb_build_array(jsonb_build_object('student_id',s,'memorization_amount',' ')),1);raise exception 'Blank amount accepted';exception when check_violation then null; when raise_exception then if sqlerrm='Blank amount accepted' then raise; end if;end;
 begin perform public.save_khairkom_nominations('quran90',t,jsonb_build_array(jsonb_build_object('student_id',other_student,'memorization_amount','مقدار')),1);raise exception 'Foreign student accepted';exception when raise_exception then if sqlerrm='Foreign student accepted' then raise; end if;end;
 begin perform public.save_khairkom_nominations('quran91',t,'[]',0);raise exception 'Other teacher write accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_khairkom_nominations('quran90',t,'[]',0);raise exception 'Stale version accepted';exception when raise_exception then if sqlerrm='Stale version accepted' then raise; end if;end;
 if exists(select 1 from public.khairkom_nomination_sets where teacher_username='quran91') then raise exception 'Other teacher set exposed'; end if;
 rec:=public.save_khairkom_nominations('quran90',t,'[]',1);
 if exists(select 1 from public.khairkom_nominations where student_id=s and nominated) or not exists(select 1 from public.khairkom_nominations where student_id=s) then raise exception 'Deselection lost audit history'; end if;
 rec:=public.save_khairkom_nominations('quran90',t,jsonb_build_array(jsonb_build_object('student_id',s,'memorization_amount','جزآن')),2);
end;$$;
reset role;
update public.teacher_accounts set auth_user_id=null,activated_at=null where username='quran90';
update public.admin_accounts set auth_user_id=null,activated_at=null where email='mbaazeem@as.edu.sa';
update public.admin_accounts set auth_user_id=(select uid from khairkom_fixture),activated_at=now() where email='mbaazeem@as.edu.sa';
set local role authenticated;
do $$declare student uuid:=(select id from public.students where student_code='KH-ONE'); moved jsonb;begin
 if not exists(select 1 from public.khairkom_nominations where student_id=student and nominated and memorization_amount='جزآن') then raise exception 'Admin report missing nomination'; end if;
 if not exists(select 1 from public.students where id=student and full_name='طالب ترشيح أول') then raise exception 'Admin cannot see student name'; end if;
 moved:=public.manage_student(student,'طالب ترشيح أول','quran91',true);
 if (moved->>'id')::uuid=student or not exists(select 1 from public.khairkom_nominations where student_id=student) then raise exception 'Transfer did not preserve nomination'; end if;
end;$$;
reset role;
rollback;
select 'PASS: own-teacher save, blank/foreign/stale denial, teacher isolation, soft deselection, admin report, transfer history; fixtures rolled back' result;
