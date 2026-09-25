-- Run once in the Quran School Supabase SQL editor.
-- This first stage provisions teachers and class assignments only.

create extension if not exists pgcrypto;

create table if not exists public.teacher_accounts (
  username text primary key check (username ~ '^quran[0-9]{2}$'),
  full_name text not null,
  class_name text not null unique,
  activation_hash text not null,
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  activated_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint activation_state check ((auth_user_id is null) = (activated_at is null))
);

create index if not exists teacher_accounts_auth_user_idx
  on public.teacher_accounts(auth_user_id);

alter table public.teacher_accounts enable row level security;
revoke all on public.teacher_accounts from anon, authenticated;
grant select (username, full_name, class_name, auth_user_id, active)
  on public.teacher_accounts to authenticated;
grant select, update on public.teacher_accounts to service_role;

drop policy if exists teacher_reads_own_account on public.teacher_accounts;
create policy teacher_reads_own_account on public.teacher_accounts
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and active);

-- No client can create, change, or read activation codes. The Edge Function
-- uses the server-only service role to activate a teacher exactly once.
