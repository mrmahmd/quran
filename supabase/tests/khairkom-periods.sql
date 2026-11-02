-- Run inside a transaction after the monthly schema, then roll back.
do $test$
declare t uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); owner_name text; owner_uid uuid; other_name text;
  admin_uid uuid; first_set jsonb; second_set jsonb; data jsonb; payload jsonb; original text; rejected boolean;
begin
 select username,auth_user_id into owner_name,owner_uid from public.teacher_accounts where active and auth_user_id is not null order by username limit 1;
 select username into other_name from public.teacher_accounts where active and username<>owner_name order by username limit 1;
 select auth_user_id into admin_uid from public.admin_accounts where active and auth_user_id is not null limit 1;
 perform set_config('request.jwt.claim.sub','',true);
 insert into public.school_terms(id,name,starts_on,ends_on,active) values(t,'TEST KHAIRKOM MONTHS - ROLLBACK',current_date-14,current_date+30,true);
 insert into public.students(id,teacher_username,full_name,active) values(s,owner_name,'TEST MONTHLY NOMINEE',true);
 payload:=jsonb_build_array(jsonb_build_object('student_id',s,'identity_number','1234567890','test_parts',jsonb_build_array(1,2)));
 perform set_config('request.jwt.claim.sub',owner_uid::text,true);
 execute 'set local role authenticated';
 first_set:=public.save_khairkom_nominations_period(1,owner_name,t,payload,0);
 second_set:=public.save_khairkom_nominations_period(2,owner_name,t,payload,0);
 if first_set->>'id'=second_set->>'id' or first_set->>'period_no'<>'1' or second_set->>'period_no'<>'2' then raise exception 'Months are not independent';end if;
 select to_jsonb(n)::text into original from public.khairkom_nominations n where set_id=(first_set->>'id')::uuid;
 perform public.save_khairkom_nominations_period(2,owner_name,t,'[]',1);
 if original<>(select to_jsonb(n)::text from public.khairkom_nominations n where set_id=(first_set->>'id')::uuid) then raise exception 'Month two changed month one';end if;
 rejected:=false;begin perform public.save_khairkom_nominations_period(2,other_name,t,payload,0); exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Cross teacher write accepted';end if;
 rejected:=false;begin perform public.save_khairkom_nominations_period(3,owner_name,t,payload,0); exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Invalid month accepted';end if;
 rejected:=false;begin perform public.save_khairkom_nominations_period(2,owner_name,t,payload,1); exception when others then rejected:=true;end;
 if not rejected then raise exception 'Stale version accepted';end if;
 -- Old API stays bound to month one even after month two exists.
 perform public.save_khairkom_nominations(owner_name,t,payload,1);
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',admin_uid::text,true);
 data:=public.khairkom_report_snapshot_period(1,t);
 if jsonb_array_length(data->'rows')<>1 then raise exception 'Month one report changed';end if;
 data:=public.khairkom_report_snapshot_period(2,t);
 if jsonb_array_length(data->'rows')<>0 then raise exception 'Month two report includes month one';end if;
 perform public.add_khairkom_nomination_period(1,t,null,'TEST EXTERNAL NOMINEE','TEST','1234567891',array[3]::smallint[]);
 perform public.add_khairkom_nomination_period(2,t,null,'TEST EXTERNAL NOMINEE','TEST','1234567891',array[4]::smallint[]);
 data:=public.khairkom_report_snapshot_period(2,t);
 if jsonb_array_length(data->'rows')<>1 or data->'rows'->0->'test_parts'<>jsonb_build_array(4) then raise exception 'External monthly nominations are mixed';end if;
 perform public.update_khairkom_nominee((data->'rows'->0->>'set_id')::uuid,(data->'rows'->0->>'student_id')::uuid,'TEST EXTERNAL MONTH TWO','1234567891',array[5]::smallint[],1);
 data:=public.khairkom_report_snapshot_period(2,t);
 if data->'rows'->0->'test_parts'<>jsonb_build_array(5) then raise exception 'Month two external edit failed';end if;
 data:=public.khairkom_report_snapshot_period(1,t);
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'external'='true' and r->'test_parts'=jsonb_build_array(3)) then raise exception 'External edit changed month one';end if;
 if has_function_privilege('anon','public.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer)','EXECUTE') then raise exception 'Anonymous access exposed';end if;
 perform set_config('request.jwt.claim.sub','',true);
end;
$test$;
