-- Final user correction: Sep 27 is week 4; Oct 4 is week 5.
-- Supersedes both earlier schedule corrections. Do not move any saved record.
begin;
lock table public.school_terms in share row exclusive mode;
lock table public.weekly_reviews,public.weekly_evaluations,public.khairkom_nominations,public.weekly_workflow_access in share mode;
do $$declare before_data jsonb; after_data jsonb;begin
 if not exists(select 1 from public.school_terms where id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a' and starts_on in ('2026-09-27','2026-10-04') and first_week_number in (4,5)) then raise exception 'Unexpected schedule';end if;
 select jsonb_build_object(
 'reviews',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.weekly_reviews r),
 'scores',(select jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text) from public.weekly_evaluations e),
 'nominations',(select jsonb_agg(to_jsonb(n) order by to_jsonb(n)::text) from public.khairkom_nominations n),
 'workflow',(select jsonb_agg(to_jsonb(w) order by to_jsonb(w)::text) from public.weekly_workflow_access w)) into before_data;
 update public.school_terms set starts_on='2026-09-27',ends_on='2026-12-24',first_week_number=4 where id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a';
 select jsonb_build_object(
 'reviews',(select jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text) from public.weekly_reviews r),
 'scores',(select jsonb_agg(to_jsonb(e) order by to_jsonb(e)::text) from public.weekly_evaluations e),
 'nominations',(select jsonb_agg(to_jsonb(n) order by to_jsonb(n)::text) from public.khairkom_nominations n),
 'workflow',(select jsonb_agg(to_jsonb(w) order by to_jsonb(w)::text) from public.weekly_workflow_access w)) into after_data;
 if before_data is distinct from after_data then raise exception 'Saved data changed; schedule restoration rolled back';end if;
end;$$;
commit;
select r.week_start,(select t.first_week_number+(r.week_start-t.starts_on)/7 from public.school_terms t where t.id=r.term_id) week_number,count(*) saved_reviews,count(*) filter(where r.status='submitted') submitted_reviews,count(r.knight_student_id) saved_champions,(select count(*) from public.weekly_evaluations e join public.weekly_reviews x on x.id=e.review_id where x.term_id=r.term_id and x.week_start=r.week_start) saved_student_evaluations from public.weekly_reviews r where r.term_id='41e93af1-9d22-4d3a-9234-7ffb13d5ba6a' group by r.term_id,r.week_start order by r.week_start;
