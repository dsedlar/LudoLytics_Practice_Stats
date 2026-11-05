# Ludolytics Practice Stats — Specification

VES Boys Basketball. Live practice stat collection, the Ludolytics one-page
report, and a season-long player dashboard.

## Goals

1. **Two analysts collect at once**, one per squad, from their own MacBooks, with
   real-time sync into one shared practice.
2. **One-click report** at the end of practice that matches the Ludolytics
   sample report exactly, exportable to PDF.
3. **Season dashboard** that aggregates every practice for all players to see.

## Users & roles

- **Coach** — sets up the practice, assigns squads, sets the 1–5 grade, exports
  the report. Sees both squads live.
- **Analyst** (student) — logs stats for one squad during practice.
- **Players / families** — view the season dashboard (read-only, via team link).

## Workflow

1. **Setup** — Upload the practice-plan `.docx`; the app auto-reads the two
   squads, jersey numbers, date and time. Coach confirms/edits and marks
   attendance. (Manual setup also available.)
2. **Live entry** — Each analyst opens their squad. Fast, keyboard-friendly
   buttons for Live Play, Transition, and Shooting Drills. Every tap is a raw
   event; one-tap undo.
3. **Coach view** — Garnet / White / Combined update in real time; coach sets
   the grade.
4. **Report** — The exact one-page Ludolytics layout; Save as PDF.
5. **Dashboard** — Season totals/averages per player, viewable by the team.

## Stats model

Analysts log **raw events only**; the app computes everything else.

- **Shooting by zone:** At-the-Rim, Non-ATR 2FG, 3FG, FT (makes/attempts).
- **Playmaking:** potential assist, 2nd assist, assist, turnover.
- **Rebounding:** tip, OR, DR. **Defense:** STL, BLK, deflection, loose ball,
  dive, charge. **Other:** foul drawn, good screen, throw-ahead, misc.
- **Shooting drills:** Baylor (makes/75), 90s (makes/20), Transition
  (makes/attempts), FT (makes/20). Denominators editable in Admin.

### Computed (formulas from the sample report footer)

- POSS = FGA + TO + 0.44·FTA
- PPP = PTS / POSS · PPS = PTS / FGA (FT included)
- eFG% = (FGM + 0.5·3PM) / FGA · TS% = PTS / 2 / (FGA + 0.44·FTA)
- A/TO = Ast / max(TO,1)
- PER = PTS + 4·FGM − 0.7·FGA − 0.4·missedFT + 0.7·OR + 0.3·DR + Ast + 0.7·STL + 0.7·BLK − TO
- **Casper Points** = Σ (count × value): CHG 4, DIVE 2, OR 1.5, DR 1, TIP 0.5,
  LB/STL/BLK/DEF/GS/TA/MISC 1.

Heat-map tiers: below average → average → above average → high → elite.

## Architecture (chosen for "least to maintain")

- **Front end:** React + Vite + TypeScript + Tailwind, as a PWA. Runs in the
  browser on the MacBooks.
- **Backend:** Supabase (hosted Postgres + realtime + auth). Free tier. This is
  both the live sync layer and the permanent season store.
- **Report + PDF:** one HTML/CSS template rendered on screen and via browser
  Print → Save as PDF (pixel-matched to the sample; no PDF library to maintain).
- **Hosting:** auto-deploy from GitHub (Netlify/Vercel free tier).

## Phases

- **Phase 1 (building):** project, DB schema, practice-plan import, setup,
  two-analyst live entry with realtime, computed stats + Casper.
- **Phase 2:** the exact one-page report + PDF export.
- **Phase 3:** season dashboard.

## Out of scope (v1)

Hudl film data (merged separately by staff), JV/Deacon teams, native mobile apps.
