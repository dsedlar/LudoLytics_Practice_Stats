// ---------------------------------------------------------------------------
// Data access layer — all Supabase reads/writes live here.
// ---------------------------------------------------------------------------
import { supabase } from "./supabase";
import type { PracticeDraft } from "./types";

function client() {
  if (!supabase) throw new Error("Supabase is not configured. Add your keys to .env.");
  return supabase;
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

// ---------------------------------------------------------------------------
// Live practice reads/writes
// ---------------------------------------------------------------------------
export interface PracticeRow {
  id: string;
  practice_date: string;
  start_time: string | null;
  finish_time: string | null;
  grade: number | null;
  status: string;
  player_of_day: string | null;
}
export interface SquadRow {
  id: string;
  practice_id: string;
  name: string;
  color: string;
  sort_order: number;
  wins: number;
  losses: number;
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
  const tables = ["players", "practices", "squads", "roster_entries", "events", "drill_results", "settings"];
  const out: Record<string, unknown[]> = {};
  for (const t of tables) {
    const { data, error } = await sb.from(t).select("*");
    if (error) throw error;
    out[t] = data ?? [];
  }
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

export async function setGrade(practiceId: string, grade: number | null) {
  const { error } = await client().from("practices").update({ grade }).eq("id", practiceId);
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

export async function setSquadColor(squadId: string, color: string) {
  const { error } = await client().from("squads").update({ color }).eq("id", squadId);
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
  squads: { name: string; color: string; wins: number; losses: number }[];
  present: number;
  total: number;
}

/** All practices with squad records + attendance, newest first. */
export async function getHistory(): Promise<PracticeSummary[]> {
  const sb = client();
  const [pr, sq, ro] = await Promise.all([
    sb.from("practices").select("id, practice_date, grade, status, finish_time").order("practice_date", { ascending: false }),
    sb.from("squads").select("practice_id, name, color, wins, losses, sort_order").order("sort_order"),
    sb.from("roster_entries").select("practice_id, present"),
  ]);
  if (pr.error) throw pr.error;
  if (sq.error) throw sq.error;
  if (ro.error) throw ro.error;

  const squadsByPractice = new Map<string, { name: string; color: string; wins: number; losses: number }[]>();
  (sq.data as { practice_id: string; name: string; color: string; wins: number; losses: number }[]).forEach((s) => {
    if (!squadsByPractice.has(s.practice_id)) squadsByPractice.set(s.practice_id, []);
    squadsByPractice.get(s.practice_id)!.push({ name: s.name, color: s.color, wins: s.wins ?? 0, losses: s.losses ?? 0 });
  });
  const att = new Map<string, { present: number; total: number }>();
  (ro.data as { practice_id: string; present: boolean }[]).forEach((r) => {
    const a = att.get(r.practice_id) ?? { present: 0, total: 0 };
    a.total += 1;
    if (r.present) a.present += 1;
    att.set(r.practice_id, a);
  });

  return (pr.data as { id: string; practice_date: string; grade: number | null; status: string; finish_time: string | null }[]).map((p) => ({
    id: p.id,
    date: p.practice_date,
    grade: p.grade,
    status: p.status,
    finish: p.finish_time,
    squads: squadsByPractice.get(p.id) ?? [],
    present: att.get(p.id)?.present ?? 0,
    total: att.get(p.id)?.total ?? 0,
  }));
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
    sb.from("practices").select("id, practice_date, player_of_day, grade").order("practice_date"),
    sb.from("roster_entries").select("practice_id, player_id, squad_id, present, jersey, players(name)"),
    sb.from("squads").select("id, practice_id, name, color, wins, losses"),
    sb.from("events").select("id, practice_id, squad_id, player_id, segment, type, made"),
    sb.from("drill_results").select("practice_id, player_id, drill, makes, attempts"),
  ]);
  if (pr.error) throw pr.error;
  if (ro.error) throw ro.error;
  if (sq.error) throw sq.error;
  if (ev.error) throw ev.error;
  if (dr.error) throw dr.error;
  return {
    practices: pr.data as { id: string; practice_date: string; player_of_day: string | null; grade: number | null }[],
    roster: (ro.data as unknown as { practice_id: string; player_id: string; squad_id: string | null; present: boolean; jersey: string | null; players: { name: string } | null }[]).map((r) => ({
      practice_id: r.practice_id,
      player_id: r.player_id,
      squad_id: r.squad_id,
      present: r.present,
      name: r.players?.name ?? "—",
      jersey: r.jersey ?? "",
    })),
    squads: sq.data as { id: string; practice_id: string; name: string; color: string; wins: number; losses: number }[],
    events: ev.data as EventRow[],
    drills: dr.data as { practice_id: string; player_id: string; drill: string; makes: number; attempts: number | null }[],
  };
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
