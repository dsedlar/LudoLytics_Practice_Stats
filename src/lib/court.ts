// ---------------------------------------------------------------------------
// Half-court geometry + shot-zone detection (NFHS / high-school dimensions).
// Coordinate system is in FEET, origin top-left of the half court:
//   x: 0..50 (sideline to sideline), y: 0..47 (baseline at top -> half-court)
//   basket hoop center near the top.
// ---------------------------------------------------------------------------

export const COURT = {
  width: 50,
  height: 33, // baseline to just past the top of the 3-point arc (shooting area)
  basket: { x: 25, y: 5.25 },
  rimR: 0.75,
  backboardY: 4,
  lane: { x0: 19, x1: 31, ftLineY: 19 }, // 12-ft lane, FT line 15 ft from backboard
  ftCircleR: 6,
  threeR: 19.75, // NFHS 3-point distance
  atrR: 4, // "at the rim" radius
};

export type ShotZone = "atr" | "nonatr2" | "fg3";

export function zoneFor(x: number, y: number): ShotZone {
  const dx = x - COURT.basket.x;
  const dy = y - COURT.basket.y;
  const d = Math.hypot(dx, dy);
  if (d <= COURT.atrR) return "atr";
  if (d >= COURT.threeR) return "fg3";
  return "nonatr2";
}

export const ZONE_LABEL: Record<ShotZone, string> = {
  atr: "At the Rim",
  nonatr2: "2FG",
  fg3: "3FG",
};
