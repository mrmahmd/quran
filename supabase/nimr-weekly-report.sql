-- Private weekly reports written by Mohammed Al-Nimr (quran17).
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from public.teacher_accounts
    where username = 'quran17' and full_name like '%نمر%' and active
  ) then
    raise exception 'تحقق من حساب محمد النمر قبل تفعيل التقرير الأسبوعي';
  end if;
end;
$$;

create table if not exists public.nimr_weekly_reports (
  term_id uuid not null references public.school_terms(id),
  week_start date not null check (extract(dow from week_start) = 0),
  body text not null check (char_length(body) <= 30000 and body ~ '[^[:space:]]'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (term_id, week_start)
);
alter table public.nimr_weekly_reports enable row level security;

revoke all on public.nimr_weekly_reports from public, anon, authenticated;
grant select on public.nimr_weekly_reports to authenticated;
grant insert (term_id, week_start, body) on public.nimr_weekly_reports to authenticated;
grant update (body) on public.nimr_weekly_reports to authenticated;

drop policy if exists nimr_weekly_report_owner on public.nimr_weekly_reports;
create policy nimr_weekly_report_owner on public.nimr_weekly_reports
for all to authenticated
using (
  exists (select 1 from public.teacher_accounts
    where username = 'quran17' and active and auth_user_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.teacher_accounts
    where username = 'quran17' and active and auth_user_id = (select auth.uid()))
  and exists (select 1 from public.school_terms t
    where t.id = term_id and week_start <= t.ends_on and week_start + 6 >= t.starts_on)
);

create or replace function quran_private.revise_nimr_weekly_report()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function quran_private.revise_nimr_weekly_report() from public, anon, authenticated;
drop trigger if exists revise_nimr_weekly_report on public.nimr_weekly_reports;
create trigger revise_nimr_weekly_report before update on public.nimr_weekly_reports
for each row execute function quran_private.revise_nimr_weekly_report();

notify pgrst,'reload schema';
commit;
