// ---------------------------------------------------------------------------
// Aggregate every practice into season-long numbers per player.
// ---------------------------------------------------------------------------
import { compute, emptyTally, type RawTally, type Computed } from "./stats";
import { applyEvent, type EventRow } from "./aggregate";
import { playerZoneFor, PLAYER_ZONES, type PlayerZone } from "./court";

export type ZoneSplit = { m: number; a: number };
export type PlayerZones = Record<PlayerZone, ZoneSplit>;
export interface Shot { x: number; y: number; made: boolean } // located FG attempt (feet)
const emptyZones = (): PlayerZones => {
  const z = {} as PlayerZones;
  for (const k of PLAYER_ZONES) z[k] = { m: 0, a: 0 };
  return z;
};
const SHOT_EVENT_TYPES = new Set(["atr", "nonatr2", "fg3"]);

export type Trend = "better" | "worse" | "same";
export interface TeamSeason {
  practices: number;
  toPerPractice: number;
  fg3Pct: number;
  pps: number;
  ftPct: number;
  efg: number;
  ts: number;
  rebPerPractice: number;
  astPerPractice: number;
  ppp: number;
  casper: number;
  // latest practice vs the one before (better/worse/same)
  trends: { to: Trend; fg3: Trend; pps: Trend; ft: Trend; efg: Trend; ts: Trend; reb: Trend; ast: Trend; ppp: Trend; casper: Trend };
}
export interface GradePoint {
  date: string;
  grade: number;
}
export interface TeamRecord {
  name: string;
  color: string;
  w: number;
  l: number;
  streakType: "W" | "L" | null;
  streakCount: number;
}
export interface SeasonResult {
  players: PlayerSeason[];
  team: TeamSeason;
  grades: GradePoint[];
  teams: TeamRecord[]; // per-squad-name season record + current streak
  shots: Shot[]; // all players' located FG attempts (team hexbin chart)
}

export interface SeasonInput {
  practices: { id: string; practice_date: string; player_of_day?: string | null; grade?: number | null }[];
  roster: { practice_id: string; player_id: string; squad_id: string | null; present: boolean; name: string; jersey: string }[];
  squads: { id: string; practice_id: string; name: string; color: string; wins: number; losses: number }[];
  events: EventRow[];
  drills: { practice_id: string; player_id: string; drill: string; makes: number; attempts: number | null }[];
}

