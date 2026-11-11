-- Run in a rollback transaction on a development database.
do $test$
declare
  term uuid := gen_random_uuid();
  reciter uuid := gen_random_uuid();
  memorizer uuid := gen_random_uuid();
  owner_name text;
  owner_uid uuid;
  admin_uid uuid;
  payload jsonb;
  result jsonb;
  before_first jsonb;
  before_second jsonb;
  report jsonb;
begin
  select username,auth_user_id into strict owner_name,owner_uid from public.teacher_accounts
    where active and auth_user_id is not null order by username limit 1;
  select auth_user_id into strict admin_uid from public.admin_accounts
    where active and auth_user_id is not null limit 1;
  insert into public.school_terms(id,name,starts_on,ends_on)
    values(term,'TEST KHAIRKOM ROUND 3',current_date-14,current_date+30);
  insert into public.students(id,teacher_username,full_name)
    values(reciter,owner_name,'Test reciter'),(memorizer,owner_name,'Test memorizer');
  payload := jsonb_build_array(
    jsonb_build_object('student_id',reciter,'identity_number','100001','nomination_type','recitation','test_parts','[]'::jsonb),
    jsonb_build_object('student_id',memorizer,'identity_number','100002','nomination_type','memorization','test_parts','[1,2]'::jsonb)
  );

  perform set_config('request.jwt.claim.sub',owner_uid::text,true);
  execute 'set local role authenticated';
  begin
    perform public.set_khairkom_third_round_open(term,true);
    raise exception 'Teacher opened round 3';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_khairkom_nominations_period(3,owner_name,term,payload,0);
    raise exception 'Teacher saved while round 3 was closed';
  exception when insufficient_privilege then null;
  end;
  perform public.save_khairkom_nominations_period(1,owner_name,term,jsonb_build_array(payload->1),0);
  perform public.save_khairkom_nominations_period(2,owner_name,term,jsonb_build_array(payload->1),0);

  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  before_first := public.khairkom_report_snapshot_period(1,term);
  before_second := public.khairkom_report_snapshot_period(2,term);
  perform public.set_khairkom_third_round_open(term,true);

  perform set_config('request.jwt.claim.sub',owner_uid::text,true);
  begin
    perform public.save_khairkom_nominations_period(3,owner_name,term,jsonb_set(payload,'{1,test_parts}','[]'),0);
    raise exception using errcode='XX000',message='Memorization saved without parts';
  exception when raise_exception then null;
  end;
  begin
    perform public.save_khairkom_nominations_period(3,owner_name,term,jsonb_set(payload,'{0,test_parts}','[1]'),0);
    raise exception using errcode='XX000',message='Recitation saved with parts';
  exception when raise_exception then null;
  end;
  begin
    perform public.save_khairkom_nominations_period(3,owner_name,term,jsonb_set(payload,'{0,identity_number}','""'),0);
    raise exception using errcode='XX000',message='Recitation saved without identity';
  exception when raise_exception then null;
  end;
  result := public.save_khairkom_nominations_period(3,owner_name,term,payload,0);
  if result->>'period_no' <> '3' then raise exception 'Wrong saved round'; end if;
  begin
    perform public.save_khairkom_nominations_period(2,owner_name,term,jsonb_build_array(payload->0),1);
    raise exception using errcode='XX000',message='Recitation saved in round 2';
  exception when raise_exception then null;
  end;

  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  report := public.khairkom_report_snapshot_period(3,term);
  if jsonb_array_length(report->'rows') <> 2 or not (report->'rows' @>
    '[{"identity_number":"100001","test_parts":[]},{"identity_number":"100002","test_parts":[1,2]}]'::jsonb)
  then raise exception 'Round 3 report has incorrect entries'; end if;
  result := public.add_khairkom_nomination_period(3,term,null,'Test external reciter',null,'100003','{}');
  perform public.update_khairkom_nominee((result->>'student_id')::uuid,(result->>'student_id')::uuid,'Test edited reciter','100004','{}',1);
  report := public.khairkom_report_snapshot_period(3,term);
  if not (report->'rows' @> '[{"identity_number":"100004","external":true,"test_parts":[]}]'::jsonb)
  then raise exception 'External recitation entry was not saved'; end if;
  if before_first is distinct from public.khairkom_report_snapshot_period(1,term)
    or before_second is distinct from public.khairkom_report_snapshot_period(2,term)
  then raise exception 'Round 3 affected historical data'; end if;
  perform public.set_khairkom_third_round_open(term,false);
  begin
    perform public.add_khairkom_nomination_period(3,term,null,'Closed round reciter',null,'100005','{}');
    raise exception 'Supervisor saved while round 3 was closed';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('anon','public.set_khairkom_third_round_open(uuid,boolean)','EXECUTE')
  then raise exception 'Anonymous round access exposed'; end if;
  execute 'reset role';
end;
$test$;
