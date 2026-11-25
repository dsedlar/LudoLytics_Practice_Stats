// ---------------------------------------------------------------------------
// Seasons are derived from the practice date (no stored field). A season runs
// June 1 → May 30 and is labeled by the year it starts, e.g. "2026-27":
// June 2026 … May 2027 are all the 2026-27 season.
// ---------------------------------------------------------------------------
import type { SeasonInput } from "./seasonData";

const SEASON_START_MONTH = 6; // June

export function seasonOf(dateISO: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(dateISO);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const start = month >= SEASON_START_MONTH ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function currentSeason(todayISO: string = new Date().toISOString().slice(0, 10)): string {
  return seasonOf(todayISO);
}

/** Distinct seasons present in a set of ISO dates, newest first. */
export function seasonsIn(dates: string[]): string[] {
  const set = new Set(dates.map(seasonOf).filter(Boolean));
  return [...set].sort().reverse();
}

/** Narrow a SeasonInput to one season (by each practice's date). */
export function filterSeasonInput(input: SeasonInput, season: string): SeasonInput {
  const ids = new Set(input.practices.filter((p) => seasonOf(p.practice_date) === season).map((p) => p.id));
  return {
    practices: input.practices.filter((p) => ids.has(p.id)),
    roster: input.roster.filter((r) => ids.has(r.practice_id)),
    squads: input.squads.filter((s) => ids.has(s.practice_id)),
    events: input.events.filter((e) => ids.has(e.practice_id)),
    drills: input.drills.filter((d) => ids.has(d.practice_id)),
  };
}
