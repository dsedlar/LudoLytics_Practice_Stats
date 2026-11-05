-- ===========================================================================
-- Player of the Day
-- ===========================================================================
-- One player can be named Player of the Day per practice; tallied over the
-- season on the dashboard.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

alter table practices add column if not exists player_of_day uuid references players(id) on delete set null;

-- Make squad changes (wins/losses) propagate in real time across devices.
do $$ begin
  alter publication supabase_realtime add table squads;
exception when duplicate_object then null; end $$;
