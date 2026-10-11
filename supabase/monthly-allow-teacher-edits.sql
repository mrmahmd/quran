-- Restore edits within each teacher own monthly report; preserve saved rows.
begin;
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
  if rec.version<>p_version then raise exception 'تم تحديث التقرير. حدّث الصفحة قبل الحفظ'; end if;
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
