-- Coach 3-point shooting, tracked in the Transition tab but kept entirely
-- separate from player/team/season stats (its own table, never joined into
-- events). Coaches themselves are a fixed list in the app config.
create table if not exists public.coach_shots (
  id uuid primary key default gen_random_uuid(),
  coach_key text not null,
  practice_id uuid references public.practices(id) on delete cascade,
  segment text not null default 'transition',
  made boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists coach_shots_practice_idx on public.coach_shots(practice_id);

alter table public.coach_shots enable row level security;
drop policy if exists read_all on public.coach_shots;
create policy read_all on public.coach_shots for select using (true);
drop policy if exists write_auth on public.coach_shots;
create policy write_auth on public.coach_shots for all to authenticated using (true) with check (true);
