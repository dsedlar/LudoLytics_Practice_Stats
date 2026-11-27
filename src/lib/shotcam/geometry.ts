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

/**
 * What we know about the camera before looking at any taps: it is a phone,
 * on a tripod or propped up, held about level, somewhere between knee and
 * head height. Finger taps on a small screen are rough, and without these
 * the fit happily explains rough taps with an absurd camera (tilted on its
 * side, a mile away, or under the floor). Returned as extra error terms, in
 * the same pixel-ish units as the taps.
 */
function priors(c: Camera, size: { w: number; h: number }): number[] {
  const p = cameraPose(c), dim = Math.max(size.w, size.h), lf = Math.log(c.f / dim);
  const lo = Math.log(0.38), hi = Math.log(1.9); // ultra-wide to 2x lens, in picture widths
  return [
    p.roll * 2.5, // degrees off level
    p.height < 2 ? (2 - p.height) * 40 : p.height > 9 ? (p.height - 9) * 40 : 0,
    lf < lo ? (lo - lf) * 300 : lf > hi ? (lf - hi) * 300 : 0,
  ];
}

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
    r.push(...priors(c, size));
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

/** Where the camera is and how it is held, for sanity checks: height (ft), roll and pitch (degrees), floor position (court ft). */
function cameraPose(c: Camera) {
  const R = c.R, t = c.t;
  const C: V3 = [-(R[0] * t[0] + R[3] * t[1] + R[6] * t[2]), -(R[1] * t[0] + R[4] * t[1] + R[7] * t[2]), -(R[2] * t[0] + R[5] * t[1] + R[8] * t[2])];
  const up: V3 = [R[2], R[5], R[8]]; // the court's "up" as the camera sees it (x right, y down, z forward)
  return { x: C[0], y: C[1], height: C[2], roll: (Math.atan2(up[0], -up[1]) * 180) / Math.PI, pitch: (Math.asin(Math.max(-1, Math.min(1, up[2]))) * 180) / Math.PI };
}

// ---- find the court automatically ---------------------------------------------
/** A greyscale picture of the court. `scale` = its pixels per video pixel. */
export interface CourtPicture { gray: Uint8Array | Uint8ClampedArray; w: number; h: number; scale: number; }

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}

/**
 * "Painted line here" strength for every pixel: a line is a thin stripe that
 * is lighter or darker than the floor on BOTH sides of it. (The edge of a big
 * patch — wall meets floor, a shadow — differs on one side only and scores 0.)
 */
function lineMap(pic: CourtPicture): Float32Array {
  const { w, h, gray } = pic, out = new Float32Array(w * h);
  const d = Math.max(2, Math.round(w / 300));
  for (let y = d; y < h - d; y++) for (let x = d; x < w - d; x++) {
    const c = gray[y * w + x];
    let best = 0;
    for (const [dx, dy] of [[d, 0], [0, d], [d, d], [d, -d]]) {
      const a = c - gray[(y - dy) * w + x - dx], b = c - gray[(y + dy) * w + x + dx];
      if (a * b > 0) { const m = Math.min(Math.abs(a), Math.abs(b)); if (m > best) best = m; }
    }
    out[y * w + x] = Math.min(50, best);
  }
  return out;
}

/** Points along the painted 3-point line and lane (court feet), with weights, for scoring a camera against the picture. */
function paintedLinePoints(): { x: number; y: number; wgt: number }[] {
  const pts: { x: number; y: number; wgt: number }[] = [];
  const along = (a: Pt, b: Pt, n: number, wgt: number) => { for (let k = 0; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, wgt }); };
  const B = COURT.basket, L = COURT.lane;
  const a0 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x), a1 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x);
  for (let k = 0; k <= 120; k++) { const a = a0 + ((a1 - a0) * k) / 120; pts.push({ x: B.x + COURT.threeR * Math.cos(a), y: B.y + COURT.threeR * Math.sin(a), wgt: 1 }); }
  along({ x: COURT.cornerX0, y: 0.8 }, { x: COURT.cornerX0, y: COURT.cornerJoinY }, 8, 1);
  along({ x: COURT.cornerX1, y: 0.8 }, { x: COURT.cornerX1, y: COURT.cornerJoinY }, 8, 1);
  along({ x: L.x0, y: 1.5 }, { x: L.x0, y: L.ftLineY }, 24, 1);
  along({ x: L.x1, y: 1.5 }, { x: L.x1, y: L.ftLineY }, 24, 1);
  along({ x: L.x0, y: L.ftLineY }, { x: L.x1, y: L.ftLineY }, 16, 1);
  return pts;
}

