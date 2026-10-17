-- Per-account typography, available only to the active teacher who owns it.
begin;
create table public.teacher_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 text_size text not null default 'normal' check(text_size in ('normal','large','xlarge'))
);
alter table public.teacher_preferences enable row level security;
revoke all on public.teacher_preferences from public,anon,authenticated;
grant select,insert,update on public.teacher_preferences to authenticated;
grant all on public.teacher_preferences to service_role;
create policy teacher_preferences_read on public.teacher_preferences for select to authenticated
using(user_id=(select auth.uid()) and exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active));
create policy teacher_preferences_insert on public.teacher_preferences for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active));
create policy teacher_preferences_update on public.teacher_preferences for update to authenticated
using(user_id=(select auth.uid()) and exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active))
with check(user_id=(select auth.uid()) and exists(select 1 from public.teacher_accounts where auth_user_id=(select auth.uid()) and active));
commit;
