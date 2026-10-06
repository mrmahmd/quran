-- Every test write is rolled back. No personal records are returned.
begin;
create temporary table nomination_add_fixture as select
 (select auth_user_id from public.teacher_accounts where username='quran17') editor_id,
 (select auth_user_id from public.teacher_accounts where username='quran19') viewer_id,
 (select auth_user_id from public.teacher_accounts where username not in('quran17','quran19') and active and auth_user_id is not null limit 1) teacher_id,
 (select id from public.school_terms where active limit 1) term_id;
grant select on nomination_add_fixture to authenticated;
set local role authenticated;
do $$declare f record; added uuid; data jsonb; candidates jsonb; target uuid; before_count integer; after_count integer; roster_before integer; begin
 select * into f from nomination_add_fixture;
 if f.editor_id is null or f.viewer_id is null or f.teacher_id is null or f.term_id is null then raise exception 'Missing fixture'; end if;
 perform set_config('request.jwt.claim.sub',f.viewer_id::text,true);
 begin perform public.khairkom_nomination_candidates(f.term_id); raise exception 'Viewer read candidates allowed'; exception when insufficient_privilege then null; end;
 begin perform public.add_khairkom_nomination(f.term_id,null,'اختبار مؤقت',null,'00000000000000000001',array[1,2]::smallint[]);raise exception 'Viewer addition allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',f.teacher_id::text,true);
 begin perform public.add_khairkom_nomination(f.term_id,null,'اختبار مؤقت',null,'00000000000000000001',array[1,2]::smallint[]);raise exception 'Teacher addition allowed';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',f.editor_id::text,true);
 if not (public.khairkom_permissions()->>'add_nomination')::boolean then raise exception 'Editor missing permission';end if;
 candidates:=public.khairkom_nomination_candidates(f.term_id);
 if jsonb_array_length(candidates)=0 then raise exception 'No candidates';end if;
 select count(*) into roster_before from public.students;
 data:=public.khairkom_report_snapshot(f.term_id);before_count:=jsonb_array_length(data->'rows');
 added:=(public.add_khairkom_nomination(f.term_id,null,'اختبار ترشيح مؤقت',null,'00000000000000000001',array[5,6]::smallint[])->>'student_id')::uuid;
 data:=public.khairkom_report_snapshot(f.term_id);
 if jsonb_array_length(data->'rows')<>before_count+1 or not exists(select 1 from jsonb_array_elements(data->'students') s where s->>'id'=added::text and s->>'full_name'='اختبار ترشيح مؤقت' and s->>'source_class'='—') then raise exception 'Manual nominee missing'; end if;
 if (select count(*) from public.students)<>roster_before then raise exception 'External nominee changed roster';end if;
 begin perform public.add_khairkom_nomination(f.term_id,null,'اختبار ترشيح مؤقت',null,'00000000000000000001',array[5,6]::smallint[]);raise exception 'Duplicate identity allowed';exception when raise_exception then if sqlerrm<>'رقم الهوية موجود في الترشيحات بالفعل' then raise;end if;end;
 begin perform public.add_khairkom_nomination(f.term_id,null,'اختبار مؤقت',null,'00000000000000000002',array[31]::smallint[]);raise exception 'Invalid parts allowed';exception when raise_exception then if sqlerrm<>'اختر أجزاء مختلفة من ١ إلى ٣٠' then raise;end if;end;
 perform public.update_khairkom_identity(added,added,'00000000000000000002',1);
 data:=public.khairkom_report_snapshot(f.term_id);
 if not exists(select 1 from jsonb_array_elements(data->'rows') r where r->>'student_id'=added::text and r->>'identity_number'='00000000000000000002') then raise exception 'External identity edit failed';end if;
 target:=(candidates->0->>'id')::uuid;
 perform public.add_khairkom_nomination(f.term_id,target,null,null,'00000000000000000003',array[10,11]::smallint[]);
 data:=public.khairkom_report_snapshot(f.term_id);after_count:=jsonb_array_length(data->'rows');
 if after_count<>before_count+2 then raise exception 'Existing nominations lost';end if;
 if exists(select 1 from jsonb_array_elements(public.khairkom_nomination_candidates(f.term_id)) s where s->>'id'=target::text) then raise exception 'Already nominated candidate shown';end if;
 begin perform public.add_khairkom_nomination(f.term_id,target,null,null,'00000000000000000004',array[10]::smallint[]);raise exception 'Duplicate student allowed';exception when raise_exception then if sqlerrm<>'الطالب مرشح بالفعل' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',f.viewer_id::text,true);
 data:=public.khairkom_report_snapshot(f.term_id);
 if jsonb_array_length(data->'rows')<>after_count then raise exception 'Viewer missing new rows';end if;
end;$$;
reset role;
do $$begin
 if has_function_privilege('anon','public.add_khairkom_nomination(uuid,uuid,text,text,text,smallint[])','execute') or has_table_privilege('authenticated','quran_private.khairkom_external_nominees','select') then raise exception 'Private access exposed';end if;
end;$$;
rollback;
select 'PASS: manual/existing additions, preserved rosters, duplicate rejection, identity editing and role access; all writes rolled back' as tests;
