-- ===========================================================================
-- 014: Shot Cam — camera-tracked shooting workouts.
-- ===========================================================================
-- One row per camera session (Baylor / 20 Free Throws / 90 Seconds). Kept in
-- its own table: nothing here touches practices, events, drill_results or any
-- other Practice Stats data.
--
-- `shots` is the shot-by-shot log: [{ t, made, src, edited }] where t is ms
-- since the drill clock started. auto_makes / auto_attempts are what the camera
-- counted before the player corrected anything, so camera accuracy can be
-- measured over time.
-- ===========================================================================

create table if not exists public.shot_cam_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  drill text not null check (drill in ('baylor', 'ft', 'ninety')),
  workout_date date not null default current_date,
  makes integer not null check (makes >= 0),
  attempts integer not null check (attempts >= makes),
  duration_ms integer not null default 0,
  auto_makes integer not null default 0,
  auto_attempts integer not null default 0,
  shots jsonb not null default '[]'::jsonb,
  device text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists shot_cam_sessions_player_idx on public.shot_cam_sessions(player_id, created_at desc);

alter table public.shot_cam_sessions enable row level security;

-- Staff (admin / coach / manager) see and manage every session; a player sees
-- and records only their own.
drop policy if exists shot_cam_read on public.shot_cam_sessions;
create policy shot_cam_read on public.shot_cam_sessions
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('admin', 'coach', 'manager') or p.player_id = shot_cam_sessions.player_id)
  ));

drop policy if exists shot_cam_insert on public.shot_cam_sessions;
create policy shot_cam_insert on public.shot_cam_sessions
  for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('admin', 'coach', 'manager') or p.player_id = shot_cam_sessions.player_id)
  ));

drop policy if exists shot_cam_delete on public.shot_cam_sessions;
create policy shot_cam_delete on public.shot_cam_sessions
  for delete to authenticated
  using (created_by = auth.uid() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'coach')
  ));
