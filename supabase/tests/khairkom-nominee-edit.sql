-- Exercise real roles and real nomination paths, rolling back every change.
begin;
create temporary table nominee_edit_fixture as select
 (select auth_user_id from public.teacher_accounts where username='quran17' and active) editor_id,
 (select auth_user_id from public.teacher_accounts where username='quran19' and active) viewer_id,
 (select auth_user_id from public.teacher_accounts where username not in('quran17','quran19') and active and auth_user_id is not null limit 1) teacher_id,
 (select auth_user_id from public.admin_accounts where active limit 1) admin_id,
 (select id from public.school_terms where active limit 1) term_id;
grant select on nominee_edit_fixture to authenticated;
set local role authenticated;
do $$declare f record; data jsonb; before_data jsonb; r jsonb; sid uuid; nid uuid; ver integer; added uuid; roster_name text; begin
 select * into f from nominee_edit_fixture;
 if f.editor_id is null or f.viewer_id is null or f.teacher_id is null or f.admin_id is null then raise exception 'Missing role fixture'; end if;
 perform set_config('request.jwt.claim.sub',f.editor_id::text,true);
 data:=public.khairkom_report_snapshot(f.term_id); before_data:=data;
 r:=data->'rows'->0;sid:=(r->>'set_id')::uuid;nid:=(r->>'student_id')::uuid;
 select (s->>'version')::integer into ver from jsonb_array_elements(data->'sets') s where s->>'id'=sid::text;
 select full_name into roster_name from public.students where id=nid;
 perform public.update_khairkom_nominee(sid,nid,'اختبار اسم مؤقت للترشيح','00000000000000000111',array[30,2]::smallint[],ver);
 data:=public.khairkom_report_snapshot(f.term_id);
 if not exists(select 1 from jsonb_array_elements(data->'students') s where s->>'id'=nid::text and s->>'full_name'='اختبار اسم مؤقت للترشيح') or not exists(select 1 from jsonb_array_elements(data->'rows') x where x->>'student_id'=nid::text and x->'test_parts'='[2,30]'::jsonb and x->>'identity_number'='00000000000000000111') then raise exception 'Nominee edit missing from report';end if;
 if (select full_name from public.students where id=nid) is distinct from roster_name then raise exception 'Roster name changed';end if;
 if (select jsonb_agg(x order by x::text) from jsonb_array_elements(data->'rows') x where x->>'student_id'<>nid::text) is distinct from (select jsonb_agg(x order by x::text) from jsonb_array_elements(before_data->'rows') x where x->>'student_id'<>nid::text) then raise exception 'Other nominations changed';end if;
 begin perform public.update_khairkom_nominee(sid,nid,'اسم آخر','00000000000000000112',array[3]::smallint[],ver);raise exception 'Stale version allowed';exception when raise_exception then if sqlerrm<>'تغيّرت الترشيحات. حدّث البيانات ثم حاول مرة أخرى' then raise;end if;end;
 begin perform public.update_khairkom_nominee(sid,nid,'اسم آخر','00000000000000000112',array[31]::smallint[],ver+1);raise exception 'Invalid parts allowed';exception when raise_exception then if sqlerrm<>'اختر أجزاء مختلفة من ١ إلى ٣٠' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',f.viewer_id::text,true);
 begin perform public.update_khairkom_nominee(sid,nid,'اسم آخر','00000000000000000112',array[3]::smallint[],ver+1);raise exception 'Viewer edit allowed';exception when insufficient_privilege then null;end;
 data:=public.khairkom_report_snapshot(f.term_id);
 if not exists(select 1 from jsonb_array_elements(data->'students') s where s->>'id'=nid::text and s->>'full_name'='اختبار اسم مؤقت للترشيح') then raise exception 'Viewer cannot see correction';end if;
 perform set_config('request.jwt.claim.sub',f.teacher_id::text,true);
 begin perform public.update_khairkom_nominee(sid,nid,'اسم آخر','00000000000000000112',array[3]::smallint[],ver+1);raise exception 'Teacher edit allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',f.editor_id::text,true);
 added:=(public.add_khairkom_nomination(f.term_id,null,'اختبار مرشح مؤقت',null,'00000000000000000113',array[1]::smallint[])->>'student_id')::uuid;
 perform public.update_khairkom_nominee(added,added,'اختبار تصحيح مرشح','00000000000000000114',array[10,11]::smallint[],1);
 begin perform public.update_khairkom_nominee(added,added,'اختبار تصحيح مرشح','00000000000000000111',array[5]::smallint[],2);raise exception 'Duplicate identity allowed';exception when raise_exception then if sqlerrm<>'رقم الهوية موجود في الترشيحات بالفعل' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',f.admin_id::text,true);
 data:=public.khairkom_report_snapshot(f.term_id);
 if not exists(select 1 from jsonb_array_elements(data->'students') s where s->>'id'=added::text and s->>'full_name'='اختبار تصحيح مرشح') then raise exception 'Admin missing manual correction';end if;
 perform public.update_khairkom_nominee(added,added,'اختبار صلاحية الإدارة','00000000000000000114',array[12]::smallint[],2);
end;$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer)','execute') or has_table_privilege('authenticated','quran_private.khairkom_nominee_names','select') or has_table_privilege('authenticated','quran_private.khairkom_edit_audit','select') then raise exception 'Private access exposed';end if;
end;$$;
rollback;
select 'PASS: editor/admin updates; viewer/teacher denied; roster preserved; report refreshed; stale/invalid/duplicate rejected; all writes rolled back' as tests;
