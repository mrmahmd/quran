-- Synthetic accounts only. Every fixture and attempt counter is rolled back.
begin;
create temporary table recovery_test_results(test text, passed boolean);
grant insert, select on recovery_test_results to service_role;
create temporary table recovery_fixture(teacher_id uuid, admin_id uuid);
insert into recovery_fixture values(gen_random_uuid(),gen_random_uuid());
grant select on recovery_fixture to service_role;
insert into auth.users(id, aud, role, email)
select teacher_id,'authenticated','authenticated','recovery-test-teacher@example.invalid' from recovery_fixture
union all select admin_id,'authenticated','authenticated','recovery-test-admin@example.invalid' from recovery_fixture;
insert into public.teacher_accounts(username,full_name,class_name,activation_hash,auth_user_id,activated_at)
select 'quran99','TEST RECOVERY ROLLBACK','TEST RECOVERY ROLLBACK',encode(extensions.digest('123456','sha256'),'hex'),teacher_id,now() from recovery_fixture;
insert into public.teacher_accounts(username,full_name,class_name,activation_hash)
values ('quran98','TEST UNACTIVATED ROLLBACK','TEST UNACTIVATED ROLLBACK',encode(extensions.digest('123456','sha256'),'hex'));
insert into public.admin_accounts(email,activation_hash,auth_user_id,activated_at)
select 'recovery-test-admin@example.invalid',encode(extensions.digest('123456','sha256'),'hex'),admin_id,now() from recovery_fixture;

insert into recovery_test_results values
('anonymous and logged-in clients cannot call the verifier',
 not has_function_privilege('anon','public.verify_school_recovery(text,text)','EXECUTE')
 and not has_function_privilege('authenticated','public.verify_school_recovery(text,text)','EXECUTE')),
('clients cannot read school code hashes',
 not has_column_privilege('anon','public.teacher_accounts','activation_hash','SELECT')
 and not has_column_privilege('authenticated','public.admin_accounts','activation_hash','SELECT'));
set local role service_role;
do $$
declare r record; i integer; good text := encode(extensions.digest('123456','sha256'),'hex'); bad text := repeat('0',64);
begin
  select * into r from public.verify_school_recovery('quran97',good);
  insert into recovery_test_results values('unknown username denied',r.result='invalid' and r.account_id is null);
  select * into r from public.verify_school_recovery('quran98',good);
  insert into recovery_test_results values('unactivated account denied',r.result='invalid' and r.account_id is null);
  for i in 1..5 loop perform public.verify_school_recovery('quran99',bad); end loop;
  select * into r from public.verify_school_recovery('quran99',good);
  insert into recovery_test_results values('five wrong attempts lock even the correct code',r.result='locked' and r.account_id is null);
  insert into recovery_test_results values('attempt count is persisted',
    (select failed_attempts=5 and locked_until>now() from public.teacher_accounts where username='quran99'));
  update public.teacher_accounts set locked_until=now()-interval '1 minute',attempt_window_started_at=now()-interval '16 minutes' where username='quran99';
  select * into r from public.verify_school_recovery(' QURAN99 ',good);
  insert into recovery_test_results values('correct code returns the existing teacher ID',r.result='ok' and r.account_id=(select teacher_id from recovery_fixture));
  select * into r from public.verify_school_recovery('quran99',good);
  insert into recovery_test_results values('successful submission is rate limited',r.result='locked' and r.account_id is null);
  insert into recovery_test_results values('original hash and account link remain intact',
    (select activation_hash=good and auth_user_id=(select teacher_id from recovery_fixture) and failed_attempts=0 from public.teacher_accounts where username='quran99'));
  select * into r from public.verify_school_recovery('recovery-test-admin',good);
  insert into recovery_test_results values('admin alias returns its existing account ID',r.result='ok' and r.account_id=(select admin_id from recovery_fixture));
  update public.admin_accounts set active=false,locked_until=null where email='recovery-test-admin@example.invalid';
  select * into r from public.verify_school_recovery('recovery-test-admin',good);
  insert into recovery_test_results values('inactive admin denied',r.result='invalid' and r.account_id is null);
end; $$;
reset role;
insert into public.admin_accounts(email,activation_hash) values('recovery-test-admin@other.invalid',repeat('0',64));
set local role service_role;
insert into recovery_test_results select 'ambiguous alias denied',result='invalid' and account_id is null
from public.verify_school_recovery('recovery-test-admin',repeat('0',64));
reset role;
do $$ begin
 if exists(select 1 from recovery_test_results where passed is not true) then raise exception 'Recovery test failed'; end if;
end $$;
select * from recovery_test_results order by test;
rollback;
