// CSV / JSON export + download helpers (all client-side).
import { getBackup, getPracticeBundle, getEvents, getDrillResults, getSeasonData, type DrillRow } from "./db";
import { buildReport, buildBoxScore, buildSeasonBoxScore } from "./reportData";
import { buildSeason } from "./seasonData";
import type { EventRow } from "./aggregate";

export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

// Full box score (one row per player + team totals), the report as raw data.
export async function exportPracticeCSV(practiceId: string, dateLabel?: string) {
  const [bundle, events, drills] = await Promise.all([
    getPracticeBundle(practiceId),
    getEvents(practiceId),
    getDrillResults(practiceId),
  ]);
  const model = buildReport(bundle, events as unknown as EventRow[], drills as DrillRow[]);
  downloadText(`practice-${slug(dateLabel || practiceId)}-boxscore.csv`, toCSV(buildBoxScore(model)), "text/csv");
}

// Season box score: every player's season totals + team totals.
export async function exportSeasonCSV() {
  const season = buildSeason(await getSeasonData());
  downloadText("ludolytics-season-boxscore.csv", toCSV(buildSeasonBoxScore(season)), "text/csv");
}

export async function exportBackupJSON() {
  const data = await getBackup();
  const payload = { exported_at: new Date().toISOString(), version: 1, data };
  downloadText(`ludolytics-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
}
