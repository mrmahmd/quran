-- Nomination-only name corrections; roster/evaluations remain untouched.
begin;
create table if not exists quran_private.khairkom_nominee_names (
 set_id uuid not null references public.khairkom_nomination_sets(id),
 student_id uuid not null references public.students(id),
 full_name text not null check(length(btrim(full_name)) between 3 and 150),
 updated_at timestamptz not null default now(), primary key(set_id,student_id)
);
alter table quran_private.khairkom_nominee_names enable row level security;
revoke all on quran_private.khairkom_nominee_names from public,anon,authenticated;
create table if not exists quran_private.khairkom_edit_audit (
 id bigint generated always as identity primary key,set_id uuid not null,student_id uuid not null,
 actor_id uuid not null,old_data jsonb not null,new_data jsonb not null,changed_at timestamptz not null default now()
);
alter table quran_private.khairkom_edit_audit enable row level security;
revoke all on quran_private.khairkom_edit_audit from public,anon,authenticated;
create or replace function quran_private.update_khairkom_nominee(p_set uuid,p_student uuid,p_name text,p_identity text,p_parts smallint[],p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare clean_name text:=btrim(p_name); ident text:=btrim(p_identity); parts smallint[]; target_term uuid; old_data jsonb; external_row boolean;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'edit_identity')::boolean,false) then raise exception 'ليس لديك صلاحية تعديل المرشح' using errcode='42501'; end if;
 if clean_name is null or length(clean_name) not between 3 and 150 then raise exception 'اكتب اسم الطالب من ٣ إلى ١٥٠ حرفًا'; end if;
 if ident is null or ident !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_parts is null or cardinality(p_parts) not between 1 and 30 or array_position(p_parts,null) is not null or exists(select 1 from unnest(p_parts) p where p not between 1 and 30) or (select count(distinct p) from unnest(p_parts) p)<>cardinality(p_parts) then raise exception 'اختر أجزاء مختلفة من ١ إلى ٣٠'; end if;
 select array_agg(p order by p) into parts from unnest(p_parts) p;
 select term_id into target_term from quran_private.khairkom_external_nominees where id=p_set and id=p_student;
 external_row:=found;
 if not external_row then select term_id into target_term from public.khairkom_nomination_sets where id=p_set; end if;
 if target_term is null then raise exception 'الترشيح غير موجود'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||target_term::text||ident,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=target_term and identity_number=ident and not (external_row and id=p_student))
 or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=target_term and n.nominated and n.identity_number=ident and not (n.set_id=p_set and n.student_id=p_student)) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
 -- Existing identity writer performs authorization, row/batch locking and optimistic version validation.
 perform quran_private.update_khairkom_identity(p_set,p_student,ident,p_version);
 if external_row then
  select jsonb_build_object('full_name',full_name,'test_parts',test_parts) into old_data from quran_private.khairkom_external_nominees where id=p_student;
  update quran_private.khairkom_external_nominees set full_name=clean_name,test_parts=parts,updated_at=now() where id=p_student;
 else
  select jsonb_build_object('full_name',coalesce(o.full_name,s.full_name),'test_parts',n.test_parts) into old_data from public.khairkom_nominations n join public.students s on s.id=n.student_id left join quran_private.khairkom_nominee_names o on o.set_id=n.set_id and o.student_id=n.student_id where n.set_id=p_set and n.student_id=p_student;
  insert into quran_private.khairkom_nominee_names(set_id,student_id,full_name) values(p_set,p_student,clean_name) on conflict(set_id,student_id) do update set full_name=excluded.full_name,updated_at=now();
  update public.khairkom_nominations set test_parts=parts,updated_at=now() where set_id=p_set and student_id=p_student;
 end if;
 insert into quran_private.khairkom_edit_audit(set_id,student_id,actor_id,old_data,new_data) values(p_set,p_student,auth.uid(),old_data,jsonb_build_object('full_name',clean_name,'test_parts',parts));
 return jsonb_build_object('saved',true,'version',p_version+1);
end;$$;
create or replace function public.update_khairkom_nominee(p_set uuid,p_student uuid,p_name text,p_identity text,p_parts smallint[],p_version integer)
returns jsonb language sql security invoker set search_path='' as $$select quran_private.update_khairkom_nominee(p_set,p_student,p_name,p_identity,p_parts,p_version);$$;
do $$begin
 if to_regprocedure('quran_private.khairkom_base_report_snapshot(uuid)') is null then alter function quran_private.khairkom_report_snapshot(uuid) rename to khairkom_base_report_snapshot; end if;
end;$$;
create or replace function quran_private.khairkom_report_snapshot(p_term uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb;
begin
 data:=quran_private.khairkom_base_report_snapshot(p_term);
 return data || jsonb_build_object('students',(select coalesce(jsonb_agg(s || case when o.full_name is not null then jsonb_build_object('full_name',o.full_name) else '{}'::jsonb end),'[]'::jsonb) from jsonb_array_elements(data->'students') s left join lateral (select names.full_name from quran_private.khairkom_nominee_names names join public.khairkom_nomination_sets ns on ns.id=names.set_id join public.khairkom_nominations n on n.set_id=names.set_id and n.student_id=names.student_id and n.nominated where ns.term_id=p_term and names.student_id=(s->>'id')::uuid order by names.updated_at desc limit 1) o on true));
end;$$;
create or replace function public.khairkom_report_snapshot(p_term uuid) returns jsonb language sql stable security invoker set search_path='' as $$select quran_private.khairkom_report_snapshot(p_term);$$;
revoke all on function quran_private.khairkom_base_report_snapshot(uuid) from public,anon,authenticated;
revoke all on function quran_private.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer),public.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer),quran_private.khairkom_report_snapshot(uuid) from public,anon;
grant execute on function quran_private.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer),public.update_khairkom_nominee(uuid,uuid,text,text,smallint[],integer),quran_private.khairkom_report_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
