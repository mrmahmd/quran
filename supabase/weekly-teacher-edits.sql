-- Deploy after dashboard.sql, independent-knight.sql and week-workflow-control.sql.
-- Submitted edits are atomic: preserve review ID, roster snapshot and manual knight.
-- Ownership, workflow locks, bounds, completeness and version conflicts still apply.
begin;
create or replace function quran_private.save_week(p_teacher text,p_term uuid,p_week date,p_rows jsonb,p_submit boolean,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec public.weekly_reviews%rowtype; item jsonb; sid uuid; expected integer; actual integer;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active and p_week<=ends_on and p_week+6>=starts_on)
 or extract(dow from p_week)<>0 then raise exception 'الأسبوع خارج الفصل الدراسي النشط'; end if;
 if p_submit and p_week>(current_timestamp at time zone 'Asia/Riyadh')::date then raise exception 'لا يمكن اعتماد أسبوع لم يبدأ'; end if;
 if p_rows is null or p_submit is null or p_version is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>300 then raise exception 'قائمة التقييم غير صالحة'; end if;
 perform quran_private.assert_week_workflow_open(p_term,p_week);
 perform pg_advisory_xact_lock(hashtextextended(p_teacher||p_term::text||p_week::text,0));
 select * into rec from public.weekly_reviews where teacher_username=p_teacher and term_id=p_term and week_start=p_week for update;
 if found then
  if rec.version<>p_version then raise exception 'تم تحديث هذا الأسبوع من نافذة أخرى. حدّث الصفحة قبل الحفظ'; end if;
  if rec.status='submitted' and not p_submit then raise exception 'التقييم المحفوظ يظل معتمدًا؛ احفظ التعديلات لجميع الطلاب'; end if;
 else
  if p_version<>0 then raise exception 'حدّث الصفحة قبل الحفظ'; end if;
  insert into public.weekly_reviews(teacher_username,term_id,week_start) values(p_teacher,p_term,p_week) returning * into rec;
 end if;
 select count(*) into expected from public.students s where s.teacher_username=p_teacher and
 ((rec.status<>'submitted' and s.active) or exists(select 1 from public.weekly_evaluations e where e.review_id=rec.id and e.student_id=s.id));
 if expected=0 then raise exception 'لم تُضف أسماء الطلاب لهذه الحلقة بعد'; end if;
 if jsonb_array_length(p_rows)<>expected then raise exception 'تغيرت قائمة الطلاب. حدّث الصفحة وأعد التقييم'; end if;
 if (select count(distinct x->>'student_id') from jsonb_array_elements(p_rows) x)<>expected then raise exception 'قائمة الطلاب مكررة أو ناقصة'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  sid:=(item->>'student_id')::uuid;
  if not exists(select 1 from public.students s where s.id=sid and s.teacher_username=p_teacher and
  ((rec.status<>'submitted' and s.active) or exists(select 1 from public.weekly_evaluations e where e.review_id=rec.id and e.student_id=sid))) then raise exception 'طالب غير تابع للحلقة'; end if;
  insert into public.weekly_evaluations(review_id,teacher_username,student_id,memorization,revision,improvement,commitment,bonus_memorization,bonus_revision)
  values(rec.id,p_teacher,sid,(item->>'memorization')::smallint,(item->>'revision')::smallint,(item->>'improvement')::smallint,(item->>'commitment')::smallint,coalesce((item->>'bonus_memorization')::smallint,0),coalesce((item->>'bonus_revision')::smallint,0))
  on conflict(review_id,student_id) do update set memorization=excluded.memorization,revision=excluded.revision,improvement=excluded.improvement,commitment=excluded.commitment,bonus_memorization=excluded.bonus_memorization,bonus_revision=excluded.bonus_revision;
 end loop;
 if p_submit and exists(select 1 from public.weekly_evaluations where review_id=rec.id and total is null) then raise exception 'أكمل نقاط جميع الطلاب قبل الاعتماد'; end if;
 update public.weekly_reviews set status=case when p_submit then 'submitted' else 'draft' end,
 submitted_at=case when p_submit then coalesce(rec.submitted_at,now()) else null end,updated_at=now(),version=case when p_version=0 then 1 else p_version+1 end
 where id=rec.id returning * into rec;
 return to_jsonb(rec);
end; $$;
revoke all on function quran_private.save_week(text,uuid,date,jsonb,boolean,integer) from public,anon;
grant execute on function quran_private.save_week(text,uuid,date,jsonb,boolean,integer) to authenticated;
commit;
