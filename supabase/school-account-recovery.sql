-- Run after teacher-onboarding.sql. No existing code, account ID, role or roster changes.
-- Only the server-side Edge Function can check a school code.
create or replace function public.verify_school_recovery(p_username text, p_code_hash text)
returns table(account_id uuid, result text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_username text := lower(trim(p_username));
  v_teacher boolean;
  v_email text;
  v_hash text;
  v_id uuid;
  v_active boolean;
  v_attempts smallint;
  v_window timestamptz;
  v_locked timestamptz;
begin
  if v_username is null or v_username !~ '^[a-z][a-z0-9._-]{1,63}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    return query select null::uuid, 'invalid'::text; return;
  end if;
  v_teacher := v_username ~ '^quran[0-9]{2}$';
  begin
    if v_teacher then
      select a.activation_hash, a.auth_user_id, a.active, a.failed_attempts,
             a.attempt_window_started_at, a.locked_until
      into strict v_hash, v_id, v_active, v_attempts, v_window, v_locked
      from public.teacher_accounts a where a.username = v_username for update;
    else
      -- An admin uses the part before @ as a username. Ambiguous aliases are denied.
      select a.email, a.activation_hash, a.auth_user_id, a.active, a.failed_attempts,
             a.attempt_window_started_at, a.locked_until
      into strict v_email, v_hash, v_id, v_active, v_attempts, v_window, v_locked
      from public.admin_accounts a where lower(split_part(a.email, '@', 1)) = v_username for update;
    end if;
  exception when no_data_found or too_many_rows then
    return query select null::uuid, 'invalid'::text; return;
  end;
  if not v_active or v_id is null then
    return query select null::uuid, 'invalid'::text; return;
  end if;
  if v_locked > now() then
    return query select null::uuid, 'locked'::text; return;
  end if;
  if v_window is null or v_window < now() - interval '15 minutes' then
    v_attempts := 0;
    v_window := now();
  end if;
  if v_hash <> p_code_hash then
    v_attempts := v_attempts + 1;
    v_locked := case when v_attempts >= 5 then now() + interval '15 minutes' else null end;
    if v_teacher then
      update public.teacher_accounts set failed_attempts = v_attempts,
        attempt_window_started_at = v_window, locked_until = v_locked where username = v_username;
    else
      update public.admin_accounts set failed_attempts = v_attempts,
        attempt_window_started_at = v_window, locked_until = v_locked where email = v_email;
    end if;
    return query select null::uuid, 'invalid'::text; return;
  end if;
  -- Limit repeated successful recovery submissions too; do not lock ordinary login.
  if v_teacher then
    update public.teacher_accounts set failed_attempts = 0,
      attempt_window_started_at = null, locked_until = now() + interval '1 minute' where username = v_username;
  else
    update public.admin_accounts set failed_attempts = 0,
      attempt_window_started_at = null, locked_until = now() + interval '1 minute' where email = v_email;
  end if;
  return query select v_id, 'ok'::text;
end;
$$;

revoke all on function public.verify_school_recovery(text, text) from public, anon, authenticated;
grant execute on function public.verify_school_recovery(text, text) to service_role;