/**
 * Find the court with no marks from the player. We already know where the rim
 * is, and that the phone is level and somewhere around the half court at knee
 * to head height. So: try every such camera (thousands), draw where the
 * 3-point line and lane would fall for each, and keep the one whose drawn
 * lines land on painted lines in the picture; then fine-tune it.
 * `confidence` is how much better the winner is than a typical candidate.
 */
export function findCourt(pic: CourtPicture, rim: { x: number; y: number; width: number }, size: { w: number; h: number }): (CourtFit & { confidence: number }) | null {
  const { w, h, scale: S } = pic, dim = Math.max(size.w, size.h);
  const raw = lineMap(pic);
  const coarse = boxBlur(raw, w, h, Math.max(3, Math.round(w / 110))), fine = boxBlur(raw, w, h, Math.max(1, Math.round(w / 420)));
  const lines = paintedLinePoints();
  const nArc = 121 + 18; // the first points are the 3-point line, the rest the lane
  // "On a line" = stronger than most of the picture. Counting hits, not adding
  // up strength, stops one very bold line (a wall edge, a border) from winning
  // by itself: the whole arc AND the lane have to be found.
  const level = (map: Float32Array) => { const v: number[] = []; for (let i = 0; i < map.length; i += 13) v.push(map[i]); v.sort((a, b) => a - b); return Math.max(1.5, v[Math.floor(v.length * 0.88)]); };
  const levels = new Map<Float32Array, number>();
  const score = (cam: Camera, map: Float32Array): number => {
    let lv = levels.get(map);
    if (lv === undefined) { lv = level(map); levels.set(map, lv); }
    let hitA = 0, seenA = 0, hitL = 0, seenL = 0;
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i], q = project(cam, size, p.x, p.y, 0);
      if (!q) continue;
      const x = Math.round(q.x * S), y = Math.round(q.y * S);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const v = Math.min(1, map[y * w + x] / lv);
      if (i < nArc) { seenA++; hitA += v; } else { seenL++; hitL += v; }
    }
    if (seenA < nArc * 0.45 || seenL < (lines.length - nArc) * 0.5) return 0; // most of the court must be in the picture
    // the floor under the hoop must be below the rim in the picture
    const B = COURT.basket, under = project(cam, size, B.x, B.y, 0);
    if (!under || under.y < rim.y + rim.width) return 0;
    const a = hitA / seenA, l = hitL / seenL;
    return Math.sqrt(a * l) * Math.min(1, seenA / (nArc * 0.8)); // both must be good
  };
  const make = (x: number, y: number, hgt: number, f: number) => lookAtRim([x, y, hgt], f, MIRROR, rim, size);

  // 1. coarse sweep
  const cands: { x: number; y: number; hgt: number; f: number; s: number }[] = [];
  let sumS = 0, nS = 0;
  for (const fr of [0.45, 0.56, 0.68, 0.8, 0.95, 1.15, 1.45]) for (const hgt of [3.5, 4.5, 5.5]) for (let x = -25; x <= 75; x += 5) for (let y = 12; y <= 85; y += 5) {
    const cam = make(x, y, hgt, fr * dim);
    if (!cam) continue;
    const s2 = score(cam, coarse);
    if (s2 > 0) { cands.push({ x, y, hgt, f: fr * dim, s: s2 }); sumS += s2; nS++; }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.s - a.s);
  // 2. fine-tune the best few, coarse map then fine map
  let best: { cam: Camera; s: number } | null = null;
  const tried: { x: number; y: number }[] = [];
  for (const c0 of cands) {
    if (tried.length >= 8) break;
    if (tried.some((t) => Math.hypot(t.x - c0.x, t.y - c0.y) < 8)) continue; // already exploring this neighbourhood
    tried.push({ x: c0.x, y: c0.y });
    let p = [c0.x, c0.y, c0.hgt, Math.log(c0.f)], cur = c0.s;
    for (const map of [coarse, fine]) {
      const camNow = make(p[0], p[1], p[2], Math.exp(p[3]));
      cur = camNow ? score(camNow, map) : 0;
      let step = map === coarse ? [2.5, 2.5, 0.75, 0.08] : [0.8, 0.8, 0.3, 0.03];
      for (let round = 0; round < 40; round++) {
        let moved = false;
        for (let k = 0; k < 4; k++) for (const dir of [1, -1]) {
          const q = p.slice(); q[k] += dir * step[k];
          if (q[2] < 2.8 || q[2] > 7.5 || q[3] < Math.log(0.36 * dim) || q[3] > Math.log(2 * dim)) continue;
          const cam = make(q[0], q[1], q[2], Math.exp(q[3]));
          const s2 = cam ? score(cam, map) : 0;
          if (s2 > cur * 1.0005) { p = q; cur = s2; moved = true; }
        }
        if (!moved) { step = step.map((v) => v / 2); if (step[0] < 0.1) break; }
      }
    }
    const cam = make(p[0], p[1], p[2], Math.exp(p[3]));
    if (cam && (!best || cur > best.s)) best = { cam, s: cur };
  }
  if (!best) return null;
  const toImg = floorMapping(best.cam, size), toCourt = invertH(toImg);
  if (!toCourt) return null;
  // typical line strength along a random believable camera's lines, on the fine map
  let base = 0, nb = 0;
  for (let i = 0; i < cands.length; i += Math.max(1, Math.floor(cands.length / 60))) { const c1 = cands[i], cam = make(c1.x, c1.y, c1.hgt, c1.f); if (cam) { base += score(cam, fine); nb++; } }
  const typical = nb ? base / nb : 1;
  void sumS; void nS;
  return {
    toCourt, toImg, corners: LANE.map((p) => applyH(toImg, p)), error: 0, cameraHeight: cameraPose(best.cam).height,
    state: { cam: best.cam, order: [0, 1, 2, 3] }, confidence: typical > 0 ? best.s / typical : 0,
  };
}

