// Shot Cam persistence. Sessions live in their own table (shot_cam_sessions,
// migration 014) — nothing here reads or writes practices, events or drill
// results, so Practice Stats is untouched.
import { supabase } from "../supabase";
import type { CamDrillKey, CamShot } from "./drills";

export interface CamSessionRow {
  id: string;
  player_id: string;
  drill: CamDrillKey;
  workout_date: string;
  makes: number;
  attempts: number;
  duration_ms: number;
  auto_makes: number;
  auto_attempts: number;
  shots: CamShot[];
  created_at: string;
}

export interface NewCamSession {
  player_id: string;
  drill: CamDrillKey;
  makes: number;
  attempts: number;
  duration_ms: number;
  /** What the camera counted before any hand corrections — lets us measure its accuracy. */
  auto_makes: number;
  auto_attempts: number;
  shots: CamShot[];
}

const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export async function saveCamSession(s: NewCamSession): Promise<void> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("shot_cam_sessions").insert({
    ...s,
    workout_date: localDate(),
    device: navigator.userAgent.slice(0, 200),
  });
  if (error) throw error;
}

/** Recent sessions the signed-in user may see (their own; staff see everyone's). */
export async function listCamSessions(limit = 30): Promise<CamSessionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("shot_cam_sessions")
    .select("id, player_id, drill, workout_date, makes, attempts, duration_ms, auto_makes, auto_attempts, shots, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CamSessionRow[];
}

export async function deleteCamSession(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("shot_cam_sessions").delete().eq("id", id);
  if (error) throw error;
}
