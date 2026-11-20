-- Class changes of a ring, so screens can explain history recorded before the change.
-- Saved evaluations and reports stay with the teacher who wrote them; when a teacher changes class,
-- the pages before the change show the previous class's students. One row per teacher and change.
-- First rows: on 2026-11-20 Mohamed Saeed (quran03) moved 7B -> 6B and Jamal Abdelrahim (quran09) 6B -> 7B,
-- students following the class (see class-names-2026-11.sql).
begin;
create table public.class_changes (
 id uuid primary key default gen_random_uuid(),
 teacher_username text not null references public.teacher_accounts(username),
 changed_on date not null,
 class_before text not null,
 class_after text not null,
 -- where this teacher's previous students went
 students_now_with text references public.teacher_accounts(username),
 students_now_with_name text not null default '',
 -- whose saved history belongs to this teacher's current class
 history_of_class_after text references public.teacher_accounts(username),
 history_of_class_after_name text not null default '',
 created_at timestamptz not null default now(),
 unique (teacher_username, changed_on)
);
alter table public.class_changes enable row level security;
revoke all on public.class_changes from public,anon,authenticated;
grant select on public.class_changes to authenticated;
grant all on public.class_changes to service_role;
-- The teacher reads his own rows; the administration reads all of them.
create policy class_changes_read on public.class_changes for select to authenticated using (
 exists(select 1 from public.teacher_accounts t where t.username=teacher_username and t.auth_user_id=(select auth.uid()) and t.active)
 or exists(select 1 from public.admin_accounts where auth_user_id=(select auth.uid()) and active)
);
insert into public.class_changes(teacher_username,changed_on,class_before,class_after,students_now_with,students_now_with_name,history_of_class_after,history_of_class_after_name) values
 ('quran03','2026-11-20','7B','6B','quran09','جمال عبد الرحيم','quran09','جمال عبد الرحيم'),
 ('quran09','2026-11-20','6B','7B','quran03','محمد سعيد','quran03','محمد سعيد');
commit;
