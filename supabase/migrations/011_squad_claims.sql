-- ===========================================================================
-- 011: Manager squad claims.
-- ===========================================================================
-- When a practice is live, each manager self-claims one squad (Grey or Garnet)
-- to take stats for. First-come: once a squad is claimed, the other manager can
-- only take the remaining squad. The claim lives on the per-practice squad row.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

alter table squads add column if not exists claimed_by uuid;      -- the manager's auth user id
alter table squads add column if not exists claimed_label text;   -- their email, for display
