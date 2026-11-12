-- Run in a rollback transaction after nimr-weekly-report.sql.
do $test$
declare
  term uuid := gen_random_uuid();
  owner_uid uuid;
  other_uid uuid;
  admin_uid uuid;
  saved_revision integer;
begin
  select auth_user_id into strict owner_uid from public.teacher_accounts
    where username='quran17' and active and auth_user_id is not null;
  select auth_user_id into strict other_uid from public.teacher_accounts
    where username<>'quran17' and active and auth_user_id is not null limit 1;
  select auth_user_id into strict admin_uid from public.admin_accounts
    where active and auth_user_id is not null limit 1;
  insert into public.school_terms(id,name,starts_on,ends_on)
    values(term,'TEST NIMR WEEKLY REPORT','2026-11-01','2026-11-30');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',owner_uid::text,true);
  insert into public.nimr_weekly_reports(term_id,week_start,body) values
    (term,'2026-11-01','## عنوان'),(term,'2026-11-08','- بند');
  update public.nimr_weekly_reports set body='**نص محدث**'
    where term_id=term and week_start='2026-11-01' and revision=1
    returning revision into saved_revision;
  if saved_revision is distinct from 2 then raise exception 'Revision did not advance'; end if;
  update public.nimr_weekly_reports set body='stale'
    where term_id=term and week_start='2026-11-01' and revision=1;
  if found then raise exception 'Stale write succeeded'; end if;
  if (select body from public.nimr_weekly_reports where term_id=term and week_start='2026-11-08') <> '- بند'
  then raise exception 'Another week changed'; end if;

  begin
    insert into public.nimr_weekly_reports(term_id,week_start,body) values(term,'2026-12-06','خارج الفصل');
    raise exception 'Week outside term was accepted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub',other_uid::text,true);
  if exists(select 1 from public.nimr_weekly_reports where term_id=term)
  then raise exception 'A different teacher could read the report'; end if;
  begin
    insert into public.nimr_weekly_reports(term_id,week_start,body) values(term,'2026-11-15','ممنوع');
    raise exception 'A different teacher could write a report';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',admin_uid::text,true);
  if exists(select 1 from public.nimr_weekly_reports where term_id=term)
  then raise exception 'An admin account could read the private report'; end if;
  if has_table_privilege('anon','public.nimr_weekly_reports','SELECT')
  then raise exception 'Anonymous access exposed'; end if;
  execute 'reset role';
end;
$test$;
