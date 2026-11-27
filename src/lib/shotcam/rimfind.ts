// ---------------------------------------------------------------------------
// Shot Cam — find the rim automatically.
// ---------------------------------------------------------------------------
// A rim is a thin, wide, orange-red shape, usually with the white net hanging
// under it. We look for blobs of that colour and shape and score them. With a
// `near` hint (the player touched roughly where the hoop is) only that part of
// the picture is searched. Pure logic, no DOM.
// ---------------------------------------------------------------------------
import type { RimBox } from "./detector";

export interface RimCandidate extends RimBox { score: number; }

/**
 * Orange-red, the colour of a rim — not the purple-red of gym padding (its hue
 * sits on the other side of pure red) or the yellow-brown of wood. Judged by
 * hue, with "how colourful counts as colourful" set from the picture itself
 * (`satMin`), so a dim gym or washed-out video still works.
 */
function rimColour(r: number, g: number, b: number, satMin: number): boolean {
  // First choice (satMin = 0): a plain, strict "bright orange-red" test. It is the most selective.
  if (satMin === 0) return r > 110 && r - g > 45 && r - b > 60 && g >= b - 8 && g < r * 0.72;
  if (r < 70 || r < g || r < b) return false;
  const mn = g < b ? g : b, span = r - mn;
  if (span < r * satMin) return false;
  const tilt = (g - b) / span; // hue: 0 = pure red, +1 = yellow, negative = toward purple
  return tilt > -0.07 && tilt < 0.42;
}

/** How colourful the colourful parts of this picture are (90th percentile of saturation), turned into a threshold. */
function saturationFloor(rgba: Uint8ClampedArray | Uint8Array, n: number): number {
  const hist = new Uint32Array(101);
  let count = 0;
  for (let i = 0; i < n; i += 7) { const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx < 40) continue; hist[Math.round(((mx - mn) / mx) * 100)]++; count++; }
  let acc = 0, s90 = 50;
  for (let k = 0; k <= 100; k++) { acc += hist[k]; if (acc >= count * 0.9) { s90 = k; break; } }
  return Math.min(0.45, Math.max(0.16, (s90 / 100) * 0.55));
}

/**
 * Find rim candidates in an RGBA picture, best first. Coordinates are in the
 * picture's own pixels. `near` restricts the search to around that point.
 */
