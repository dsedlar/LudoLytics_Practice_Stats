-- ===========================================================================
-- 010: Repair the profiles table for roles.
-- ===========================================================================
-- A profiles table (id, role, display_name, created_at) already existed before
-- migration 009, so 009's `create table if not exists` skipped it and the new
-- columns + trigger/RLS never applied (009 errored on the missing `email`).
-- This migration ALTERs the existing table instead, and is safe to re-run.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

-- 1. Add the missing columns.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists player_id uuid references public.players(id) on delete set null;
alter table public.profiles alter column role set default 'manager';

-- 2. Make sure every auth user has a profile row.
insert into public.profiles (id, email, role)
select u.id, u.email, case when lower(u.email) = 'dsedlar@ves.org' then 'admin' else 'coach' end
from auth.users u
on conflict (id) do nothing;

-- 3. Backfill email + any null roles, and seed the admin.
update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and (p.email is null or p.email = '');
update public.profiles set role = 'manager' where role is null;
update public.profiles set role = 'admin' where lower(email) = 'dsedlar@ves.org';

-- 4. Auto-create a profile (with email) whenever a new auth user is added.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when lower(new.email) = 'dsedlar@ves.org' then 'admin' else 'manager' end)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Admin check (bypasses RLS) + row-level security.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
