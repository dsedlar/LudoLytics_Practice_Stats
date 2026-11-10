// ---------------------------------------------------------------------------
// Stat computations — pure functions, no side effects.
// Formulas are taken verbatim from the footer of the sample Practice Report so
// the app's output matches the sample exactly.
// ---------------------------------------------------------------------------
import { CASPER_VALUES, SHOT_POINTS } from "./config";

export interface RawTally {
  // shot makes / attempts, by zone
  atrM: number; atrA: number;
  nonatr2M: number; nonatr2A: number;
  fg3M: number; fg3A: number;
  ftM: number; ftA: number;
  // counting
  pot: number; second: number; ast: number; to: number;
  tip: number; or: number; dr: number;
  stl: number; blk: number; def: number; foul: number; dive: number; chg: number;
  fd: number; gs: number; ta: number; misc: number;
}

export function emptyTally(): RawTally {
  return {
    atrM: 0, atrA: 0, nonatr2M: 0, nonatr2A: 0, fg3M: 0, fg3A: 0, ftM: 0, ftA: 0,
    pot: 0, second: 0, ast: 0, to: 0,
    tip: 0, or: 0, dr: 0,
    stl: 0, blk: 0, def: 0, foul: 0, dive: 0, chg: 0,
    fd: 0, gs: 0, ta: 0, misc: 0,
  };
}

export function addTally(a: RawTally, b: RawTally): RawTally {
  const out = emptyTally();
  (Object.keys(out) as (keyof RawTally)[]).forEach((k) => {
    out[k] = a[k] + b[k];
  });
  return out;
}

export interface Computed {
  pts: number;
  fgm: number; fga: number; fgPct: number;
  poss: number;
  ppp: number; // points per possession
  pps: number; // points per FGA (FT included)
  efg: number; // effective FG%
  ts: number; // true shooting %
  ato: number; // assist-to-turnover
  per: number;
  casper: number;
}

// POSS (estimated) = FGA + TO + 0.44 * FTA
// PPP = points per possession
// PPS = points per FGA (free throws included)
// eFG% = (FGM + 0.5*3PM) / FGA
// TS% = PTS / 2 / (FGA + 0.44*FTA)
// A/TO = Ast / TO (turnovers count as at least 1)
// PER = PTS + 4*FGM - 0.7*FGA - 0.4*(missed FT) + 0.7*OR + 0.3*DR + Ast + 0.7*STL + 0.7*BLK - TO
export function compute(t: RawTally, casperValues: Record<string, number> = CASPER_VALUES): Computed {
  const fgm = t.atrM + t.nonatr2M + t.fg3M;
  const fga = t.atrA + t.nonatr2A + t.fg3A;
  const pts =
    SHOT_POINTS.atr * t.atrM +
    SHOT_POINTS.nonatr2 * t.nonatr2M +
    SHOT_POINTS.fg3 * t.fg3M +
    SHOT_POINTS.ft * t.ftM;
  const poss = fga + t.to + 0.44 * t.ftA;
  const missedFt = Math.max(0, t.ftA - t.ftM);

  const casper =
    casperValues.or * t.or +
    casperValues.dr * t.dr +
    casperValues.tip * t.tip +
    casperValues.dive * t.dive +
    casperValues.chg * t.chg +
    casperValues.stl * t.stl +
    casperValues.blk * t.blk +
    casperValues.def * t.def +
    casperValues.gs * t.gs +
    casperValues.ta * t.ta +
    casperValues.misc * t.misc;

  return {
    pts,
    fgm,
    fga,
    fgPct: fga > 0 ? fgm / fga : 0,
    poss,
    ppp: poss > 0 ? pts / poss : 0,
    pps: fga > 0 ? pts / fga : 0,
    efg: fga > 0 ? (fgm + 0.5 * t.fg3M) / fga : 0,
    ts: fga + 0.44 * t.ftA > 0 ? pts / 2 / (fga + 0.44 * t.ftA) : 0,
    ato: t.ast / Math.max(1, t.to),
    per:
      pts +
      4 * fgm -
      0.7 * fga -
      0.4 * missedFt +
      0.7 * t.or +
      0.3 * t.dr +
      t.ast +
      0.7 * t.stl +
      0.7 * t.blk -
      t.to,
    casper,
  };
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
