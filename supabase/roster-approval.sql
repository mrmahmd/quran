-- Apply after teacher-own-roster.sql. Requests never change the roster until an active admin approves.
begin;
create table public.roster_change_requests (
 id uuid primary key default gen_random_uuid(),
 teacher_username text not null references public.teacher_accounts(username),
 requested_by uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('add','archive','restore')),
 student_id uuid references public.students(id),
 student_name text not null check(length(btrim(student_name)) between 1 and 150),
 student_code text check(length(student_code)<=100),
 source_class text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null,
 admin_note text not null default '' check(length(admin_note)<=500),
 check(kind='add' or student_id is not null),
 check((status='pending' and decided_at is null) or (status<>'pending' and decided_at is not null))
);
create index roster_requests_status_idx on public.roster_change_requests(status,created_at desc);
create index roster_requests_teacher_idx on public.roster_change_requests(teacher_username,created_at desc);
create unique index roster_requests_pending_student on public.roster_change_requests(student_id) where status='pending' and kind<>'add';
create unique index roster_requests_pending_add on public.roster_change_requests(teacher_username,(case when student_code is null then 'name:'||student_name else 'code:'||student_code end)) where status='pending' and kind='add';
alter table public.roster_change_requests enable row level security;
revoke all on public.roster_change_requests from public,anon,authenticated;
grant select on public.roster_change_requests to authenticated;
grant all on public.roster_change_requests to service_role;
create policy roster_requests_read on public.roster_change_requests for select to authenticated using (
 exists(select 1 from public.admin_accounts a where a.auth_user_id=(select auth.uid()) and a.active)
 or exists(select 1 from public.teacher_accounts t where t.auth_user_id=(select auth.uid()) and t.active and (t.username=teacher_username or requested_by=t.auth_user_id))
);

-- The trigger also closes old RPC/direct-insert paths, including supervisor paths.
-- Inactive records used by the separate Khairkom nomination workflow are not active-roster additions.
create function quran_private.guard_roster_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then
  if tg_op='INSERT' then
   if new.active then raise exception 'إضافة الطلاب تحتاج موافقة الإدارة؛ أرسل طلبًا أولًا' using errcode='42501'; end if;
  elsif new.active is distinct from old.active or new.teacher_username is distinct from old.teacher_username then
   raise exception 'حذف الطلاب واستعادتهم أو نقلهم يحتاج موافقة الإدارة؛ أرسل طلبًا أولًا' using errcode='42501';
  end if;
 end if;
 return new;
end;$$;
revoke all on function quran_private.guard_roster_approval() from public,anon,authenticated;
create trigger require_roster_admin_approval before insert or update on public.students for each row execute function quran_private.guard_roster_approval();

create function quran_private.request_roster_additions(p_rows jsonb,p_teacher text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.teacher_accounts; owner public.teacher_accounts; item jsonb; student_name text; code text; req public.roster_change_requests; added jsonb:='[]'::jsonb;
begin
 select * into actor from public.teacher_accounts where auth_user_id=auth.uid() and active for share;
 if not found or auth.uid() is null then raise exception 'الحساب غير متاح' using errcode='42501'; end if;
 if p_teacher is not null and p_teacher<>actor.username and not quran_private.is_roster_manager() then raise exception 'يمكنك طلب الإضافة لحلقتك فقط' using errcode='42501'; end if;
 select * into owner from public.teacher_accounts where username=coalesce(p_teacher,actor.username) and active for share;
 if not found then raise exception 'المعلم غير نشط' using errcode='23514'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'راجع قائمة الطلاب' using errcode='23514'; end if;
 if jsonb_array_length(p_rows) not between 1 and 300 then raise exception 'أدخل من طالب إلى ٣٠٠ طالب' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('own-roster:'||owner.username,0));
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'object' then raise exception 'راجع بيانات الطالب' using errcode='23514'; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('full_name','student_code')) then raise exception 'بيانات الطلب غير مسموحة' using errcode='42501'; end if;
  if jsonb_typeof(item->'full_name') is distinct from 'string' or (item ? 'student_code' and jsonb_typeof(item->'student_code') not in ('string','null')) then raise exception 'راجع اسم الطالب ورقمه' using errcode='23514'; end if;
  student_name:=btrim(item->>'full_name');code:=nullif(btrim(item->>'student_code'),'');
  if length(student_name) not between 1 and 150 or length(code)>100 then raise exception 'راجع اسم الطالب ورقمه' using errcode='23514'; end if;
  if exists(select 1 from public.students s where s.teacher_username=owner.username and ((code is not null and s.student_code=code) or (code is null and btrim(s.full_name)=student_name))) then raise exception 'الطالب موجود بالفعل؛ راجع القائمة والمؤرشفين' using errcode='23505'; end if;
  insert into public.roster_change_requests(teacher_username,requested_by,kind,student_name,student_code,source_class)
  values(owner.username,auth.uid(),'add',student_name,code,owner.class_name) returning * into req;
  added:=added||jsonb_build_array(to_jsonb(req));
 end loop;
 return added;
