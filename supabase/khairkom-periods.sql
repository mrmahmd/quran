-- Separate monthly Khairkom rounds. Existing clients remain on month one.
begin;
set local lock_timeout='5s';
create temporary table khairkom_before on commit drop as select
 (select md5(coalesce(jsonb_agg(to_jsonb(s) order by id)::text,'')) from public.khairkom_nomination_sets s) sets,
 (select md5(coalesce(jsonb_agg(to_jsonb(n) order by set_id,student_id)::text,'')) from public.khairkom_nominations n) nominations,
 (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'')) from quran_private.khairkom_external_nominees e) external;
alter table public.khairkom_nomination_sets add column period_no integer not null default 1 check(period_no in (1,2));
alter table quran_private.khairkom_external_nominees add column period_no integer not null default 1 check(period_no in (1,2));

alter table khairkom_nomination_sets drop constraint khairkom_nomination_sets_teacher_username_term_id_key;
alter table quran_private.khairkom_external_nominees drop constraint khairkom_external_nominees_term_id_identity_number_key;
alter table public.khairkom_nomination_sets add unique(teacher_username,term_id,period_no);
alter table quran_private.khairkom_external_nominees add unique(term_id,identity_number,period_no);
grant select(period_no) on public.khairkom_nomination_sets to authenticated;
CREATE OR REPLACE FUNCTION quran_private.save_khairkom_nominations_period(p_period integer, p_teacher text, p_term uuid, p_rows jsonb, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rec public.khairkom_nomination_sets%rowtype; item jsonb; sid uuid; parts smallint[]; identity_value text;
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 if auth.uid() is null or not exists(select 1 from public.teacher_accounts t where t.username=p_teacher and t.auth_user_id=auth.uid() and t.active) then raise exception 'هذه الترشيحات متاحة لمعلم الحلقة فقط' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active) then raise exception 'الفصل الدراسي غير نشط'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>300 or p_version is null or p_version<0 then raise exception 'قائمة الترشيحات غير صالحة'; end if;
 if (select count(distinct (r->>'student_id')::uuid) from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) then raise exception 'تكرر طالب في الترشيحات'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom'||p_teacher||p_term::text,0));
 select * into rec from public.khairkom_nomination_sets where teacher_username=p_teacher and term_id=p_term and period_no=p_period for update;
 if found then
 if rec.version<>p_version then raise exception 'تغيّرت الترشيحات من نافذة أخرى. حدّث الصفحة'; end if;
 else
 if p_version<>0 then raise exception 'تغيّرت الترشيحات. حدّث الصفحة'; end if;
 insert into public.khairkom_nomination_sets(teacher_username,term_id,period_no) values(p_teacher,p_term,p_period) returning * into rec;
 end if;
 update public.khairkom_nominations set nominated=false,updated_at=now()
 where set_id=rec.id and nominated and student_id not in (select (r->>'student_id')::uuid from jsonb_array_elements(p_rows) r);
 for item in select * from jsonb_array_elements(p_rows) loop
 sid:=(item->>'student_id')::uuid;
 if jsonb_typeof(item->'identity_number') is distinct from 'string' then raise exception 'اكتب رقم هوية الطالب المرشح'; end if;
 identity_value:=btrim(item->>'identity_number');
 if identity_value !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if jsonb_typeof(item->'test_parts') is distinct from 'array' then raise exception 'اختر أجزاء الاختبار لكل طالب مرشح'; end if;
 if jsonb_array_length(item->'test_parts') not between 1 and 30 then raise exception 'اختر جزءًا واحدًا على الأقل لكل طالب'; end if;
 if exists(select 1 from jsonb_array_elements(item->'test_parts') p where jsonb_typeof(p.value)<>'number' or p.value::text !~ '^[0-9]+$') then raise exception 'أرقام الأجزاء غير صالحة'; end if;
 select array_agg((p.value::text)::smallint order by (p.value::text)::smallint) into parts
 from jsonb_array_elements(item->'test_parts') p;
 if exists(select 1 from unnest(parts) p where p not between 1 and 30)
 or (select count(distinct p) from unnest(parts) p)<>cardinality(parts) then raise exception 'اختر أجزاء مختلفة من ١ إلى ٣٠'; end if;
 perform 1 from public.students s where s.id=sid and s.teacher_username=p_teacher
 and (s.active or exists(select 1 from public.khairkom_nominations n where n.set_id=rec.id and n.student_id=s.id)) for share;
 if not found then raise exception 'طالب خارج حلقتك أو غير نشط'; end if;
 insert into public.khairkom_nominations(set_id,teacher_username,student_id,test_parts,identity_number,nominated)
 values(rec.id,p_teacher,sid,parts,identity_value,true)
 on conflict(set_id,student_id) do update set test_parts=excluded.test_parts,identity_number=excluded.identity_number,nominated=true,updated_at=now();
 end loop;
 update public.khairkom_nomination_sets set version=p_version+1,updated_at=now() where id=rec.id returning * into rec;
 return to_jsonb(rec);
