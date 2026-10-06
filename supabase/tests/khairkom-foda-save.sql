-- Replay the same saved nominations as this teacher; all writes are rolled back.
begin;
create temporary table foda_save_fixture as select t.auth_user_id actor_id,s.id,s.term_id,s.version,
 (select jsonb_agg(jsonb_build_object('student_id',n.student_id,'test_parts',n.test_parts,'identity_number',n.identity_number)) from public.khairkom_nominations n where n.set_id=s.id and n.nominated) rows
 from public.teacher_accounts t join public.khairkom_nomination_sets s on s.teacher_username=t.username where t.username='quran18';
grant select on foda_save_fixture to authenticated;
set local role authenticated;
do $$declare f record; ack jsonb; observed integer;begin
 select * into f from foda_save_fixture;
 if f.actor_id is null or f.rows is null then raise exception 'Missing teacher nominations';end if;
 perform set_config('request.jwt.claim.sub',f.actor_id::text,true);
 ack:=public.save_khairkom_nominations('quran18',f.term_id,f.rows,f.version);
 if ack->>'id'<>f.id::text or (ack->>'version')::integer<>f.version+1 then raise exception 'Wrong saved acknowledgement';end if;
 select count(*) into observed from public.khairkom_nominations where set_id=f.id and nominated;
 if observed<>jsonb_array_length(f.rows) then raise exception 'Saved nominations not readable';end if;
end;$$;
reset role;
rollback;
select 'PASS: Muhammad Foda can save and reload his nominations; original data preserved by rollback' as tests;
