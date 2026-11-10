-- ===========================================================================
-- 008: Win validation at the line — ties + dead-even tiebreaker winner.
-- ===========================================================================
-- A run (live-play game) now ends with a validation free throw: make it and
-- the win banks, miss it and the run is a TIE. Ties are shared by both squads.
--
-- Also: every practice resolves to one winner via a tiebreaker cascade
-- (more wins -> Transition% -> Thespian% -> Baylor% -> FT%). In the vanishingly
-- rare case where all four are dead-even, the coach's pick is stored on the
-- practice.
--
-- Both changes are additive (new columns with safe defaults), so existing rows
-- are untouched. Run once in the Supabase SQL editor.
-- ===========================================================================

-- Tied runs per squad (missed validation FT).
alter table squads add column if not exists ties int not null default 0;

-- Coach's winner for a genuinely dead-even practice (null otherwise). Stored as
-- the winning squad's id; no FK so the migration can't fail on ordering/grants.
alter table practices add column if not exists tiebreak_winner_squad_id uuid;