export interface HistoryPoint {
  practiceId: string; date: string;
  pts: number; ts: number; efg: number; per: number; cp: number;
  tally: RawTally;
  trans: { m: number; a: number };
  drills: { baylor: number | null; ninety: number | null; ft: number | null };
  wl: { w: number; l: number };
}
export interface PlayerSeason {
  playerId: string; name: string; jersey: string;
  gp: number;
  pod: number; // Player of the Day count
  record: { w: number; l: number }; // season scrimmage wins-losses
  total: Computed;
  tally: RawTally; // season raw totals
  ptsPerG: number; cpPerG: number; perAvg: number;
  drills: { baylorAvg: number; ninetyAvg: number; transPct: number; ftAvg: number };
  zones: PlayerZones; // season FG makes/attempts per court zone (located shots)
  shots: Shot[]; // the player's located FG attempts (for the hexbin chart)
  history: HistoryPoint[];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function buildSeason(input: SeasonInput): SeasonResult {
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

  // Transition 3s are a separate drill and do NOT count toward player/team
  // stats; they are tracked separately below (transAt) for the Trans column.
  const playEvents = input.events.filter((e) => e.segment !== "transition");

  // per (player, practice) tally and per-player total
  const perPP = new Map<string, RawTally>();
  const totals = new Map<string, RawTally>();
  for (const e of playEvents) {
    const k = `${e.player_id}|${e.practice_id}`;
    if (!perPP.has(k)) perPP.set(k, emptyTally());
    applyEvent(perPP.get(k)!, e);
    if (!totals.has(e.player_id)) totals.set(e.player_id, emptyTally());
    applyEvent(totals.get(e.player_id)!, e);
  }

  // per-player shot zones + raw located shots (field goals, non-transition only)
  const zonesByPlayer = new Map<string, PlayerZones>();
  const shotsByPlayer = new Map<string, Shot[]>();
  const allShots: Shot[] = [];
  for (const e of playEvents) {
    if (!SHOT_EVENT_TYPES.has(e.type) || e.shot_x == null || e.shot_y == null) continue;
    if (!zonesByPlayer.has(e.player_id)) zonesByPlayer.set(e.player_id, emptyZones());
    const z = zonesByPlayer.get(e.player_id)![playerZoneFor(e.shot_x, e.shot_y)];
    z.a += 1;
    if (e.made) z.m += 1;
    const shot: Shot = { x: e.shot_x, y: e.shot_y, made: !!e.made };
    allShots.push(shot);
    if (!shotsByPlayer.has(e.player_id)) shotsByPlayer.set(e.player_id, []);
    shotsByPlayer.get(e.player_id)!.push(shot);
  }

  // drills per player
  const dByPlayer = new Map<string, typeof input.drills>();
  for (const d of input.drills) {
    if (!dByPlayer.has(d.player_id)) dByPlayer.set(d.player_id, []);
    dByPlayer.get(d.player_id)!.push(d);
  }

  // per-practice lookups: squad W-L, which squad a player was on, drill makes, transition 3s
  const squadWL = new Map<string, { w: number; l: number }>();
  input.squads.forEach((s) => squadWL.set(s.id, { w: s.wins ?? 0, l: s.losses ?? 0 }));
  const playerSquadAt = new Map<string, string | null>();
  input.roster.forEach((r) => playerSquadAt.set(`${r.player_id}|${r.practice_id}`, r.squad_id));
  const drillAt = new Map<string, number>();
  input.drills.forEach((d) => drillAt.set(`${d.player_id}|${d.practice_id}|${d.drill}`, Number(d.makes)));
  const transAt = new Map<string, { m: number; a: number }>();
  input.events.forEach((e) => {
    if (e.segment === "transition" && e.type === "fg3") {
      const k = `${e.player_id}|${e.practice_id}`;
      const cur = transAt.get(k) ?? { m: 0, a: 0 };
      cur.a += 1;
      if (e.made) cur.m += 1;
      transAt.set(k, cur);
    }
  });
  const drillVal = (player: string, pid: string, drill: string) => {
    const key = `${player}|${pid}|${drill}`;
    return drillAt.has(key) ? drillAt.get(key)! : null;
  };

  const out: PlayerSeason[] = [];
  for (const [playerId, practiceSet] of attended) {
    const gp = practiceSet.size;
    if (gp === 0) continue;
    const meta = info.get(playerId)!;
    const total = compute(totals.get(playerId) ?? emptyTally());

    const history: HistoryPoint[] = [...practiceSet]
      .map((pid) => {
        const t = perPP.get(`${playerId}|${pid}`) ?? emptyTally();
        const c = compute(t);
        const sid = playerSquadAt.get(`${playerId}|${pid}`) ?? null;
        const sw = sid ? squadWL.get(sid) : undefined;
        return {
          practiceId: pid, date: dateById.get(pid) ?? "",
          pts: c.pts, ts: c.ts, efg: c.efg, per: c.per, cp: c.casper, tally: t,
          trans: transAt.get(`${playerId}|${pid}`) ?? { m: 0, a: 0 },
          drills: { baylor: drillVal(playerId, pid, "baylor"), ninety: drillVal(playerId, pid, "ninetys"), ft: drillVal(playerId, pid, "ft") },
          wl: { w: sw?.w ?? 0, l: sw?.l ?? 0 },
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    const dr = dByPlayer.get(playerId) ?? [];
    const pick = (k: string) => dr.filter((d) => d.drill === k);
    const trM = history.reduce((s, h) => s + h.trans.m, 0);
    const trA = history.reduce((s, h) => s + h.trans.a, 0);
    // overall practice record: count only decided days (squad won or lost);
    // a 0-0 / undecided practice counts as neither a win nor a loss.
    const wonDays = history.filter((h) => h.wl.w > h.wl.l).length;
    const lostDays = history.filter((h) => h.wl.l > h.wl.w).length;
    const record = { w: wonDays, l: lostDays };

    out.push({
      playerId, name: meta.name, jersey: meta.jersey, gp, pod: podCount.get(playerId) ?? 0, record, total,
      tally: totals.get(playerId) ?? emptyTally(),
      zones: zonesByPlayer.get(playerId) ?? emptyZones(),
      shots: shotsByPlayer.get(playerId) ?? [],
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

  const players = out.sort((a, b) => Number(a.jersey || 999) - Number(b.jersey || 999));

  // team season totals (non-transition events only)
  const totalTally = emptyTally();
  playEvents.forEach((e) => applyEvent(totalTally, e));
  const tc = compute(totalTally);
  const practicesWithData = new Set(playEvents.map((e) => e.practice_id)).size || input.practices.length;

  // per-practice team tallies (for trends), ordered by date
  const byPractice = new Map<string, RawTally>();
  playEvents.forEach((e) => {
    if (!byPractice.has(e.practice_id)) byPractice.set(e.practice_id, emptyTally());
    applyEvent(byPractice.get(e.practice_id)!, e);
  });
  const orderedPids = [...byPractice.keys()].sort((a, b) => ((dateById.get(a) ?? "") < (dateById.get(b) ?? "") ? -1 : 1));
  const latest = orderedPids.length ? byPractice.get(orderedPids[orderedPids.length - 1])! : null;
  const prev = orderedPids.length > 1 ? byPractice.get(orderedPids[orderedPids.length - 2])! : null;

  const trend = (val: (t: RawTally) => number | null, higherBetter: boolean): Trend => {
    if (!latest || !prev) return "same";
    const a = val(latest);
    const b = val(prev);
    if (a == null || b == null || a === b) return "same";
    const better = higherBetter ? a > b : a < b;
    return better ? "better" : "worse";
  };
  const hasFga = (t: RawTally) => t.atrA + t.nonatr2A + t.fg3A > 0;
  const fg3 = (t: RawTally) => (t.fg3A ? t.fg3M / t.fg3A : null);
  const ppsOf = (t: RawTally) => (hasFga(t) ? compute(t).pps : null);
  const ftOf = (t: RawTally) => (t.ftA ? t.ftM / t.ftA : null);
  const efgOf = (t: RawTally) => (hasFga(t) ? compute(t).efg : null);
  const tsOf = (t: RawTally) => (hasFga(t) || t.ftA ? compute(t).ts : null);
  const pppOf = (t: RawTally) => (hasFga(t) || t.to || t.ftA ? compute(t).ppp : null);

  const team: TeamSeason = {
    practices: practicesWithData,
    toPerPractice: practicesWithData ? totalTally.to / practicesWithData : 0,
    fg3Pct: totalTally.fg3A ? totalTally.fg3M / totalTally.fg3A : 0,
    pps: tc.pps,
    ftPct: totalTally.ftA ? totalTally.ftM / totalTally.ftA : 0,
    efg: tc.efg,
    ts: tc.ts,
    rebPerPractice: practicesWithData ? (totalTally.or + totalTally.dr) / practicesWithData : 0,
    astPerPractice: practicesWithData ? totalTally.ast / practicesWithData : 0,
    ppp: tc.ppp,
    casper: tc.casper,
    trends: {
      to: trend((t) => t.to, false), // fewer turnovers is better
      fg3: trend(fg3, true),
      pps: trend(ppsOf, true),
      ft: trend(ftOf, true),
      efg: trend(efgOf, true),
      ts: trend(tsOf, true),
      reb: trend((t) => t.or + t.dr, true),
      ast: trend((t) => t.ast, true),
      ppp: trend(pppOf, true),
      casper: trend((t) => compute(t).casper, true),
    },
  };

  const grades: GradePoint[] = input.practices
    .filter((p) => p.grade != null)
    .map((p) => ({ date: p.practice_date, grade: p.grade as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // per-team (by squad name) season record + current W/L streak.
  // A practice counts only when it has a decided winner: wins>losses = W,
  // losses>wins = L, equal (e.g. 0-0, undecided/live) = neither.
  const byName = new Map<string, { color: string; days: { date: string; result: "W" | "L" | null }[] }>();
  input.squads.forEach((s) => {
    const date = dateById.get(s.practice_id) ?? "";
    const w = s.wins ?? 0;
    const l = s.losses ?? 0;
    const result: "W" | "L" | null = w > l ? "W" : l > w ? "L" : null;
    if (!byName.has(s.name)) byName.set(s.name, { color: s.color, days: [] });
    byName.get(s.name)!.days.push({ date, result });
  });
  const teams: TeamRecord[] = [...byName.entries()]
    .map(([name, { color, days }]) => {
      const decided = days.filter((d) => d.result).sort((a, b) => (a.date < b.date ? -1 : 1));
      const w = decided.filter((d) => d.result === "W").length;
      const l = decided.filter((d) => d.result === "L").length;
      let streakType: "W" | "L" | null = null;
      let streakCount = 0;
      for (let i = decided.length - 1; i >= 0; i--) {
        const t = decided[i].result as "W" | "L";
        if (streakType === null) { streakType = t; streakCount = 1; }
        else if (t === streakType) streakCount++;
        else break;
      }
      return { name, color, w, l, streakType, streakCount };
    })
    .sort((a, b) => b.w + b.l - (a.w + a.l) || b.w - a.w);

  return { players, team, grades, teams, shots: allShots };
}
