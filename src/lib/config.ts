// ---------------------------------------------------------------------------
// Ludolytics configuration
// ---------------------------------------------------------------------------
// These are the DEFAULT values. They are also stored in the database `settings`
// table so coaches can edit them from the Admin screen without changing code.
// Everything the app computes (percentages, advanced metrics, Casper totals,
// heat-map colors) is derived from raw events + these constants.
// ---------------------------------------------------------------------------

// ---- Casper Points (effort plays, in honor of Coach Mitch Casper) ----------
// Source: VES_MBB_Casper_Points. Positives only, no deductions. #BeLikeMitch
export const CASPER_VALUES: Record<string, number> = {
  or: 1.5, // Offensive Rebound
  dr: 1, // Defensive Rebound
  tip: 0.5, // Tip
  lb: 1, // Loose Ball
  dive: 2, // Dive
  chg: 4, // Charge Taken
  stl: 1, // Steal
  blk: 1, // Block
  def: 1, // Deflection
  gs: 1, // Good Screen
  ta: 1, // Throw Ahead Pass
  misc: 1, // Coach's Call / Miscellaneous
};

// ---- Shooting drills -------------------------------------------------------
// Three drills score makes against a fixed denominator; Transition is makes/attempts.
export type DrillKey = "baylor" | "ninetys" | "transition" | "ft";

export interface DrillDef {
  key: DrillKey;
  label: string;
  short: string;
  // "fixed": % = makes / denominator  |  "ratio": % = makes / attempts
  mode: "fixed" | "ratio";
  denominator?: number;
}

export const SHOOTING_DRILLS: DrillDef[] = [
  { key: "baylor", label: "Baylor (3PT)", short: "BAY", mode: "fixed", denominator: 75 },
  { key: "ninetys", label: "90 Seconds", short: "90s", mode: "fixed", denominator: 20 },
  { key: "transition", label: "Transition", short: "3on0", mode: "ratio" },
  { key: "ft", label: "Free Throws", short: "FT", mode: "fixed", denominator: 20 },
];

// ---- Practice grade scale (1-5) -------------------------------------------
export const GRADE_SCALE: Record<number, { label: string; blurb: string }> = {
  5: { label: "Elite", blurb: "Championship Standard" },
  4: { label: "Strong", blurb: "Winning Effort" },
  3: { label: "Average", blurb: "Up and Down" },
  2: { label: "Below Standard", blurb: "Missed Opportunity" },
  1: { label: "Unacceptable", blurb: "Reset Required" },
};

// ---- Stat event taxonomy ---------------------------------------------------
// Live Play + Transition segments are logged as append-only events (one row per
// occurrence), which makes real-time sync and one-tap undo trivial.
export type Segment = "live" | "transition";

// Shot events carry a `made` boolean; counting events do not.
export const SHOT_TYPES = ["atr", "nonatr2", "fg3", "ft"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const SHOT_LABELS: Record<ShotType, string> = {
  atr: "At the Rim",
  nonatr2: "Non-ATR 2FG",
  fg3: "3FG",
  ft: "Free Throw",
};

export const SHOT_POINTS: Record<ShotType, number> = {
  atr: 2,
  nonatr2: 2,
  fg3: 3,
  ft: 1,
};

// Counting stats (value 1 each). `casperOnly` ones never appear in the box score,
// only in the Casper column.
export const COUNTING_TYPES = [
  "pot", // potential assist
  "second", // 2nd assist
  "ast", // assist
  "to", // turnover
  "tip",
  "or",
  "dr",
  "stl",
  "blk",
  "def", // deflection
  "lb",
  "dive",
  "chg",
  "fd", // foul drawn
  "gs", // good screen (casper only)
  "ta", // throw ahead (casper only)
  "misc", // casper only
] as const;
export type CountingType = (typeof COUNTING_TYPES)[number];

export const COUNTING_LABELS: Record<CountingType, string> = {
  pot: "Potential Assist",
  second: "2nd Assist",
  ast: "Assist",
  to: "Turnover",
  tip: "Tip",
  or: "Off. Rebound",
  dr: "Def. Rebound",
  stl: "Steal",
  blk: "Block",
  def: "Deflection",
  lb: "Loose Ball",
  dive: "Dive",
  chg: "Charge",
  fd: "Foul Drawn",
  gs: "Good Screen",
  ta: "Throw Ahead",
  misc: "Misc (Coach's Call)",
};

export type StatType = ShotType | CountingType;

// Default squad names/colors (overridden per-practice; teams change often).
export const DEFAULT_SQUADS = [
  { name: "Garnet", color: "#7a0019" },
  { name: "White", color: "#444444" },
];
