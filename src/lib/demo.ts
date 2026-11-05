// Synthetic practice data for previewing/verifying the report layout without
// a database. Deterministic (seeded) so screenshots are stable.
import type { PracticeBundle, DrillRow } from "./db";
import type { EventRow } from "./aggregate";

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const NAMES_A = ["Patrick Steptoe Jr.", "Malik Jordan", "Sam Dewey", "Jack Powers", "Andrey Sharkov", "Tommy Herzel"];
const NAMES_B = ["Thorpe Fussell", "Khairi Douglin", "Zion Martin", "Austin Lian", "Preston Avery", "Kam Waller"];
const JERS_A = ["1", "3", "5", "11", "13", "15"];
const JERS_B = ["2", "4", "10", "12", "14", "0"];

export function makeDemoData(): { bundle: PracticeBundle; events: EventRow[]; drills: DrillRow[] } {
  const rnd = lcg(42);
  const ri = (n: number) => Math.floor(rnd() * n);
  const squads = [
    { id: "sA", practice_id: "demo", name: "Garnet", color: "#7a0019", sort_order: 0, wins: 4 },
    { id: "sB", practice_id: "demo", name: "White", color: "#444444", sort_order: 1, wins: 6 },
  ];
  const roster = [
    ...NAMES_A.map((n, i) => ({ id: "rA" + i, squad_id: "sA", player_id: "pA" + i, jersey: JERS_A[i], present: true, players: { name: n } })),
    ...NAMES_B.map((n, i) => ({ id: "rB" + i, squad_id: "sB", player_id: "pB" + i, jersey: JERS_B[i], present: i < 5, players: { name: n } })),
  ];
  const bundle: PracticeBundle = {
    practice: { id: "demo", practice_date: "Friday, October 9, 2026", start_time: "7:00 PM", finish_time: "9:00 PM", grade: 4, status: "finished" },
    squads,
    roster,
  };

  const events: EventRow[] = [];
  let id = 1;
  const push = (squad: string, player: string, segment: string, type: string, made: boolean | null) =>
    events.push({ id: id++, practice_id: "demo", squad_id: squad, player_id: player, segment, type, made });

  for (const r of roster) {
    if (!r.present) continue;
    const sq = r.squad_id;
    const pid = r.player_id;
    for (const seg of ["live", "transition"]) {
      for (let k = 0; k < 2 + ri(4); k++) push(sq, pid, seg, "atr", rnd() < 0.6);
      for (let k = 0; k < 2 + ri(5); k++) push(sq, pid, seg, "nonatr2", rnd() < 0.42);
      for (let k = 0; k < 2 + ri(6); k++) push(sq, pid, seg, "fg3", rnd() < 0.34);
    }
    for (let k = 0; k < ri(5); k++) push(sq, pid, "live", "ft", rnd() < 0.75);
    for (const t of ["pot", "second", "ast", "to", "tip", "or", "dr", "stl", "blk", "def", "lb", "dive", "chg", "fd", "gs", "ta", "misc"]) {
      for (let k = 0; k < ri(4); k++) push(sq, pid, "live", t, null);
    }
  }

  const drills: DrillRow[] = [];
  let did = 1;
  for (const r of roster) {
    if (!r.present) continue;
    drills.push({ id: "d" + did++, squad_id: r.squad_id, player_id: r.player_id, drill: "baylor", makes: 35 + ri(25), attempts: null });
    drills.push({ id: "d" + did++, squad_id: r.squad_id, player_id: r.player_id, drill: "ninetys", makes: 9 + ri(8), attempts: null });
    drills.push({ id: "d" + did++, squad_id: r.squad_id, player_id: r.player_id, drill: "transition", makes: 2 + ri(5), attempts: 4 + ri(4) });
    drills.push({ id: "d" + did++, squad_id: r.squad_id, player_id: r.player_id, drill: "ft", makes: 13 + ri(6), attempts: null });
  }

  return { bundle, events, drills };
}
