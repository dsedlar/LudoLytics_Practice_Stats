// Picture <-> court mapping for Shot Cam.
// The player taps four painted landmarks (the corners of the lane); from those
// we solve the homography between video pixels and court feet, so a shooter's
// feet in the picture can be placed on the court diagram.
import { COURT } from "../court";

export interface Pt { x: number; y: number; }
export type Homography = number[]; // 3x3, row-major

/** The lane's four corners on the court (feet), clockwise as drawn with the baseline at the top. */
const LANE: Pt[] = [
  { x: COURT.lane.x0, y: 0 }, { x: COURT.lane.x1, y: 0 },
  { x: COURT.lane.x1, y: COURT.lane.ftLineY }, { x: COURT.lane.x0, y: COURT.lane.ftLineY },
];

/** Solve the homography taking each src[i] to dst[i] (exactly four pairs). Null if degenerate. */
export function solveHomography(src: Pt[], dst: Pt[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gauss-Jordan on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-10) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

export function applyH(h: Homography, p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

export function invertH(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/** Points along the painted lines (court feet), for drawing the court over the video as a check. */
export function courtOutline(): Pt[][] {
  const B = COURT.basket, lines: Pt[][] = [];
  const arc: Pt[] = [{ x: COURT.cornerX0, y: 0 }];
  const a0 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x), a1 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x);
  for (let k = 0; k <= 48; k++) { const a = a0 + ((a1 - a0) * k) / 48; arc.push({ x: B.x + COURT.threeR * Math.cos(a), y: B.y + COURT.threeR * Math.sin(a) }); }
  arc.push({ x: COURT.cornerX1, y: 0 });
  lines.push(arc);
  const L = COURT.lane;
  lines.push([{ x: L.x0, y: 0 }, { x: L.x0, y: L.ftLineY }, { x: L.x1, y: L.ftLineY }, { x: L.x1, y: 0 }]);
  lines.push([{ x: 0, y: 0 }, { x: COURT.width, y: 0 }]);
  return lines;
}

/**
 * Build the picture->court mapping from four taps on the corners of the lane,
 * in ANY order. We sort the taps clockwise, then pick whichever of the four
 * possible labelings puts the spot on the floor under the basket directly
 * below the rim in the picture — the rim's position tells us which end of the
 * lane is the baseline.
 */
export function calibrateFromLane(taps: Pt[], rim: Pt): Homography | null {
  if (taps.length !== 4) return null;
  const c = { x: (taps[0].x + taps[1].x + taps[2].x + taps[3].x) / 4, y: (taps[0].y + taps[1].y + taps[2].y + taps[3].y) / 4 };
  const cw = taps.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)); // clockwise on screen (y down)
  let best: Homography | null = null, bestErr = Infinity;
  for (let r = 0; r < 4; r++) {
    const img = [0, 1, 2, 3].map((k) => cw[(k + r) % 4]);
    const toCourt = solveHomography(img, LANE);
    const toImg = toCourt && invertH(toCourt);
    if (!toCourt || !toImg) continue;
    const under = applyH(toImg, COURT.basket); // floor point under the hoop, in the picture
    if (under.y <= rim.y) continue; // the floor must be below the rim
    const err = Math.abs(under.x - rim.x) / Math.max(1, under.y - rim.y);
    if (err < bestErr) { bestErr = err; best = toCourt; }
  }
  return best;
}
