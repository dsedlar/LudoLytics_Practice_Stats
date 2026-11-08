// ---------------------------------------------------------------------------
// Half-court geometry + shot-zone detection (NFHS / high-school dimensions).
// Coordinate system is in FEET, origin top-left of the half court:
//   x: 0..50 (sideline to sideline), y: 0..47 (baseline at top -> half-court)
//   basket hoop center near the top.
// ---------------------------------------------------------------------------

const BASKET_Y = 5.25;
const THREE_R = 19.75; // NFHS 3-point distance
const CORNER_X0 = 6; // straight corner-3 line, 6 ft from the sideline
const CORNER_INSET = 25 - CORNER_X0; // |x-25| >= this (x<=6 or x>=44) is a corner
// y where the straight corner meets the arc:
const CORNER_JOIN_Y = BASKET_Y + Math.sqrt(THREE_R * THREE_R - CORNER_INSET * CORNER_INSET);

export const COURT = {
  width: 50,
  height: 47, // baseline to mid-court
  basket: { x: 25, y: BASKET_Y },
  rimR: 0.75,
  backboardY: 4,
  backboardHalf: 3, // backboard is 6 ft wide
  lane: { x0: 19, x1: 31, ftLineY: 19 }, // 12-ft lane, FT line 15 ft from backboard
  ftCircleR: 6,
  threeR: THREE_R,
  cornerX0: CORNER_X0,
  cornerX1: 50 - CORNER_X0,
  cornerInset: CORNER_INSET,
  cornerJoinY: CORNER_JOIN_Y,
  atrR: 4, // restricted-area radius
  centerR: 6, // center circle at the half-court line
};

export type ShotZone = "atr" | "nonatr2" | "fg3";

export function zoneFor(x: number, y: number): ShotZone {
  const d = Math.hypot(x - COURT.basket.x, y - COURT.basket.y);
  if (d <= COURT.atrR) return "atr";
  const inCorner = y <= COURT.cornerJoinY && Math.abs(x - COURT.basket.x) >= COURT.cornerInset;
  if (inCorner || d >= COURT.threeR) return "fg3";
  return "nonatr2";
}

export const ZONE_LABEL: Record<ShotZone, string> = {
  atr: "At the Rim",
  nonatr2: "2FG",
  fg3: "3FG",
};

// ---- detailed shot zones (for per-player shot-zone chart) ------------------
export type PlayerZone =
  | "rim" | "paint" | "midLeft" | "midRight"
  | "cornerLeft" | "wingLeft" | "top" | "wingRight" | "cornerRight";

export const PLAYER_ZONES: PlayerZone[] = [
  "rim", "paint", "midLeft", "midRight",
  "cornerLeft", "wingLeft", "top", "wingRight", "cornerRight",
];

// Angle from the basket, in degrees: 0 = straight up the court (top of key),
// negative = left, positive = right, ±90 = toward a sideline at the baseline.
function angleFromBasket(x: number, y: number): number {
  const dx = x - COURT.basket.x;
  const dy = y - COURT.basket.y;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

// Benchmark FG% for each zone — what counts as "good" there (rim high, 3s low).
export const ZONE_BENCHMARK: Record<PlayerZone, number> = {
  rim: 0.58, paint: 0.42,
  midLeft: 0.38, midRight: 0.38,
  cornerLeft: 0.36, cornerRight: 0.36,
  wingLeft: 0.33, top: 0.33, wingRight: 0.33,
};

export function playerZoneFor(x: number, y: number): PlayerZone {
  const ring = zoneFor(x, y);
  const a = angleFromBasket(x, y);
  if (ring === "atr") return "rim";
  if (ring === "nonatr2") {
    if (a < -30) return "midLeft";
    if (a > 30) return "midRight";
    return "paint";
  }
  // 3-point ring
  if (a < -68) return "cornerLeft";
  if (a < -24) return "wingLeft";
  if (a <= 24) return "top";
  if (a <= 68) return "wingRight";
  return "cornerRight";
}

// Pick the brand color (garnet or navy) that contrasts most with the court color,
// so shot marks stand out: navy dots on a garnet court, garnet dots on a navy court.
const GARNET = "#B20000";
const NAVY = "#00142D";
function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) as [number, number, number];
}
function dist(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
export function markColorFor(courtColor: string): string {
  try {
    const c = hexToRgb(courtColor);
    return dist(c, hexToRgb(GARNET)) >= dist(c, hexToRgb(NAVY)) ? GARNET : NAVY;
  } catch {
    return NAVY;
  }
}
