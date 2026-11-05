// ---------------------------------------------------------------------------
// Build every number the one-page practice report needs, from raw data.
// ---------------------------------------------------------------------------
import { compute, emptyTally, addTally, type RawTally } from "./stats";
import { tallyByPlayer, type EventRow } from "./aggregate";
import { SHOOTING_DRILLS } from "./config";
import type { PracticeBundle, DrillRow } from "./db";

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
  date: string; finishTime: string | null; grade: number | null;
  attPresent: number; attTotal: number; attPct: number;
  squads: SquadReport[]; combined: StatBlock;
  liveTeam: BlockRow[]; // Live-play rich stat line per squad + combined
  drills: DrillLine[]; // Baylor / 90s / FT + transition 3s (for Trans summary)
  absent: { jersey: string; name: string }[];
}

function squadTally(bundle: PracticeBundle, squadId: string, perPlayer: Map<string, RawTally>): RawTally {
  let t = emptyTally();
  bundle.roster.filter((r) => r.squad_id === squadId).forEach((r) => {
    const pt = perPlayer.get(r.player_id);
    if (pt) t = addTally(t, pt);
  });
  return t;
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
  const perPlayerSeg = (seg: string) => tallyByPlayer(events.filter((e) => e.segment === seg));

  const squadIds = bundle.squads.map((s) => s.id);
  const squadDR: Record<string, number> = {};
  squadIds.forEach((sid) => (squadDR[sid] = squadTally(bundle, sid, perPlayer).dr));

  const squads: SquadReport[] = bundle.squads.map((s, i) => {
    const oppDR = squadDR[squadIds[1 - i]] ?? 0;
    const wins = s.wins ?? 0;
    const losses = s.losses ?? 0;
    const wl = `${wins}-${losses}`;
    const t = squadTally(bundle, s.id, perPlayer);
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

  const combinedTally = squadIds.reduce((acc, sid) => addTally(acc, squadTally(bundle, sid, perPlayer)), emptyTally());

  // Live-play rich stat line per squad + combined (from live-segment events only)
  const liveByPlayer = perPlayerSeg("live");
  const segTotal = (byPlayer: Map<string, RawTally>, squadId: string) => {
    let t = emptyTally();
    bundle.roster.filter((r) => r.squad_id === squadId).forEach((r) => {
      const pt = byPlayer.get(r.player_id);
      if (pt) t = addTally(t, pt);
    });
    return t;
  };
  const liveTeam: BlockRow[] = bundle.squads.map((s, i) => {
    const oppLiveDR = segTotal(liveByPlayer, squadIds[1 - i] ?? "").dr;
    return { name: s.name, color: s.color, block: statBlock(segTotal(liveByPlayer, s.id), oppLiveDR) };
  });
  liveTeam.push({
    name: "Combined",
    color: "#00142D",
    block: statBlock(squadIds.reduce((a, sid) => addTally(a, segTotal(liveByPlayer, sid)), emptyTally())),
  });

  const drillLines: DrillLine[] = bundle.squads.map((s) =>
    drillLine(s.name, s.color, drills.filter((d) => d.squad_id === s.id), transOf(events.filter((e) => e.squad_id === s.id))),
  );
  drillLines.push(drillLine("Combined", "#00142D", drills, transOf(events)));

  const present = bundle.roster.filter((r) => r.present).length;
  const total = bundle.roster.length;

  return {
    date: bundle.practice.practice_date,
    finishTime: bundle.practice.finish_time,
    grade: bundle.practice.grade,
    attPresent: present, attTotal: total, attPct: total ? present / total : 0,
    squads, combined: statBlock(combinedTally),
    liveTeam, drills: drillLines,
    absent: bundle.roster.filter((r) => !r.present).map((r) => ({ jersey: r.jersey ?? "", name: r.players?.name ?? "—" })),
  };
}
