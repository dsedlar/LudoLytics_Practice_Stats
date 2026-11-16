# Spec: User Roles (Admin / Coach / Manager / Player)

Status: **Phase 1 implementing** · Owner: Coach Sedlar · Last updated: 2026-11-16

## Summary
Replace today's single hardcoded-email admin check with a real four-role system
backed by a `profiles` table (one row per auth user, holding their role). The app
reads the signed-in user's role and gates the UI accordingly. Enforcement is
**UI-level for v1** (hide/disable by role); database-level RLS lockdown is a later
hardening pass.

## Roles
| Role | Can do |
|------|--------|
| **Admin** (you) | Everything + manage users (set roles, link a player account to a roster player, send password-reset emails) + roster. |
| **Coach** | See and edit **all** stats; run practices; reports, dashboard, weekly report. No user management. |
| **Manager** | **Read-only** across reports/dashboard; during a practice, **self-claims** Grey or Garnet (first-come) and edits **only that squad's** entry. |
| **Player** | Their **own player page only**, read-only. |

## Accounts (no backend)
- New accounts are created in the **Supabase dashboard** (email + temp password).
- A **database trigger auto-creates a `profiles` row** for every new auth user
  (default role `manager`; `dsedlar@ves.org` → `admin`).
- In the app's **Admin → Users** screen the admin sets each person's **role**, links
  a **player** account to a roster player, and **sends a password-reset email**
  (`supabase.auth.resetPasswordForEmail` — client-side, no server function).

## Data model (migration 009)
`profiles`: `id` (= auth.users id), `email`, `role` (admin/coach/manager/player,
default `manager`), `display_name`, `player_id` (→ players, nullable), `created_at`.
- Trigger `on_auth_user_created` inserts a profile per new auth user.
- `public.is_admin()` SECURITY DEFINER helper (avoids RLS recursion).
- RLS: a user reads their **own** profile; **admins** read/write all.
- Backfill existing users (admin email → admin, others → coach).

---

## Phase 1 — Roles foundation (this pass)
- Migration `009_roles.sql` (profiles + trigger + is_admin + RLS + backfill).
- `useAuth` exposes `role` and `playerId` (fetched from `profiles`; falls back to the
  email allowlist if the migration hasn't run yet, so nothing breaks pre-migration).
- `RequireAdmin` becomes role-based (`role === 'admin'`).
- **Admin → Users** screen: list profiles, change role, link player (for player role),
  send reset email. Linked from Settings.
- No behavioral change yet for Coach/Manager/Player beyond admin gating — they keep
  current access until Phases 2–3.

## Phase 2 — Manager flow (next)
- Self-claim Grey/Garnet per practice (first-come; the other manager gets the
  remaining squad). A claim records (practice, squad, manager).
- Managers: read-only everywhere except their claimed squad's entry.

## Phase 3 — Player experience (later)
- Player account → roster player link drives an own-page-only, scoped view.
- Optional: RLS hardening so roles are enforced at the database, not just the UI.

## Out of scope (v1)
- Self-service signup (accounts are admin-created in Supabase).
- In-app user creation / setting passwords directly (would need an Edge Function).