end;$function$
;
revoke all on function quran_private.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer) from public,anon,authenticated;
create or replace function quran_private.save_khairkom_nominations(p_teacher text, p_term uuid, p_rows jsonb, p_version integer) returns jsonb language sql security invoker set search_path='' as $$select quran_private.save_khairkom_nominations_period(1,p_teacher,p_term,p_rows,p_version);$$;
grant execute on function quran_private.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer) to authenticated;
create function public.save_khairkom_nominations_period(p_period integer,p_teacher text, p_term uuid, p_rows jsonb, p_version integer) returns jsonb language sql security invoker set search_path='' as $$select quran_private.save_khairkom_nominations_period(p_period,p_teacher,p_term,p_rows,p_version);$$;
revoke all on function public.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer) from public,anon; grant execute on function public.save_khairkom_nominations_period(integer,text,uuid,jsonb,integer) to authenticated;
CREATE OR REPLACE FUNCTION quran_private.add_khairkom_nomination_period(p_period integer, p_term uuid, p_student uuid, p_name text, p_class text, p_identity text, p_parts smallint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.students; ns public.khairkom_nomination_sets; added uuid; clean_name text; parts smallint[]; ident text;
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 if not coalesce((quran_private.khairkom_permissions()->>'add_nomination')::boolean,false) then raise exception 'ليس لديك صلاحية إضافة المرشحين' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active) then raise exception 'الفصل الدراسي غير نشط'; end if;
 perform quran_private.assert_week_workflow_open(p_term,((current_timestamp at time zone 'Asia/Riyadh')::date - extract(dow from (current_timestamp at time zone 'Asia/Riyadh')::date)::integer));
 ident:=btrim(p_identity);
 if ident is null or ident !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_parts is null or cardinality(p_parts) not between 1 and 30 or array_position(p_parts,null) is not null or exists(select 1 from unnest(p_parts) p where p not between 1 and 30) or (select count(distinct p) from unnest(p_parts) p)<>cardinality(p_parts) then raise exception 'اختر أجزاء مختلفة من ١ إلى ٣٠'; end if;
 select array_agg(p order by p) into parts from unnest(p_parts) p;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||p_term::text||ident,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=p_term and period_no=p_period and identity_number=ident) or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets x on x.id=n.set_id where x.term_id=p_term and x.period_no=p_period and n.nominated and n.identity_number=ident) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
 if p_student is null then
 clean_name:=btrim(p_name);
 if clean_name is null or length(clean_name) not between 3 and 150 then raise exception 'اكتب اسم الطالب من ٣ إلى ١٥٠ حرفًا'; end if;
 if length(btrim(coalesce(p_class,'')))>100 then raise exception 'بيان الفصل طويل جدًا'; end if;
 insert into quran_private.khairkom_external_nominees(term_id,full_name,source_class,identity_number,test_parts,created_by,period_no)
 values(p_term,clean_name,coalesce(nullif(btrim(p_class),''),'—'),ident,parts,auth.uid(),p_period) returning id into added;
 else
 select * into s from public.students where id=p_student and active for share;
 if not found or not exists(select 1 from public.teacher_accounts where username=s.teacher_username and active) then raise exception 'اختر طالبًا نشطًا من الحلقات'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom'||s.teacher_username||p_term::text,0));
 select * into ns from public.khairkom_nomination_sets where teacher_username=s.teacher_username and term_id=p_term and period_no=p_period for update;
 if not found then insert into public.khairkom_nomination_sets(teacher_username,term_id,period_no) values(s.teacher_username,p_term,p_period) returning * into ns; end if;
 if exists(select 1 from public.khairkom_nominations where set_id=ns.id and student_id=s.id and nominated) then raise exception 'الطالب مرشح بالفعل'; end if;
 insert into public.khairkom_nominations(set_id,teacher_username,student_id,test_parts,identity_number,nominated) values(ns.id,s.teacher_username,s.id,parts,ident,true)
 on conflict(set_id,student_id) do update set test_parts=excluded.test_parts,identity_number=excluded.identity_number,nominated=true,updated_at=now();
 update public.khairkom_nomination_sets set version=version+1,updated_at=now() where id=ns.id;
 added:=s.id;
 end if;
 insert into quran_private.khairkom_addition_audit(term_id,student_id,external,actor_id) values(p_term,added,p_student is null,auth.uid());
 return jsonb_build_object('saved',true,'student_id',added);
