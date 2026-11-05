-- ===========================================================================
-- Segment model: per-squad live-drill games + losses.
-- ===========================================================================
--  * squads.losses: live drills this squad lost (wins already exists).
--    A squad's W-L for the day comes from these; Transition drills (made/miss
--    3s) are tracked as events, not as a shooting-drill row.
--  * events.game_index: which live drill an event belongs to, so the Live shot
--    chart can reset per drill while totals keep accumulating.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

alter table squads add column if not exists losses int not null default 0;
alter table events add column if not exists game_index int not null default 1;

-- Transition is no longer a reported shooting drill; drop any stored rows.
delete from drill_results where drill = 'transition';
