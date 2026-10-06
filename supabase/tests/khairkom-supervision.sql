-- All mutations are rolled back. No student names or identities are emitted.
begin;
create temporary table khairkom_test_fixture as
 select (select auth_user_id from public.teacher_accounts where username='quran17') as editor_id,
 (select auth_user_id from public.teacher_accounts where username='quran19') as viewer_id,
 (select auth_user_id from public.teacher_accounts where username not in ('quran17','quran19') and active and auth_user_id is not null limit 1) as teacher_id,
 (select auth_user_id from public.admin_accounts where active and auth_user_id is not null limit 1) as admin_id,
 (select id from public.school_terms where active limit 1) as term_id,
 (select n.set_id from public.khairkom_nominations n where n.nominated limit 1) as set_id;
 grant select on khairkom_test_fixture to authenticated;
set local role authenticated;
do $$declare f record; snapshot jsonb; target jsonb; v integer;begin
 select * into f from khairkom_test_fixture;
 if f.editor_id is null or f.viewer_id is null or f.teacher_id is null or f.admin_id is null or f.term_id is null then raise exception 'Missing test accounts';end if;
 perform set_config('request.jwt.claim.sub',f.viewer_id::text,true);
 if public.khairkom_permissions()<>jsonb_build_object('view',true,'edit_identity',false,'add_nomination',false) then raise exception 'Viewer permissions wrong';end if;
 snapshot:=public.khairkom_report_snapshot(f.term_id);
 if jsonb_array_length(snapshot->'teachers')<2 then raise exception 'Viewer cannot read report';end if;
 begin perform public.update_khairkom_identity(f.set_id,gen_random_uuid(),'000000',1);raise exception 'Viewer edit incorrectly allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',f.teacher_id::text,true);
 if public.khairkom_permissions()<>jsonb_build_object('view',false,'edit_identity',false,'add_nomination',false) then raise exception 'Teacher gained access';end if;
 begin perform public.khairkom_report_snapshot(f.term_id);raise exception 'Teacher report incorrectly allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 if (public.khairkom_permissions()->>'view')::boolean then raise exception 'Signed-out access allowed';end if;
 begin perform public.khairkom_report_snapshot(f.term_id);raise exception 'Signed-out report allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',f.editor_id::text,true);
 if public.khairkom_permissions()<>jsonb_build_object('view',true,'edit_identity',true,'add_nomination',true) then raise exception 'Editor permissions wrong';end if;
 snapshot:=public.khairkom_report_snapshot(f.term_id);
 select value into target from jsonb_array_elements(snapshot->'rows') where value->>'identity_number' ~ '^[0-9]{6,20}$' limit 1;
 if target is null then raise exception 'No nominated student for write test';end if;
 select (value->>'version')::integer into v from jsonb_array_elements(snapshot->'sets') where value->>'id'=target->>'set_id';
 perform public.update_khairkom_identity((target->>'set_id')::uuid,(target->>'student_id')::uuid,target->>'identity_number',v);
 begin perform public.update_khairkom_identity((target->>'set_id')::uuid,(target->>'student_id')::uuid,target->>'identity_number',v);raise exception 'Stale version accepted';exception when raise_exception then if sqlerrm not like 'تغيّرت الترشيحات%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',f.admin_id::text,true);
 if public.khairkom_permissions()<>jsonb_build_object('view',true,'edit_identity',true,'add_nomination',true) then raise exception 'Admin permissions wrong';end if;
end;$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.khairkom_report_snapshot(uuid)','execute') or has_function_privilege('anon','public.update_khairkom_identity(uuid,uuid,text,integer)','execute') then raise exception 'Anonymous execute grant';end if;
 if has_table_privilege('authenticated','quran_private.khairkom_supervisors','select') or has_table_privilege('authenticated','public.khairkom_nominations','update') then raise exception 'Direct table access broadened';end if;
end;$$;
rollback;
select 'PASS: viewer, editor, teacher, admin, anonymous and stale-version checks; changes rolled back' as security_tests;
