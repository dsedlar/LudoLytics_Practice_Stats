// Synthetic practice data for previewing/verifying the report layout without
// a database. Deterministic (seeded) so screenshots are stable.
import type { PracticeBundle, DrillRow } from "./db";
import type { EventRow } from "./aggregate";
import type { SeasonInput } from "./seasonData";

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
    { id: "sA", practice_id: "demo", name: "Garnet", color: "#B20000", sort_order: 0, wins: 4, losses: 6 },
    { id: "sB", practice_id: "demo", name: "White", color: "#00142D", sort_order: 1, wins: 6, losses: 4 },
  ];
  const roster = [
    ...NAMES_A.map((n, i) => ({ id: "rA" + i, squad_id: "sA", player_id: "pA" + i, jersey: JERS_A[i], present: true, players: { name: n } })),
    ...NAMES_B.map((n, i) => ({ id: "rB" + i, squad_id: "sB", player_id: "pB" + i, jersey: JERS_B[i], present: i < 5, players: { name: n } })),
  ];
  const bundle: PracticeBundle = {
    practice: { id: "demo", practice_date: "Friday, October 9, 2026", start_time: "7:00 PM", finish_time: "9:00 PM", grade: 4, status: "finished", player_of_day: "pA2" },
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
    for (let k = 0; k < 2 + ri(4); k++) push(sq, pid, "live", "atr", rnd() < 0.6);
    for (let k = 0; k < 2 + ri(5); k++) push(sq, pid, "live", "nonatr2", rnd() < 0.42);
    for (let k = 0; k < 2 + ri(6); k++) push(sq, pid, "live", "fg3", rnd() < 0.34);
    // transition + thespian: 3s and the occasional turnover
    for (let k = 0; k < 3 + ri(5); k++) push(sq, pid, "transition", "fg3", rnd() < 0.33);
    for (let k = 0; k < ri(2); k++) push(sq, pid, "transition", "to", null);
    for (let k = 0; k < 3 + ri(5); k++) push(sq, pid, "thespian", "fg3", rnd() < 0.36);
    for (let k = 0; k < ri(2); k++) push(sq, pid, "thespian", "to", null);
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
    drills.push({ id: "d" + did++, squad_id: r.squad_id, player_id: r.player_id, drill: "ft", makes: 13 + ri(6), attempts: null });
  }

  return { bundle, events, drills };
}

// ---------------------------------------------------------------------------
// Synthetic multi-practice season for previewing the dashboard.
// ---------------------------------------------------------------------------
export function makeSeasonDemo(): SeasonInput {
  const rnd = lcg(7);
  const ri = (n: number) => Math.floor(rnd() * n);
  const names = [...NAMES_A, ...NAMES_B];
  const jers = [...JERS_A, ...JERS_B];
  const players = names.map((n, i) => ({ id: "p" + i, name: n, jersey: jers[i] }));
  const dates = ["2025-11-04", "2025-11-06", "2025-11-08", "2025-11-11", "2025-11-13", "2025-11-14"];
  const gradeSeq = [4, 3, 2, 4, 3, 4];
  const practices = dates.map((d, i) => ({ id: "pr" + i, practice_date: d, player_of_day: players[(i * 2) % players.length].id, grade: gradeSeq[i] }));

  const roster: SeasonInput["roster"] = [];
  const squads: SeasonInput["squads"] = [];
  const events: EventRow[] = [];
  const drills: SeasonInput["drills"] = [];
  let id = 1;

  practices.forEach((pr, pIdx) => {
    // 9 scrimmages per day so there's always a winner (no ties)
    const aWins = 3 + ri(4); // 3..6
    squads.push({ id: `${pr.id}-A`, practice_id: pr.id, name: "Garnet", color: "#B20000", wins: aWins, losses: 9 - aWins });
    squads.push({ id: `${pr.id}-B`, practice_id: pr.id, name: "Grey", color: "#6B7280", wins: 9 - aWins, losses: aWins });
    players.forEach((pl, i) => {
      const squadId = i < 6 ? `${pr.id}-A` : `${pr.id}-B`;
      const present = !(pIdx === 2 && i === 11); // one absence for realism
      roster.push({ practice_id: pr.id, player_id: pl.id, squad_id: squadId, present, name: pl.name, jersey: pl.jersey });
      if (!present) return;
      const growth = pIdx * 0.015; // slight improvement over the season
      const push = (type: string, made: boolean | null, segment = "live", shot_x: number | null = null, shot_y: number | null = null) =>
        events.push({ id: id++, practice_id: pr.id, squad_id: squadId, player_id: pl.id, segment, type, made, shot_x, shot_y });
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const atrXY = (): [number, number] => [25 + (rnd() - 0.5) * 8, 3 + rnd() * 5];
      const midXY = (): [number, number] => [clamp(25 + (rnd() - 0.5) * 26, 2, 48), 8 + rnd() * 10];
      const threeXY = (): [number, number] => {
        const ang = (rnd() - 0.5) * 2 * (80 * Math.PI / 180);
        const R = 20 + rnd() * 3;
        return [clamp(25 + R * Math.sin(ang), 1, 49), clamp(5.25 + R * Math.cos(ang), 1, 44)];
      };
      for (let k = 0; k < 2 + ri(3); k++) { const [x, y] = atrXY(); push("atr", rnd() < 0.58 + growth, "live", x, y); }
      for (let k = 0; k < 2 + ri(4); k++) { const [x, y] = midXY(); push("nonatr2", rnd() < 0.4 + growth, "live", x, y); }
      for (let k = 0; k < 2 + ri(5); k++) { const [x, y] = threeXY(); push("fg3", rnd() < 0.32 + growth, "live", x, y); }
      for (let k = 0; k < ri(4); k++) push("ft", rnd() < 0.72);
      for (const t of ["ast", "to", "or", "dr", "stl", "def", "chg", "dive"]) for (let k = 0; k < ri(3); k++) push(t, null);
      // transition + thespian shooting segments (events, not drills), each with
      // the occasional turnover that counts toward TO totals (not efficiency)
      for (let k = 0; k < 3 + ri(4); k++) push("fg3", rnd() < 0.3 + growth, "transition");
      for (let k = 0; k < ri(2); k++) push("to", null, "transition");
      for (let k = 0; k < 3 + ri(4); k++) push("fg3", rnd() < 0.33 + growth, "thespian");
      for (let k = 0; k < ri(2); k++) push("to", null, "thespian");
      drills.push({ practice_id: pr.id, player_id: pl.id, drill: "baylor", makes: 38 + pIdx + ri(18), attempts: null });
      drills.push({ practice_id: pr.id, player_id: pl.id, drill: "ninetys", makes: 10 + ri(7), attempts: null });
      drills.push({ practice_id: pr.id, player_id: pl.id, drill: "ft", makes: 13 + ri(6), attempts: null });
    });
  });

  return { practices, roster, squads, events, drills };
}
