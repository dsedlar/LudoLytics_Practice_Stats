// ---------------------------------------------------------------------------
// Build the Weekly Report: aggregate practices in a date range, compare to the
// previous equal-length period, and surface per-player + standout numbers.
// Pure function over the same SeasonInput the dashboard already fetches.
// ---------------------------------------------------------------------------
import { compute, emptyTally, type RawTally } from "./stats";
import { applyEvent } from "./aggregate";
import { practiceWinner, teamShootPcts } from "./practiceOutcome";
import { isShootSegment, SHOOTING_DRILLS } from "./config";
import type { SeasonInput } from "./seasonData";

const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
const BAY_D = denom("baylor");
const NINETY_D = denom("ninetys");
const FT_D = denom("ft");

export interface TrendStat {
  key: string;
  label: string;
  value: number;
  prior: number | null; // null when there is no prior-period data
  fmt: (v: number) => string;
  higherBetter: boolean;
}
export interface DailyRow {
  practiceId: string;
  date: string;
  grade: number | null;
  winnerName: string | null;
  winnerColor: string | null;
  reason: string;
  playerOfDayName: string | null;
  present: number;
  total: number;
  teams: { name: string; color: string; w: number; l: number; t: number }[];
}
export interface PlayerWeekRow {
  playerId: string;
  name: string;
  jersey: string;
  record: { w: number; l: number }; // overall practice W-L across the week
  pps: number; // points per FGA (live)
  efg: number;
  ts: number;
  fg3Pct: number;
  ftPct: number; // live free-throw % (validation FTs included)
  clutch: { m: number; a: number; pct: number };
  ast: number;
  reb: number;
  def: number; // deflections
  to: number;
  casper: number;
  per: number; // average PER across the player's practices in range
  drills: { baylor: number | null; ninety: number | null; ft: number | null; trans: { m: number; a: number }; thes: { m: number; a: number } };
}
export interface Standout { label: string; name: string; detail: string }
export interface WeeklyModel {
  startDate: string;
  endDate: string;
  practiceCount: number;
  hasPrior: boolean;
  priorStart: string;
  priorEnd: string;
  team: TrendStat[];
  daily: DailyRow[];
  players: PlayerWeekRow[];
  standouts: Standout[];
  playerOfWeek: { name: string; detail: string } | null;
}

const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);

