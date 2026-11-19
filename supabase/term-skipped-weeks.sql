-- Weeks left out of a term's evaluation calendar (a break). The dashboard drops them from the
-- week list and keeps counting after them, so the week after a break takes the next number.
-- Saved records are never moved. First use: the week of 2026-11-22 is a break, so week 12
-- starts on 2026-11-29 (weeks 4..11 keep their dates and numbers).
begin;
create function quran_private.all_sundays(days date[]) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(bool_and(extract(dow from day)=0), true) from unnest(days) day;
$$;
alter table public.school_terms add column if not exists skipped_weeks date[] not null default '{}'
 check (quran_private.all_sundays(skipped_weeks));

do $$declare before_data jsonb; after_data jsonb; term uuid := '41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
begin
 if not exists(select 1 from public.school_terms where id=term and active and starts_on='2026-09-27' and first_week_number=4) then
  raise exception 'Unexpected schedule; inspect before changing';
 end if;
 -- A skipped week must not hide anything already saved.
 if exists(select 1 from public.weekly_reviews where term_id=term and week_start='2026-11-22')
 or exists(select 1 from public.weekly_workflow_access where term_id=term and week_start='2026-11-22')
 or exists(select 1 from public.nimr_weekly_reports where term_id=term and week_start='2026-11-22') then
  raise exception 'Records exist for 2026-11-22; it cannot be skipped';
 end if;
 select jsonb_build_object('reviews',(select count(*) from public.weekly_reviews),'scores',(select count(*) from public.weekly_evaluations)) into before_data;
 update public.school_terms set skipped_weeks=array['2026-11-22'::date] where id=term;
 select jsonb_build_object('reviews',(select count(*) from public.weekly_reviews),'scores',(select count(*) from public.weekly_evaluations)) into after_data;
 if before_data is distinct from after_data then raise exception 'Saved data changed'; end if;
end;$$;
commit;
