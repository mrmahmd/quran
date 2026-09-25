-- Run once in the Quran School Supabase SQL editor.
-- This stage provisions teacher/class assignments and the school administrator.

create extension if not exists pgcrypto;

create table if not exists public.teacher_accounts (
  username text primary key check (username ~ '^quran[0-9]{2}$'),
  full_name text not null,
  class_name text not null unique,
  activation_hash text not null,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  activated_at timestamptz,
  active boolean not null default true,
  failed_attempts smallint not null default 0,
  attempt_window_started_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  constraint activation_state check ((auth_user_id is null) = (activated_at is null))
);

create index if not exists teacher_accounts_auth_user_idx
  on public.teacher_accounts(auth_user_id);

create table if not exists public.admin_accounts (
  email text primary key,
  activation_hash text not null,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  activated_at timestamptz,
  active boolean not null default true,
  failed_attempts smallint not null default 0,
  attempt_window_started_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  constraint activation_state check ((auth_user_id is null) = (activated_at is null))
);

alter table public.admin_accounts enable row level security;
revoke all on public.admin_accounts from anon, authenticated;
grant select (email, auth_user_id, active) on public.admin_accounts to authenticated;
grant select, update on public.admin_accounts to service_role;

create policy admin_reads_own_account on public.admin_accounts
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and active);

alter table public.teacher_accounts enable row level security;
revoke all on public.teacher_accounts from anon, authenticated;
grant select (username, full_name, class_name, auth_user_id, active)
  on public.teacher_accounts to authenticated;
grant select, update on public.teacher_accounts to service_role;

create or replace function public.verify_teacher_activation(p_username text, p_code_hash text)
returns table(account_name text, result text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.teacher_accounts%rowtype;
  attempts smallint;
begin
  select * into account from public.teacher_accounts
    where username = p_username for update;
  if not found or not account.active or account.auth_user_id is not null then
    return query select null::text, 'invalid'::text;
    return;
  end if;
  if account.locked_until > now() then
    return query select null::text, 'locked'::text;
    return;
  end if;
  if account.attempt_window_started_at is null
     or account.attempt_window_started_at < now() - interval '15 minutes' then
    attempts := 0;
  else
    attempts := account.failed_attempts;
  end if;
  if account.activation_hash <> p_code_hash then
    attempts := attempts + 1;
    update public.teacher_accounts
      set failed_attempts = attempts,
          attempt_window_started_at = case when attempts = 1 then now() else account.attempt_window_started_at end,
          locked_until = case when attempts >= 5 then now() + interval '15 minutes' else null end
      where username = p_username;
    return query select null::text, 'invalid'::text;
    return;
  end if;
  update public.teacher_accounts
    set failed_attempts = 0, attempt_window_started_at = null, locked_until = null
    where username = p_username;
  return query select account.full_name, 'ok'::text;
end;
$$;

revoke all on function public.verify_teacher_activation(text, text) from public, anon, authenticated;
grant execute on function public.verify_teacher_activation(text, text) to service_role;

create or replace function public.verify_admin_activation(p_email text, p_code_hash text)
returns table(result text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.admin_accounts%rowtype;
  attempts smallint;
begin
  select * into account from public.admin_accounts
    where email = p_email for update;
  if not found or not account.active or account.auth_user_id is not null then
    return query select 'invalid'::text;
    return;
  end if;
  if account.locked_until > now() then
    return query select 'locked'::text;
    return;
  end if;
  if account.attempt_window_started_at is null
     or account.attempt_window_started_at < now() - interval '15 minutes' then
    attempts := 0;
  else
    attempts := account.failed_attempts;
  end if;
  if account.activation_hash <> p_code_hash then
    attempts := attempts + 1;
    update public.admin_accounts
      set failed_attempts = attempts,
          attempt_window_started_at = case when attempts = 1 then now() else account.attempt_window_started_at end,
          locked_until = case when attempts >= 5 then now() + interval '15 minutes' else null end
      where email = p_email;
    return query select 'invalid'::text;
    return;
  end if;
  update public.admin_accounts
    set failed_attempts = 0, attempt_window_started_at = null, locked_until = null
    where email = p_email;
  return query select 'ok'::text;
end;
$$;

revoke all on function public.verify_admin_activation(text, text) from public, anon, authenticated;
grant execute on function public.verify_admin_activation(text, text) to service_role;

drop policy if exists teacher_reads_own_account on public.teacher_accounts;
create policy teacher_reads_own_account on public.teacher_accounts
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and active);

create policy admin_reads_teacher_accounts on public.teacher_accounts
  for select to authenticated
  using (exists (
    select 1 from public.admin_accounts
    where auth_user_id = (select auth.uid()) and active
  ));

-- Supabase's automatic-RLS event trigger may be installed in public. It still
-- runs for DDL events after direct API execution is revoked.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- No client can create, change, or read activation codes. The Edge Functions
-- use the server-only service role to activate each account exactly once.