function isoAdd(isoStr: string, days: number): string {
  const d = new Date(isoStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function buildWeekly(input: SeasonInput, startDate: string, endDate: string): WeeklyModel {
  const lenDays = daysBetween(startDate, endDate) + 1;
  const priorEnd = isoAdd(startDate, -1);
  const priorStart = isoAdd(startDate, -lenDays);
  const inRange = (d: string, s: string, e: string) => d >= s && d <= e;

  const practicesInRange = input.practices
    .filter((p) => inRange(p.practice_date, startDate, endDate))
    .sort((a, b) => (a.practice_date < b.practice_date ? -1 : 1));
  const rangeIds = new Set(practicesInRange.map((p) => p.id));
  const priorIds = new Set(input.practices.filter((p) => inRange(p.practice_date, priorStart, priorEnd)).map((p) => p.id));

  // player display info (name + jersey), used by both the daily and player tables
  const info = new Map<string, { name: string; jersey: string }>();
  input.roster.forEach((r) => { if (!info.has(r.player_id)) info.set(r.player_id, { name: r.name, jersey: r.jersey }); });

  // ---- team aggregate for a set of practices ----
  const teamAgg = (ids: Set<string>) => {
    const practiceCount = ids.size;
    const tally = emptyTally();
    input.events.forEach((e) => {
      if (ids.has(e.practice_id) && e.segment === "live") applyEvent(tally, e);
    });
    const c = compute(tally);
    const drillTO = input.events.filter((e) => ids.has(e.practice_id) && isShootSegment(e.segment) && e.type === "to").length;
    const to = tally.to + drillTO;
    let attSum = 0;
    let attN = 0;
    ids.forEach((pid) => {
      const r = input.roster.filter((x) => x.practice_id === pid);
      if (!r.length) return;
      attSum += r.filter((x) => x.present && x.squad_id != null).length / r.length;
      attN++;
    });
    const grades = input.practices.filter((p) => ids.has(p.id) && p.grade != null).map((p) => p.grade as number);
    return {
      practiceCount,
      efg: c.efg,
      ts: c.ts,
      fg3Pct: tally.fg3A ? tally.fg3M / tally.fg3A : 0,
      ppp: c.ppp,
      toPerP: practiceCount ? to / practiceCount : 0,
      rebPerP: practiceCount ? (tally.or + tally.dr) / practiceCount : 0,
      casperPerP: practiceCount ? c.casper / practiceCount : 0,
      attPct: attN ? attSum / attN : 0,
      avgGrade: grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0,
    };
  };
  const cur = teamAgg(rangeIds);
  const pri = teamAgg(priorIds);
  const hasPrior = pri.practiceCount > 0;
  const pr = <K extends keyof typeof pri>(k: K) => (hasPrior ? (pri[k] as number) : null);

  const team: TrendStat[] = [
    { key: "efg", label: "eFG%", value: cur.efg, prior: pr("efg"), fmt: pctFmt, higherBetter: true },
    { key: "ts", label: "TS%", value: cur.ts, prior: pr("ts"), fmt: pctFmt, higherBetter: true },
    { key: "fg3", label: "3FG%", value: cur.fg3Pct, prior: pr("fg3Pct"), fmt: pctFmt, higherBetter: true },
    { key: "ppp", label: "PPP", value: cur.ppp, prior: pr("ppp"), fmt: f2, higherBetter: true },
    { key: "to", label: "TO / Prac", value: cur.toPerP, prior: pr("toPerP"), fmt: f1, higherBetter: false },
    { key: "reb", label: "REB / Prac", value: cur.rebPerP, prior: pr("rebPerP"), fmt: f1, higherBetter: true },
    { key: "casper", label: "Casper / Prac", value: cur.casperPerP, prior: pr("casperPerP"), fmt: f1, higherBetter: true },
    { key: "att", label: "Attendance", value: cur.attPct, prior: pr("attPct"), fmt: pctFmt, higherBetter: true },
    { key: "grade", label: "Avg Grade", value: cur.avgGrade, prior: pr("avgGrade"), fmt: f1, higherBetter: true },
  ];

  // ---- daily recap ----
  const squadsByPractice = new Map<string, SeasonInput["squads"]>();
  input.squads.forEach((s) => {
    if (!squadsByPractice.has(s.practice_id)) squadsByPractice.set(s.practice_id, []);
    squadsByPractice.get(s.practice_id)!.push(s);
  });
  const playerSquadAt = new Map<string, string | null>();
  input.roster.forEach((r) => playerSquadAt.set(`${r.player_id}|${r.practice_id}`, r.squad_id));
  const overrideByPractice = new Map(input.practices.map((p) => [p.id, p.tiebreak_winner_squad_id ?? null]));
  const sideFor = (s: SeasonInput["squads"][number]) => ({
    id: s.id,
    wins: s.wins ?? 0,
    pcts: teamShootPcts(
      input.events.filter((e) => e.practice_id === s.practice_id && e.squad_id === s.id),
      input.drills.filter((d) => d.practice_id === s.practice_id && playerSquadAt.get(`${d.player_id}|${s.practice_id}`) === s.id).map((d) => ({ drill: d.drill, makes: Number(d.makes) })),
    ),
  });

  // which squad won each practice overall (tiebreaker-aware) — feeds per-player W-L
  const winnerSquadByPractice = new Map<string, string | null>();

  const daily: DailyRow[] = practicesInRange.map((p) => {
    const sqs = squadsByPractice.get(p.id) ?? [];
    const roster = input.roster.filter((r) => r.practice_id === p.id);
    let winnerName: string | null = null;
    let winnerColor: string | null = null;
    let reason = "";
    if (sqs.length >= 2) {
      const w = practiceWinner(sideFor(sqs[0]), sideFor(sqs[1]), overrideByPractice.get(p.id));
      const win = sqs.find((s) => s.id === w.winnerId);
      winnerName = win?.name ?? null;
      winnerColor = win?.color ?? null;
      reason = w.reasonLabel;
      winnerSquadByPractice.set(p.id, w.winnerId ?? null);
    }
    return {
      practiceId: p.id,
      date: p.practice_date,
      grade: p.grade ?? null,
      winnerName,
      winnerColor,
      reason,
      playerOfDayName: p.player_of_day ? info.get(p.player_of_day)?.name ?? null : null,
      present: roster.filter((r) => r.present && r.squad_id != null).length,
      total: roster.length,
      teams: sqs.map((s) => ({ name: s.name, color: s.color, w: s.wins ?? 0, l: s.losses ?? 0, t: s.ties ?? 0 })),
    };
  });

  // ---- per-player rows ----
  const attended = new Map<string, Set<string>>();
  input.roster.forEach((r) => {
    if (rangeIds.has(r.practice_id) && r.present && r.squad_id != null) {
      if (!attended.has(r.player_id)) attended.set(r.player_id, new Set());
      attended.get(r.player_id)!.add(r.practice_id);
    }
  });

  const totalsByPlayer = new Map<string, RawTally>();
  const perPP = new Map<string, RawTally>();
  input.events.forEach((e) => {
    if (!rangeIds.has(e.practice_id) || e.segment !== "live") return;
    if (!totalsByPlayer.has(e.player_id)) totalsByPlayer.set(e.player_id, emptyTally());
    applyEvent(totalsByPlayer.get(e.player_id)!, e);
    const k = `${e.player_id}|${e.practice_id}`;
    if (!perPP.has(k)) perPP.set(k, emptyTally());
    applyEvent(perPP.get(k)!, e);
  });
  const drillTOByPlayer = new Map<string, number>();
  input.events.forEach((e) => {
    if (rangeIds.has(e.practice_id) && isShootSegment(e.segment) && e.type === "to") drillTOByPlayer.set(e.player_id, (drillTOByPlayer.get(e.player_id) ?? 0) + 1);
  });
  const seg3ByPlayer = (seg: string) => {
    const m = new Map<string, { m: number; a: number }>();
    input.events.forEach((e) => {
      if (rangeIds.has(e.practice_id) && e.segment === seg && e.type === "fg3") {
        const c = m.get(e.player_id) ?? { m: 0, a: 0 };
        c.a++;
        if (e.made) c.m++;
        m.set(e.player_id, c);
      }
    });
    return m;
  };
  const transByP = seg3ByPlayer("transition");
  const thesByP = seg3ByPlayer("thespian");
  const drillAvg = (pid: string, drill: string) => {
    const rs = input.drills.filter((d) => rangeIds.has(d.practice_id) && d.player_id === pid && d.drill === drill);
    return rs.length ? rs.reduce((a, d) => a + Number(d.makes), 0) / rs.length : null;
  };

  const players: PlayerWeekRow[] = [...attended.entries()]
    .map(([pid, set]) => {
      const t = totalsByPlayer.get(pid) ?? emptyTally();
      const c = compute(t);
      const pers = [...set].map((prid) => compute(perPP.get(`${pid}|${prid}`) ?? emptyTally()).per);
      const perAvg = pers.length ? pers.reduce((a, b) => a + b, 0) / pers.length : 0;
      const meta = info.get(pid) ?? { name: "—", jersey: "" };
      // overall practice W-L: did this player's squad win each practice it played?
      let w = 0;
      let l = 0;
      set.forEach((prid) => {
        const winner = winnerSquadByPractice.get(prid);
        const mySquad = playerSquadAt.get(`${pid}|${prid}`);
        if (winner == null || mySquad == null) return;
        if (winner === mySquad) w++;
        else l++;
      });
      return {
        playerId: pid,
        name: meta.name,
        jersey: meta.jersey,
        record: { w, l },
        pps: c.pps,
        efg: c.efg,
        ts: c.ts,
        fg3Pct: t.fg3A ? t.fg3M / t.fg3A : 0,
        ftPct: t.ftA ? t.ftM / t.ftA : 0,
        clutch: { m: t.vftM, a: t.vftA, pct: t.vftA ? t.vftM / t.vftA : 0 },
        ast: t.ast,
        reb: t.or + t.dr,
        def: t.def,
        to: t.to + (drillTOByPlayer.get(pid) ?? 0),
        casper: c.casper,
        per: perAvg,
        drills: {
          baylor: drillAvg(pid, "baylor"),
          ninety: drillAvg(pid, "ninetys"),
          ft: drillAvg(pid, "ft"),
          trans: transByP.get(pid) ?? { m: 0, a: 0 },
          thes: thesByP.get(pid) ?? { m: 0, a: 0 },
        },
      };
    })
    .sort((a, b) => Number(a.jersey || 999) - Number(b.jersey || 999));

  // ---- standouts ----
  const standouts: Standout[] = [];
  const topBy = (f: (p: PlayerWeekRow) => number, filter?: (p: PlayerWeekRow) => boolean) => {
    const pool = filter ? players.filter(filter) : players;
    return pool.length ? pool.reduce((best, p) => (f(p) > f(best) ? p : best)) : null;
  };
  const topCasper = topBy((p) => p.casper);
  const topPer = topBy((p) => p.per);
  const topClutch = topBy((p) => p.clutch.pct, (p) => p.clutch.a >= 2);
  if (topCasper) standouts.push({ label: "Top Casper", name: topCasper.name, detail: `${f1(topCasper.casper)} CP` });
  if (topPer) standouts.push({ label: "Top PER", name: topPer.name, detail: `${f1(topPer.per)} avg` });
  if (topClutch) standouts.push({ label: "Clutch FT", name: topClutch.name, detail: `${Math.round(topClutch.clutch.pct * 100)}% (${topClutch.clutch.m}/${topClutch.clutch.a})` });

  if (hasPrior) {
    const priorTally = new Map<string, RawTally>();
    input.events.forEach((e) => {
      if (!priorIds.has(e.practice_id) || e.segment !== "live") return;
      if (!priorTally.has(e.player_id)) priorTally.set(e.player_id, emptyTally());
      applyEvent(priorTally.get(e.player_id)!, e);
    });
    let best: { p: PlayerWeekRow; delta: number } | null = null;
    players.forEach((p) => {
      const pt = priorTally.get(p.playerId);
      const ct = totalsByPlayer.get(p.playerId);
      if (!pt || !ct) return;
      const priorFga = pt.atrA + pt.nonatr2A + pt.fg3A;
      const curFga = ct.atrA + ct.nonatr2A + ct.fg3A;
      if (priorFga < 3 || curFga < 3) return;
      const delta = p.efg - compute(pt).efg;
      if (!best || delta > best.delta) best = { p, delta };
    });
    if (best && (best as { delta: number }).delta > 0) {
      const b = best as { p: PlayerWeekRow; delta: number };
      standouts.push({ label: "Most Improved", name: b.p.name, detail: `eFG +${Math.round(b.delta * 100)} pts` });
    }
  }

  const playerOfWeek = topCasper ? { name: topCasper.name, detail: `${f1(topCasper.casper)} Casper points` } : null;

  return {
    startDate,
    endDate,
    practiceCount: practicesInRange.length,
    hasPrior,
    priorStart,
    priorEnd,
    team,
    daily,
    players,
    standouts,
    playerOfWeek,
  };
}

// Drill denominators exposed for the view's % formatting.
export const DRILL_DENOMS = { baylor: BAY_D, ninety: NINETY_D, ft: FT_D };