end;$function$
;
revoke all on function quran_private.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[]) from public,anon,authenticated;
create or replace function quran_private.add_khairkom_nomination(p_term uuid, p_student uuid, p_name text, p_class text, p_identity text, p_parts smallint[]) returns jsonb language sql security invoker set search_path='' as $$select quran_private.add_khairkom_nomination_period(1,p_term,p_student,p_name,p_class,p_identity,p_parts);$$;
grant execute on function quran_private.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[]) to authenticated;
create function public.add_khairkom_nomination_period(p_period integer,p_term uuid, p_student uuid, p_name text, p_class text, p_identity text, p_parts smallint[]) returns jsonb language sql security invoker set search_path='' as $$select quran_private.add_khairkom_nomination_period(p_period,p_term,p_student,p_name,p_class,p_identity,p_parts);$$;
revoke all on function public.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[]) from public,anon; grant execute on function public.add_khairkom_nomination_period(integer,uuid,uuid,text,text,text,smallint[]) to authenticated;
CREATE OR REPLACE FUNCTION quran_private.khairkom_nomination_candidates_period(p_period integer, p_term uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 if not coalesce((quran_private.khairkom_permissions()->>'add_nomination')::boolean,false) then raise exception 'ليس لديك صلاحية إضافة المرشحين' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'full_name',s.full_name,'teacher_username',s.teacher_username,'source_class',s.source_class) order by s.full_name),'[]'::jsonb) from public.students s join public.teacher_accounts t on t.username=s.teacher_username and t.active where s.active and not exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets ns on ns.id=n.set_id where n.student_id=s.id and ns.term_id=p_term and ns.period_no=p_period and n.nominated));
end;$function$
;
revoke all on function quran_private.khairkom_nomination_candidates_period(integer,uuid) from public,anon,authenticated;
create or replace function quran_private.khairkom_nomination_candidates(p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_nomination_candidates_period(1,p_term);$$;
grant execute on function quran_private.khairkom_nomination_candidates_period(integer,uuid) to authenticated;
create function public.khairkom_nomination_candidates_period(p_period integer,p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_nomination_candidates_period(p_period,p_term);$$;
revoke all on function public.khairkom_nomination_candidates_period(integer,uuid) from public,anon; grant execute on function public.khairkom_nomination_candidates_period(integer,uuid) to authenticated;
CREATE OR REPLACE FUNCTION quran_private.khairkom_roster_report_snapshot_period(p_period integer, p_term uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 if not coalesce((quran_private.khairkom_permissions()->>'view')::boolean,false) then raise exception 'ليس لديك صلاحية عرض ترشيحات خيركم' using errcode='42501'; end if;
 return jsonb_build_object(
 'teachers',(select coalesce(jsonb_agg(jsonb_build_object('username',t.username,'full_name',t.full_name,'class_name',t.class_name,'ring_name',t.ring_name,'active',t.active) order by t.username),'[]'::jsonb) from public.teacher_accounts t where t.active or exists(select 1 from public.khairkom_nomination_sets ns where ns.teacher_username=t.username and ns.term_id=p_term and ns.period_no=p_period)),
 'sets',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'teacher_username',s.teacher_username,'version',s.version)),'[]'::jsonb) from public.khairkom_nomination_sets s where s.term_id=p_term and s.period_no=p_period),
 'rows',(select coalesce(jsonb_agg(jsonb_build_object('set_id',n.set_id,'teacher_username',n.teacher_username,'student_id',n.student_id,'test_parts',n.test_parts,'identity_number',n.identity_number) order by n.teacher_username,n.student_id),'[]'::jsonb) from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=p_term and s.period_no=p_period and n.nominated),
 'students',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'full_name',st.full_name,'teacher_username',st.teacher_username,'source_class',st.source_class) order by st.full_name),'[]'::jsonb) from public.students st where exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where n.student_id=st.id and n.nominated and s.term_id=p_term and s.period_no=p_period)));
