-- ===========================================================================
-- 012: Let any signed-in user read profiles.
-- ===========================================================================
-- The 010 read policy (own row OR is_admin()) wasn't returning a non-admin's
-- own row reliably, so managers/players fell back to "coach". Reads are now
-- open to any authenticated user (same as every other table); writes stay
-- admin-only via the profiles_admin_write policy.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (true);
