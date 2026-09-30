-- Run in SQL Editor after week-workflow-control.sql; everything rolls back.
begin;
create temp table week_control_fixture as
select t.id as term_id,
  (t.starts_on - extract(dow from t.starts_on)::integer) as week_start,
  (select a.auth_user_id from public.admin_accounts a where a.active and a.auth_user_id is not null limit 1) as admin_uid,
  (select q.username from public.teacher_accounts q where q.active and q.auth_user_id is not null limit 1) as teacher_username,
  (select q.auth_user_id from public.teacher_accounts q where q.active and q.auth_user_id is not null limit 1) as teacher_uid
from public.school_terms t where t.active order by t.starts_on desc limit 1;

do $$
declare f record;
begin
  select * into f from week_control_fixture;
  if f.term_id is null or f.admin_uid is null or f.teacher_uid is null then
    raise exception 'Test requires an active term, activated administrator and teacher';
  end if;
  perform set_config('request.jwt.claim.sub',f.admin_uid::text,true);
  perform public.set_week_workflow_open(f.term_id,f.week_start,false);
  if not exists(select 1 from public.weekly_workflow_access where term_id=f.term_id and week_start=f.week_start and is_open=false) then
    raise exception 'Administrator could not close week';
  end if;
  perform set_config('request.jwt.claim.sub',f.teacher_uid::text,true);
  begin
    perform public.set_week_workflow_open(f.term_id,f.week_start,true);
    raise exception 'Teacher changed global switch';
  exception when insufficient_privilege then null;
  end;
  begin
    perform quran_private.assert_week_workflow_open(f.term_id,f.week_start);
    raise exception 'Closed week allowed teacher write';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.weekly_reviews set updated_at=updated_at
      where id=(select r.id from public.weekly_reviews r where r.term_id=f.term_id and r.week_start=f.week_start limit 1);
    if not found then
      insert into public.weekly_reviews(teacher_username,term_id,week_start)
        values(f.teacher_username,f.term_id,f.week_start);
    end if;
    raise exception 'Closed week allowed weekly review write';
  exception when insufficient_privilege then null;
  end;
  if f.week_start = ((current_timestamp at time zone 'Asia/Riyadh')::date - extract(dow from (current_timestamp at time zone 'Asia/Riyadh')::date)::integer) then
    begin
      update public.khairkom_nomination_sets set updated_at=updated_at
        where id=(select k.id from public.khairkom_nomination_sets k where k.term_id=f.term_id limit 1);
      if not found then
        insert into public.khairkom_nomination_sets(teacher_username,term_id)
          values(f.teacher_username,f.term_id);
      end if;
      raise exception 'Closed week allowed Khairkom write';
    exception when insufficient_privilege then null;
    end;
  end if;
  perform set_config('request.jwt.claim.sub',f.admin_uid::text,true);
  perform public.set_week_workflow_open(f.term_id,f.week_start,true);
  if not exists(select 1 from public.weekly_workflow_access where term_id=f.term_id and week_start=f.week_start and is_open=true) then
    raise exception 'Administrator could not reopen week';
  end if;
  if not exists(select 1 from pg_trigger where tgname='guard_weekly_review_write' and not tgisinternal)
    or not exists(select 1 from pg_trigger where tgname='guard_khairkom_set_write' and not tgisinternal) then
    raise exception 'A server-side write guard is missing';
  end if;
end; $$;
rollback;
