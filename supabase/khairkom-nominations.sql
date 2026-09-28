-- Khairkom nominations belong to a term and a teacher. Teachers edit their own
-- nominations; administrators read the combined report. No client table writes.
begin;
create table public.khairkom_nomination_sets (
 id uuid primary key default gen_random_uuid(),
 teacher_username text not null references public.teacher_accounts(username),
 term_id uuid not null references public.school_terms(id),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(),
 unique(teacher_username,term_id),unique(id,teacher_username)
);
create table public.khairkom_nominations (
 set_id uuid not null,
 teacher_username text not null,
 student_id uuid not null,
 memorization_amount text not null check(length(btrim(memorization_amount)) between 1 and 1000),
 nominated boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(set_id,student_id),
 foreign key(set_id,teacher_username) references public.khairkom_nomination_sets(id,teacher_username),
 foreign key(student_id,teacher_username) references public.students(id,teacher_username)
);
create index khairkom_nominations_student_idx on public.khairkom_nominations(student_id);
create index khairkom_nominations_teacher_idx on public.khairkom_nominations(teacher_username,nominated);
alter table public.khairkom_nomination_sets enable row level security;
alter table public.khairkom_nominations enable row level security;
revoke all on public.khairkom_nomination_sets,public.khairkom_nominations from public,anon,authenticated;
grant select on public.khairkom_nomination_sets,public.khairkom_nominations to authenticated;
grant all on public.khairkom_nomination_sets,public.khairkom_nominations to service_role;
create policy khairkom_sets_read on public.khairkom_nomination_sets for select to authenticated using (
 exists(select 1 from public.teacher_accounts t where t.username=teacher_username and t.auth_user_id=(select auth.uid()) and t.active)
 or exists(select 1 from public.admin_accounts a where a.auth_user_id=(select auth.uid()) and a.active)
);
create policy khairkom_nominations_read on public.khairkom_nominations for select to authenticated using (
 exists(select 1 from public.teacher_accounts t where t.username=teacher_username and t.auth_user_id=(select auth.uid()) and t.active)
 or exists(select 1 from public.admin_accounts a where a.auth_user_id=(select auth.uid()) and a.active)
);
create function quran_private.save_khairkom_nominations(p_teacher text,p_term uuid,p_rows jsonb,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rec public.khairkom_nomination_sets%rowtype; item jsonb; sid uuid; amount text;
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
 -- Keep prior records for audit; deselection marks them inactive.
 update public.khairkom_nominations set nominated=false,updated_at=now() where set_id=rec.id and nominated and student_id not in (select (r->>'student_id')::uuid from jsonb_array_elements(p_rows) r);
 for item in select * from jsonb_array_elements(p_rows) loop
  sid:=(item->>'student_id')::uuid;
  if jsonb_typeof(item->'memorization_amount') is distinct from 'string' then raise exception 'اكتب مقدار الحفظ لكل طالب مرشح'; end if;
  amount:=btrim(item->>'memorization_amount');
  if length(amount) not between 1 and 1000 then raise exception 'مقدار الحفظ مطلوب وبحد أقصى ١٠٠٠ حرف'; end if;
  perform 1 from public.students s where s.id=sid and s.teacher_username=p_teacher and (s.active or exists(select 1 from public.khairkom_nominations n where n.set_id=rec.id and n.student_id=s.id)) for share;
  if not found then raise exception 'طالب خارج حلقتك أو غير نشط'; end if;
  insert into public.khairkom_nominations(set_id,teacher_username,student_id,memorization_amount,nominated)
  values(rec.id,p_teacher,sid,amount,true)
  on conflict(set_id,student_id) do update set memorization_amount=excluded.memorization_amount,nominated=true,updated_at=now();
 end loop;
 update public.khairkom_nomination_sets set version=p_version+1,updated_at=now() where id=rec.id returning * into rec;
 return to_jsonb(rec);
end;$$;
revoke all on function quran_private.save_khairkom_nominations(text,uuid,jsonb,integer) from public,anon;
grant execute on function quran_private.save_khairkom_nominations(text,uuid,jsonb,integer) to authenticated;
create function public.save_khairkom_nominations(p_teacher text,p_term uuid,p_rows jsonb,p_version integer) returns jsonb
language sql security invoker set search_path='' as $$select quran_private.save_khairkom_nominations(p_teacher,p_term,p_rows,p_version);$$;
revoke all on function public.save_khairkom_nominations(text,uuid,jsonb,integer) from public,anon;
grant execute on function public.save_khairkom_nominations(text,uuid,jsonb,integer) to authenticated;
-- Moving a nominated student preserves the original teacher's nomination.
create or replace function quran_private.manage_student(p_id uuid,p_name text,p_teacher text,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old public.students; changed public.students;
begin
 if not quran_private.is_roster_manager() then raise exception 'ليس لديك صلاحية إدارة الطلاب' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 150 or p_active is null then raise exception 'راجع اسم الطالب' using errcode='23514'; end if;
 if not exists(select 1 from public.teacher_accounts where username=p_teacher and active) then raise exception 'المعلم غير نشط' using errcode='23514'; end if;
 select * into old from public.students where id=p_id for update;
 if not found then raise exception 'الطالب غير موجود' using errcode='23514'; end if;
 if old.teacher_username<>p_teacher and (exists(select 1 from public.weekly_evaluations where student_id=p_id) or exists(select 1 from public.semester_honors where student_id=p_id) or exists(select 1 from public.monthly_entries where student_id=p_id) or exists(select 1 from public.khairkom_nominations where student_id=p_id)) then
   update public.students set active=false where id=p_id;
   insert into public.students(teacher_username,full_name,student_code,active,source_class,memorization_note)
   values(p_teacher,btrim(p_name),'TRANSFER-'||p_id::text,p_active,old.source_class,old.memorization_note) returning * into changed;
 else
   update public.students set full_name=btrim(p_name),teacher_username=p_teacher,active=p_active where id=p_id returning * into changed;
 end if;
 return to_jsonb(changed);
end;$$;
commit;
