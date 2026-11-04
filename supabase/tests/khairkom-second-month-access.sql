begin;
do $test$
declare
  term uuid:=gen_random_uuid(); student uuid:=gen_random_uuid();
  teacher text; teacher_uid uuid; admin_uid uuid; first_set jsonb; second_set jsonb; payload jsonb;
  before_rows text; today date:=(current_timestamp at time zone 'Asia/Riyadh')::date;
begin
  select username,auth_user_id into strict teacher,teacher_uid from public.teacher_accounts where active and auth_user_id is not null order by username limit 1;
  select auth_user_id into strict admin_uid from public.admin_accounts where active and auth_user_id is not null limit 1;
  insert into public.school_terms(id,name,starts_on,ends_on,active) values(term,'TEST MONTH TWO ACCESS ROLLBACK',today-14,today+30,true);
  insert into public.students(id,teacher_username,full_name,active) values(student,teacher,'TEST MONTH TWO ACCESS',true);
  payload:=jsonb_build_array(jsonb_build_object('student_id',student,'identity_number','1234567890','test_parts',jsonb_build_array(1)));
  perform set_config('request.jwt.claim.sub',teacher_uid::text,true);
  execute 'set local role authenticated';
  begin
    perform public.set_khairkom_second_month_open(term,false);
    raise exception 'Teacher changed the switch';
  exception when insufficient_privilege then null; end;
  first_set:=public.save_khairkom_nominations_period(1,teacher,term,payload,0);
  second_set:=public.save_khairkom_nominations_period(2,teacher,term,payload,0);
  select jsonb_agg(to_jsonb(n) order by n.student_id)::text into before_rows from public.khairkom_nominations n where set_id=(second_set->>'id')::uuid;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  if public.set_khairkom_second_month_open(term,false) is distinct from false then raise exception 'Close failed'; end if;
  perform set_config('request.jwt.claim.sub',teacher_uid::text,true);
  execute 'set local role authenticated';
  begin
    perform public.save_khairkom_nominations_period(2,teacher,term,'[]',1);
    raise exception 'Closed month accepted a save';
  exception when insufficient_privilege then null; end;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(n) order by n.student_id)::text from public.khairkom_nominations n where set_id=(second_set->>'id')::uuid) then raise exception 'Closed save changed nominations'; end if;
  perform public.save_khairkom_nominations_period(1,teacher,term,payload,1);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  if jsonb_array_length(public.khairkom_report_snapshot_period(2,term)->'rows')<>1 then raise exception 'Closed report unavailable'; end if;
  begin
    perform public.add_khairkom_nomination_period(2,term,null,'TEST EXTERNAL','TEST','1234567891',array[1]::smallint[]);
    raise exception 'Closed month accepted supervised addition';
  exception when insufficient_privilege then null; end;
  perform public.set_khairkom_second_month_open(term,true);
  perform public.set_week_workflow_open(term,today-extract(dow from today)::integer,false);
  perform set_config('request.jwt.claim.sub',teacher_uid::text,true);
  execute 'set local role authenticated';
  perform public.save_khairkom_nominations_period(2,teacher,term,payload,1);
  begin
    perform public.save_khairkom_nominations_period(1,teacher,term,payload,2);
    raise exception 'First month weekly lock bypassed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  if has_function_privilege('anon','public.set_khairkom_second_month_open(uuid,boolean)','EXECUTE') then raise exception 'Anonymous toggle exposed'; end if;
end;
$test$;
select 'PASS: admin toggle, teacher denial, closed saves/additions, preserved data, readable report, reopen and independent weekly lock' as result;
rollback;
