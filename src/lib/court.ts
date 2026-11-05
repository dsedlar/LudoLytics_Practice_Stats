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
