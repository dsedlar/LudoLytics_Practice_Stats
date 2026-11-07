# To Do

## JV practice tracking (lean) — not started

A lightweight JV track that sits entirely alongside the Varsity app without
touching it. No box score, no shot charts, no drills, no live/real-time sync.

### Scope (what JV records)
Per JV practice, entered after the fact in one sitting:
- **Practice level** (1–5, same grade scale as Varsity)
- **Day's teams** — assign that day's players to **Grey** or **Garnet**
  (rosters are NOT fixed; players are assigned to a different team each day,
  like the Varsity practice setup). Being assigned = they played that day.
- **Winner** of the day (Grey or Garnet)
- **Player of the Day (POD)** — dropdown of players assigned that day

Explicitly NOT tracked for JV: shooting, rebounds, Casper, drills, shot chart.

### Derived numbers
- **Team record:** per squad, practices won → Grey W-L + streak, Garnet W-L + streak.
- **Player record:** for each practice a player was assigned, W if their squad
  won that day, else L → player W-L + streak.
- **POD count** per player.
- Streaks = consecutive W/L by date, no ties (teams and players).

### Entry points
- **Season Dashboard:** one **"JV" button** (top-right) → the JV Dashboard.
- **JV Dashboard** shows:
  - Practice-level trend line (1–5), matching the Varsity look
  - Grey/Garnet team records (with streaks)
  - Roster table: #, Player, **GP (practices played)**, W, L, Streak, POD count
    (GP instead of a fixed Squad column, since teams change daily)
  - An **"Enter today's practice"** action (set up the day's two teams +
    level + winner + POD)
  - **Edit history** — reopen any logged JV practice to fix
    level/winner/assignments/POD, or delete it
- **Settings (admin):** manage the **JV roster / player pool** (add/edit/remove),
  next to the Varsity roster.

### Access
- JV **entry/editing** open to any signed-in user (JV coach signs in with their
  own non-admin account, or the analytics team enters it).
- JV **roster management** admin-only (in Settings).

### Suggested data model (to confirm at build time)
- `jv_players` — id, name, jersey?, active (pool; no fixed squad)
- `jv_practices` — id, date, level (1–5), winner ('grey'|'garnet'), player_of_day (fk), created_at
- `jv_assignments` — jv_practice_id, jv_player_id, squad ('grey'|'garnet')
  (presence in this table = played that day; squad stored per-practice)

### Open questions to confirm before building
1. **One JV button vs two** on the Season Dashboard — proposed: one "JV" button
   to the JV Dashboard, with "Enter today's practice" on that page.
2. Confirm JV = the four fields above only (no box score).
3. Will the **JV coach have their own login**? (If not, analytics team enters it.)

---

## Full-court shot chart on the practice report — DONE (2026-11)

Implemented: Report page has Box Score / Shot Chart toggle (top-left) + Save
as PDF (top-right). Shot Chart is a full-court ESPN-style SVG (tan hardwood,
Fighting Bishop center logo), Grey shots at the left hoop / Garnet at the right,
made = filled, missed = hollow ring. See src/components/ShotChartView.tsx.
Remaining nice-to-haves below if ever wanted.

### Original notes (kept for reference)

Add a full-court shot chart as **page 2** of each practice report (page 1 stays
the exact one-pager, untouched). Fills the page in landscape; prints as SVG.

### How it works
- Reuses existing data: every shot already has `shot_x`, `shot_y`, `made`,
  `squad_id`. No new capture.
- Shots are stored on a **half court** (one basket). On the full court, plot
  **Grey's shots at the left hoop and Garnet's at the right** — the two
  half-courts back-to-back. No "which end?" guessing.
- Dots colored by team: **grey = Grey, garnet = Garnet**. Make/miss convention
  matches live entry: **filled = make, open ring = miss**.

### Court design (brand colors, from the VES "Bishops" court mockup)
- Deep-garnet frame, garnet inner trim, cream floor, ivory "BISHOPS" side panels,
  center "V", "Virginia Episcopal School" top, "Robert I. Lee, Jr. '45 Court" bottom.
- Light paint tints (grey end / garnet end) to reinforce which team is which.
- A sample mockup was rendered during brainstorming (scratchpad only, not in repo).

### Polish items to finish in the real build
- Plot **real** shot coordinates (sample used fake scattered dots).
- Swap the typed "V" for the actual logo art.
- Move the legend fully inside the frame (sample overlapped the bottom edge).
- Tighten court lines to true NFHS proportions.
- If dots get cluttered at a busy practice: shrink them, or offer a
  zone-shaded alternate view (can reuse `zoneFor`).

### Open questions
1. Start with one combined full court (both teams, each at their end) — yes?
2. Ever want it split by **segment** (Live vs Transition) or a **per-player**
   version? (Proposed: just the combined court for v1.)
