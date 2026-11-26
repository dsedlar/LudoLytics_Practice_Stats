// ---------------------------------------------------------------------------
// Shot Cam — make/miss detector
// ---------------------------------------------------------------------------
// Pure logic, no DOM: it is fed a small, fixed-size crop of the camera frame
// centred on the rim (the "ROI") and reports makes and misses. Keeping it pure
// lets the same code run in the browser and in scripts/testShotCam.ts against
// recorded footage.
//
// Everything is measured in rim widths. The caller crops the video so the rim
// is RIM_PX wide and sits at (RIM_CX, RIM_CY) in the ROI; the phone is on a
// tripod, so the hoop stays put and only the ball moves through this window.
//
// How a shot is judged:
//   1. Background subtraction finds moving blobs; ball-sized, round-ish blobs
//      become ball sightings.
//   2. A shot attempt starts when the ball is seen FALLING toward the hoop from
//      above rim height (a rising ball — a release near the camera — is ignored).
//   3. It is a MAKE if the ball drops into the rim and the net box underneath
//      fills up and stays filled (ball in the net, net kicking out). Otherwise
//      (ball comes down beside the hoop, or flies off) it is a MISS.
// ---------------------------------------------------------------------------

export const RIM_PX = 32; // rim width in ROI pixels
export const ROI_W = 7 * RIM_PX; // 224
export const ROI_H = 6.5 * RIM_PX; // 208
export const RIM_CX = ROI_W / 2; // rim centre x in the ROI
export const RIM_CY = 4 * RIM_PX; // rim centre y in the ROI (more room above than below)

/** Where the ROI sits in the source video, given the rim there (source pixels). */
export interface RimBox { cx: number; cy: number; width: number; }
export function roiRect(rim: RimBox) {
  const s = rim.width / RIM_PX; // source px per ROI px
  return { x: rim.cx - RIM_CX * s, y: rim.cy - RIM_CY * s, w: ROI_W * s, h: ROI_H * s, scale: s };
}

export type ShotResult = "make" | "miss";
export interface ShotEvent {
  result: ShotResult;
  /** ms timestamp (caller's clock) at which the ball reached the rim. */
  t: number;
}

export interface BallSighting { t: number; x: number; y: number; } // x,y in rim widths, origin rim centre, y down

export interface FrameDebug {
  balls: { x: number; y: number; w: number; h: number }[]; // ROI px boxes
  netFill: number;
  phase: "idle" | "armed";
  drift: { dx: number; dy: number } | null; // ROI px the rim has moved; caller should shift its crop
}

interface Blob { minX: number; minY: number; maxX: number; maxY: number; area: number; sx: number; sy: number; }

const DIFF_THRESHOLD = 26; // per-channel difference that counts as "changed"
const BG_ALPHA = 0.06; // background learning rate where nothing is moving
const STALE_FRAMES = 45;
const BG_ALPHA_FG = 0.004; // ...and under moving things (slow, so the ball never burns in)

const NET_FILL_ON = 0.2; // net box counts as "filled" above this fraction
const NET_MS_FOR_MAKE = 60; // ...for at least this long
const NET_PEAK_FOR_MAKE = 0.26; // ...and peaking at least this high

// Net box: directly under the rim, in rim widths relative to rim centre.
const NET = { x0: -0.5, x1: 0.5, y0: 0.08, y1: 1.0 };

export class ShotDetector {
  private bg: Float32Array | null = null; // RGB background, 3 floats per pixel
  private mask = new Uint8Array(ROI_W * ROI_H);
  private age = new Uint8Array(ROI_W * ROI_H); // consecutive frames each pixel has been foreground
  private labels = new Int32Array(ROI_W * ROI_H);
  private stack = new Int32Array(ROI_W * ROI_H);
  private frames = 0;

  // rim template for drift lock (grayscale patch around the rim)
  private tpl: Float32Array | null = null;
  private static TPL = { x0: Math.round(RIM_CX - 1.2 * RIM_PX), y0: Math.round(RIM_CY - 0.9 * RIM_PX), w: Math.round(2.4 * RIM_PX), h: Math.round(1.5 * RIM_PX) };
  private quietFrames = 0;