end;$$;
create function public.request_roster_additions(p_rows jsonb,p_teacher text default null) returns jsonb
language sql security invoker set search_path='' as $$select quran_private.request_roster_additions(p_rows,p_teacher);$$;

create function quran_private.request_roster_status(p_student uuid,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor public.teacher_accounts; student public.students; req public.roster_change_requests;
begin
 select * into actor from public.teacher_accounts where auth_user_id=auth.uid() and active for share;
 if not found or auth.uid() is null then raise exception 'الحساب غير متاح' using errcode='42501'; end if;
 select * into student from public.students where id=p_student for update;
 if not found or (student.teacher_username<>actor.username and not quran_private.is_roster_manager()) then raise exception 'ليس لديك صلاحية لهذا الطالب' using errcode='42501'; end if;
 if p_active is null or p_active=student.active then raise exception 'حالة الطالب تغيرت؛ حدّث القائمة' using errcode='23514'; end if;
 if not exists(select 1 from public.teacher_accounts where username=student.teacher_username and active) then raise exception 'المعلم غير نشط' using errcode='23514'; end if;
 insert into public.roster_change_requests(teacher_username,requested_by,kind,student_id,student_name,student_code,source_class)
 values(student.teacher_username,auth.uid(),case when p_active then 'restore' else 'archive' end,student.id,student.full_name,student.student_code,student.source_class) returning * into req;
 return to_jsonb(req);
end;$$;
create function public.request_roster_status(p_student uuid,p_active boolean) returns jsonb
language sql security invoker set search_path='' as $$select quran_private.request_roster_status(p_student,p_active);$$;

create function quran_private.decide_roster_request(p_request uuid,p_approve boolean,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare req public.roster_change_requests; student public.students; owner public.teacher_accounts;
begin
 if auth.uid() is null or not exists(select 1 from public.admin_accounts where auth_user_id=auth.uid() and active) then raise exception 'مراجعة الطلبات متاحة للإدارة فقط' using errcode='42501'; end if;
 if p_approve is null or length(coalesce(p_note,''))>500 then raise exception 'راجع قرار الطلب والملاحظة' using errcode='23514'; end if;
 select * into req from public.roster_change_requests where id=p_request for update;
 if not found or req.status<>'pending' then raise exception 'تمت مراجعة الطلب بالفعل؛ حدّث القائمة' using errcode='40001'; end if;
 if p_approve then
  select * into owner from public.teacher_accounts where username=req.teacher_username and active for share;
  if not found then raise exception 'المعلم غير نشط؛ يمكن رفض الطلب أو مراجعته لاحقًا' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('own-roster:'||owner.username,0));
  if req.kind='add' then
   if exists(select 1 from public.students s where s.teacher_username=owner.username and ((req.student_code is not null and s.student_code=req.student_code) or (req.student_code is null and btrim(s.full_name)=req.student_name))) then raise exception 'الطالب أصبح موجودًا في الحلقة؛ راجع الطلب' using errcode='23505'; end if;
   insert into public.students(teacher_username,full_name,student_code,source_class,active) values(owner.username,req.student_name,req.student_code,owner.class_name,true) returning * into student;
  else
   select * into student from public.students where id=req.student_id and teacher_username=req.teacher_username for update;
   if not found or student.active<>(req.kind='archive') then raise exception 'حالة الطالب أو حلقته تغيرت؛ ارفض الطلب القديم بعد مراجعته' using errcode='23514'; end if;
   -- A later name correction is retained. Approval changes the active state only.
   update public.students set active=(req.kind='restore') where id=student.id returning * into student;
  end if;
 end if;
 update public.roster_change_requests set status=case when p_approve then 'approved' else 'rejected' end,decided_at=now(),decided_by=auth.uid(),admin_note=coalesce(btrim(p_note),''),student_id=case when p_approve and req.kind='add' then student.id else student_id end where id=req.id returning * into req;
 return to_jsonb(req);
end;$$;
create function public.decide_roster_request(p_request uuid,p_approve boolean,p_note text default '') returns jsonb
language sql security invoker set search_path='' as $$select quran_private.decide_roster_request(p_request,p_approve,p_note);$$;

revoke all on function quran_private.request_roster_additions(jsonb,text),public.request_roster_additions(jsonb,text),quran_private.request_roster_status(uuid,boolean),public.request_roster_status(uuid,boolean),quran_private.decide_roster_request(uuid,boolean,text),public.decide_roster_request(uuid,boolean,text) from public,anon,authenticated;
grant execute on function quran_private.request_roster_additions(jsonb,text),public.request_roster_additions(jsonb,text),quran_private.request_roster_status(uuid,boolean),public.request_roster_status(uuid,boolean),quran_private.decide_roster_request(uuid,boolean,text),public.decide_roster_request(uuid,boolean,text) to authenticated;
commit;
