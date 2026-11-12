-- Run after khairkom-nas-duha.sql inside a rollback transaction.
do $test$
declare
  term_id uuid := gen_random_uuid();
  student_id uuid := gen_random_uuid();
  teacher_name text;
  teacher_uid uuid;
  admin_uid uuid;
  payload jsonb;
  report jsonb;
  external_id uuid;
  riyadh_today date := (current_timestamp at time zone 'Asia/Riyadh')::date;
begin
  select username,auth_user_id into strict teacher_name,teacher_uid
    from public.teacher_accounts where active and auth_user_id is not null order by username limit 1;
  select auth_user_id into strict admin_uid
    from public.admin_accounts where active and auth_user_id is not null limit 1;
  insert into public.school_terms(id,name,starts_on,ends_on,khairkom_third_round_open)
    values(term_id,'TEST KHAIRKOM NAS DUHA',riyadh_today-7,riyadh_today+7,true);
  insert into public.students(id,teacher_username,full_name)
    values(student_id,teacher_name,'Test nomination');
  payload := jsonb_build_array(jsonb_build_object(
    'student_id',student_id,'identity_number','100001','nomination_type','memorization','test_parts','[30,31]'::jsonb));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',teacher_uid::text,true);
  perform public.save_khairkom_nominations_period(3,teacher_name,term_id,payload,0);
  begin
    perform public.save_khairkom_nominations_period(2,teacher_name,term_id,payload,0);
    raise exception using errcode='XX000',message='Round two accepted Nas to Duha';
  exception when raise_exception then null;
  end;
  begin
    perform public.save_khairkom_nominations_period(3,teacher_name,term_id,
      jsonb_set(payload,'{0,nomination_type}','"recitation"'),1);
    raise exception using errcode='XX000',message='Recitation accepted Nas to Duha';
  exception when raise_exception then null;
  end;

  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  external_id := (public.add_khairkom_nomination_period(3,term_id,null,'Test external',null,'100002',array[31]::smallint[])->>'student_id')::uuid;
  perform public.update_khairkom_nominee(external_id,external_id,'Test external','100002',array[29,31]::smallint[],1);
  report := public.khairkom_report_snapshot_period(3,term_id);
  if not (report->'rows' @> '[{"identity_number":"100001","test_parts":[30,31]},{"identity_number":"100002","test_parts":[29,31]}]'::jsonb)
  then raise exception 'Round three report did not retain Nas to Duha'; end if;
  execute 'reset role';
end;
$test$;
