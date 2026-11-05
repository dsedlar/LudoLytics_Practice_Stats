-- ===========================================================================
-- Phase 1 fix: allow the app to write without a login yet.
-- ===========================================================================
-- The original schema restricted writes to authenticated users, but we have
-- not built login yet, so the anon browser session was blocked ("new row
-- violates row-level security policy"). This replaces the write policies so
-- anyone using the app can write.
--
-- SECURITY NOTE: with this in place, anyone who has the site URL can read AND
-- write the database. That is fine for private testing. Before real use we
-- will add a simple login and switch these back to "authenticated only".
--
-- Run this once in the Supabase SQL editor.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'players','practices','squads','roster_entries','events','drill_results','settings'
  ]
  loop
    execute format('drop policy if exists write_auth on %I;', t);
    execute format('drop policy if exists write_all on %I;', t);
    execute format('create policy write_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