/** Which way round a real camera sees the court (the other is a mirror image). Set by `lookAtRim`'s construction. */
const MIRROR: 1 | -1 = -1;

/** A camera looking from `at` (court x, y, height) straight at the rim, level, with the rim landing on `rimPix`. */
function lookAtRim(at: V3, f: number, mirror: 1 | -1, rimPix: Pt, size: { w: number; h: number }): Camera | null {
  const B = COURT.basket;
  let fwd: V3 = [B.x - at[0], B.y - at[1], RIM_HEIGHT_FT - at[2]];
  const n = norm(fwd);
  if (n < 1) return null;
  fwd = scale(fwd, 1 / n);
  let right = cross(fwd, [0, 0, 1]);
  const nr = norm(right);
  if (nr < 1e-6) return null;
  right = scale(right, mirror / nr);
  let down = cross(fwd, right);
  // "down" must point at the floor
  if (down[2] > 0) down = scale(down, -1);
  const R = [right[0], right[1], right[2], down[0], down[1], down[2], fwd[0], fwd[1], fwd[2]];
  // turn so the rim sits where it was marked, not at the picture centre
  const k: V3 = [(rimPix.x - size.w / 2) / f, (rimPix.y - size.h / 2) / f, 1];
  const kn = scale(k, 1 / norm(k));
  const axis = cross(kn, [0, 0, 1]), sn = norm(axis), ang = Math.asin(Math.min(1, sn));
  const R2 = sn > 1e-9 ? rotate(R, scale(axis, -ang / sn)) : R;
  const t: V3 = [-(R2[0] * at[0] + R2[1] * at[1] + R2[2] * at[2]), -(R2[3] * at[0] + R2[4] * at[1] + R2[5] * at[2]), -(R2[6] * at[0] + R2[7] * at[1] + R2[8] * at[2])];
  return { f, R: R2, t };
}

export interface CourtFit {
  toCourt: Homography; toImg: Homography;
  /** where the fit puts the four lane corners in the picture */
  corners: Pt[];
  /** typical distance (video pixels) between the marks and where the fit puts them — big means "check your marks" */
  error: number;
  /** camera height in feet, as a sanity readout */
  cameraHeight: number;
  /** opaque: lets a small adjustment (dragging a dot) refit quickly from here */
  state: { cam: Camera; order: number[] };
}

/**
 * Build the picture<->court mapping from four marks on the corners of the lane
 * (any order), the rim the player already marked, and — strongly recommended —
 * a few marks along the painted 3-point line.
 *
 * We fit an actual camera (lens, position, tilt). The lane marks alone can't
 * say which side of the lane is the baseline, so every way round is tried,
 * each from many believable starting cameras (standing around the half court
 * at different spots and heights), and the best-explained one is kept.
 * `from` (a previous fit) skips the search: used while a dot is being dragged.
 */
