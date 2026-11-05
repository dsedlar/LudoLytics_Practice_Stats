import { tallyByPlayer, type EventRow } from "../src/lib/aggregate";
import { compute } from "../src/lib/stats";

// Player line: 2/2 ATR, 0/0 non-ATR, 1/3 3FG, 2/2 FT, 3 ast, 1 TO, 2 OR, 1 DR, 1 STL, 1 CHG
const mk = (type: string, made: boolean | null = null): EventRow =>
  ({ id: 0, practice_id: "p", squad_id: "s", player_id: "x", segment: "live", type, made });
const events: EventRow[] = [
  mk("atr", true), mk("atr", true),
  mk("fg3", true), mk("fg3", false), mk("fg3", false),
  mk("ft", true), mk("ft", true),
  mk("ast"), mk("ast"), mk("ast"),
  mk("to"),
  mk("or"), mk("or"),
  mk("dr"),
  mk("stl"),
  mk("chg"),
];
const t = tallyByPlayer(events).get("x")!;
const c = compute(t);
const r = (n: number) => Math.round(n * 1000) / 1000;
const expect = { pts: 9, fgm: 3, fga: 5, efg: 0.7, ts: 0.765, ato: 3, per: 21.9, casper: 9, pps: 1.8 };
const got = { pts: c.pts, fgm: c.fgm, fga: c.fga, efg: r(c.efg), ts: r(c.ts), ato: r(c.ato), per: r(c.per), casper: c.casper, pps: r(c.pps) };
console.log("expected:", expect);
console.log("got:     ", got);
let ok = true;
for (const k of Object.keys(expect) as (keyof typeof expect)[]) {
  if (Math.abs(expect[k] - got[k]) > 0.01) { ok = false; console.log(`MISMATCH ${k}: ${expect[k]} vs ${got[k]}`); }
}
console.log(ok ? "\nALL CHECKS PASS ✓" : "\nFAILED ✗");