  // shot state
  private last: BallSighting | null = null; // most recent ball sighting (for linking frames into a path)
  private prevT = 0;
  private armedAt: number | null = null; // time a falling ball first came at the hoop
  private lastAbove: BallSighting | null = null; // last sighting above the rim before it got there
  private closest = Infinity; // closest approach to the rim centre while armed (rim widths)
  private netMs = 0; // how long the net box has been substantially filled while armed
  private netPeak = 0;
  private rimT = 0; // time the ball reached the rim
  private nearT = 0; // last time the ball was seen near the hoop
  private cooldownUntil = 0;

  reset() {
    this.bg = null; this.tpl = null; this.age.fill(0); this.frames = 0; this.quietFrames = 0;
    this.last = null; this.disarm(); this.cooldownUntil = 0;
  }

  private disarm() {
    this.armedAt = null; this.lastAbove = null; this.closest = Infinity; this.netMs = 0; this.netPeak = 0; this.rimT = 0; this.nearT = 0;
  }

  /**
   * Feed one ROI frame (RGBA, ROI_W x ROI_H) with its timestamp in ms.
   * Returns a shot event when one is decided on this frame, else null.
   */
  process(rgba: Uint8ClampedArray | Uint8Array, t: number, debug?: FrameDebug): ShotEvent | null {
    const n = ROI_W * ROI_H;
    if (!this.bg) {
      this.bg = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { this.bg[i * 3] = rgba[i * 4]; this.bg[i * 3 + 1] = rgba[i * 4 + 1]; this.bg[i * 3 + 2] = rgba[i * 4 + 2]; }
      this.frames = 1;
      if (debug) { debug.balls = []; debug.netFill = 0; debug.phase = "idle"; debug.drift = null; }
      return null;
    }
    this.frames++;
    const bg = this.bg, mask = this.mask, age = this.age;

    // ---- foreground mask + background update ----
    let fgCount = 0;
    for (let i = 0; i < n; i++) {
      const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
      const dr = Math.abs(r - bg[i * 3]), dg = Math.abs(g - bg[i * 3 + 1]), db = Math.abs(b - bg[i * 3 + 2]);
      const d = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
      const fg = d > DIFF_THRESHOLD ? 1 : 0;
      mask[i] = fg; fgCount += fg;
      if (fg) {
        // Something that stays changed for ~1.5s is scenery now (net hanging
        // differently, phone nudged) — absorb it into the background.
        if (++age[i] > STALE_FRAMES) { bg[i * 3] = r; bg[i * 3 + 1] = g; bg[i * 3 + 2] = b; age[i] = 0; continue; }
      } else age[i] = 0;
      const a = fg ? BG_ALPHA_FG : BG_ALPHA;
      bg[i * 3] += (r - bg[i * 3]) * a; bg[i * 3 + 1] += (g - bg[i * 3 + 1]) * a; bg[i * 3 + 2] += (b - bg[i * 3 + 2]) * a;
    }
    // A big global change (lights, exposure, phone moved) — relearn the scene.
    if (fgCount > n * 0.35) {
      for (let i = 0; i < n; i++) { bg[i * 3] = rgba[i * 4]; bg[i * 3 + 1] = rgba[i * 4 + 1]; bg[i * 3 + 2] = rgba[i * 4 + 2]; }
      this.quietFrames = 0; this.last = null; this.disarm(); age.fill(0);
      if (debug) { debug.balls = []; debug.netFill = 0; debug.phase = "idle"; debug.drift = null; }
      return null;
    }

    // ---- net box fill ----
    const nx0 = Math.round(RIM_CX + NET.x0 * RIM_PX), nx1 = Math.round(RIM_CX + NET.x1 * RIM_PX);
    const ny0 = Math.round(RIM_CY + NET.y0 * RIM_PX), ny1 = Math.round(RIM_CY + NET.y1 * RIM_PX);
    let netFg = 0;
    for (let y = ny0; y < ny1; y++) for (let x = nx0; x < nx1; x++) netFg += mask[y * ROI_W + x];
    const netFill = netFg / ((nx1 - nx0) * (ny1 - ny0));

    // ---- blobs -> ball sightings ----
    const blobs = this.findBlobs();
    const balls: Blob[] = [];
    for (const b of blobs) {
      const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
      if (w < 0.28 * RIM_PX || h < 0.28 * RIM_PX || w > 1.0 * RIM_PX || h > 1.0 * RIM_PX) continue;
      if (b.area < 0.07 * RIM_PX * RIM_PX) continue;
      if (b.area / (w * h) < 0.5) continue;
      const ar = w > h ? w / h : h / w;
      if (ar > 2.0) continue;
      balls.push(b);
    }

    // ---- rim drift lock (only when the scene is quiet) ----
    let drift: { dx: number; dy: number } | null = null;
    if (balls.length === 0 && netFill < 0.12 && this.armedAt === null) {
      this.quietFrames++;
      if (!this.tpl) { if (this.quietFrames >= 8 && fgCount < n * 0.004) this.tpl = this.grabTemplate(rgba, 0, 0); }
      else if (this.quietFrames % 5 === 0) drift = this.matchTemplate(rgba);
    } else this.quietFrames = 0;
    if (drift) this.shiftBackground(drift.dx, drift.dy);

    const ev = this.updateShot(balls, netFill, t);
    if (debug) {
      debug.balls = balls.map((b) => ({ x: b.minX, y: b.minY, w: b.maxX - b.minX + 1, h: b.maxY - b.minY + 1 }));
      debug.netFill = netFill; debug.phase = this.armedAt === null ? "idle" : "armed"; debug.drift = drift;
    }
    return ev;
  }

