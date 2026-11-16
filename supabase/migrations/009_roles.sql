-- ===========================================================================
-- 009: User roles — Admin / Coach / Manager / Player.
-- ===========================================================================
-- Adds a `profiles` table (one row per auth user) holding each user's role and,
-- for player accounts, which roster player they are. A trigger auto-creates a
-- profile for every new auth user. Existing users are backfilled.
--
-- Run once in the Supabase SQL editor (after you have at least your own account).
-- ===========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'manager' check (role in ('admin', 'coach', 'manager', 'player')),
  display_name text,
  player_id uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Backfill: give every existing auth user a profile. Admin email -> admin,
-- everyone who already has access today -> coach.
insert into public.profiles (id, email, role)
select u.id, u.email, case when lower(u.email) = 'dsedlar@ves.org' then 'admin' else 'coach' end
from auth.users u
on conflict (id) do nothing;
update public.profiles set role = 'admin' where lower(email) = 'dsedlar@ves.org';

-- Auto-create a profile whenever a new auth user is added (new accounts start as
-- 'manager'; the admin promotes them in the app).
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

-- Admin check that bypasses RLS on profiles (prevents policy recursion).
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Row-level security: a user may read their own profile; admins read/write all.
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