export function calibrateCourt(taps: Pt[], rim: { x: number; y: number; width: number }, size: { w: number; h: number }, arcTaps: Pt[] = [], from?: CourtFit["state"], report?: (line: string) => void): CourtFit | null {
  if (taps.length !== 4) return null;
  const dim = Math.max(size.w, size.h);
  const finish = (cam: Camera, order: number[], err: number): CourtFit | null => {
    const toImg = floorMapping(cam, size), toCourt = invertH(toImg);
    if (!toCourt) return null;
    const corners = LANE.map((p) => applyH(toImg, p));
    // error on the marks themselves (lane corners + rim), without the camera-sense terms
    const B = COURT.basket, rp = project(cam, size, B.x, B.y, RIM_HEIGHT_FT);
    let sum = rp ? (rp.x - rim.x) ** 2 + (rp.y - rim.y) ** 2 : 1e6;
    corners.forEach((p, i) => { sum += (p.x - taps[order[i]].x) ** 2 + (p.y - taps[order[i]].y) ** 2; });
    void err;
    return { toCourt, toImg, corners, error: Math.sqrt(sum / 5), cameraHeight: cameraPose(cam).height, state: { cam, order } };
  };

  if (from) {
    const img = from.order.map((i) => taps[i]);
    const { cam, err } = fitCamera(from.cam, img, rim, size, arcTaps);
    return finish(cam, from.order, err);
  }

  const c = { x: (taps[0].x + taps[1].x + taps[2].x + taps[3].x) / 4, y: (taps[0].y + taps[1].y + taps[2].y + taps[3].y) / 4 };
  const idx = [0, 1, 2, 3].sort((a, b) => Math.atan2(taps[a].y - c.y, taps[a].x - c.x) - Math.atan2(taps[b].y - c.y, taps[b].x - c.x)); // clockwise on screen (y down)
  const cost0 = (cam: Camera, img: Pt[]): number => {
    let sum = 0;
    for (let i = 0; i < 4; i++) { const p = project(cam, size, LANE[i].x, LANE[i].y, 0); if (!p) return Infinity; sum += (p.x - img[i].x) ** 2 + (p.y - img[i].y) ** 2; }
    return sum;
  };
  let best: Camera | null = null, bestErr = Infinity, bestOrder: number[] = idx;
  for (let r = 0; r < 4; r++) {
    const order = [0, 1, 2, 3].map((k) => idx[(k + r) % 4]);
    const img = order.map((i) => taps[i]);
    const starts: { cam: Camera; c0: number }[] = [];
    // believable cameras: around the half court, knee to head height, common phone lenses
    for (const fr of [0.45, 0.62, 0.8, 1.1, 1.5]) for (const h of [3, 5.5]) for (let x = -15; x <= 65; x += 10) for (let y = 8; y <= 78; y += 10) for (const mirror of [1, -1] as const) {
      const cam = lookAtRim([x, y, h], fr * dim, mirror, rim, size);
      if (cam) starts.push({ cam, c0: cost0(cam, img) });
    }
    // plus the cameras implied directly by the four marks
    const toCourt = solveHomography(img, LANE), toImg0 = toCourt && invertH(toCourt);
    if (toImg0) for (const fr of [0.55, 0.8, 1.1, 1.6]) { const cam = cameraFrom(toImg0, size, fr * dim); if (cam) starts.push({ cam, c0: 0 }); }
    starts.sort((a, b) => a.c0 - b.c0);
    for (const st of starts.slice(0, 14)) {
      const { cam, err } = fitCamera(st.cam, img, rim, size, arcTaps);
      const pose = cameraPose(cam);
      report?.(`way ${r}: err ${err.toFixed(1)} f ${(cam.f / dim).toFixed(2)} height ${pose.height.toFixed(1)}ft roll ${pose.roll.toFixed(0)} pitch ${pose.pitch.toFixed(0)} at (${pose.x.toFixed(0)},${pose.y.toFixed(0)})`);
      if (err < bestErr) { bestErr = err; best = cam; bestOrder = order; }
    }
  }
  if (!best) return null;
  return finish(best, bestOrder, bestErr);
}
