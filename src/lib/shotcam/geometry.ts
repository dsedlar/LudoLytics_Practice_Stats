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

const RIM_HEIGHT_FT = 10;

// ---- camera model -----------------------------------------------------------
// A flat-floor mapping from four nearby taps is very touchy: a few pixels of
// tap error on the lane corners moves a shooter out at the arc by many feet.
// So instead of trusting the taps alone we fit an actual camera — focal length,
// tilt and position — to the four lane corners AND the rim, which we know is
// 10 ft straight above the basket spot. That extra, off-the-floor point pins
// the camera's tilt and distance far better than the floor points can.

type V3 = [number, number, number];
interface Camera { f: number; R: number[]; t: V3; } // R row-major, court (x, y, up) -> camera

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

function project(c: Camera, size: { w: number; h: number }, X: number, Y: number, Z: number): Pt | null {
  const R = c.R;
  const px = R[0] * X + R[1] * Y + R[2] * Z + c.t[0], py = R[3] * X + R[4] * Y + R[5] * Z + c.t[1], pz = R[6] * X + R[7] * Y + R[8] * Z + c.t[2];
  if (pz < 1e-6) return null;
  return { x: (c.f * px) / pz + size.w / 2, y: (c.f * py) / pz + size.h / 2 };
}

/** First guess at the camera from a floor mapping (court -> picture) and a focal length. */
function cameraFrom(toImg: Homography, size: { w: number; h: number }, f: number): Camera | null {
  const cx = size.w / 2, cy = size.h / 2;
  const col = (i: number): V3 => [(toImg[i] - cx * toImg[6 + i]) / f, (toImg[3 + i] - cy * toImg[6 + i]) / f, toImg[6 + i]];
  let r1 = col(0), r2 = col(1), t = col(2);
  const n1 = norm(r1), n2 = norm(r2);
  if (!n1 || !n2) return null;
  let k = 2 / (n1 + n2);
  if (t[2] * k < 0) k = -k; // the court is in front of the camera
  t = scale(t, k); r1 = scale(r1, k / Math.abs(k) / n1); r2 = scale(r2, k / Math.abs(k) / n2);
  // make r2 exactly perpendicular to r1
  const d = r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2];
  r2 = [r2[0] - d * r1[0], r2[1] - d * r1[1], r2[2] - d * r1[2]];
  const n = norm(r2);
  if (!n) return null;
  r2 = scale(r2, 1 / n);
  let up = cross(r1, r2);
  const cam: Camera = { f, R: [r1[0], r2[0], up[0], r1[1], r2[1], up[1], r1[2], r2[2], up[2]], t };
  // "up" must raise a point in the picture
  const B = COURT.basket, lo = project(cam, size, B.x, B.y, 0), hi = project(cam, size, B.x, B.y, RIM_HEIGHT_FT);
  if (lo && hi && hi.y > lo.y) { up = scale(up, -1); cam.R[2] = up[0]; cam.R[5] = up[1]; cam.R[8] = up[2]; }
  return cam;
}

/** Small rotation (rx, ry, rz) applied on top of R. */
function rotate(R: number[], w: V3): number[] {
  const th = norm(w);
  if (th < 1e-12) return R.slice();
  const [x, y, z] = scale(w, 1 / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  const D = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
  const out = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) out[i * 3 + j] += D[i * 3 + k] * R[k * 3 + j];
  return out;
}

const RIM_WEIGHT = 2;
const ARC_PX_PER_FT = 12; // how hard a 3-point-line tap pulls, relative to a pixel of error on a lane corner

