// ---------------------------------------------------------------------------
// Shot Cam — ball flight tracker (where was the shot released?)
// ---------------------------------------------------------------------------
// The make/miss detector only watches the hoop. To find where a shot came
// from we also watch the whole picture at low resolution, remember every small
// moving blob for the last few seconds, and — once a shot reaches the rim —
// follow the ball's arc BACKWARDS in time from the rim to where it left the
// shooter's hands. Pure logic, no DOM.
// ---------------------------------------------------------------------------

export interface FlightPoint { t: number; x: number; y: number; } // low-res frame pixels

interface Cand { x: number; y: number; w: number; h: number; crowded: boolean; }
interface Frame { t: number; cands: Cand[]; }

const DIFF = 22; // per-channel change that counts as motion
const HISTORY_MS = 3500;

export class FlightTracker {
  readonly w: number;
  readonly h: number;
  private prev1: Uint8Array | null = null; // previous frame (RGB)
  private prev2: Uint8Array | null = null; // the one before
  private mask: Uint8Array;
  private labels: Uint8Array;
  private stack: Int32Array;
  private integral: Int32Array; // summed-area table of the motion mask
  private frames: Frame[] = [];

  constructor(width: number, height: number) {
    this.w = width; this.h = height;
    this.mask = new Uint8Array(width * height);
    this.labels = new Uint8Array(width * height);
    this.stack = new Int32Array(width * height);
    this.integral = new Int32Array((width + 1) * (height + 1));
  }

  reset() { this.prev1 = this.prev2 = null; this.frames = []; }

  /** Feed one low-res RGBA frame. `ballPx` is the expected ball diameter in these pixels. */
  process(rgba: Uint8ClampedArray | Uint8Array, t: number, ballPx: number) {
    const n = this.w * this.h;
    const cur = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) { cur[i * 3] = rgba[i * 4]; cur[i * 3 + 1] = rgba[i * 4 + 1]; cur[i * 3 + 2] = rgba[i * 4 + 2]; }
    const p1 = this.prev1, p2 = this.prev2;
    this.prev2 = p1; this.prev1 = cur;
    if (!p1 || !p2) return;

