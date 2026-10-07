-- Correct schedule only. Never shift/delete reviews, scores, champions, or nominations.
-- Previous schedule: 2026-09-27 through 2026-12-17, first week 5.
begin;
lock table public.school_terms in share row exclusive mode;
create temporary table schedule_preservation_check as
select md5(coalesce(string_agg(to_jsonb(r)::text,',' order by r.id),'')) fingerprint
from public.weekly_reviews r where r.term_id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
do $$begin
 if not exists(select 1 from public.school_terms where id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a' and starts_on in ('2026-09-27','2026-10-04') and first_week_number=5) then raise exception 'Unexpected schedule; inspect before changing';end if;
end;$$;
update public.school_terms set starts_on='2026-10-04',ends_on='2026-12-24',first_week_number=5
where id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
do $$declare after_hash text;begin
 select md5(coalesce(string_agg(to_jsonb(r)::text,',' order by r.id),'')) into after_hash from public.weekly_reviews r where r.term_id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
 if after_hash<>(select fingerprint from schedule_preservation_check) then raise exception 'Review records changed';end if;
end;$$;
commit;
select starts_on,ends_on,first_week_number,(select count(*) from public.weekly_reviews r where r.term_id=t.id and r.week_start<'2026-10-04') preserved_earlier_reviews from public.school_terms t where id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
