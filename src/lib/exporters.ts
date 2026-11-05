// CSV / JSON export + download helpers (all client-side).
import { getEventsForExport, getBackup } from "./db";

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

export async function exportPracticeCSV(practiceId: string, dateLabel?: string) {
  const rows = await getEventsForExport(practiceId);
  downloadText(`practice-${slug(dateLabel || practiceId)}-events.csv`, toCSV(rows), "text/csv");
}

export async function exportSeasonCSV() {
  const rows = await getEventsForExport();
  downloadText("ludolytics-season-events.csv", toCSV(rows), "text/csv");
}

export async function exportBackupJSON() {
  const data = await getBackup();
  const payload = { exported_at: new Date().toISOString(), version: 1, data };
  downloadText(`ludolytics-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
}