end;$function$
;
revoke all on function quran_private.khairkom_roster_report_snapshot_period(integer,uuid) from public,anon,authenticated;
create or replace function quran_private.khairkom_roster_report_snapshot(p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_roster_report_snapshot_period(1,p_term);$$;
CREATE OR REPLACE FUNCTION quran_private.khairkom_base_report_snapshot_period(p_period integer, p_term uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare data jsonb; extra jsonb;
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 data:=quran_private.khairkom_roster_report_snapshot_period(p_period,p_term);
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into extra from quran_private.khairkom_external_nominees e where e.term_id=p_term and e.period_no=p_period;
 return data || jsonb_build_object(
 'sets',(data->'sets')||(select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','teacher_username','quran17','version',(e->>'version')::integer)),'[]'::jsonb) from jsonb_array_elements(extra) e),
 'rows',(data->'rows')||(select coalesce(jsonb_agg(jsonb_build_object('set_id',e->>'id','teacher_username','quran17','student_id',e->>'id','test_parts',e->'test_parts','identity_number',e->>'identity_number','external',true)),'[]'::jsonb) from jsonb_array_elements(extra) e),
 'students',(data->'students')||(select coalesce(jsonb_agg(jsonb_build_object('id',e->>'id','full_name',e->>'full_name','teacher_username','quran17','source_class',e->>'source_class','external',true)),'[]'::jsonb) from jsonb_array_elements(extra) e));
end;$function$
;
revoke all on function quran_private.khairkom_base_report_snapshot_period(integer,uuid) from public,anon,authenticated;
create or replace function quran_private.khairkom_base_report_snapshot(p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_base_report_snapshot_period(1,p_term);$$;
CREATE OR REPLACE FUNCTION quran_private.khairkom_report_snapshot_period(p_period integer, p_term uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare data jsonb;
begin
 if p_period is null or p_period not in (1,2) then raise exception 'اختر الشهر الأول أو الشهر الثاني' using errcode='23514'; end if;
 data:=quran_private.khairkom_base_report_snapshot_period(p_period,p_term);
 return data || jsonb_build_object('students',(select coalesce(jsonb_agg(s || case when o.full_name is not null then jsonb_build_object('full_name',o.full_name) else '{}'::jsonb end),'[]'::jsonb) from jsonb_array_elements(data->'students') s left join lateral (select names.full_name from quran_private.khairkom_nominee_names names join public.khairkom_nomination_sets ns on ns.id=names.set_id join public.khairkom_nominations n on n.set_id=names.set_id and n.student_id=names.student_id and n.nominated where ns.term_id=p_term and ns.period_no=p_period and names.student_id=(s->>'id')::uuid order by names.updated_at desc limit 1) o on true));
end;$function$
;
revoke all on function quran_private.khairkom_report_snapshot_period(integer,uuid) from public,anon,authenticated;
create or replace function quran_private.khairkom_report_snapshot(p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_report_snapshot_period(1,p_term);$$;
grant execute on function quran_private.khairkom_report_snapshot_period(integer,uuid) to authenticated;
create function public.khairkom_report_snapshot_period(p_period integer,p_term uuid) returns jsonb language sql security invoker set search_path='' as $$select quran_private.khairkom_report_snapshot_period(p_period,p_term);$$;
revoke all on function public.khairkom_report_snapshot_period(integer,uuid) from public,anon; grant execute on function public.khairkom_report_snapshot_period(integer,uuid) to authenticated;
CREATE OR REPLACE FUNCTION quran_private.update_khairkom_identity(p_set uuid, p_student uuid, p_identity text, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e quran_private.khairkom_external_nominees; cleaned text;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'edit_identity')::boolean,false) then raise exception 'ليس لديك صلاحية تعديل هوية المرشح' using errcode='42501'; end if;
 select * into e from quran_private.khairkom_external_nominees where id=p_set and id=p_student for update;
 if not found then return quran_private.update_khairkom_roster_identity(p_set,p_student,p_identity,p_version); end if;
 cleaned:=btrim(p_identity);
 if cleaned is null or cleaned !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_version is null or p_version<>e.version then raise exception 'تغيّرت الترشيحات. حدّث البيانات ثم حاول مرة أخرى'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||e.term_id::text||cleaned,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=e.term_id and period_no=e.period_no and id<>e.id and identity_number=cleaned) or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=e.term_id and s.period_no=e.period_no and n.nominated and n.identity_number=cleaned) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
 update quran_private.khairkom_external_nominees set identity_number=cleaned,version=version+1,updated_at=now() where id=e.id;
 insert into quran_private.khairkom_identity_audit(set_id,student_id,actor_id,old_identity,new_identity) values(e.id,e.id,auth.uid(),e.identity_number,cleaned);
 return jsonb_build_object('saved',true);
end;$function$
;
CREATE OR REPLACE FUNCTION quran_private.update_khairkom_nominee(p_set uuid, p_student uuid, p_name text, p_identity text, p_parts smallint[], p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare clean_name text:=btrim(p_name); ident text:=btrim(p_identity); parts smallint[]; target_term uuid; target_period integer; old_data jsonb; external_row boolean;
begin
 if not coalesce((quran_private.khairkom_permissions()->>'edit_identity')::boolean,false) then raise exception 'ليس لديك صلاحية تعديل المرشح' using errcode='42501'; end if;
 if clean_name is null or length(clean_name) not between 3 and 150 then raise exception 'اكتب اسم الطالب من ٣ إلى ١٥٠ حرفًا'; end if;
 if ident is null or ident !~ '^[0-9]{6,20}$' then raise exception 'رقم الهوية يجب أن يكون من ٦ إلى ٢٠ رقمًا'; end if;
 if p_parts is null or cardinality(p_parts) not between 1 and 30 or array_position(p_parts,null) is not null or exists(select 1 from unnest(p_parts) p where p not between 1 and 30) or (select count(distinct p) from unnest(p_parts) p)<>cardinality(p_parts) then raise exception 'اختر أجزاء مختلفة من ١ إلى ٣٠'; end if;
 select array_agg(p order by p) into parts from unnest(p_parts) p;
 select term_id,period_no into target_term,target_period from quran_private.khairkom_external_nominees where id=p_set and id=p_student;
 external_row:=found;
 if not external_row then select term_id,period_no into target_term,target_period from public.khairkom_nomination_sets where id=p_set; end if;
 if target_term is null then raise exception 'الترشيح غير موجود'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom-identity'||target_term::text||ident,0));
 if exists(select 1 from quran_private.khairkom_external_nominees where term_id=target_term and period_no=target_period and identity_number=ident and not (external_row and id=p_student))
 or exists(select 1 from public.khairkom_nominations n join public.khairkom_nomination_sets s on s.id=n.set_id where s.term_id=target_term and s.period_no=target_period and n.nominated and n.identity_number=ident and not (n.set_id=p_set and n.student_id=p_student)) then raise exception 'رقم الهوية موجود في الترشيحات بالفعل'; end if;
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
end;$function$
;
do $$declare old record;begin
 select * into old from khairkom_before;
 if old.sets<>(select md5(coalesce(jsonb_agg(to_jsonb(s)-'period_no' order by id)::text,'')) from public.khairkom_nomination_sets s)
 or old.nominations<>(select md5(coalesce(jsonb_agg(to_jsonb(n) order by set_id,student_id)::text,'')) from public.khairkom_nominations n)
 or old.external<>(select md5(coalesce(jsonb_agg(to_jsonb(e)-'period_no' order by id)::text,'')) from quran_private.khairkom_external_nominees e)
 then raise exception 'Existing nominations changed; rolling back.';end if;
end;$$;
notify pgrst,'reload schema';
commit;
select period_no,count(*) as saved_teacher_sets from public.khairkom_nomination_sets group by period_no order by period_no;
