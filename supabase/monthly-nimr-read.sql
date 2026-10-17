-- Read-only monthly reporting for Mohammed Al-Nimr, quran17.
-- Existing owner/admin access and all write authorization remain unchanged.
begin;
create policy monthly_reports_nimr_read on public.monthly_reports
for select to authenticated using (exists (
 select 1 from public.teacher_accounts t
 where t.username='quran17' and t.auth_user_id=(select auth.uid()) and t.active
));
create policy monthly_entries_nimr_read on public.monthly_entries
for select to authenticated using (exists (
 select 1 from public.teacher_accounts t
 where t.username='quran17' and t.auth_user_id=(select auth.uid()) and t.active
));
commit;
