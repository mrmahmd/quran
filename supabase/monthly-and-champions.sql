-- Monthly reports are visible only to the owner teacher and school administrators.
-- The supervisor receives ONLY the minimal weekly champion summary via a private function.
begin;
create table public.monthly_reports (
 id uuid primary key default gen_random_uuid(),
 teacher_username text not null references public.teacher_accounts(username),
 term_id uuid not null references public.school_terms(id),
 month_start date not null check (extract(day from month_start)=1),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 unique(teacher_username,term_id,month_start), unique(id,teacher_username)
);
create table public.monthly_entries (
 report_id uuid not null,
 teacher_username text not null,
 student_id uuid not null,
 memorization jsonb not null,
 revision jsonb not null,
 note text not null default '' check(length(note)<=500),
 primary key(report_id,student_id),
 foreign key(report_id,teacher_username) references public.monthly_reports(id,teacher_username),
 foreign key(student_id,teacher_username) references public.students(id,teacher_username)
);
create index monthly_entries_student_idx on public.monthly_entries(student_id);
create index monthly_entries_teacher_idx on public.monthly_entries(teacher_username);
alter table public.monthly_reports enable row level security;
alter table public.monthly_entries enable row level security;
revoke all on public.monthly_reports,public.monthly_entries from public,anon,authenticated;
grant select on public.monthly_reports,public.monthly_entries to authenticated;
grant all on public.monthly_reports,public.monthly_entries to service_role;
create policy monthly_reports_read on public.monthly_reports for select to authenticated using (exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active) or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active));
create policy monthly_entries_read on public.monthly_entries for select to authenticated using (exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active) or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active));

create function quran_private.valid_monthly_amount(value jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if value is null or jsonb_typeof(value)<>'object' or jsonb_typeof(value->'none') is distinct from 'boolean' or jsonb_typeof(value->'text') is distinct from 'string' then return false; end if;
 if length(value->>'text')>1000 then return false; end if;
 if (value->>'none')::boolean then return value->>'text'=''; end if;
 return length(btrim(value->>'text'))>0;
end;$$;
revoke all on function quran_private.valid_monthly_amount(jsonb) from public,anon;
grant execute on function quran_private.valid_monthly_amount(jsonb) to authenticated;
alter table public.monthly_entries add constraint valid_monthly_amounts check(quran_private.valid_monthly_amount(memorization) and quran_private.valid_monthly_amount(revision));

create function quran_private.save_monthly(p_teacher text,p_term uuid,p_month date,p_rows jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec public.monthly_reports%rowtype; item jsonb; sid uuid; expected integer; missing text;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if p_month is null or extract(day from p_month)<>1 or p_month>(current_timestamp at time zone 'Asia/Riyadh')::date
 or not exists(select 1 from public.school_terms where id=p_term and active and p_month<=ends_on and (p_month+interval '1 month')::date>starts_on) then raise exception 'الشهر خارج الفصل الدراسي النشط أو لم يبدأ'; end if;
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
revoke all on function quran_private.save_monthly(text,uuid,date,jsonb,integer) from public,anon;
grant execute on function quran_private.save_monthly(text,uuid,date,jsonb,integer) to authenticated;
create function public.save_monthly_report(p_teacher text,p_term uuid,p_month date,p_rows jsonb,p_version integer) returns jsonb
language sql security invoker set search_path='' as $$ select quran_private.save_monthly(p_teacher,p_term,p_month,p_rows,p_version); $$;
revoke all on function public.save_monthly_report(text,uuid,date,jsonb,integer) from public,anon;
grant execute on function public.save_monthly_report(text,uuid,date,jsonb,integer) to authenticated;

create function quran_private.weekly_champions(p_term uuid,p_week date)
returns table(teacher_username text,teacher_name text,class_name text,ring_name text,student_name text,note text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not quran_private.is_roster_manager() then raise exception 'عرض فرسان الحلقات متاح للإدارة والمشرف فقط' using errcode='42501'; end if;
 return query select t.username,t.full_name,t.class_name,t.ring_name,s.full_name,coalesce(r.knight_note,'')
 from public.teacher_accounts t left join public.weekly_reviews r on r.teacher_username=t.username and r.term_id=p_term and r.week_start=p_week and r.status='submitted'
 left join public.students s on s.id=r.knight_student_id and s.teacher_username=t.username
 where t.active order by t.username;
end;$$;
revoke all on function quran_private.weekly_champions(uuid,date) from public,anon;
grant execute on function quran_private.weekly_champions(uuid,date) to authenticated;
create function public.weekly_champions(p_term uuid,p_week date)
returns table(teacher_username text,teacher_name text,class_name text,ring_name text,student_name text,note text)
language sql stable security invoker set search_path='' as $$select * from quran_private.weekly_champions(p_term,p_week);$$;
revoke all on function public.weekly_champions(uuid,date) from public,anon;
grant execute on function public.weekly_champions(uuid,date) to authenticated;
create or replace function quran_private.manage_student(p_id uuid,p_name text,p_teacher text,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.students; changed public.students;
begin
 if not quran_private.is_roster_manager() then raise exception 'ليس لديك صلاحية إدارة الطلاب' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 150 or p_active is null then raise exception 'راجع اسم الطالب' using errcode='23514'; end if;
 if not exists(select 1 from public.teacher_accounts where username=p_teacher and active) then raise exception 'المعلم غير نشط' using errcode='23514'; end if;
 select * into old from public.students where id=p_id for update;
 if not found then raise exception 'الطالب غير موجود' using errcode='23514'; end if;
 if old.teacher_username<>p_teacher and (exists(select 1 from public.weekly_evaluations where student_id=p_id) or exists(select 1 from public.semester_honors where student_id=p_id) or exists(select 1 from public.monthly_entries where student_id=p_id)) then
   update public.students set active=false where id=p_id;
   insert into public.students(teacher_username,full_name,student_code,active,source_class,memorization_note)
   values(p_teacher,btrim(p_name),'TRANSFER-'||p_id::text,p_active,old.source_class,old.memorization_note) returning * into changed;
 else
   update public.students set full_name=btrim(p_name),teacher_username=p_teacher,active=p_active where id=p_id returning * into changed;
 end if;
 return to_jsonb(changed);
end;$$;

commit;

