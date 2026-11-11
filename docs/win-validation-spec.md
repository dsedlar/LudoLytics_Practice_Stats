# Spec: Win Validation at the Line (free-throw validated wins, ties, clutch FT%)

Status: **implemented** (migration 008 must be run) · Owner: Coach Sedlar · Last updated: 2026-11-10

## Summary

Today a live-play run ends with a manager tapping **Won** or **Lost** for a squad.
We are adding the gym rule that **a win must be validated at the line**: the team
that wins a run shoots one free throw. Make it and the win banks; miss it and the
run is a **tie**. The free throw is a real live free throw (it counts in the
player's FT%) and is *also* tracked separately so each player gets a **Clutch FT%**
(validation FTs made / attempted).

Because runs can now tie, a practice could end tied on wins. A **tiebreaker
cascade** guarantees every *practice* still has one winner and one loser.

## Vocabulary

- **Run / game** — one live-play scrimmage. Each carries a `game_index`.
- **Validation FT** — the single dead-ball free throw the winning team shoots to
  bank a win. One attempt, make or miss, **no rebound and no live play after**.
- **Tie** — a run whose validation FT was missed. Tracked per squad.
- **Clutch FT%** — a player's validation FTs made ÷ attempted, across the season.

## Rules

### Per run (game)
1. A manager ends the run and records **which team won it**.
2. That team picks the **player who shot the validation FT** and marks **Made / Miss**.
3. **Made** → the run is a **win**: winner `+1W`, loser `+1L`. The FT is logged as a
   live free throw (feeds FT%) and as a validation make (feeds Clutch FT%).
4. **Miss** → the run is a **tie**: both squads `+1T`. The FT is logged as a live
   free throw (a miss, feeds FT%) and as a validation attempt (feeds Clutch FT%).
5. Managers never pick "tie" directly — a tie is *derived* from a missed validation FT.
6. **One source of truth per run:** the winning team's bench records the result; the
   loss (or shared tie) is written to the opponent automatically. (The Coach view
   keeps manual W/L/T adjustments for fixing mistakes.)

### Per practice
7. **Practice winner = more banked wins.**
8. If the two teams are **tied on wins**, break the tie with this cascade (team totals,
   pooled = all makes ÷ all attempts):
   1. Transition 3FG%
   2. Thespian 3FG%
   3. Baylor %
   4. FT-drill %
9. If **all four are exactly equal** (vanishingly rare): the coach picks the winner
   when tapping **Finish Practice**.
10. Result: **every practice resolves to exactly one winner and one loser — practices
    never tie.** (Individual runs can tie; the practice cannot.)

### Season
11. Each player's Season Dashboard shows **Clutch FT%** (validation made / attempted),
    e.g. "7/8 · 88%".
12. Season team records and win streaks use the per-practice winner from rule 7–9, so
    there are no more "undecided" practice days.

## Data model

### Events (no schema change)
The validation FT is a new event **type `vft`** in the `live` segment, carrying
`made` true/false and the shooter's `player_id`.

- `aggregate.applyEvent` folds `vft` into the FT tally (`ftM`/`ftA`) **and** into new
  validation fields (`vftM`/`vftA`). So FT% automatically includes validation FTs, and
  Clutch FT% reads the `vft*` fields. No other code needs to special-case `vft`.
- `RawTally` gains `vftM` and `vftA`.

### Squads (migration 008)
- Add `squads.ties integer not null default 0`.
- `game_index` for new events becomes `wins + losses + ties + 1` (was `wins + losses + 1`),
  so tied runs still advance the game counter and per-run shot charts stay separate.

### Practices (migration 008)
- Add `practices.tiebreak_winner_squad_id uuid null` — set only in the rule-9 dead-even
  case, from the Coach's Finish-Practice choice.

Migration `008_ties_and_tiebreak.sql` adds both columns (additive, nullable/defaulted —
safe on existing rows). **Coach must run it in the Supabase SQL editor** (same as 007).

## Flows / UI

### Entry (manager) — `LiveEntryView` + `SquadEntry` / `DemoEntryPanel`
"End drill & record result" → **"We won this run"** →
player picker (winning squad's present roster) → **FT Made / FT Miss**.
- Made → win banked + validation make logged.
- Miss → tie + validation miss logged.
A squad that *lost* the run records nothing; its loss/tie is written by the winner's
bench. Records stay **W-L** with ties shown as a small separate note (e.g. `4-3 · 2T`).

### Coach view — `Coach.tsx`
- Record shows **W / L / T** with +/- adjusters (ties adjuster added; W/L already mirror
  to the opponent — ties mirror too).
- "Winner of the day" uses the full cascade and shows *why* on a tiebreaker
  (e.g. "Garnet — Transition %").
- **Finish Practice**: auto-resolves the winner; only if the cascade is dead-even does it
  prompt the coach to pick, storing `tiebreak_winner_squad_id`.

### Report — `ReportView` / `reportData`
- Squad records keep the familiar **W-L**, with **ties shown as a small separate note**
  (not a third number in the record).
- Validation FTs already flow into the FT line via the tally (no change needed there).

### Season Dashboard — `seasonData` / `PlayerDashboardView` / `DashboardView`
- New per-player **Clutch FT%** (made/attempted) in the player detail and a column on the
  roster table.
- Team records/streaks use the per-practice winner (cascade + override), replacing the
  old "wins > losses else undecided" logic.

## Tiebreaker helper (shared)

`practiceWinner(a, b, events, drills, overrideId?) => squadId | null`
1. `a.wins` vs `b.wins` → higher wins.
2. else Transition% → Thespian% → Baylor% → FT% (pooled team totals).
3. else `overrideId` (coach) or `null` (only until the coach sets it).

Lives next to the season/report builders so the Coach view, the report, and the season
standings all agree.

## Out of scope (for now)
- A dedicated `games` table (the `vft` events already record who validated each win).
- Stealing a missed validation FT / multiple FT attempts (rule: one dead-ball shot).
- A live "if practice ended now…" projection (the Coach view resolves at Finish).

## Build order
1. Data model: `RawTally.vft*`, `aggregate` `vft` handling, config label.
2. Tiebreaker helper + ties in records (season + report + coach "winner of day").
3. Entry flow: `LiveEntryView` validation-FT UI, wired in `DemoEntryPanel` (demo) and
   `SquadEntry` (live) + `db.ts` (`setSquadTies`, log `vft`, mirror to opponent).
4. Clutch FT% in the Season Dashboard.
5. Coach Finish-Practice resolver + dead-even prompt.
6. Migration `008`; verify demo routes; note migration for the coach to run.
