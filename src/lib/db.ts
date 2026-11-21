// ---------------------------------------------------------------------------
// Data access layer — all Supabase reads/writes live here.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";
import type { PracticeDraft } from "./types";
import { practiceWinners } from "./practiceOutcome";
import { SHOOTING_DRILLS } from "./config";

function client() {
  if (!supabase) throw new Error("Supabase is not configured. Add your keys to .env.");
  return supabase;
}

// PostgREST caps a single response at 1000 rows. Season-wide reads (events,
// roster, drills) blow past that over a season, so fetch every page and stitch
// them together. We order by a unique key (id) so paging is a stable total
// order — without it, rows can be skipped or repeated across page boundaries.
const PAGE_SIZE = 1000;
async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const sb = client();
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export interface PlayerRow {
  id: string;
  name: string;
  jersey: string | null;
  active: boolean;
}

/** Convert "MM/DD/YYYY" (or already-ISO) to yyyy-mm-dd. */
export function toISODate(raw?: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export async function getPlayers(): Promise<PlayerRow[]> {
  const { data, error } = await client().from("players").select("*").order("name");
  if (error) throw error;
  return data as PlayerRow[];
}

export async function createPlayer(name: string, jersey: string): Promise<PlayerRow> {
  const { data, error } = await client()
    .from("players")
    .insert({ name: name.trim(), jersey: jersey.trim() || null, active: true })
    .select()
    .single();
  if (error) throw error;
  return data as PlayerRow;
}

export async function updatePlayer(id: string, fields: Partial<{ name: string; jersey: string | null; active: boolean }>) {
  const { error } = await client().from("players").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deletePlayer(id: string) {
  const { error } = await client().from("players").delete().eq("id", id);
  if (error) throw error;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Create a practice from the confirmed setup draft:
 *  1. Match each draft player to an existing season player (by name) or create.
 *  2. Insert the practice + its two squads.
 *  3. Insert roster_entries (squad assignment, jersey, attendance).
 * Returns the new practice id.
 */
export async function createPracticeFromDraft(draft: PracticeDraft): Promise<string> {
  const sb = client();

  // 1. players ------------------------------------------------------------
  const existing = await getPlayers();
  const byName = new Map(existing.map((p) => [norm(p.name), p]));
  const toCreate = draft.players
    .filter((p) => !p.id && !byName.has(norm(p.name)))
    .map((p) => ({ name: p.name.trim(), jersey: p.jersey || null }));

  if (toCreate.length) {
    // de-dupe by name
    const seen = new Set<string>();
    const unique = toCreate.filter((p) => {
      const k = norm(p.name);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const { data, error } = await sb.from("players").insert(unique).select();
    if (error) throw error;
    (data as PlayerRow[]).forEach((p) => byName.set(norm(p.name), p));
  }

  const playerId = (name: string, id?: string) => id ?? byName.get(norm(name))?.id;

  // 2. practice + squads --------------------------------------------------
  const { data: practice, error: pErr } = await sb
    .from("practices")
    .insert({
      practice_date: draft.dateISO,
      start_time: draft.startTime ?? null,
      finish_time: draft.finishTime ?? null,
      status: "live",
    })
    .select()
    .single();
  if (pErr) throw pErr;
  const practiceId = practice.id as string;

  const { data: squads, error: sErr } = await sb
    .from("squads")
    .insert([
      { practice_id: practiceId, name: draft.squads[0].name, color: draft.squads[0].color, sort_order: 0 },
      { practice_id: practiceId, name: draft.squads[1].name, color: draft.squads[1].color, sort_order: 1 },
    ])
    .select();
  if (sErr) throw sErr;
  const squadIds = (squads as { id: string; sort_order: number }[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.id);

  // 3. roster entries -----------------------------------------------------
  const entries = draft.players
    .map((p) => {
      const pid = playerId(p.name, p.id);
      if (!pid) return null;
      return {
        practice_id: practiceId,
        squad_id: p.squad === -1 ? null : squadIds[p.squad],
        player_id: pid,
        jersey: p.jersey || null,
        present: p.present,
        absence_reason: p.present ? null : p.absenceReason ?? null,
      };
    })
    .filter(Boolean);

  const { error: rErr } = await sb.from("roster_entries").insert(entries as object[]);
  if (rErr) throw rErr;

  return practiceId;
}

/**
 * Create a Shootaround session: a shooting-only session with the whole active
 * roster on ONE team (no scrimmage, no win/loss). Returns the new practice id.
 */
export async function createShootaround(): Promise<string> {
  const sb = client();
  const players = (await getPlayers()).filter((p) => p.active);

  const { data: practice, error: pErr } = await sb
    .from("practices")
    .insert({ practice_date: new Date().toISOString().slice(0, 10), status: "live", session_type: "shootaround" })
    .select()
    .single();
  if (pErr) throw pErr;
  const practiceId = practice.id as string;

  const { data: squad, error: sErr } = await sb
    .from("squads")
    .insert({ practice_id: practiceId, name: "Shootaround", color: "#00142D", sort_order: 0 })
    .select()
    .single();
  if (sErr) throw sErr;
  const squadId = squad.id as string;

  const entries = players.map((p) => ({
    practice_id: practiceId,
    squad_id: squadId,
    player_id: p.id,
    jersey: p.jersey || null,
    present: true,
  }));
  if (entries.length) {
    const { error: rErr } = await sb.from("roster_entries").insert(entries as object[]);
    if (rErr) throw rErr;
  }
  return practiceId;
}

// ---------------------------------------------------------------------------
// User roles / profiles (migration 009) — admin only
// ---------------------------------------------------------------------------
export interface ProfileRow {
  id: string;
  email: string | null;
  role: "admin" | "coach" | "manager" | "player";
  display_name: string | null;
  player_id: string | null;
}

export async function getProfiles(): Promise<ProfileRow[]> {
  // No players(...) embed — the player name is resolved from getPlayers() in the
  // UI, so this doesn't depend on PostgREST detecting the FK relationship.
  const { data, error } = await client()
    .from("profiles")
    .select("id, email, role, display_name, player_id")
    .order("email");
  if (error) throw error;
  return data as ProfileRow[];
}

export async function setProfileRole(id: string, role: ProfileRow["role"]) {
  const { error } = await client().from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function setProfilePlayer(id: string, playerId: string | null) {
  const { error } = await client().from("profiles").update({ player_id: playerId }).eq("id", id);
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Live practice reads/writes
// ---------------------------------------------------------------------------
export interface PracticeRow {
  id: string;
  practice_date: string;
  start_time: string | null;
  finish_time: string | null;
  grade: number | null;
  lift_grade?: number | null; // strength-training grade (1-5); separate from practice grade
  status: string;
  player_of_day: string | null;
  session_type?: string; // 'practice' (default) | 'shootaround'
  tiebreak_winner_squad_id?: string | null; // migration 008; dead-even coach pick
}
export interface SquadRow {
  id: string;
  practice_id: string;
  name: string;
  color: string;
  sort_order: number;
  wins: number;
  losses: number;
  ties?: number; // added in migration 008; undefined until then
  claimed_by?: string | null; // manager who claimed this squad (migration 011)
  claimed_label?: string | null; // their email, for display
}
export interface RosterRow {
  id: string;
  squad_id: string | null;
  player_id: string;
  jersey: string | null;
  present: boolean;
  players: { name: string } | null;
}
export interface DrillRow {
  id: string;
  squad_id: string | null;
  player_id: string;
  drill: string;
  makes: number;
  attempts: number | null;
}

export interface PracticeBundle {
  practice: PracticeRow;
  squads: SquadRow[];
  roster: RosterRow[];
}

export async function getPracticeBundle(practiceId: string): Promise<PracticeBundle> {
  const sb = client();
  const [p, s, r] = await Promise.all([
    sb.from("practices").select("*").eq("id", practiceId).single(),
    sb.from("squads").select("*").eq("practice_id", practiceId).order("sort_order"),
    sb
      .from("roster_entries")
      .select("id, squad_id, player_id, jersey, present, players(name)")
      .eq("practice_id", practiceId),
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  if (r.error) throw r.error;
  return {
    practice: p.data as PracticeRow,
    squads: s.data as SquadRow[],
    roster: r.data as unknown as RosterRow[],
  };
}

// Denormalized events for CSV export (optionally one practice).
export async function getEventsForExport(practiceId?: string) {
  let q = client()
    .from("events")
    .select("created_at, segment, type, made, shot_x, shot_y, game_index, players(name), squads(name), practices(practice_date)");
  if (practiceId) q = q.eq("practice_id", practiceId);
  const { data, error } = await q.order("id");
  if (error) throw error;
  type Row = { created_at: string; segment: string; type: string; made: boolean | null; shot_x: number | null; shot_y: number | null; game_index: number | null; players: { name: string } | null; squads: { name: string } | null; practices: { practice_date: string } | null };
  return (data as unknown as Row[]).map((e) => ({
    date: e.practices?.practice_date ?? "",
    squad: e.squads?.name ?? "",
    player: e.players?.name ?? "",
    segment: e.segment,
    type: e.type,
    made: e.made == null ? "" : e.made ? "make" : "miss",
    shot_x: e.shot_x ?? "",
    shot_y: e.shot_y ?? "",
    game: e.game_index ?? "",
    logged_at: e.created_at,
  }));
}

// Full dump of every table — for a restorable backup.
export async function getBackup(): Promise<Record<string, unknown[]>> {
  const sb = client();
  const out: Record<string, unknown[]> = {};
  // Page through every table that has an id so a backup can never silently
  // truncate at PostgREST's 1000-row cap (events especially grows past it).
  for (const t of ["players", "practices", "squads", "roster_entries", "events", "drill_results"]) {
    out[t] = await selectAll<unknown>(t, "*");
  }
  // settings is a tiny key/value table with no id to page by.
  const { data, error } = await sb.from("settings").select("*");
  if (error) throw error;
  out["settings"] = data ?? [];
  return out;
}

export async function getSquads(practiceId: string): Promise<SquadRow[]> {
  const { data, error } = await client().from("squads").select("*").eq("practice_id", practiceId).order("sort_order");
  if (error) throw error;
  return data as SquadRow[];
}

export async function getEvents(practiceId: string) {
  const { data, error } = await client()
    .from("events")
    .select("id, practice_id, squad_id, player_id, segment, type, made, shot_x, shot_y, game_index")
    .eq("practice_id", practiceId)
    .order("id");
  if (error) throw error;
  return data;
}

export async function logEvent(ev: {
  practice_id: string;
  squad_id: string;
  player_id: string;
  segment: string;
  type: string;
  made?: boolean | null;
  shot_x?: number | null;
  shot_y?: number | null;
  game_index?: number;
}) {
  const { data, error } = await client()
    .from("events")
    .insert({
      ...ev,
      made: ev.made ?? null,
      shot_x: ev.shot_x ?? null,
      shot_y: ev.shot_y ?? null,
      game_index: ev.game_index ?? 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEvent(id: number) {
  const { error } = await client().from("events").delete().eq("id", id);
  if (error) throw error;
}

export async function getDrillResults(practiceId: string) {
  const { data, error } = await client().from("drill_results").select("*").eq("practice_id", practiceId);
  if (error) throw error;
  return data as DrillRow[];
}

export async function upsertDrillResult(row: {
  practice_id: string;
  squad_id: string | null;
  player_id: string;
  drill: string;
  makes: number;
  attempts?: number | null;
}) {
  const { error } = await client()
    .from("drill_results")
    .upsert({ ...row, attempts: row.attempts ?? null }, { onConflict: "practice_id,player_id,drill" });
  if (error) throw error;
}

// Remove a drill result entirely (drill was not done) — distinct from a 0 score.
export async function deleteDrillResult(practiceId: string, playerId: string, drill: string) {
  const { error } = await client()
    .from("drill_results")
    .delete()
    .eq("practice_id", practiceId)
    .eq("player_id", playerId)
    .eq("drill", drill);
  if (error) throw error;
}

export async function setGrade(practiceId: string, grade: number | null) {
  const { error } = await client().from("practices").update({ grade }).eq("id", practiceId);
  if (error) throw error;
}

export async function setLiftGrade(practiceId: string, liftGrade: number | null) {
  const { error } = await client().from("practices").update({ lift_grade: liftGrade }).eq("id", practiceId);
  if (error) throw error;
}

export async function setSquadWins(squadId: string, wins: number) {
  const { error } = await client().from("squads").update({ wins: Math.max(0, wins) }).eq("id", squadId);
  if (error) throw error;
}

export async function setSquadLosses(squadId: string, losses: number) {
  const { error } = await client().from("squads").update({ losses: Math.max(0, losses) }).eq("id", squadId);
  if (error) throw error;
}

// Tied runs (missed validation FT). Column added in migration 008.
export async function setSquadTies(squadId: string, ties: number) {
  const { error } = await client().from("squads").update({ ties: Math.max(0, ties) }).eq("id", squadId);
  if (error) throw error;
}

// A manager claims a squad for the current live practice (first-come). Returns
// false if another manager already holds it. Column added in migration 011.
export async function claimSquad(squadId: string, label: string): Promise<boolean> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in.");
  // Only succeeds when the squad is unclaimed or already mine (atomic: a
  // concurrent claim leaves claimed_by set, so this WHERE no longer matches).
  const { data, error } = await sb
    .from("squads")
    .update({ claimed_by: uid, claimed_label: label })
    .eq("id", squadId)
    .or(`claimed_by.is.null,claimed_by.eq.${uid}`)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// Release my claim on a squad (lets a manager switch while the other team is open).
export async function releaseSquad(squadId: string): Promise<void> {
  const sb = client();
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  const { error } = await sb.from("squads").update({ claimed_by: null, claimed_label: null }).eq("id", squadId).eq("claimed_by", uid);
  if (error) throw error;
}

// Only written in the rare dead-even tiebreaker case (migration 008 column).
export async function setTiebreakWinner(practiceId: string, squadId: string | null) {
  const { error } = await client().from("practices").update({ tiebreak_winner_squad_id: squadId }).eq("id", practiceId);
  if (error) throw error;
}

export async function setSquadColor(squadId: string, color: string) {
  const { error } = await client().from("squads").update({ color }).eq("id", squadId);
  if (error) throw error;
}

export async function updateSquad(squadId: string, patch: { name?: string; color?: string }) {
  const { error } = await client().from("squads").update(patch).eq("id", squadId);
  if (error) throw error;
}

// Move a player to the other squad mid-practice. Already-logged events keep
// their original squad_id (so team totals split by where each stat was earned);
// only the player's current team changes from here on.
export async function setPlayerSquad(practiceId: string, playerId: string, squadId: string) {
  const { error } = await client()
    .from("roster_entries")
    .update({ squad_id: squadId })
    .eq("practice_id", practiceId)
    .eq("player_id", playerId);
  if (error) throw error;
}

export async function finishPractice(practiceId: string, finishTime: string) {
  const { error } = await client()
    .from("practices")
    .update({ status: "finished", finish_time: finishTime })
    .eq("id", practiceId);
  if (error) throw error;
}

export async function getLivePractice(): Promise<PracticeRow | null> {
  const { data, error } = await client()
    .from("practices")
    .select("*")
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as PracticeRow) ?? null;
}

export async function listRecentPractices(): Promise<PracticeRow[]> {
  const { data, error } = await client()
    .from("practices")
    .select("*")
    .order("practice_date", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as PracticeRow[];
}

export interface PracticeSummary {
  id: string;
  date: string;
  grade: number | null;
  status: string;
  finish: string | null;
  squads: { name: string; color: string; wins: number; losses: number; ties?: number }[];
  present: number;
  total: number;
  winner?: { name: string | null; color: string | null; note: string } | null; // decided by the tiebreaker cascade
}

/** All practices with squad records + attendance + winner, newest first. */
export async function getHistory(): Promise<PracticeSummary[]> {
  const sb = client();
  // events/roster/drills can exceed PostgREST's 1000-row cap over a season, so
  // page through them (a truncated read would drop whole practices and skew the
  // winner computation).
  const [pr, sq, ro, ev, dr] = await Promise.all([
    sb.from("practices").select("*").order("practice_date", { ascending: false }),
    sb.from("squads").select("*").order("sort_order"),
    selectAll<{ practice_id: string; present: boolean; player_id: string; squad_id: string | null }>(
      "roster_entries", "id, practice_id, present, player_id, squad_id",
    ),
    selectAll<{ practice_id: string; squad_id: string; segment: string; type: string; made: boolean | null }>(
      "events", "id, practice_id, squad_id, segment, type, made",
    ),
    selectAll<{ practice_id: string; player_id: string; drill: string; makes: number }>(
      "drill_results", "id, practice_id, player_id, drill, makes",
    ),
  ]);
  if (pr.error) throw pr.error;
  if (sq.error) throw sq.error;

  const winners = practiceWinners(
    pr.data as { id: string; tiebreak_winner_squad_id?: string | null }[],
    sq.data as { id: string; practice_id: string; name: string; color: string; wins: number }[],
    ev,
    dr,
    ro,
  );

  const squadsByPractice = new Map<string, { name: string; color: string; wins: number; losses: number; ties: number }[]>();
  (sq.data as { practice_id: string; name: string; color: string; wins: number; losses: number; ties?: number }[]).forEach((s) => {
    if (!squadsByPractice.has(s.practice_id)) squadsByPractice.set(s.practice_id, []);
    squadsByPractice.get(s.practice_id)!.push({ name: s.name, color: s.color, wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0 });
  });
  const att = new Map<string, { present: number; total: number }>();
  ro.forEach((r) => {
    const a = att.get(r.practice_id) ?? { present: 0, total: 0 };
    a.total += 1;
    if (r.present) a.present += 1;
    att.set(r.practice_id, a);
  });

  return (pr.data as { id: string; practice_date: string; grade: number | null; status: string; finish_time: string | null; session_type?: string }[])
    .filter((p) => p.session_type !== "shootaround") // shootarounds have no W-L; shown on their own page
    .map((p) => {
    const w = winners.get(p.id);
    return {
      id: p.id,
      date: p.practice_date,
      grade: p.grade,
      status: p.status,
      finish: p.finish_time,
      squads: squadsByPractice.get(p.id) ?? [],
      present: att.get(p.id)?.present ?? 0,
      total: att.get(p.id)?.total ?? 0,
      winner: w && w.winnerId ? { name: w.name, color: w.color, note: w.reason === "wins" ? "" : w.reasonLabel } : null,
    };
  });
}

export async function deletePractice(id: string) {
  const { error } = await client().from("practices").delete().eq("id", id);
  if (error) throw error;
}

export async function updatePractice(id: string, fields: Partial<{ practice_date: string; finish_time: string | null; grade: number | null; status: string; player_of_day: string | null }>) {
  const { error } = await client().from("practices").update(fields).eq("id", id);
  if (error) throw error;
}

import type { SeasonInput } from "./seasonData";
import type { EventRow } from "./aggregate";

/** Fetch everything needed to build the season dashboard. */
export async function getSeasonData(): Promise<SeasonInput> {
  const sb = client();
  const [pr, ro, sq, ev, dr] = await Promise.all([
    // select("*") so new columns (ties, tiebreak_winner_squad_id from migration
    // 008) are included once present, without erroring before the migration runs.
    sb.from("practices").select("*").order("practice_date"),
    // events/roster/drills grow past PostgREST's 1000-row cap over a season, so
    // page through them; a truncated read silently drops whole practices.
    selectAll<{ practice_id: string; player_id: string; squad_id: string | null; present: boolean; jersey: string | null; players: { name: string } | null }>(
      "roster_entries", "id, practice_id, player_id, squad_id, present, jersey, players(name)",
    ),
    sb.from("squads").select("*"),
    selectAll<EventRow>("events", "id, practice_id, squad_id, player_id, segment, type, made, shot_x, shot_y"),
    selectAll<{ practice_id: string; player_id: string; drill: string; makes: number; attempts: number | null }>(
      "drill_results", "id, practice_id, player_id, drill, makes, attempts",
    ),
  ]);
  if (pr.error) throw pr.error;
  if (sq.error) throw sq.error;
  // Shootaround sessions are shooting-only — keep them out of the scrimmage-based
  // season stats (W-L, eFG, Casper, grades, winners) entirely.
  const allPractices = pr.data as { id: string; session_type?: string }[];
  const shootIds = new Set(allPractices.filter((p) => p.session_type === "shootaround").map((p) => p.id));
  const keep = <T extends { practice_id: string }>(rows: T[]) => rows.filter((r) => !shootIds.has(r.practice_id));
  return {
    practices: (pr.data as { id: string; practice_date: string; player_of_day: string | null; grade: number | null; lift_grade?: number | null; session_type?: string; tiebreak_winner_squad_id?: string | null }[]).filter((p) => !shootIds.has(p.id)),
    roster: keep(ro).map((r) => ({
      practice_id: r.practice_id,
      player_id: r.player_id,
      squad_id: r.squad_id,
      present: r.present,
      name: r.players?.name ?? "—",
      jersey: r.jersey ?? "",
    })),
    squads: (sq.data as { id: string; practice_id: string; name: string; color: string; wins: number; losses: number; ties?: number }[]).filter((s) => !shootIds.has(s.practice_id)),
    events: keep(ev),
    drills: keep(dr),
  };
}

export interface ShootaroundSummary {
  id: string;
  date: string;
  players: number;
  trans: { m: number; a: number };
  thes: { m: number; a: number };
  baylorPct: number | null; // team avg makes / denominator
  ninetyPct: number | null;
  ftPct: number | null;
}

/** All shootaround sessions, newest first, with the team's shooting line each. */
export async function getShootaroundHistory(): Promise<ShootaroundSummary[]> {
  const sb = client();
  const { data: prs, error } = await sb.from("practices").select("id, practice_date, session_type").order("practice_date", { ascending: false });
  if (error) throw error;
  const shoot = (prs as { id: string; practice_date: string; session_type?: string }[]).filter((p) => p.session_type === "shootaround");
  if (!shoot.length) return [];
  const ids = new Set(shoot.map((p) => p.id));
  const [ev, dr, ro] = await Promise.all([
    selectAll<{ practice_id: string; segment: string; type: string; made: boolean | null }>("events", "id, practice_id, segment, type, made"),
    selectAll<{ practice_id: string; drill: string; makes: number }>("drill_results", "id, practice_id, drill, makes"),
    selectAll<{ practice_id: string; present: boolean }>("roster_entries", "id, practice_id, present"),
  ]);
  const evS = ev.filter((e) => ids.has(e.practice_id));
  const drS = dr.filter((d) => ids.has(d.practice_id));
  const roS = ro.filter((r) => ids.has(r.practice_id));
  const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
  return shoot.map((p) => {
    const seg = (s: string) => {
      const e = evS.filter((x) => x.practice_id === p.id && x.segment === s && x.type === "fg3");
      return { m: e.filter((x) => x.made).length, a: e.length };
    };
    const drillPct = (k: string) => {
      const rs = drS.filter((x) => x.practice_id === p.id && x.drill === k);
      return rs.length ? rs.reduce((a, b) => a + Number(b.makes), 0) / rs.length / denom(k) : null;
    };
    return {
      id: p.id,
      date: p.practice_date,
      players: roS.filter((r) => r.practice_id === p.id && r.present).length,
      trans: seg("transition"),
      thes: seg("thespian"),
      baylorPct: drillPct("baylor"),
      ninetyPct: drillPct("ninetys"),
      ftPct: drillPct("ft"),
    };
  });
}

/** Subscribe to realtime changes for a practice. Returns an unsubscribe fn. */
export function subscribeToPractice(practiceId: string, onChange: () => void): () => void {
  const sb = client();
  const channel = sb
    .channel(`practice:${practiceId}:${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events", filter: `practice_id=eq.${practiceId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "drill_results", filter: `practice_id=eq.${practiceId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "practices", filter: `id=eq.${practiceId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "squads", filter: `practice_id=eq.${practiceId}` },
      onChange,
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