    // Three-frame difference: a pixel is "the moving thing, now" only if it
    // differs from BOTH earlier frames. That marks where the ball is, not where it was.
    const mask = this.mask;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const d1 = Math.max(Math.abs(cur[j] - p1[j]), Math.abs(cur[j + 1] - p1[j + 1]), Math.abs(cur[j + 2] - p1[j + 2]));
      if (d1 <= DIFF) { mask[i] = 0; continue; }
      const d2 = Math.max(Math.abs(cur[j] - p2[j]), Math.abs(cur[j + 1] - p2[j + 1]), Math.abs(cur[j + 2] - p2[j + 2]));
      mask[i] = d2 > DIFF ? 1 : 0;
    }

    const cands: Cand[] = [];
    const areas: number[] = [];
    const maxSide = Math.max(6, ballPx * 3.2), minArea = Math.max(2, ballPx * ballPx * 0.12);
    const labels = this.labels, stack = this.stack, W = this.w, H = this.h;
    labels.fill(0);
    for (let s = 0; s < n; s++) {
      if (!mask[s] || labels[s]) continue;
      let sp = 0, area = 0, sx = 0, sy = 0, minX = W, maxX = 0, minY = H, maxY = 0;
      stack[sp++] = s; labels[s] = 1;
      while (sp) {
        const i = stack[--sp], x = i % W, y = (i / W) | 0;
        area++; sx += x; sy += y;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        // 8-neighbour fill so a thin, fast ball stays one blob
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const k = yy * W + xx;
          if (mask[k] && !labels[k]) { labels[k] = 1; stack[sp++] = k; }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (area < minArea || bw > maxSide || bh > maxSide) continue;
      cands.push({ x: sx / area, y: sy / area, w: bw, h: bh, crowded: false });
      areas.push(area);
    }
    // "Crowded" = lots of other motion right around the blob, i.e. the ball is
    // still in (or right next to) a moving player's hands rather than in the air.
    const I = this.integral, W1 = W + 1;
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += mask[y * W + x]; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + row; } }
    const rad = Math.max(4, Math.round(ballPx * 2.5));
    cands.forEach((c, k) => {
      const x0 = Math.max(0, Math.round(c.x) - rad), x1 = Math.min(W, Math.round(c.x) + rad + 1), y0 = Math.max(0, Math.round(c.y) - rad), y1 = Math.min(H, Math.round(c.y) + rad + 1);
      const around = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0] - areas[k];
      c.crowded = around > Math.max(6, ballPx * ballPx * 1.2);
    });
    this.frames.push({ t, cands });
    while (this.frames.length && t - this.frames[0].t > HISTORY_MS) this.frames.shift();
  }

  /**
   * Follow the ball back from the hoop. `tail` is the ball's final approach
   * (oldest first, low-res pixels) from the make/miss detector. Returns the
   * flight oldest-first; its first point is the release.
   */
  traceBack(tail: FlightPoint[], ballPx: number): FlightPoint[] {
    if (tail.length < 2) return tail.slice();
    const track = tail.slice().sort((a, b) => b.t - a.t); // newest first; we append older points
    const gate = Math.max(4, ballPx * 1.6);
    let misses = 0, lastCrowded = false;
    const startT = track[track.length - 1].t;
    for (let f = this.frames.length - 1; f >= 0; f--) {
      const fr = this.frames[f];
      if (fr.t >= startT - 1) continue;
      const pred = predict(track, fr.t);
      let best: Cand | null = null, bd = gate * (1 + 0.5 * misses);
      for (const c of fr.cands) { const d = Math.hypot(c.x - pred.x, c.y - pred.y); if (d < bd) { bd = d; best = c; } }
      if (best) {
        // Two crowded sightings in a row: we have followed the ball back into the shooter's hands.
        if (best.crowded && lastCrowded) { track.pop(); break; }
        lastCrowded = best.crowded;
        track.push({ t: fr.t, x: best.x, y: best.y }); misses = 0;
      } else if (++misses > 6) break;
    }
    return track.reverse();
  }
}

/** Fit x(t) as a line and y(t) as a parabola through the oldest few track points; evaluate at t. */
function predict(track: FlightPoint[], t: number): { x: number; y: number } {
  const pts = track.slice(-10);
  const t0 = pts[pts.length - 1].t;
  const n = pts.length;
  // linear fit for x
  let st = 0, sx = 0, stt = 0, stx = 0;
  for (const p of pts) { const u = (p.t - t0) / 1000; st += u; sx += p.x; stt += u * u; stx += u * p.x; }
  const den = n * stt - st * st;
  const bx = den ? (n * stx - st * sx) / den : 0, ax = (sx - bx * st) / n;
  const u = (t - t0) / 1000;
  // quadratic fit for y once there are enough points, otherwise linear
  if (n < 5) {
    let sy = 0, sty = 0;
    for (const p of pts) { const v = (p.t - t0) / 1000; sy += p.y; sty += v * p.y; }
    const by = den ? (n * sty - st * sy) / den : 0, ay = (sy - by * st) / n;
    return { x: ax + bx * u, y: ay + by * u };
  }
  const S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
  for (const p of pts) { const v = (p.t - t0) / 1000; let pw = 1; for (let k = 0; k < 5; k++) { S[k] += pw; if (k < 3) Y[k] += pw * p.y; pw *= v; } }
  const M = [[S[0], S[1], S[2], Y[0]], [S[1], S[2], S[3], Y[1]], [S[2], S[3], S[4], Y[2]]];
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-9) return { x: ax + bx * u, y: pts[pts.length - 1].y };
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k]; }
  }
  const c0 = M[0][3] / M[0][0], c1 = M[1][3] / M[1][1], c2 = M[2][3] / M[2][2];
  return { x: ax + bx * u, y: c0 + c1 * u + c2 * u * u };
}