/** Where a picture point lies on the floor (court feet), by casting its ray down to the floor. */
function toFloor(c: Camera, size: { w: number; h: number }, p: Pt): Pt | null {
  const R = c.R, k: V3 = [(p.x - size.w / 2) / c.f, (p.y - size.h / 2) / c.f, 1];
  // ray direction and camera position in court coordinates (R transpose)
  const d: V3 = [R[0] * k[0] + R[3] * k[1] + R[6] * k[2], R[1] * k[0] + R[4] * k[1] + R[7] * k[2], R[2] * k[0] + R[5] * k[1] + R[8] * k[2]];
  const C: V3 = [-(R[0] * c.t[0] + R[3] * c.t[1] + R[6] * c.t[2]), -(R[1] * c.t[0] + R[4] * c.t[1] + R[7] * c.t[2]), -(R[2] * c.t[0] + R[5] * c.t[1] + R[8] * c.t[2])];
  if (Math.abs(d[2]) < 1e-9) return null;
  const s = -C[2] / d[2];
  if (s <= 0) return null;
  return { x: C[0] + s * d[0], y: C[1] + s * d[1] };
}

/** Signed distance (feet) from a floor point to the painted 3-point line: + outside, - inside. */
function distToThreeLine(g: Pt): number {
  const B = COURT.basket;
  if (g.y < COURT.cornerJoinY) return Math.abs(g.x - B.x) - COURT.cornerInset; // the straight parts in the corners
  return Math.hypot(g.x - B.x, g.y - B.y) - COURT.threeR;
}

/** Fit the camera to the four lane corners (on the floor) and the rim (10 ft up). Returns the fit and its error in pixels. */
function fitCamera(start: Camera, img: Pt[], rim: Pt, size: { w: number; h: number }, arcTaps: Pt[] = []): { cam: Camera; err: number } {
  const B = COURT.basket;
  const world: [number, number, number, Pt, number][] = [
    ...LANE.map((p, i) => [p.x, p.y, 0, img[i], 1] as [number, number, number, Pt, number]),
    [B.x, B.y, RIM_HEIGHT_FT, rim, RIM_WEIGHT],
  ];
  const apply = (c: Camera, d: number[]): Camera => ({ f: c.f * Math.exp(d[0]), R: rotate(c.R, [d[1], d[2], d[3]]), t: [c.t[0] + d[4], c.t[1] + d[5], c.t[2] + d[6]] });
  const resid = (c: Camera): number[] | null => {
    const r: number[] = [];
    for (const [X, Y, Z, target, wgt] of world) { const p = project(c, size, X, Y, Z); if (!p) return null; r.push((p.x - target.x) * wgt, (p.y - target.y) * wgt); }
    // Taps along the 3-point line: wherever each lands on the floor, it should be ON the line.
    for (const a of arcTaps) {
      const g = toFloor(c, size, a);
      if (!g) return null;
      r.push(distToThreeLine(g) * ARC_PX_PER_FT);
    }
    return r;
  };
  const cost = (r: number[]) => r.reduce((s2, v) => s2 + v * v, 0);
  let cam = start, r = resid(cam);
  if (!r) return { cam, err: Infinity };
  let lambda = 1e-2;
  const steps = [1e-4, 1e-4, 1e-4, 1e-4, 1e-2, 1e-2, 1e-2];
  for (let iter = 0; iter < 60; iter++) {
    // numeric Jacobian
    const J: number[][] = [];
    for (let k = 0; k < 7; k++) {
      const d = new Array(7).fill(0); d[k] = steps[k];
      const rk = resid(apply(cam, d));
      if (!rk) return { cam, err: Math.sqrt(cost(r) / r.length) };
      J.push(rk.map((v, i) => (v - r![i]) / steps[k]));
    }
    // solve (JtJ + lambda*diag) d = -Jt r
    const A: number[][] = [], g: number[] = [];
    for (let a = 0; a < 7; a++) { A.push([]); g.push(-J[a].reduce((s2, v, i) => s2 + v * r![i], 0)); for (let b = 0; b < 7; b++) A[a].push(J[a].reduce((s2, v, i) => s2 + v * J[b][i], 0)); }
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const M = A.map((row, a) => [...row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)), g[a]]);
      let ok = true;
      for (let c = 0; c < 7 && ok; c++) {
        let piv = c;
        for (let q = c + 1; q < 7; q++) if (Math.abs(M[q][c]) > Math.abs(M[piv][c])) piv = q;
        if (Math.abs(M[piv][c]) < 1e-14) { ok = false; break; }
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let q = 0; q < 7; q++) { if (q === c) continue; const fct = M[q][c] / M[c][c]; for (let k = c; k < 8; k++) M[q][k] -= fct * M[c][k]; }
      }
      if (ok) {
        const next = apply(cam, M.map((row, i) => row[7] / row[i]));
        const rn = resid(next);
        if (rn && cost(rn) < cost(r)) { const gain = cost(r) - cost(rn); cam = next; r = rn; lambda = Math.max(1e-7, lambda / 3); improved = true; if (gain < 1e-9) return { cam, err: Math.sqrt(cost(r) / r.length) }; continue; }
      }
      lambda *= 4;
    }
    if (!improved) break;
  }
  return { cam, err: Math.sqrt(cost(r) / r.length) };
}

