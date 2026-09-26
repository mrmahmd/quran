-- Weekly evaluation dashboard. No student or term seed data is included.
begin;
create schema if not exists quran_private;
revoke all on schema quran_private from public, anon;
grant usage on schema quran_private to authenticated;

create table public.school_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_username text not null references public.teacher_accounts(username),
  full_name text not null check (length(btrim(full_name)) between 1 and 150),
  student_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(id, teacher_username),
  unique(teacher_username, student_code)
);
create index students_teacher_idx on public.students(teacher_username);
create table public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  teacher_username text not null references public.teacher_accounts(username),
  term_id uuid not null references public.school_terms(id),
  week_start date not null check (extract(dow from week_start) = 0),
  status text not null default 'draft' check (status in ('draft','submitted')),
  knight_student_id uuid,
  knight_note text not null default '' check (length(knight_note) <= 500),
  version integer not null default 1,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(teacher_username, term_id, week_start),
  unique(id, teacher_username),
  foreign key(knight_student_id, teacher_username) references public.students(id,teacher_username)
);
create index weekly_reviews_term_idx on public.weekly_reviews(term_id);
create table public.weekly_evaluations (
  review_id uuid not null,
  teacher_username text not null,
  student_id uuid not null,
  memorization smallint check (memorization between 0 and 4),
  revision smallint check (revision between 0 and 2),
  improvement smallint check (improvement between 0 and 2),
  commitment smallint check (commitment between 0 and 2),
  bonus_memorization smallint not null default 0 check (bonus_memorization between 0 and 1),
  bonus_revision smallint not null default 0 check (bonus_revision between 0 and 1),
  total smallint generated always as (memorization+revision+improvement+commitment+bonus_memorization+bonus_revision) stored,
  primary key(review_id,student_id),
  foreign key(review_id,teacher_username) references public.weekly_reviews(id,teacher_username),
  foreign key(student_id,teacher_username) references public.students(id,teacher_username)
);
create index weekly_evaluations_student_idx on public.weekly_evaluations(student_id);
create index weekly_evaluations_teacher_idx on public.weekly_evaluations(teacher_username);
create table public.semester_honors (
  term_id uuid not null references public.school_terms(id),
  teacher_username text not null references public.teacher_accounts(username),
  student_id uuid not null,
  note text not null default '' check (length(note) <= 500),
  selected_at timestamptz not null default now(),
  primary key(term_id,teacher_username,student_id),
  foreign key(student_id,teacher_username) references public.students(id,teacher_username)
);
create index semester_honors_teacher_idx on public.semester_honors(teacher_username);
create index semester_honors_student_idx on public.semester_honors(student_id);

alter table public.school_terms enable row level security;
alter table public.students enable row level security;
alter table public.weekly_reviews enable row level security;
alter table public.weekly_evaluations enable row level security;
alter table public.semester_honors enable row level security;
revoke all on public.school_terms, public.students, public.weekly_reviews, public.weekly_evaluations, public.semester_honors from public, anon, authenticated;
grant select on public.school_terms, public.students, public.weekly_reviews, public.weekly_evaluations, public.semester_honors to authenticated;
grant insert, update on public.school_terms, public.students to authenticated;
grant all on public.school_terms, public.students, public.weekly_reviews, public.weekly_evaluations, public.semester_honors to service_role;

