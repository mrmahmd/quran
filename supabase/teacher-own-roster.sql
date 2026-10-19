-- Apply after roster-management.sql. Own-ring writes do not grant supervisor access.
begin;
create or replace function quran_private.add_own_students(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner public.teacher_accounts; item jsonb; student_name text; code text; sid uuid; added jsonb:='[]'::jsonb;
begin
 select * into owner from public.teacher_accounts where auth_user_id=auth.uid() and active for share;
 if not found or auth.uid() is null then raise exception 'ليس لديك صلاحية إدارة هذه الحلقة' using errcode='42501'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' then raise exception 'قائمة الطلاب غير صحيحة' using errcode='23514'; end if;
 if jsonb_array_length(p_rows) not between 1 and 300 then raise exception 'أدخل من طالب واحد إلى ٣٠٠ طالب' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('own-roster:'||owner.username,0));
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'object' then raise exception 'راجع بيانات الطالب' using errcode='23514'; end if;
  if exists(select 1 from jsonb_object_keys(item) k where k not in ('full_name','student_code')) then raise exception 'يمكنك إضافة طلاب حلقتك فقط' using errcode='42501'; end if;
  if jsonb_typeof(item->'full_name') is distinct from 'string' or (item ? 'student_code' and jsonb_typeof(item->'student_code') not in ('string','null')) then raise exception 'راجع اسم الطالب ورقمه' using errcode='23514'; end if;
  student_name:=btrim(item->>'full_name'); code:=nullif(btrim(item->>'student_code'),'');
  if length(student_name) not between 1 and 150 or length(code)>100 then raise exception 'راجع اسم الطالب ورقمه' using errcode='23514'; end if;
  if exists(select 1 from public.students s where s.teacher_username=owner.username and ((code is not null and s.student_code=code) or (code is null and btrim(s.full_name)=student_name))) then
   raise exception 'الطالب موجود بالفعل؛ راجع القائمة والمؤرشفين' using errcode='23505';
  end if;
  insert into public.students(teacher_username,full_name,student_code,source_class,active)
  values(owner.username,student_name,code,owner.class_name,true) returning id into sid;
  added:=added||jsonb_build_array(jsonb_build_object('id',sid));
 end loop;
 return added;
end;$$;
revoke all on function quran_private.add_own_students(jsonb) from public,anon,authenticated;
grant execute on function quran_private.add_own_students(jsonb) to authenticated;
create or replace function public.add_own_students(p_rows jsonb) returns jsonb
language sql security invoker set search_path='' as $$select quran_private.add_own_students(p_rows);$$;
revoke all on function public.add_own_students(jsonb) from public,anon,authenticated;
grant execute on function public.add_own_students(jsonb) to authenticated;

create or replace function quran_private.manage_own_student(p_id uuid,p_name text,p_active boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner public.teacher_accounts; old public.students; changed public.students;
begin
 select * into owner from public.teacher_accounts where auth_user_id=auth.uid() and active for share;
 if not found or auth.uid() is null then raise exception 'ليس لديك صلاحية إدارة هذه الحلقة' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 150 or p_active is null then raise exception 'راجع اسم الطالب' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('own-roster:'||owner.username,0));
 select * into old from public.students where id=p_id and teacher_username=owner.username for update;
 if not found then raise exception 'ليس لديك صلاحية تعديل هذا الطالب' using errcode='42501'; end if;
 if old.full_name<>btrim(p_name) and old.student_code is null and exists(select 1 from public.students where teacher_username=owner.username and id<>old.id and btrim(full_name)=btrim(p_name)) then
  raise exception 'الاسم موجود بالفعل في الحلقة' using errcode='23505';
 end if;
 -- Archive in place: all evaluations, monthly amounts, honors and nominations keep their IDs.
 update public.students set full_name=btrim(p_name),active=p_active where id=old.id returning * into changed;
 return to_jsonb(changed);
end;$$;
revoke all on function quran_private.manage_own_student(uuid,text,boolean) from public,anon,authenticated;
grant execute on function quran_private.manage_own_student(uuid,text,boolean) to authenticated;
create or replace function public.manage_own_student(p_id uuid,p_name text,p_active boolean) returns jsonb
language sql security invoker set search_path='' as $$select quran_private.manage_own_student(p_id,p_name,p_active);$$;
revoke all on function public.manage_own_student(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.manage_own_student(uuid,text,boolean) to authenticated;
commit;
