// ---------------------------------------------------------------------------
// Deciding a practice winner.
//
// A run (game) can tie (missed validation FT), so a practice can end tied on
// wins. The tiebreaker cascade guarantees exactly one winner per practice:
//   more wins → Transition 3FG% → Thespian 3FG% → Baylor % → FT-drill %
//   → coach's choice (only when all four are dead-even).
// Pooled team percentages are used (all makes ÷ all attempts), not averages.
// ---------------------------------------------------------------------------
import { SHOOTING_DRILLS } from "./config";

const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
const BAY_D = denom("baylor");
const FT_D = denom("ft");

export interface ShootPcts {
  trans: number;
  thes: number;
  baylor: number;
  ft: number;
}

type MiniEvent = { segment: string; type: string; made: boolean | null };
type MiniDrill = { drill: string; makes: number };

/** Pooled Transition/Thespian/Baylor/FT-drill percentages for ONE squad. */
export function teamShootPcts(sqEvents: MiniEvent[], sqDrills: MiniDrill[]): ShootPcts {
  const seg = (s: string) => {
    const e = sqEvents.filter((x) => x.segment === s && x.type === "fg3");
    const a = e.length;
    return a ? e.filter((x) => x.made).length / a : 0;
  };
  const drill = (k: string, d: number) => {
    const rs = sqDrills.filter((r) => r.drill === k);
    return rs.length ? rs.reduce((s, r) => s + Number(r.makes), 0) / (d * rs.length) : 0;
  };
  return { trans: seg("transition"), thes: seg("thespian"), baylor: drill("baylor", BAY_D), ft: drill("ft", FT_D) };
}

export type WinReason = "wins" | "trans" | "thes" | "baylor" | "ft" | "coach" | "none";

export interface Side {
  id: string;
  wins: number;
  pcts: ShootPcts;
}

const REASON_LABEL: Record<WinReason, string> = {
  wins: "Wins",
  trans: "Transition %",
  thes: "Thespian %",
  baylor: "Baylor %",
  ft: "FT-drill %",
  coach: "Coach's call",
  none: "Undecided",
};

/**
 * Decide a practice winner between two squads.
 * Returns the winning squad id (or null if dead-even and no coach override),
 * plus the reason it was decided.
 */
export function practiceWinner(a: Side, b: Side, overrideId?: string | null): { winnerId: string | null; reason: WinReason; reasonLabel: string } {
  const out = (winnerId: string | null, reason: WinReason) => ({ winnerId, reason, reasonLabel: REASON_LABEL[reason] });
  if (a.wins !== b.wins) return out(a.wins > b.wins ? a.id : b.id, "wins");
  const keys: (keyof ShootPcts)[] = ["trans", "thes", "baylor", "ft"];
  const reasonFor: Record<keyof ShootPcts, WinReason> = { trans: "trans", thes: "thes", baylor: "baylor", ft: "ft" };
  for (const k of keys) {
    if (a.pcts[k] !== b.pcts[k]) return out(a.pcts[k] > b.pcts[k] ? a.id : b.id, reasonFor[k]);
  }
  if (overrideId) return out(overrideId, "coach");
  return out(null, "none");
}
