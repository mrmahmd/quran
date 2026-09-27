begin;
create function quran_private.select_manual_knight(p_teacher text,p_term uuid,p_week date,p_student uuid,p_note text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec public.weekly_reviews%rowtype;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if p_week is null or extract(dow from p_week)<>0 or p_week>(current_timestamp at time zone 'Asia/Riyadh')::date or not exists(select 1 from public.school_terms where id=p_term and active and p_week<=ends_on and p_week+6>=starts_on) then raise exception 'الأسبوع خارج الفصل الدراسي أو لم يبدأ'; end if;
 if p_version is null or p_version<0 or length(coalesce(p_note,''))>500 then raise exception 'بيانات غير صالحة'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher||p_term::text||p_week::text,0));
 select * into rec from public.weekly_reviews where teacher_username=p_teacher and term_id=p_term and week_start=p_week for update;
 if found then
  if rec.version<>p_version then raise exception 'تم تحديث الأسبوع. حدّث الصفحة'; end if;
 else
  if p_version<>0 then raise exception 'تم تحديث الأسبوع. حدّث الصفحة'; end if;
  insert into public.weekly_reviews(teacher_username,term_id,week_start) values(p_teacher,p_term,p_week) returning * into rec;
 end if;
 perform 1 from public.students where id=p_student and teacher_username=p_teacher and (active or id=rec.knight_student_id) for share;
 if not found then raise exception 'اختر طالبًا من طلاب حلقتك'; end if;
 update public.weekly_reviews set knight_student_id=p_student,knight_note=coalesce(p_note,''),version=p_version+1,updated_at=now() where id=rec.id returning * into rec;
 return to_jsonb(rec);
end;$$;
revoke all on function quran_private.select_manual_knight(text,uuid,date,uuid,text,integer) from public,anon;
grant execute on function quran_private.select_manual_knight(text,uuid,date,uuid,text,integer) to authenticated;
create function public.select_manual_weekly_knight(p_teacher text,p_term uuid,p_week date,p_student uuid,p_note text,p_version integer)
returns jsonb language sql security invoker set search_path='' as $$select quran_private.select_manual_knight(p_teacher,p_term,p_week,p_student,p_note,p_version);$$;
revoke all on function public.select_manual_weekly_knight(text,uuid,date,uuid,text,integer) from public,anon;
grant execute on function public.select_manual_weekly_knight(text,uuid,date,uuid,text,integer) to authenticated;
create or replace function quran_private.weekly_champions(p_term uuid,p_week date)
returns table(teacher_username text,teacher_name text,class_name text,ring_name text,student_name text,note text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not quran_private.is_roster_manager() then raise exception 'عرض فرسان الحلقات متاح للإدارة والمشرف فقط' using errcode='42501'; end if;
 return query select t.username,t.full_name,t.class_name,t.ring_name,s.full_name,coalesce(r.knight_note,'')
 from public.teacher_accounts t left join public.weekly_reviews r on r.teacher_username=t.username and r.term_id=p_term and r.week_start=p_week
 left join public.students s on s.id=r.knight_student_id and s.teacher_username=t.username
 where t.active order by t.username;
end;$$;
create or replace function quran_private.reopen_week(p_review uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then raise exception 'إعادة الفتح متاحة للإدارة فقط' using errcode='42501'; end if;
 update public.weekly_reviews set status='draft',submitted_at=null,version=version+1,updated_at=now() where id=p_review and version=p_version;
 if not found then raise exception 'تم تحديث الأسبوع. حدّث الصفحة'; end if;
end; $$;
commit;
