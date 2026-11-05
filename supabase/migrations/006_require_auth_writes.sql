-- ===========================================================================
-- Login gate: the whole app is private — reads AND writes require a signed-in
-- user (coaches / managers). No public/player access.
-- ===========================================================================
-- Run this AFTER you have created at least one coach/manager account
-- (Supabase dashboard -> Authentication -> Users -> Add user), otherwise no
-- one will be able to read or write.
-- ===========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'players','practices','squads','roster_entries','events','drill_results','settings'
  ]
  loop
    -- reads: signed-in only
    execute format('drop policy if exists read_all on %I;', t);
    execute format('drop policy if exists read_auth on %I;', t);
    execute format('create policy read_auth on %I for select to authenticated using (true);', t);
    -- writes: signed-in only
    execute format('drop policy if exists write_all on %I;', t);
    execute format('drop policy if exists write_auth on %I;', t);
    execute format('create policy write_auth on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
