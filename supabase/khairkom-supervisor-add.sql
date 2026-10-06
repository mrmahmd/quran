-- Additive nominations only; external students never enter teacher rosters.
begin;
alter table quran_private.khairkom_supervisors add column if not exists can_add_nomination boolean not null default false;
do $$begin
 if not exists(select 1 from public.teacher_accounts where username='quran17' and full_name like '%نمر%' and active) then raise exception 'تحقق من حساب محمد النمر'; end if;
end;$$;
update quran_private.khairkom_supervisors set can_add_nomination=true where teacher_username='quran17' and active;
create table if not exists quran_private.khairkom_external_nominees (
 id uuid primary key default gen_random_uuid(), term_id uuid not null references public.school_terms(id),
 full_name text not null check(length(btrim(full_name)) between 3 and 150),
 source_class text not null default '—' check(length(source_class) between 1 and 100),
 identity_number text not null check(identity_number ~ '^[0-9]{6,20}$'),
 test_parts smallint[] not null, version integer not null default 1,
 created_by uuid not null, updated_at timestamptz not null default now(),
 unique(term_id,identity_number),
 check(cardinality(test_parts) between 1 and 30 and array_position(test_parts,null) is null and test_parts <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]::smallint[])
);
alter table quran_private.khairkom_external_nominees enable row level security;
revoke all on quran_private.khairkom_external_nominees from public,anon,authenticated;
create table if not exists quran_private.khairkom_addition_audit (
 id bigint generated always as identity primary key, term_id uuid not null, student_id uuid not null,
 external boolean not null, actor_id uuid not null, created_at timestamptz not null default now()
);
alter table quran_private.khairkom_addition_audit enable row level security;
revoke all on quran_private.khairkom_addition_audit from public,anon,authenticated;
create or replace function quran_private.khairkom_permissions() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'view',auth.uid() is not null and (exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) or exists(select 1 from quran_private.khairkom_supervisors k join public.teacher_accounts t on t.username=k.teacher_username where t.auth_user_id=auth.uid() and t.active and k.active)),
 'edit_identity',auth.uid() is not null and (exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) or exists(select 1 from quran_private.khairkom_supervisors k join public.teacher_accounts t on t.username=k.teacher_username where t.auth_user_id=auth.uid() and t.active and k.active and k.can_edit_identity)),
 'add_nomination',auth.uid() is not null and (exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) or exists(select 1 from quran_private.khairkom_supervisors k join public.teacher_accounts t on t.username=k.teacher_username where t.auth_user_id=auth.uid() and t.active and k.active and k.can_add_nomination)));
$$;
create or replace function quran_private.khairkom_nomination_candidates(p_term uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce((quran_private.khairkom_permissions()->>'add_nomination')::boolean,false) then raise exception 'ليس لديك صلاحية إضافة المرشحين' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'teacher_username',s.teacher_username,'source_class',s.source_class) order by s.full_name),'[]'::jsonb) from public.students s join public.teacher_accounts t on t.username=s.teacher_username and t.active where s.active and not exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets ns on ns.id=n.set_id where n.student_id=s.id and ns.term_id=p_term and n.nominated));
end;$$;
create or replace function public.khairkom_nomination_candidates(p_term uuid) returns jsonb language sql stable security invoker set search_path='' as $$select quran_private.khairkom_nomination_candidates(p_term);$$;
create or replace function quran_private.add_khairkom_nomination(p_term uuid,p_student uuid,p_name text,p_class text,p_identity text,p_parts smallint[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students; ns public.khairkom_nomination_sets; added uuid; clean_name text; parts smallint[]; ident text;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'add_nomination')::boolean,false) then raise exception 'ليس لديك صلاحية إضافة المرشحين' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active) then raise exception 'الفصل الدراسي غير نشط'; end if;
 perform quran_private.assert_week_workflow_open(p_term,((current_timestamp at time zone 'Asia/Riyadh')::date - extract(dow from (current_timestamp at time zone 'Asia/Riyadh')::date)::integer));
 ident:=btrim(p_identity);
 if ident is null or ident !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_parts is null or cardinality(p_parts) not between 1 and 30 or array_position(p_parts,null) is not null or exists(select 1 from unnest(p_parts) p where p not between 1 and 30) or (select count(distinct p) from unnest(p_parts) p)<>cardinality(p_parts) then raise exception 'اختر أجزاء مختلفة من ١ إلى ٣٠'; end if;
 select array_agg(p order by p) into parts from unnest(p_parts) p;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||p_term::text||ident,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=p_term and identity_number=ident) or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets x on x.id=n.set_id where x.term_id=p_term and n.nominated and n.identity_number=ident) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
 if p_student is null then
  clean_name:=btrim(p_name);
  if clean_name is null or length(clean_name) not between 3 and 150 then raise exception 'اكتب اسم الطالب من ٣ إلى ١٥٠ حرفًا'; end if;
  if length(btrim(coalesce(p_class,'')))>100 then raise exception 'بيان الفصل طويل جدًا'; end if;
  insert into quran_private.khairkom_external_nominees(term_id,full_name,source_class,identity_number,test_parts,created_by)
   values(p_term,clean_name,coalesce(nullif(btrim(p_class),''),'—'),ident,parts,auth.uid()) returning id into added;
 else
  select * into s from public.students where id=p_student and active for share;
  if not found or not exists(select 1 from public.teacher_accounts where username=s.teacher_username and active) then raise exception 'اختر طالبًا نشطًا من الحلقات'; end if;
  perform pg_advisory_xact_lock(hashtextextended('khairkom'||s.teacher_username||p_term::text,0));
  select * into ns from public.khairkom_nomination_sets where teacher_username=s.teacher_username and term_id=p_term for update;
  if not found then insert into public.khairkom_nomination_sets(teacher_username,term_id) values(s.teacher_username,p_term) returning * into ns; end if;
  if exists(select 1 from public.khairkom_nominations where set_id=ns.id and student_id=s.id and nominated) then raise exception 'الطالب مرشح بالفعل'; end if;
  insert into public.khairkom_nominations(set_id,teacher_username,student_id,test_parts,identity_number,nominated) values(ns.id,s.teacher_username,s.id,parts,ident,true)
   on conflict(set_id,student_id) do update set test_parts=excluded.test_parts,identity_number=excluded.identity_number,nominated=true,updated_at=now();
  update public.khairkom_nomination_sets set version=version+1,updated_at=now() where id=ns.id;
  added:=s.id;
 end if;
 insert into quran_private.khairkom_addition_audit(term_id,student_id,external,actor_id) values(p_term,added,p_student is null,auth.uid());
 return jsonb_build_object('saved',true,'student_id',added);
