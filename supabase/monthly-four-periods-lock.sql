-- Four ordinal periods; existing report IDs, dates and entries remain untouched.
begin;
create or replace function quran_private.valid_monthly_amount(value jsonb) returns boolean language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb; fs integer; ts integer; fa integer; ta integer; counts integer[]:=array[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
begin
 if value is null or jsonb_typeof(value)<>'object' or jsonb_typeof(value->'none') is distinct from 'boolean' or jsonb_typeof(value->'text') is distinct from 'string' then return false;end if;
 if length(value->>'text')>1000 then return false;end if;
 if (value->>'none')::boolean then return value->>'text'='';end if;
 if length(btrim(value->>'text'))=0 then return false;end if;
 if not(value?'range') then return true;end if; -- Preserve legacy free-written reports.
 r:=value->'range';
 if jsonb_typeof(r)<>'object' then return false;end if;
 if coalesce(r->>'from_surah','')!~'^[0-9]+$' or coalesce(r->>'to_surah','')!~'^[0-9]+$' or coalesce(r->>'from_ayah','')!~'^[0-9]+$' or coalesce(r->>'to_ayah','')!~'^[0-9]+$' then return false;end if;
 fs:=(r->>'from_surah')::integer;ts:=(r->>'to_surah')::integer;fa:=(r->>'from_ayah')::integer;ta:=(r->>'to_ayah')::integer;
 return fs between 1 and 114 and ts between 1 and 114 and fa between 1 and counts[fs] and ta between 1 and counts[ts] and (fs<>ts or fa<=ta);
 exception when numeric_value_out_of_range then return false;
end;$$;
create or replace function quran_private.save_monthly(p_teacher text,p_term uuid,p_month date,p_rows jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec public.monthly_reports%rowtype; item jsonb; sid uuid; expected integer; missing text;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 or not exists(select 1 from public.school_terms where id=p_term and active and p_month>=date_trunc('month',starts_on)::date and p_month<(date_trunc('month',starts_on)+interval '4 months')::date) then raise exception 'اختر شهرًا من الأول إلى الرابع للفصل الدراسي النشط'; end if;
 if p_version is null or p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'بيانات التقرير غير صالحة'; end if;
 if jsonb_array_length(p_rows)>300 then raise exception 'تجاوزت قائمة الطلاب الحد المسموح'; end if;
 perform pg_advisory_xact_lock(hashtextextended('monthly'||p_teacher||p_term::text||p_month::text,0));
 select * into rec from public.monthly_reports where teacher_username=p_teacher and term_id=p_term and month_start=p_month for update;
 if found then
  raise exception 'تقرير هذا الشهر محفوظ ومغلق، ولا يمكن تعديله';
 else
  if p_version<>0 then raise exception 'تم تحديث التقرير. حدّث الصفحة'; end if;
  insert into public.monthly_reports(teacher_username,term_id,month_start) values(p_teacher,p_term,p_month) returning * into rec;
 end if;
 -- Lock roster rows against simultaneous transfer/archive during this save.
 perform 1 from public.students where teacher_username=p_teacher for share;
 select count(*) into expected from public.students s where s.teacher_username=p_teacher and (s.active or exists(select 1 from public.monthly_entries e where e.report_id=rec.id and e.student_id=s.id));
 if expected=0 then raise exception 'لا يوجد طلاب في هذه الحلقة'; end if;
 select s.full_name into missing from public.students s where s.teacher_username=p_teacher and (s.active or exists(select 1 from public.monthly_entries e where e.report_id=rec.id and e.student_id=s.id)) and not exists(select 1 from jsonb_array_elements(p_rows) row where (row->>'student_id')::uuid=s.id) order by s.full_name limit 1;
 if missing is not null then raise exception 'التقرير غير مكتمل للطالب: %',missing; end if;
 if jsonb_array_length(p_rows)<>expected or (select count(distinct (row->>'student_id')::uuid) from jsonb_array_elements(p_rows) row)<>expected then raise exception 'قائمة التقرير غير مطابقة لطلاب الحلقة'; end if;
 for item in select * from jsonb_array_elements(p_rows) loop
  sid:=(item->>'student_id')::uuid;
  select full_name into missing from public.students s where s.id=sid and s.teacher_username=p_teacher and (s.active or exists(select 1 from public.monthly_entries e where e.report_id=rec.id and e.student_id=s.id));
  if missing is null then raise exception 'الطالب خارج الحلقة'; end if;
  if not quran_private.valid_monthly_amount(item->'memorization') or not quran_private.valid_monthly_amount(item->'revision') or jsonb_typeof(item->'note') is distinct from 'string' or length(item->>'note')>500 then raise exception 'التقرير غير مكتمل للطالب: %',missing; end if;
  insert into public.monthly_entries(report_id,teacher_username,student_id,memorization,revision,note) values(rec.id,p_teacher,sid,item->'memorization',item->'revision',item->>'note')
  on conflict(report_id,student_id) do update set memorization=excluded.memorization,revision=excluded.revision,note=excluded.note;
 end loop;
 update public.monthly_reports set version=p_version+1,updated_at=now() where id=rec.id returning * into rec;
 return to_jsonb(rec);
end;$$;
commit;
