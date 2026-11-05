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
