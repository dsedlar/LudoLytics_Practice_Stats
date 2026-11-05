-- ===========================================================================
-- Add shot-chart coordinates to events.
-- ===========================================================================
-- Shots logged from the court chart store where they were taken (in court
-- feet: x 0..50, y 0..47, basket near the top). The shot zone (atr/nonatr2/
-- fg3) is still stored in `type`; these columns add the location for shot
-- charts. Counting stats and free throws leave them null.
--
-- Run once in the Supabase SQL editor.
-- ===========================================================================

alter table events add column if not exists shot_x numeric;
alter table events add column if not exists shot_y numeric;
