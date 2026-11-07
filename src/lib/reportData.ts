// ---------------------------------------------------------------------------
// Build every number the one-page practice report needs, from raw data.
// ---------------------------------------------------------------------------
import { compute, emptyTally, addTally, type RawTally } from "./stats";
import { tallyByPlayer, tallyBySquad, type EventRow } from "./aggregate";
import { SHOOTING_DRILLS } from "./config";
import type { PracticeBundle, DrillRow } from "./db";
import type { SeasonResult } from "./seasonData";

export interface StatBlock {
  poss: number; ppp: number; pps: number; efg: number; ts: number; pts: number;
  atr: Zone; nonatr2: Zone; fg3: Zone;
  ft: { m: number; a: number; pct: number };
  fd: number;
  play: { pot: number; second: number; ast: number; to: number; toPct: number; ato: number };
  reb: { tip: number; or: number; dr: number; orPct: number; tot: number };
  def: { stl: number; blk: number; def: number; lb: number; dive: number; chg: number };
  casper: number;
  per: number;
}
interface Zone { m: number; a: number; pct: number; fr: number }

function zone(m: number, a: number, fga: number): Zone {
  return { m, a, pct: a ? m / a : 0, fr: fga ? a / fga : 0 };
}

export function statBlock(t: RawTally, opponentDR = 0): StatBlock {
  const c = compute(t);
  const fga = c.fga;
  return {
    poss: c.poss, ppp: c.ppp, pps: c.pps, efg: c.efg, ts: c.ts, pts: c.pts,
    atr: zone(t.atrM, t.atrA, fga),
    nonatr2: zone(t.nonatr2M, t.nonatr2A, fga),
    fg3: zone(t.fg3M, t.fg3A, fga),
    ft: { m: t.ftM, a: t.ftA, pct: t.ftA ? t.ftM / t.ftA : 0 },
    fd: t.fd,
    play: { pot: t.pot, second: t.second, ast: t.ast, to: t.to, toPct: c.poss ? t.to / c.poss : 0, ato: c.ato },
    reb: {
      tip: t.tip, or: t.or, dr: t.dr, tot: t.or + t.dr,
      orPct: t.or + opponentDR ? t.or / (t.or + opponentDR) : 0,
    },
    def: { stl: t.stl, blk: t.blk, def: t.def, lb: t.lb, dive: t.dive, chg: t.chg },
    casper: c.casper, per: c.per,
  };
}

export interface DrillLine {
  name: string; color: string;
  baylor: { avg: number; pct: number };
  ninetys: { avg: number; pct: number };
  transition: { m: number; a: number; pct: number };
  ft: { avg: number; pct: number };
}
export interface PlayerLine {
  playerId: string; jersey: string; name: string; present: boolean; wl: string;
  block: StatBlock;
  drills: { baylor: number | null; ninetys: number | null; transM: number | null; transA: number | null; ft: number | null };
}
export interface SquadReport {
  id: string; name: string; color: string; team: StatBlock; wins: number; wl: string;
  players: PlayerLine[];
  totals: StatBlock;
}
export interface BlockRow {
  name: string;
  color: string;
  block: StatBlock;
}
export interface ReportModel {
  date: string; startTime: string | null; finishTime: string | null; grade: number | null;
  attPresent: number; attTotal: number; attPct: number;
  squads: SquadReport[]; combined: StatBlock;
  liveTeam: BlockRow[]; // Live-play rich stat line per squad + combined
  drills: DrillLine[]; // Baylor / 90s / FT + transition 3s (for Trans summary)
  absent: { jersey: string; name: string }[];
}

// Format an ISO date ("2026-11-09") as "Wednesday, November 9, 2026".
// Passes through anything that isn't a plain ISO date (e.g. already formatted).
export function formatLongDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function drillLine(name: string, color: string, rows: DrillRow[], trans: { m: number; a: number }): DrillLine {
  const pick = (d: string) => rows.filter((r) => r.drill === d);
  const avg = (d: string) => {
    const rs = pick(d);
    return rs.length ? rs.reduce((s, r) => s + Number(r.makes), 0) / rs.length : 0;
  };
  const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
  return {
    name, color,
    baylor: { avg: avg("baylor"), pct: avg("baylor") / denom("baylor") },
    ninetys: { avg: avg("ninetys"), pct: avg("ninetys") / denom("ninetys") },
    transition: { m: trans.m, a: trans.a, pct: trans.a ? trans.m / trans.a : 0 },
    ft: { avg: avg("ft"), pct: avg("ft") / denom("ft") },
  };
}

// Transition 3s (made/attempts) from events for a set of rows.
function transOf(events: EventRow[]): { m: number; a: number } {
  const e = events.filter((x) => x.segment === "transition" && x.type === "fg3");
  return { m: e.filter((x) => x.made).length, a: e.length };
}

