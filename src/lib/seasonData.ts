// ---------------------------------------------------------------------------
// Aggregate every practice into season-long numbers per player.
// ---------------------------------------------------------------------------
import { compute, emptyTally, type RawTally, type Computed } from "./stats";
import { applyEvent, type EventRow } from "./aggregate";

export interface SeasonInput {
  practices: { id: string; practice_date: string; player_of_day?: string | null }[];
  roster: { practice_id: string; player_id: string; present: boolean; name: string; jersey: string }[];
  events: EventRow[];
  drills: { player_id: string; drill: string; makes: number; attempts: number | null }[];
}

export interface HistoryPoint {
  practiceId: string; date: string;
  pts: number; ts: number; efg: number; per: number; cp: number;
}
export interface PlayerSeason {
  playerId: string; name: string; jersey: string;
  gp: number;
  pod: number; // Player of the Day count
  total: Computed;
  ptsPerG: number; cpPerG: number; perAvg: number;
  drills: { baylorAvg: number; ninetyAvg: number; transPct: number; ftAvg: number };
  history: HistoryPoint[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function buildSeason(input: SeasonInput): PlayerSeason[] {
  const dateById = new Map(input.practices.map((p) => [p.id, p.practice_date]));
  const podCount = new Map<string, number>();
  input.practices.forEach((p) => {
    if (p.player_of_day) podCount.set(p.player_of_day, (podCount.get(p.player_of_day) ?? 0) + 1);
  });

  // player -> set of attended practice ids, and display info
  const attended = new Map<string, Set<string>>();
  const info = new Map<string, { name: string; jersey: string }>();
  for (const r of input.roster) {
    if (!info.has(r.player_id)) info.set(r.player_id, { name: r.name, jersey: r.jersey });
    if (r.present) {
      if (!attended.has(r.player_id)) attended.set(r.player_id, new Set());
      attended.get(r.player_id)!.add(r.practice_id);
    }
  }

  // per (player, practice) tally and per-player total
  const perPP = new Map<string, RawTally>();
  const totals = new Map<string, RawTally>();
  for (const e of input.events) {
    const k = `${e.player_id}|${e.practice_id}`;
    if (!perPP.has(k)) perPP.set(k, emptyTally());
    applyEvent(perPP.get(k)!, e);
    if (!totals.has(e.player_id)) totals.set(e.player_id, emptyTally());
    applyEvent(totals.get(e.player_id)!, e);
  }

  // drills per player
  const dByPlayer = new Map<string, typeof input.drills>();
  for (const d of input.drills) {
    if (!dByPlayer.has(d.player_id)) dByPlayer.set(d.player_id, []);
    dByPlayer.get(d.player_id)!.push(d);
  }

  const out: PlayerSeason[] = [];
  for (const [playerId, practiceSet] of attended) {
    const gp = practiceSet.size;
    if (gp === 0) continue;
    const meta = info.get(playerId)!;
    const total = compute(totals.get(playerId) ?? emptyTally());

    const history: HistoryPoint[] = [...practiceSet]
      .map((pid) => {
        const c = compute(perPP.get(`${playerId}|${pid}`) ?? emptyTally());
        return { practiceId: pid, date: dateById.get(pid) ?? "", pts: c.pts, ts: c.ts, efg: c.efg, per: c.per, cp: c.casper };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const dr = dByPlayer.get(playerId) ?? [];
    const pick = (k: string) => dr.filter((d) => d.drill === k);
    const trM = pick("transition").reduce((s, d) => s + Number(d.makes), 0);
    const trA = pick("transition").reduce((s, d) => s + Number(d.attempts ?? 0), 0);

    out.push({
      playerId, name: meta.name, jersey: meta.jersey, gp, pod: podCount.get(playerId) ?? 0, total,
      ptsPerG: total.pts / gp, cpPerG: total.casper / gp, perAvg: mean(history.map((h) => h.per)),
      drills: {
        baylorAvg: mean(pick("baylor").map((d) => Number(d.makes))),
        ninetyAvg: mean(pick("ninetys").map((d) => Number(d.makes))),
        transPct: trA ? trM / trA : 0,
        ftAvg: mean(pick("ft").map((d) => Number(d.makes))),
      },
      history,
    });
  }

  return out.sort((a, b) => Number(a.jersey || 999) - Number(b.jersey || 999));
}
