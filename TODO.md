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