create policy terms_read on public.school_terms for select to authenticated using (
 exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy terms_admin_insert on public.school_terms for insert to authenticated with check (
 exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy terms_admin_update on public.school_terms for update to authenticated using (
 exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
) with check (exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active));
create policy students_read on public.students for select to authenticated using (
 exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy students_admin_insert on public.students for insert to authenticated with check (
 exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy students_admin_update on public.students for update to authenticated using (
 exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
) with check (exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active));
create policy reviews_read on public.weekly_reviews for select to authenticated using (
 exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy evaluations_read on public.weekly_evaluations for select to authenticated using (
 exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
create policy honors_read on public.semester_honors for select to authenticated using (
 exists(select 1 from public.teacher_accounts where username=teacher_username and auth_user_id=(select auth.uid()) and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);

-- Privileged writes are isolated in a non-exposed schema. Every entry point
-- validates the authenticated account; clients have SELECT only on results.
create function quran_private.authorize_teacher(p_teacher text) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and (
 exists(select 1 from public.teacher_accounts where username=p_teacher and auth_user_id=auth.uid() and active)
 or exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active));
$$;
create function quran_private.save_week(p_teacher text,p_term uuid,p_week date,p_rows jsonb,p_submit boolean,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec public.weekly_reviews%rowtype; item jsonb; sid uuid; expected integer; actual integer;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active and p_week<=ends_on and p_week+6>=starts_on)
 or extract(dow from p_week)<>0 then raise exception 'الأسبوع خارج الفصل الدراسي النشط'; end if;
 if p_submit and p_week>(current_timestamp at time zone 'Asia/Riyadh')::date then raise exception 'لا يمكن اعتماد أسبوع لم يبدأ'; end if;
 if p_rows is null or p_submit is null or p_version is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>300 then raise exception 'قائمة التقييم غير صالحة'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher||p_term::text||p_week::text,0));
 select * into rec from public.weekly_reviews where teacher_username=p_teacher and term_id=p_term and week_start=p_week for update;
 if found then
  if rec.version<>p_version then raise exception 'تم تحديث هذا الأسبوع من نافذة أخرى. حدّث الصفحة قبل الحفظ'; end if;
  if rec.status='submitted' then raise exception 'الأسبوع معتمد. اطلب من الإدارة إعادة فتحه'; end if;
 else
  if p_version<>0 then raise exception 'حدّث الصفحة قبل الحفظ'; end if;
  insert into public.weekly_reviews(teacher_username,term_id,week_start) values(p_teacher,p_term,p_week) returning * into rec;
 end if;
 select count(*) into expected from public.students s where s.teacher_username=p_teacher and
 (s.active or exists(select 1 from public.weekly_evaluations e where e.review_id=rec.id and e.student_id=s.id));
 if expected=0 then raise exception 'لم تُضف أسماء الطلاب لهذه الحلقة بعد'; end if;
 if jsonb_array_length(p_rows)<>expected then raise exception 'تغيرت قائمة الطلاب. حدّث الصفحة وأعد التقييم'; end if;
 if (select count(distinct x->>'student_id') from jsonb_array_elements(p_rows) x)<>expected then raise exception 'قائمة الطلاب مكررة أو ناقصة'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  sid:=(item->>'student_id')::uuid;
  if not exists(select 1 from public.students s where s.id=sid and s.teacher_username=p_teacher and
  (s.active or exists(select 1 from public.weekly_evaluations e where e.review_id=rec.id and e.student_id=sid))) then raise exception 'طالب غير تابع للحلقة'; end if;
  insert into public.weekly_evaluations(review_id,teacher_username,student_id,memorization,revision,improvement,commitment,bonus_memorization,bonus_revision)
  values(rec.id,p_teacher,sid,(item->>'memorization')::smallint,(item->>'revision')::smallint,(item->>'improvement')::smallint,(item->>'commitment')::smallint,coalesce((item->>'bonus_memorization')::smallint,0),coalesce((item->>'bonus_revision')::smallint,0))
  on conflict(review_id,student_id) do update set memorization=excluded.memorization,revision=excluded.revision,improvement=excluded.improvement,commitment=excluded.commitment,bonus_memorization=excluded.bonus_memorization,bonus_revision=excluded.bonus_revision;
 end loop;
 if p_submit and exists(select 1 from public.weekly_evaluations where review_id=rec.id and total is null) then raise exception 'أكمل نقاط جميع الطلاب قبل الاعتماد'; end if;
 update public.weekly_reviews set status=case when p_submit then 'submitted' else 'draft' end,
 submitted_at=case when p_submit then now() else null end,updated_at=now(),version=case when p_version=0 then 1 else p_version+1 end
 where id=rec.id returning * into rec;
 return to_jsonb(rec);
end; $$;
create function quran_private.choose_knight(p_review uuid,p_student uuid,p_note text,p_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rec public.weekly_reviews%rowtype;
begin
 select * into rec from public.weekly_reviews where id=p_review for update;
 if not found or not quran_private.authorize_teacher(rec.teacher_username) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if p_version is null or rec.version<>p_version then raise exception 'تم تحديث الأسبوع. حدّث الصفحة'; end if;
 if rec.status<>'submitted' then raise exception 'اعتمد نقاط الأسبوع أولًا'; end if;
 if not exists(select 1 from public.weekly_evaluations where review_id=p_review and student_id=p_student and total is not null) then raise exception 'اختر طالبًا من تقييم هذا الأسبوع'; end if;
 update public.weekly_reviews set knight_student_id=p_student,knight_note=coalesce(p_note,''),updated_at=now(),version=version+1 where id=p_review returning * into rec;
 return to_jsonb(rec);
end; $$;
create function quran_private.save_honors(p_teacher text,p_term uuid,p_students uuid[],p_note text)
returns void language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not quran_private.authorize_teacher(p_teacher) then raise exception 'ليس لديك صلاحية لهذه الحلقة' using errcode='42501'; end if;
 if p_students is null or cardinality(p_students)>300 then raise exception 'قائمة التكريم غير صالحة'; end if;
 if not exists(select 1 from public.school_terms where id=p_term and active) then raise exception 'الفصل الدراسي غير نشط'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_teacher||p_term::text||'honors',0));
 foreach sid in array p_students loop
  if not exists(select 1 from public.weekly_evaluations e join public.weekly_reviews r on r.id=e.review_id
  where e.student_id=sid and e.teacher_username=p_teacher and r.term_id=p_term and r.status='submitted' and e.total is not null) then raise exception 'الطالب ليس له تقييم معتمد في هذا الفصل'; end if;
 end loop;
 delete from public.semester_honors where teacher_username=p_teacher and term_id=p_term;
 insert into public.semester_honors(term_id,teacher_username,student_id,note)
 select p_term,p_teacher,x,coalesce(p_note,'') from (select distinct unnest(p_students) as x) t;
end; $$;
create function quran_private.reopen_week(p_review uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then raise exception 'إعادة الفتح متاحة للإدارة فقط' using errcode='42501'; end if;
 update public.weekly_reviews set status='draft',submitted_at=null,knight_student_id=null,knight_note='',version=version+1,updated_at=now() where id=p_review and version=p_version;
 if not found then raise exception 'تم تحديث الأسبوع. حدّث الصفحة'; end if;
end; $$;

create function public.save_weekly_evaluation(p_teacher text,p_term uuid,p_week date,p_rows jsonb,p_submit boolean,p_version integer)
returns jsonb language sql security invoker set search_path='' as $$ select quran_private.save_week(p_teacher,p_term,p_week,p_rows,p_submit,p_version); $$;
create function public.choose_weekly_knight(p_review uuid,p_student uuid,p_note text,p_version integer)
returns jsonb language sql security invoker set search_path='' as $$ select quran_private.choose_knight(p_review,p_student,p_note,p_version); $$;
create function public.save_semester_honors(p_teacher text,p_term uuid,p_students uuid[],p_note text)
returns void language sql security invoker set search_path='' as $$ select quran_private.save_honors(p_teacher,p_term,p_students,p_note); $$;
create function public.reopen_weekly_evaluation(p_review uuid,p_version integer)
returns void language sql security invoker set search_path='' as $$ select quran_private.reopen_week(p_review,p_version); $$;

revoke all on all functions in schema quran_private from public, anon, authenticated;
grant execute on function quran_private.save_week(text,uuid,date,jsonb,boolean,integer),quran_private.choose_knight(uuid,uuid,text,integer),quran_private.save_honors(text,uuid,uuid[],text),quran_private.reopen_week(uuid,integer) to authenticated;
revoke all on function public.save_weekly_evaluation(text,uuid,date,jsonb,boolean,integer),public.choose_weekly_knight(uuid,uuid,text,integer),public.save_semester_honors(text,uuid,uuid[],text),public.reopen_weekly_evaluation(uuid,integer) from public,anon;
grant execute on function public.save_weekly_evaluation(text,uuid,date,jsonb,boolean,integer),public.choose_weekly_knight(uuid,uuid,text,integer),public.save_semester_honors(text,uuid,uuid[],text),public.reopen_weekly_evaluation(uuid,integer) to authenticated;
commit;
