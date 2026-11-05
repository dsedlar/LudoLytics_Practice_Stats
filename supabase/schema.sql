-- ===========================================================================
-- Ludolytics Practice Stats — database schema (Supabase / PostgreSQL)
-- ===========================================================================
-- Run this in the Supabase SQL editor (one time) to create all tables.
-- Design notes:
--  * Raw stat events are append-only (one row per occurrence). This makes
--    real-time sync and one-tap undo trivial, and every percentage / advanced
--    metric / Casper total is COMPUTED from these rows — never stored stale.
--  * Squads are per-practice because teams change most practices.
-- ===========================================================================

-- ---- season roster --------------------------------------------------------
create table if not exists players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  jersey      text,                       -- default jersey; per-practice can override
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---- a single practice ----------------------------------------------------
create table if not exists practices (
  id            uuid primary key default gen_random_uuid(),
  practice_date date not null,
  start_time    text,
  finish_time   text,
  location      text,
  grade         int check (grade between 1 and 5),
  objectives    text,
  notes         text,
  status        text not null default 'setup',  -- setup | live | finished
  created_at    timestamptz not null default now()
);

-- ---- the two squads for a given practice -----------------------------------
create table if not exists squads (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  name        text not null,
  color       text not null default '#7a0019',
  sort_order  int not null default 0
);

-- ---- which players are on which squad + attendance (per practice) ----------
create table if not exists roster_entries (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references practices(id) on delete cascade,
  squad_id       uuid references squads(id) on delete set null,
  player_id      uuid not null references players(id) on delete cascade,
  jersey         text,
  present        boolean not null default true,
  absence_reason text,
  unique (practice_id, player_id)
);

-- ---- raw stat events (live play + transition) ------------------------------
-- type: shot types (atr, nonatr2, fg3, ft) carry `made`; counting types
-- (or, dr, stl, ...) have made = null.
create table if not exists events (
  id          bigint generated always as identity primary key,
  practice_id uuid not null references practices(id) on delete cascade,
  squad_id    uuid not null references squads(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  segment     text not null,              -- 'live' | 'transition'
  type        text not null,              -- stat key, see src/lib/config.ts
  made        boolean,                    -- only for shot types
  created_by  uuid,                       -- analyst (auth user)
  created_at  timestamptz not null default now()
);
create index if not exists events_practice_idx on events (practice_id);
create index if not exists events_lookup_idx on events (practice_id, squad_id, player_id);

-- ---- shooting-drill results (tallies, not play-by-play) --------------------
create table if not exists drill_results (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  squad_id    uuid references squads(id) on delete set null,
  player_id   uuid not null references players(id) on delete cascade,
  drill       text not null,              -- 'baylor' | 'ninetys' | 'transition' | 'ft'
  makes       numeric not null default 0,
  attempts    numeric,                    -- only used by 'transition'
  unique (practice_id, player_id, drill)
);

-- ---- editable settings (Casper values, drill denominators) -----------------
create table if not exists settings (
  key    text primary key,
  value  jsonb not null
);

-- ---- user roles (coach / analyst) -----------------------------------------
create table if not exists profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  role            text not null default 'analyst',  -- 'coach' | 'analyst'
  created_at      timestamptz not null default now()
);

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- Phase 1 policy (simple; no login built yet):
--   * anyone can READ — this powers the player-facing season dashboard.
--   * anyone can WRITE — analysts/coaches entering stats (no login yet).
-- Before real use we add a login and switch writes back to authenticated-only.
-- ===========================================================================
alter table players        enable row level security;
alter table practices      enable row level security;
alter table squads         enable row level security;
alter table roster_entries enable row level security;
alter table events         enable row level security;
alter table drill_results  enable row level security;
alter table settings       enable row level security;
alter table profiles       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'players','practices','squads','roster_entries','events','drill_results','settings'
  ]
  loop
    execute format('drop policy if exists read_all on %I;', t);
    execute format('create policy read_all on %I for select using (true);', t);
    execute format('drop policy if exists write_auth on %I;', t);
    execute format('drop policy if exists write_all on %I;', t);
    execute format('create policy write_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;

drop policy if exists read_profiles on profiles;
create policy read_profiles on profiles for select using (true);
drop policy if exists write_own_profile on profiles;
create policy write_own_profile on profiles for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---- enable realtime on the live tables -----------------------------------
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table drill_results;
alter publication supabase_realtime add table practices;
alter publication supabase_realtime add table roster_entries;
