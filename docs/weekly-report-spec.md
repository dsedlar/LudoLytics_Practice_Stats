# Spec: Weekly Report

Status: **implementing** · Owner: Coach Sedlar · Last updated: 2026-11-15

## Summary

A coach-facing **Weekly Report** reachable from the Season Dashboard. It summarizes
practice performance over a date range (default: the current week, **Monday–Saturday**,
changeable to any range — a month or longer), compares it to the **previous
equal-length period**, and prints/exports as a ~2-page document.

## Entry point
- A **"Weekly Report"** card/link in the Dashboard header (coaches are already signed
  in there). Opens `/weekly`.
- Public `/weekly-demo` route renders it from the season demo for verification.

## Date range
- Default = current week, **Mon–Sat**. Start/end date pickers allow any range; quick
  buttons "This week" / "Last week".
- **Comparison baseline** = the immediately preceding window of equal length (last week
  for a week, prior month for a month). Hidden when there's no prior-period data.

## Layout (on-screen + Print/PDF, landscape, team-first, ~2 pages)

**Page 1 — the week at a glance**
1. **Team trends** — week value + ▲▼ vs prior period:
   eFG%, TS%, 3FG%, PPP, TO/practice, REB/practice, Casper/practice, Attendance%,
   Avg grade. (Efficiency from live scrimmage only; TO includes drill turnovers,
   matching the rest of the app.)
2. **Standouts (auto)** — Player of the Week (top Casper) + category leaders:
   Top Casper, Top PER, Best Clutch FT (≥2 att), Most Improved (biggest eFG gain vs
   prior period, ≥3 FGA each side).
3. **Daily recap** — one row per practice: date, winner (+ tiebreaker reason), grade,
   attendance (present/total), each squad's W-L-T.

**Then — condensed per-player table**
- Players present ≥1 day in range, one row each: GP, PTS, eFG%, TS%, 3FG%, Clutch FT,
  REB, TO, Casper, PER (avg), and drill %s (Baylor/90s/FT/Transition/Thespian).

## Build
- `src/lib/weeklyReport.ts` — `buildWeekly(seasonInput, startISO, endISO): WeeklyModel`
  (reuses compute/statBlock/practiceOutcome; no new data fetch — filters `getSeasonData`).
- `src/components/WeeklyReportView.tsx` — print-friendly view.
- `src/screens/Weekly.tsx` — date controls + view + `window.print()` (RequireAuth).
- `src/screens/WeeklyDemo.tsx` — demo wrapper (defaults to the demo date range).
- Dashboard card + routes (`/weekly` auth, `/weekly-demo` public).
- **No database migration.**

## Out of scope (for now)
- Scheduling/emailing the report.
- Coach-selected Player of the Week (auto only for v1).
- Per-practice drill-by-drill charts (kept to summary numbers).
