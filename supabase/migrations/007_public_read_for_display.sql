-- ===========================================================================
-- Public read access (for the locker-room /display, which must work with NO
-- login on a TV / Raspberry Pi). Reads become public again; WRITES stay
-- restricted to signed-in coaches/managers.
-- ===========================================================================
-- Trade-off: this makes the season stats readable by anyone who has the site
-- (the pages fetch with the public anon key). Entering/editing stats still
-- requires a coach login. Run this AFTER 006 in the Supabase SQL editor.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'players','practices','squads','roster_entries','events','drill_results','settings'
  ]
  loop
    -- reads: public (anon + authenticated)
    execute format('drop policy if exists read_auth on %I;', t);
    execute format('drop policy if exists read_all on %I;', t);
    execute format('create policy read_all on %I for select using (true);', t);
    -- writes: signed-in only (unchanged from 006)
    execute format('drop policy if exists write_all on %I;', t);
    execute format('drop policy if exists write_auth on %I;', t);
    execute format('create policy write_auth on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