export function findRims(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, near?: { x: number; y: number }, tolerant = false): RimCandidate[] {
  const satMin = tolerant ? saturationFloor(rgba, w * h) : 0;
  const mask = new Uint8Array(w * h);
  let x0 = 0, x1 = w, y0 = 0, y1 = h;
  if (near) { const rx = w * 0.14, ry = h * 0.2; x0 = Math.max(0, Math.round(near.x - rx)); x1 = Math.min(w, Math.round(near.x + rx)); y0 = Math.max(0, Math.round(near.y - ry)); y1 = Math.min(h, Math.round(near.y + ry)); }
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; if (rimColour(rgba[i], rgba[i + 1], rgba[i + 2], satMin)) mask[y * w + x] = 1; }
  // Close 1-pixel gaps sideways (net cords and highlights break a thin rim into pieces).
  for (let y = y0; y < y1; y++) for (let x = x0 + 1; x < x1 - 1; x++) { const i = y * w + x; if (!mask[i] && mask[i - 1] && mask[i + 1]) mask[i] = 2; }

  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), out: RimCandidate[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0, area = 0, minX = w, maxX = 0, minY = h, maxY = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      area++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (mask[k] && !seen[k]) { seen[k] = 1; stack[sp++] = k; }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw < w * 0.012 || bw > w * 0.085) continue; // too small to track, or far too big to be a rim
    const shape = bh / bw;
    if (shape < 0.08 || shape > 0.62) continue; // a rim seen from the floor is a flat oval
    if (area / (bw * bh) < 0.22) continue;
    // What hangs under it? A net is pale. Look at a box one rim-width tall below the shape.
    let pale = 0, n = 0;
    for (let y = maxY + 1; y < Math.min(h, maxY + 1 + Math.round(bw * 0.8)); y += 2) for (let x = minX + Math.round(bw * 0.15); x < maxX - Math.round(bw * 0.15); x += 2) {
      const i = (y * w + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      n++; if (mx > 130 && mx - mn < 60) pale++;
    }
    const paleBelow = n ? pale / n : 0;
    const flatness = 1 - Math.min(1, Math.abs(shape - 0.3) / 0.35); // most rims look about 0.3 tall for their width
    // A gym often has side baskets in view too: the one being shot at is the one the camera is pointed at.
    const central = near ? 1 : 1 - 0.5 * Math.abs((minX + maxX) / 2 - w / 2) / (w / 2);
    const score = Math.sqrt(area) * (0.5 + flatness) * (0.4 + paleBelow) * (maxY < h * 0.85 ? 1 : 0.3) * central;
    out.push({ cx: (minX + maxX + 1) / 2, cy: (minY + maxY + 1) / 2, width: bw, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Tighten a rough rim guess using the net. The orange we can see is often only
 * part of the rim (the far side washes out) plus the bracket that bolts it to
 * the backboard, so colour alone lands off-centre. The net hangs from the whole
 * rim and nothing else: its cords make a band of fine detail right under the
 * rim, and the width of that band is the rim's width. `rgba` should be the
 * picture at full resolution; `guess` is in its pixels.
 */
/** A looser "this could be part of the rim" test for the close look: thin, blurred parts of a rim are pale. */
function reddish(r: number, g: number, b: number, tolerant: boolean): boolean {
  if (!tolerant) return r > 90 && r > g + 30 && r > b + 30 && g >= b - 12;
  if (r < 70 || r < g || r < b) return false;
  const mn = g < b ? g : b, span = r - mn;
  if (span < r * 0.13) return false;
  const tilt = (g - b) / span;
  return tilt > -0.12 && tilt < 0.5;
}

export function refineRim(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, guess: RimBox, tolerant = false): RimBox & { net: number } {
  const W0 = guess.width;
  const X0 = Math.max(1, Math.round(guess.cx - 1.3 * W0)), X1 = Math.min(w - 1, Math.round(guess.cx + 1.3 * W0));
  const Y0 = Math.max(0, Math.round(guess.cy - 0.6 * W0)), Y1 = Math.min(h, Math.round(guess.cy + 0.6 * W0));
  if (X1 - X0 < 8 || Y1 - Y0 < 4) return { ...guess, net: 0 };
  // 1. Which rows hold the rim? (looser "reddish" test: thin, blurred parts of the rim are paler)
  const rowCount: number[] = [];
  let rowMax = 0;
  for (let y = Y0; y < Y1; y++) {
    let n = 0;
    for (let x = X0; x < X1; x++) { const i = (y * w + x) * 4; if (reddish(rgba[i], rgba[i + 1], rgba[i + 2], tolerant)) n++; }
    rowCount.push(n); if (n > rowMax) rowMax = n;
  }
  if (rowMax < W0 * 0.2) return { ...guess, net: 0 };
  let yt = -1, yb = -1;
  rowCount.forEach((n, k) => { if (n >= rowMax * 0.3) { if (yt < 0) yt = Y0 + k; yb = Y0 + k; } });
  const cy = (yt + yb + 1) / 2;
  // 2. How wide is the net just below it? Fine sideways detail, column by column.
  const b0 = Math.min(h - 1, Math.round(yb + 0.08 * W0)), b1 = Math.min(h, Math.round(yb + 0.5 * W0));
  const luma = (x: number, y: number) => { const i = (y * w + x) * 4; return rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11; };
  const energy = new Float32Array(X1 - X0);
  for (let x = X0; x < X1; x++) { let e = 0; for (let y = b0; y < b1; y++) e += Math.abs(luma(x + 1, y) - luma(x - 1, y)); energy[x - X0] = e; }
  const k = Math.max(1, Math.round(W0 * 0.09)), smooth = new Float32Array(energy.length);
  for (let i = 0; i < energy.length; i++) { let s2 = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(energy.length - 1, i + k); j++) { s2 += energy[j]; n++; } smooth[i] = s2 / n; }
  let peak = 0, pi = 0;
  for (let i = 0; i < smooth.length; i++) { const x = X0 + i; if (Math.abs(x - guess.cx) <= W0 * 0.8 && smooth[i] > peak) { peak = smooth[i]; pi = i; } }
  if (peak <= 0) return { cx: guess.cx, cy, width: W0, net: 0 };
  // background detail level = the quietest stretch; the net must stand clear of it
  const sorted = Array.from(smooth).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.15)];
  const cut = floor + (peak - floor) * 0.4;
  let l = pi, r = pi;
  while (l > 0 && smooth[l - 1] >= cut) l--;
  while (r < smooth.length - 1 && smooth[r + 1] >= cut) r++;
  const netW = r - l + 1;
  if (netW < W0 * 0.45 || netW > W0 * 1.6) return { cx: guess.cx, cy, width: W0, net: 0 };
  // how strongly the net stands out: average sideways change per pixel in the band, above the background
  const net = (peak - floor) / Math.max(1, b1 - b0) / 30;
  const cx = X0 + (l + r + 1) / 2;
  // 3. Width: the net narrows as it hangs, so it gives a low figure. The orange
  // itself reaches the rim's true edge on the side away from the bracket, so
  // measure outward from the net's centre both ways and trust the shorter reach.
  const red = (x: number) => { for (let y = yt; y <= yb; y++) { const i = (y * w + x) * 4; if (reddish(rgba[i], rgba[i + 1], rgba[i + 2], tolerant)) return true; } return false; };
  const reach = (dir: 1 | -1) => { let last = 0, gap = 0; for (let d = 0; d < W0 * 1.2; d++) { const x = Math.round(cx) + dir * d; if (x <= X0 || x >= X1) break; if (red(x)) { last = d; gap = 0; } else if (++gap > W0 * 0.12) break; } return last; };
  const half = Math.min(reach(1), reach(-1));
  return { cx, cy, width: Math.max(netW / 0.9, half * 2 + 1), net };
}

/**
 * Find the rim: shortlist by colour and shape on a small copy of the picture,
 * then measure each against the full-size picture and keep the one with the
 * most convincing net under it. `scale` = small pixels per full pixel.
 * Returns the rim in full-size pixels, or null if nothing looks like one.
 */
export function detectRim(small: Uint8ClampedArray | Uint8Array, sw: number, sh: number, full: Uint8ClampedArray | Uint8Array, fw: number, fh: number, near?: { x: number; y: number }): RimBox | null {
  const k = fw / sw;
  let best: RimBox | null = null, bestScore = 0;
  // Strict colour test first. Only if nothing with a net under it turns up
  // (dim gym, washed-out video) fall back to the tolerant, hue-based test.
  for (const tolerant of [false, true]) {
    for (const c of findRims(small, sw, sh, near && { x: near.x / k, y: near.y / k }, tolerant).slice(0, 20)) {
      const r = refineRim(full, fw, fh, { cx: c.cx * k, cy: c.cy * k, width: c.width * k }, tolerant);
      if (r.width < fw * 0.012) continue;
      const score = c.score * (0.15 + Math.min(2, r.net)) * (tolerant ? 0.6 : 1);
      if (score > bestScore) { bestScore = score; best = { cx: r.cx, cy: r.cy, width: r.width }; }
    }
    if (bestScore > 3) break;
  }
  return best;
}
