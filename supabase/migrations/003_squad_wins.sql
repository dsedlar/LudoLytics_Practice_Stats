-- ===========================================================================
-- Track scrimmage/live-play wins per squad.
-- ===========================================================================
-- Each live-play game has one winning squad; the other squad takes the loss.
-- We store each squad's win count; a squad's losses = the other squad's wins.
-- Report shows Wins per team and a W-L record per player (their squad's record).
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

alter table squads add column if not exists wins int not null default 0;