end;$$;
create or replace function public.add_khairkom_nomination(p_term uuid,p_student uuid,p_name text,p_class text,p_identity text,p_parts smallint[]) returns jsonb language sql security invoker set search_path='' as $$select quran_private.add_khairkom_nomination(p_term,p_student,p_name,p_class,p_identity,p_parts);$$;
-- Preserve the original report function and extend its returned projection.
alter function quran_private.khairkom_report_snapshot(uuid) rename to khairkom_roster_report_snapshot;
create function quran_private.khairkom_report_snapshot(p_term uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb; extra jsonb;
begin
 data:=quran_private.khairkom_roster_report_snapshot(p_term);
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into extra from quran_private.khairkom_external_nominees e where e.term_id=p_term;
 return data || jsonb_build_object(
 'sets',(data->'sets')||(select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','teacher_username','quran17','version',(e->>'version')::integer)),'[]'::jsonb) from jsonb_array_elements(extra) e),
 'rows',(data->'rows')||(select coalesce(jsonb_agg(jsonb_build_object('set_id',e->>'id','teacher_username','quran17','student_id',e->>'id','test_parts',e->'test_parts','identity_number',e->>'identity_number','external',true)),'[]'::jsonb) from jsonb_array_elements(extra) e),
 'students',(data->'students')||(select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','full_name',e->>'full_name','teacher_username','quran17','source_class',e->>'source_class','external',true)),'[]'::jsonb) from jsonb_array_elements(extra) e));
end;$$;
-- Recreate invoker wrapper so it resolves the extended report instead of the renamed function.
create or replace function public.khairkom_report_snapshot(p_term uuid) returns jsonb language sql stable security invoker set search_path='' as $$select quran_private.khairkom_report_snapshot(p_term);$$;
alter function quran_private.update_khairkom_identity(uuid,uuid,text,integer) rename to update_khairkom_roster_identity;
create function quran_private.update_khairkom_identity(p_set uuid,p_student uuid,p_identity text,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare e quran_private.khairkom_external_nominees; cleaned text;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'edit_identity')::boolean,false) then raise exception 'ليس لديك صلاحية تعديل هوية المرشح' using errcode='42501'; end if;
 select * into e from quran_private.khairkom_external_nominees where id=p_set and id=p_student for update;
 if not found then return quran_private.update_khairkom_roster_identity(p_set,p_student,p_identity,p_version); end if;
 cleaned:=btrim(p_identity);
 if cleaned is null or cleaned !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_version is null or p_version<>e.version then raise exception 'تغيّرت الترشيحات. حدّث البيانات ثم حاول مرة أخرى'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||e.term_id::text||cleaned,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=e.term_id and id<>e.id and identity_number=cleaned) or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=e.term_id and n.nominated and n.identity_number=cleaned) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
 update quran_private.khairkom_external_nominees set identity_number=cleaned,version=version+1,updated_at=now() where id=e.id;
 insert into quran_private.khairkom_identity_audit(set_id,student_id,actor_id,old_identity,new_identity) values(e.id,e.id,auth.uid(),e.identity_number,cleaned);
 return jsonb_build_object('saved',true);
end;$$;
create or replace function public.update_khairkom_identity(p_set uuid,p_student uuid,p_identity text,p_version integer) returns jsonb language sql security invoker set search_path='' as $$select quran_private.update_khairkom_identity(p_set,p_student,p_identity,p_version);$$;
revoke all on function quran_private.khairkom_roster_report_snapshot(uuid),quran_private.update_khairkom_roster_identity(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function quran_private.khairkom_report_snapshot(uuid),quran_private.update_khairkom_identity(uuid,uuid,text,integer),quran_private.khairkom_nomination_candidates(uuid),public.khairkom_nomination_candidates(uuid),quran_private.add_khairkom_nomination(uuid,uuid,text,text,text,smallint[]),public.add_khairkom_nomination(uuid,uuid,text,text,text,smallint[]) from public,anon;
grant execute on function quran_private.khairkom_report_snapshot(uuid),quran_private.update_khairkom_identity(uuid,uuid,text,integer),quran_private.khairkom_nomination_candidates(uuid),public.khairkom_nomination_candidates(uuid),quran_private.add_khairkom_nomination(uuid,uuid,text,text,text,smallint[]),public.add_khairkom_nomination(uuid,uuid,text,text,text,smallint[]) to authenticated;
commit;