  // ---- shot state machine --------------------------------------------------
  private updateShot(balls: Blob[], netFill: number, t: number): ShotEvent | null {
    const dt = Math.min(80, Math.max(0, t - this.prevT));
    this.prevT = t;
    // Convert to rim-width units, origin at rim centre.
    const pts: BallSighting[] = balls.map((b) => ({ t, x: (b.sx / b.area - RIM_CX) / RIM_PX, y: (b.sy / b.area - RIM_CY) / RIM_PX }));

    // Link this frame to the last sighting: the nearest blob within reach is the same ball.
    const prev = this.last && t - this.last.t < 260 ? this.last : null;
    let cur: BallSighting | null = null;
    if (prev) {
      const reach = 0.9 + 0.012 * (t - prev.t);
      let best = reach;
      for (const p of pts) { const d = Math.hypot(p.x - prev.x, p.y - prev.y); if (d < best) { best = d; cur = p; } }
    }
    const falling = !!(prev && cur && cur.y > prev.y + 0.04);
    // No link: start a new path from the highest blob (shots arrive from above).
    if (!cur && pts.length) cur = pts.reduce((a, b) => (b.y < a.y ? b : a));
    if (cur) this.last = cur;

    if (t < this.cooldownUntil) return null;

    if (this.armedAt === null) {
      // Arm on a ball that is FALLING toward the hoop from above rim height. A ball
      // rising through the picture (a release near the camera, a pass) never arms.
      if (falling && cur && cur.y < 0 && cur.y > -2.4 && Math.abs(cur.x) < 2.6) {
        this.armedAt = t; this.lastAbove = cur; this.closest = Math.hypot(cur.x, cur.y); this.rimT = t; this.nearT = t;
        this.netMs = 0; this.netPeak = 0;
      }
      return null;
    }

    // Armed: follow the ball to the rim.
    for (const p of pts) {
      const d = Math.hypot(p.x, p.y);
      if (d < 2.2) this.nearT = t;
      if (d < this.closest) { this.closest = d; this.rimT = t; }
      if (p.y < -0.1 && d < 2.5 && this.netMs === 0) this.lastAbove = p;
    }
    if (netFill > NET_FILL_ON) { this.netMs += dt; this.nearT = t; }
    if (netFill > this.netPeak) this.netPeak = netFill;

    const done = (result: ShotResult | null): ShotEvent | null => {
      const ev = result ? { result, t: this.rimT } : null;
      this.disarm();
      if (ev) this.cooldownUntil = t + 600;
      return ev;
    };

    // MAKE: the ball dropped into the rim from above and the net box filled up
    // and stayed filled — the ball inside the net, and the net kicking out.
    const entered = !!this.lastAbove && Math.abs(this.lastAbove.x) < 0.9;
    if (entered && this.netMs >= NET_MS_FOR_MAKE && this.netPeak >= NET_PEAK_FOR_MAKE) return done("make");

    // MISS: the ball got to the hoop and has now come down beside it or gone.
    const reached = this.closest < 1.5;
    const droppedOutside = pts.some((p) => p.y > 1.15 && (Math.abs(p.x) > 0.75 || p.y > 1.6) && Math.hypot(p.x, p.y) < 3.2) && netFill < NET_FILL_ON;
    if (reached && droppedOutside && t - this.rimT > 120) return done("miss");
    if (t - this.nearT > 800 || t - this.armedAt > 5000) return done(reached ? "miss" : null);
    return null;
  }