/** The floor mapping (court feet -> picture pixels) of a camera. */
function floorMapping(c: Camera, size: { w: number; h: number }): Homography {
  const cx = size.w / 2, cy = size.h / 2, R = c.R, t = c.t;
  const h = [
    c.f * R[0] + cx * R[6], c.f * R[1] + cx * R[7], c.f * t[0] + cx * t[2],
    c.f * R[3] + cy * R[6], c.f * R[4] + cy * R[7], c.f * t[1] + cy * t[2],
    R[6], R[7], t[2],
  ];
  return h.map((v) => v / h[8]);
}

export interface CourtFit { toCourt: Homography; toImg: Homography; /** where the fit puts the four lane corners in the picture */ corners: Pt[]; }

/**
 * Build the picture<->court mapping from four taps on the corners of the lane,
 * in ANY order, the rim the player already marked, and (strongly recommended)
 * a few taps anywhere along the painted 3-point line. The lane taps alone
 * can't say which side of the lane is the baseline, so we try all four ways
 * round (and a range of lens focal lengths as starting points), fit a camera
 * each time, and keep the one that explains everything best. The lane is a
 * small patch of floor far from the camera, so on its own it leaves the outer
 * court loose; the 3-point-line taps span the whole court and tie it down.
 */
export function calibrateCourt(taps: Pt[], rim: { x: number; y: number; width: number }, size: { w: number; h: number }, arcTaps: Pt[] = []): CourtFit | null {
  if (taps.length !== 4) return null;
  const c = { x: (taps[0].x + taps[1].x + taps[2].x + taps[3].x) / 4, y: (taps[0].y + taps[1].y + taps[2].y + taps[3].y) / 4 };
  const cw = taps.slice().sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x)); // clockwise on screen (y down)
  const dim = Math.max(size.w, size.h);
  let best: Camera | null = null, bestErr = Infinity;
  for (let r = 0; r < 4; r++) {
    const img = [0, 1, 2, 3].map((k) => cw[(k + r) % 4]);
    const toCourt = solveHomography(img, LANE);
    const toImg = toCourt && invertH(toCourt);
    if (!toImg) continue;
    for (const fr of [0.55, 0.8, 1.1, 1.6, 2.3]) { // phone lenses, in picture widths
      const start = cameraFrom(toImg, size, fr * dim);
      if (!start) continue;
      const { cam, err } = fitCamera(start, img, rim, size, arcTaps);
      if (cam.f < 0.35 * dim || cam.f > 4 * dim) continue; // not a believable lens
      if (err < bestErr) { bestErr = err; best = cam; }
    }
  }
  if (!best) return null;
  const toImg = floorMapping(best, size), toCourt = invertH(toImg);
  if (!toCourt) return null;
  return { toCourt, toImg, corners: LANE.map((p) => applyH(toImg, p)) };
}