export function buildReport(bundle: PracticeBundle, events: EventRow[], drills: DrillRow[]): ReportModel {
  const perPlayer = tallyByPlayer(events);
  // Team totals follow where each stat was earned (the event's squad_id), so a
  // player who switches teams mid-practice splits correctly between both teams.
  // Individual player lines keep all of that player's own stats.
  const squadTallies = tallyBySquad(events);
  const liveSquadTallies = tallyBySquad(events.filter((e) => e.segment === "live"));
  const sqT = (sid: string) => squadTallies.get(sid) ?? emptyTally();
  const liveT = (sid: string) => liveSquadTallies.get(sid) ?? emptyTally();

  const squadIds = bundle.squads.map((s) => s.id);
  const squadDR: Record<string, number> = {};
  squadIds.forEach((sid) => (squadDR[sid] = sqT(sid).dr));

  const squads: SquadReport[] = bundle.squads.map((s, i) => {
    const oppDR = squadDR[squadIds[1 - i]] ?? 0;
    const wins = s.wins ?? 0;
    const losses = s.losses ?? 0;
    const wl = `${wins}-${losses}`;
    const t = sqT(s.id);
    const players: PlayerLine[] = bundle.roster
      .filter((r) => r.squad_id === s.id)
      .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999))
      .map((r) => {
        const pt = perPlayer.get(r.player_id) ?? emptyTally();
        const dr = drills.filter((d) => d.player_id === r.player_id);
        const g = (k: string) => dr.find((d) => d.drill === k);
        const pTrans = transOf(events.filter((e) => e.player_id === r.player_id));
        return {
          playerId: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—",
          present: r.present, wl,
          block: statBlock(pt, oppDR),
          drills: {
            baylor: g("baylor") ? Number(g("baylor")!.makes) : null,
            ninetys: g("ninetys") ? Number(g("ninetys")!.makes) : null,
            transM: pTrans.a ? pTrans.m : null,
            transA: pTrans.a ? pTrans.a : null,
            ft: g("ft") ? Number(g("ft")!.makes) : null,
          },
        };
      });
    return { id: s.id, name: s.name, color: s.color, team: statBlock(t, oppDR), wins, wl, players, totals: statBlock(t, oppDR) };
  });

  const combinedTally = squadIds.reduce((acc, sid) => addTally(acc, sqT(sid)), emptyTally());

  // Live-play rich stat line per squad + combined (from live-segment events only)
  const liveTeam: BlockRow[] = bundle.squads.map((s, i) => {
    const oppLiveDR = liveT(squadIds[1 - i] ?? "").dr;
    return { name: s.name, color: s.color, block: statBlock(liveT(s.id), oppLiveDR) };
  });
  liveTeam.push({
    name: "Combined",
    color: "#00142D",
    block: statBlock(squadIds.reduce((a, sid) => addTally(a, liveT(sid)), emptyTally())),
  });

  const drillLines: DrillLine[] = bundle.squads.map((s) =>
    drillLine(s.name, s.color, drills.filter((d) => d.squad_id === s.id), transOf(events.filter((e) => e.squad_id === s.id))),
  );
  drillLines.push(drillLine("Combined", "#00142D", drills, transOf(events)));

  // "Practicing" = assigned to a squad AND present. Players left in the
  // "not practicing" bucket (no squad) are not counted toward attendance.
  const isPracticing = (r: (typeof bundle.roster)[number]) => r.present && r.squad_id != null;
  const present = bundle.roster.filter(isPracticing).length;
  const total = bundle.roster.length;

  return {
    date: bundle.practice.practice_date,
    startTime: bundle.practice.start_time,
    finishTime: bundle.practice.finish_time,
    grade: bundle.practice.grade,
    attPresent: present, attTotal: total, attPct: total ? present / total : 0,
    squads, combined: statBlock(combinedTally),
    liveTeam, drills: drillLines,
    absent: bundle.roster.filter((r) => !isPracticing(r)).map((r) => ({ jersey: r.jersey ?? "", name: r.players?.name ?? "—" })),
  };
}