  // ---- connected components (4-neighbour flood fill) -----------------------
  private findBlobs(): Blob[] {
    const mask = this.mask, labels = this.labels, stack = this.stack;
    labels.fill(0);
    const out: Blob[] = [];
    let next = 1;
    for (let start = 0; start < ROI_W * ROI_H; start++) {
      if (!mask[start] || labels[start]) continue;
      const blob: Blob = { minX: ROI_W, minY: ROI_H, maxX: 0, maxY: 0, area: 0, sx: 0, sy: 0 };
      let sp = 0;
      stack[sp++] = start; labels[start] = next;
      while (sp) {
        const i = stack[--sp];
        const x = i % ROI_W, y = (i / ROI_W) | 0;
        blob.area++; blob.sx += x; blob.sy += y;
        if (x < blob.minX) blob.minX = x; if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y; if (y > blob.maxY) blob.maxY = y;
        if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = next; stack[sp++] = i - 1; }
        if (x < ROI_W - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = next; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - ROI_W] && !labels[i - ROI_W]) { labels[i - ROI_W] = next; stack[sp++] = i - ROI_W; }
        if (y < ROI_H - 1 && mask[i + ROI_W] && !labels[i + ROI_W]) { labels[i + ROI_W] = next; stack[sp++] = i + ROI_W; }
      }
      next++;
      if (blob.area >= 12) out.push(blob);
    }
    return out;
  }

  // ---- rim drift lock ------------------------------------------------------
  private grabTemplate(rgba: Uint8ClampedArray | Uint8Array, dx: number, dy: number): Float32Array {
    const T = ShotDetector.TPL;
    const out = new Float32Array(T.w * T.h);
    for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) {
      const i = ((T.y0 + y + dy) * ROI_W + (T.x0 + x + dx)) * 4;
      out[y * T.w + x] = (rgba[i] + rgba[i + 1] * 2 + rgba[i + 2]) / 4;
    }
    return out;
  }

  private matchTemplate(rgba: Uint8ClampedArray | Uint8Array): { dx: number; dy: number } | null {
    const T = ShotDetector.TPL, tpl = this.tpl!;
    const R = 5;
    let best = Infinity, bx = 0, by = 0, zero = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      let sad = 0;
      for (let y = 0; y < T.h; y += 2) for (let x = 0; x < T.w; x += 2) {
        const i = ((T.y0 + y + dy) * ROI_W + (T.x0 + x + dx)) * 4;
        sad += Math.abs((rgba[i] + rgba[i + 1] * 2 + rgba[i + 2]) / 4 - tpl[y * T.w + x]);
      }
      if (dx === 0 && dy === 0) zero = sad;
      if (sad < best) { best = sad; bx = dx; by = dy; }
    }
    if ((bx !== 0 || by !== 0) && best < zero * 0.8) return { dx: bx, dy: by };
    return null;
  }

  /** The caller will move its crop by (dx,dy); move our background the same way. */
  private shiftBackground(dx: number, dy: number) {
    const bg = this.bg!, copy = new Float32Array(bg);
    for (let y = 0; y < ROI_H; y++) for (let x = 0; x < ROI_W; x++) {
      const sx = Math.min(ROI_W - 1, Math.max(0, x + dx)), sy = Math.min(ROI_H - 1, Math.max(0, y + dy));
      const d = (y * ROI_W + x) * 3, s = (sy * ROI_W + sx) * 3;
      bg[d] = copy[s]; bg[d + 1] = copy[s + 1]; bg[d + 2] = copy[s + 2];
    }
  }
}
