-- Verify per-account persistence and isolation, then roll back all test settings.
rollback;
begin;
create temporary table appearance_ids as select
 (select auth_user_id from public.teacher_accounts where username='quran06' and active) as first_user,
 (select auth_user_id from public.teacher_accounts where username='quran17' and active) as second_user;
grant select on appearance_ids to authenticated;
do $$begin
 if exists(select 1 from appearance_ids where first_user is null or second_user is null) then raise exception 'Missing test users';end if;
 if not (select relrowsecurity from pg_class where oid='public.teacher_preferences'::regclass) then raise exception 'RLS disabled';end if;
 if has_table_privilege('anon','public.teacher_preferences','select') or has_table_privilege('anon','public.teacher_preferences','insert') then raise exception 'Anonymous preference access';end if;
end;$$;
select set_config('request.jwt.claim.sub',(select first_user::text from appearance_ids),true);
set local role authenticated;
insert into public.teacher_preferences(user_id,text_size) select first_user,'large' from appearance_ids on conflict(user_id) do update set text_size=excluded.text_size;
do $$begin
 if not exists(select 1 from public.teacher_preferences where text_size='large') then raise exception 'Saved preference did not round trip';end if;
 begin update public.teacher_preferences set text_size='invalid';raise exception 'Invalid size accepted';exception when check_violation then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select second_user::text from appearance_ids),true);
set local role authenticated;
do $$declare changed integer;begin
 if exists(select 1 from public.teacher_preferences where user_id=(select first_user from appearance_ids)) then raise exception 'Other teacher preference visible';end if;
 update public.teacher_preferences set text_size='xlarge' where user_id=(select first_user from appearance_ids);
 get diagnostics changed=row_count;if changed<>0 then raise exception 'Other teacher preference updated';end if;
 begin insert into public.teacher_preferences(user_id,text_size) select first_user,'normal' from appearance_ids;raise exception 'Other teacher preference inserted';exception when insufficient_privilege then null;end;
end;$$;
insert into public.teacher_preferences(user_id,text_size) select second_user,'xlarge' from appearance_ids on conflict(user_id) do update set text_size=excluded.text_size;
reset role;
select set_config('request.jwt.claim.sub',(select first_user::text from appearance_ids),true);
set local role authenticated;
do $$begin
 if (select text_size from public.teacher_preferences where user_id=(select first_user from appearance_ids)) is distinct from 'large' then raise exception 'Preference changed across sessions';end if;
end;$$;
reset role;
rollback;
select 'PASS: preference persists across sessions, invalid sizes rejected, other teachers cannot read or edit it; test changes rolled back' as result;