// ---------------------------------------------------------------------------
// Box-score export: flatten the report into one spreadsheet row per player,
// a TEAM TOTAL row per squad, and a COMBINED row — all raw numbers.
// ---------------------------------------------------------------------------
const round = (n: number, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
const pctInt = (n: number) => Math.round(n * 100);

function blockCols(b: StatBlock): Record<string, number> {
  return {
    PTS: b.pts, POSS: round(b.poss, 1), PPP: round(b.ppp, 2), PPS: round(b.pps, 2),
    "eFG%": pctInt(b.efg), "TS%": pctInt(b.ts),
    "ATR M": b.atr.m, "ATR A": b.atr.a, "ATR%": pctInt(b.atr.pct),
    "2FG M": b.nonatr2.m, "2FG A": b.nonatr2.a, "2FG%": pctInt(b.nonatr2.pct),
    "3FG M": b.fg3.m, "3FG A": b.fg3.a, "3FG%": pctInt(b.fg3.pct),
    "FT M": b.ft.m, "FT A": b.ft.a, "FT%": pctInt(b.ft.pct),
    AST: b.play.ast, PAST: b.play.pot, "2ndAST": b.play.second,
    TO: b.play.to, "A/TO": round(b.play.ato, 2),
    OREB: b.reb.or, DREB: b.reb.dr, REB: b.reb.tot, Tip: b.reb.tip,
    STL: b.def.stl, BLK: b.def.blk, DEF: b.def.def, LB: b.def.lb, Dive: b.def.dive, Charge: b.def.chg,
    FD: b.fd, CP: round(b.casper, 1), PER: round(b.per, 1),
  };
}

const BLANK_DRILLS = {
  "Baylor makes": "" as number | string, "Baylor %": "" as number | string,
  "90s makes": "" as number | string, "90s %": "" as number | string,
  "FT drill makes": "" as number | string, "FT drill %": "" as number | string,
  "Trans M": "" as number | string, "Trans A": "" as number | string, "Trans %": "" as number | string,
};

export function buildBoxScore(model: ReportModel): Record<string, unknown>[] {
  const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
  const rows: Record<string, unknown>[] = [];
  for (const sq of model.squads) {
    for (const p of sq.players) {
      const d = p.drills;
      rows.push({
        Date: model.date, Squad: sq.name, "Squad W-L": sq.wl,
        "#": p.jersey, Player: p.name, Present: p.present ? "yes" : "no",
        ...blockCols(p.block),
        "Baylor makes": d.baylor ?? "", "Baylor %": d.baylor == null ? "" : pctInt(d.baylor / denom("baylor")),
        "90s makes": d.ninetys ?? "", "90s %": d.ninetys == null ? "" : pctInt(d.ninetys / denom("ninetys")),
        "FT drill makes": d.ft ?? "", "FT drill %": d.ft == null ? "" : pctInt(d.ft / denom("ft")),
        "Trans M": d.transM ?? "", "Trans A": d.transA ?? "",
        "Trans %": d.transA ? pctInt((d.transM ?? 0) / d.transA) : "",
      });
    }
    rows.push({
      Date: model.date, Squad: sq.name, "Squad W-L": sq.wl,
      "#": "", Player: "TEAM TOTAL", Present: "", ...blockCols(sq.team), ...BLANK_DRILLS,
    });
  }
  rows.push({
    Date: model.date, Squad: "COMBINED", "Squad W-L": "",
    "#": "", Player: "ALL PLAYERS", Present: "", ...blockCols(model.combined), ...BLANK_DRILLS,
  });
  return rows;
}

// Season box score: one row per player with season raw totals + drill averages,
// plus a TEAM TOTAL row. Mirrors the per-practice box score at the season level.
export function buildSeasonBoxScore(season: SeasonResult): Record<string, unknown>[] {
  const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
  const seasonDrills = (avg: { baylorAvg: number; ninetyAvg: number; ftAvg: number } | null, trM: number | "", trA: number | "") => ({
    "Baylor avg": avg ? round(avg.baylorAvg, 1) : "", "Baylor %": avg ? pctInt(avg.baylorAvg / denom("baylor")) : "",
    "90s avg": avg ? round(avg.ninetyAvg, 1) : "", "90s %": avg ? pctInt(avg.ninetyAvg / denom("ninetys")) : "",
    "FT drill avg": avg ? round(avg.ftAvg, 1) : "", "FT drill %": avg ? pctInt(avg.ftAvg / denom("ft")) : "",
    "Trans M": trM, "Trans A": trA, "Trans %": typeof trA === "number" && trA ? pctInt((trM as number) / trA) : "",
  });

  const rows: Record<string, unknown>[] = [];
  for (const p of season.players) {
    const trM = p.history.reduce((s, h) => s + h.trans.m, 0);
    const trA = p.history.reduce((s, h) => s + h.trans.a, 0);
    rows.push({
      "#": p.jersey, Player: p.name, GP: p.gp, Record: `${p.record.w}-${p.record.l}`, POD: p.pod,
      ...blockCols(statBlock(p.tally)),
      ...seasonDrills(p.drills, trM, trA),
    });
  }
  const teamTally = season.players.reduce((acc, p) => addTally(acc, p.tally), emptyTally());
  rows.push({
    "#": "", Player: "TEAM TOTAL", GP: season.team.practices, Record: "", POD: "",
    ...blockCols(statBlock(teamTally)),
    ...seasonDrills(null, "", ""),
  });
  return rows;
}
