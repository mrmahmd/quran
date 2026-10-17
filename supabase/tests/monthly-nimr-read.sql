-- Run after monthly-nimr-read.sql. No production rows are changed.
rollback;
begin;
create temporary table monthly_reader_test as select
 (select auth_user_id from public.teacher_accounts where username='quran17' and active) as nimr,
 (select auth_user_id from public.teacher_accounts where username='quran19' and active) as osman,
 (select id from public.school_terms where active order by starts_on desc limit 1) as term,
 (select count(*) from public.monthly_reports) as reports,
 (select count(*) from public.monthly_entries) as entries;
grant select on monthly_reader_test to authenticated;
do $$begin
 if exists(select 1 from monthly_reader_test where nimr is null or osman is null or term is null) then raise exception 'Missing active test accounts';end if;
 if has_table_privilege('anon','public.monthly_reports','select') or has_table_privilege('anon','public.monthly_entries','select') then raise exception 'Anonymous read grant';end if;
 if has_table_privilege('authenticated','public.monthly_reports','update') or has_table_privilege('authenticated','public.monthly_entries','update') then raise exception 'Unexpected direct write grant';end if;
end;$$;
select set_config('request.jwt.claim.sub',(select nimr::text from monthly_reader_test),true);
set local role authenticated;
do $$begin
 if (select count(*) from public.monthly_reports)<>(select reports from monthly_reader_test)
 or (select count(*) from public.monthly_entries)<>(select entries from monthly_reader_test) then raise exception 'Nimr cannot read all monthly reports';end if;
 begin perform public.save_monthly_report('quran06',(select term from monthly_reader_test),'2026-09-01','[]',0);raise exception 'Other report save allowed';exception when insufficient_privilege then null;end;
 begin perform public.set_month_workflow_open((select term from monthly_reader_test),'2026-09-01',true);raise exception 'Month gate change allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select osman::text from monthly_reader_test),true);
set local role authenticated;
do $$begin
 if exists(select 1 from public.monthly_reports where teacher_username<>'quran19')
 or exists(select 1 from public.monthly_entries where teacher_username<>'quran19') then raise exception 'Osman gained cross-teacher monthly access';end if;
end;$$;
reset role;
rollback;
select 'PASS: Nimr reads all monthly reports; cross-teacher writes and month switches denied; Osman remains owner-only; no report data changed' as result;
