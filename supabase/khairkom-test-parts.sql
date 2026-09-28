-- Replace free-text memorization entry with exact Quran parts (1–30).
-- Existing nominations and their old text remain available for audit.
begin;
alter table public.khairkom_nominations
  alter column memorization_amount drop not null;
alter table public.khairkom_nominations
  add column test_parts smallint[] not null default '{}'::smallint[]
  check (cardinality(test_parts) <= 30
    and array_position(test_parts, null) is null
    and test_parts <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]::smallint[]);

create or replace function quran_private.save_khairkom_nominations(p_teacher text,p_term uuid,p_rows jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec public.khairkom_nomination_sets%rowtype; item jsonb; sid uuid; parts smallint[];
begin
 if auth.uid() is null or not exists(select 1 from public.teacher_accounts t where t.username=p_teacher and t.auth_user_id=auth.uid() and t.active) then raise exception 'هذه الترشيحات متاحة لمعلم الحلقة فقط' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active) then raise exception 'الفصل الدراسي غير نشط'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>300 or p_version is null or p_version<0 then raise exception 'قائمة الترشيحات غير صالحة'; end if;
 if (select count(distinct (r->>'student_id')::uuid) from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) then raise exception 'تكرر طالب في الترشيحات'; end if;
 perform pg_advisory_xact_lock(hashtextextended('khairkom'||p_teacher||p_term::text,0));
 select * into rec from public.khairkom_nomination_sets where teacher_username=p_teacher and term_id=p_term for update;
 if found then
  if rec.version<>p_version then raise exception 'تغيّرت الترشيحات من نافذة أخرى. حدّث الصفحة'; end if;
 else
  if p_version<>0 then raise exception 'تغيّرت الترشيحات. حدّث الصفحة'; end if;
  insert into public.khairkom_nomination_sets(teacher_username,term_id) values(p_teacher,p_term) returning * into rec;
 end if;
 update public.khairkom_nominations set nominated=false,updated_at=now()
   where set_id=rec.id and nominated and student_id not in (select (r->>'student_id')::uuid from jsonb_array_elements(p_rows) r);
 for item in select * from jsonb_array_elements(p_rows) loop
  sid:=(item->>'student_id')::uuid;
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
  insert into public.khairkom_nominations(set_id,teacher_username,student_id,test_parts,nominated)
    values(rec.id,p_teacher,sid,parts,true)
    on conflict(set_id,student_id) do update set test_parts=excluded.test_parts,nominated=true,updated_at=now();
 end loop;
 update public.khairkom_nomination_sets set version=p_version+1,updated_at=now() where id=rec.id returning * into rec;
 return to_jsonb(rec);
end;$$;
commit;
