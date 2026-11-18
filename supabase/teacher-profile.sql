-- Teacher profile: phone number and a self-chosen login name.
-- The account key (quranNN) never changes: students, evaluations and reports stay linked to it,
-- and the original quranNN login keeps working. The login name is an extra alias resolved by
-- the school-account function. Phone numbers are loaded outside the repository (private data).
-- Readers: the teacher (own row) and the administration, through the functions below only;
-- the new columns are not in the table's column grants.
begin;
alter table public.teacher_accounts
 add column if not exists phone text check (phone ~ '^05[0-9]{8}$'),
 add column if not exists login_name text check (
  login_name ~ '^[a-z][a-z0-9._-]{2,31}$' and login_name !~ '^quran[0-9]{2}$' and login_name !~ '^test');
create unique index if not exists teacher_accounts_login_name_key on public.teacher_accounts(login_name);

create function public.my_teacher_profile()
returns table(username text, login_name text, full_name text, class_name text, ring_name text, phone text)
language sql stable security definer set search_path='' as $$
 select t.username, coalesce(t.login_name, t.username), t.full_name, t.class_name, t.ring_name, t.phone
 from public.teacher_accounts t where t.auth_user_id=(select auth.uid()) and t.active;
$$;
revoke all on function public.my_teacher_profile() from public,anon;
grant execute on function public.my_teacher_profile() to authenticated;

-- Returns the login name now in use. The own quranNN (or an empty value) restores the original.
create function public.set_my_login_name(p_login text) returns text
language plpgsql security definer set search_path='' as $$
declare v text := lower(btrim(coalesce(p_login,''))); me public.teacher_accounts%rowtype;
begin
 select * into me from public.teacher_accounts where auth_user_id=(select auth.uid()) and active for update;
 if not found then raise exception 'تغيير اسم المستخدم متاح لحسابات المعلمين فقط' using errcode='42501'; end if;
 if v='' or v=me.username then
  update public.teacher_accounts set login_name=null where username=me.username;
  return me.username;
 end if;
 if v !~ '^[a-z][a-z0-9._-]{2,31}$' then
  raise exception 'اسم المستخدم من ٣ إلى ٣٢ حرفًا: حروف إنجليزية صغيرة وأرقام و . _ - ويبدأ بحرف';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('teacher-login-name',0));
 if v ~ '^quran[0-9]{2}$' or v ~ '^test'
 or exists(select 1 from public.teacher_accounts where username<>me.username and (username=v or login_name=v))
 or exists(select 1 from public.admin_accounts where lower(split_part(email,'@',1))=v) then
  raise exception 'اسم المستخدم «%» غير متاح؛ اختر اسمًا آخر',v;
 end if;
 update public.teacher_accounts set login_name=v where username=me.username;
 return v;
end;$$;
revoke all on function public.set_my_login_name(text) from public,anon;
grant execute on function public.set_my_login_name(text) to authenticated;

-- Phone numbers for the administration's WhatsApp messages.
create function public.teacher_contacts() returns table(username text, full_name text, phone text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active) then
  raise exception 'أرقام المعلمين متاحة للإدارة فقط' using errcode='42501';
 end if;
 return query select t.username, t.full_name, t.phone from public.teacher_accounts t where t.active order by t.username;
end;$$;
revoke all on function public.teacher_contacts() from public,anon;
grant execute on function public.teacher_contacts() to authenticated;
commit;
