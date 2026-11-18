-- Second range rule (applied to the project): Mr. Wael Mohamed Shokry (quran07), first month
-- of the active term. Apply after monthly-range-required.sql; safe to run again.
insert into public.monthly_range_requirements(term_id,month_start,teacher_username)
select s.id,date_trunc('month',s.starts_on)::date,'quran07' from public.school_terms s where s.active
on conflict do nothing;
