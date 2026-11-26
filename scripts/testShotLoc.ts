// Runs make/miss + flight trace-back over a recorded video and prints where
// each shot was released (video pixels). With --dump it also writes a picture
// of the release frame with the traced flight drawn on it.
//
//   npx tsx scripts/testShotLoc.ts <video> <rimCx> <rimCy> <rimWidth> [--dump dir]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ShotDetector, ROI_W, ROI_H, RIM_PX, RIM_CX, RIM_CY, roiRect, type FrameDebug, type RimBox } from "../src/lib/shotcam/detector";
import { FlightTracker } from "../src/lib/shotcam/flight";

const args = process.argv.slice(2);
const di = args.indexOf("--dump");
const dumpDir = di >= 0 ? args.splice(di, 2)[1] : null;
const [video, cx, cy, rw] = args;
const fps = 30;
const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video]).toString().trim().split(",");
const W = Number(probe[0]), H = Number(probe[1]);
const rim: RimBox = { cx: Number(cx), cy: Number(cy), width: Number(rw) };
const LOW_W = 480, K = W / LOW_W, LOW_H = Math.round(H / K);
const ballLow = (rim.width * 0.52) / K;

const det = new ShotDetector(), flight = new FlightTracker(LOW_W, LOW_H);
const roi = new Uint8ClampedArray(ROI_W * ROI_H * 4), low = new Uint8ClampedArray(LOW_W * LOW_H * 4);
const dbg: FrameDebug = { balls: [], netFill: 0, phase: "idle", drift: null };
const keep: { t: number; frame: Buffer }[] = []; // recent full frames for --dump
if (dumpDir) mkdirSync(dumpDir, { recursive: true });

function sampleRoi(frame: Buffer) {
  const r = roiRect(rim);
  for (let y = 0; y < ROI_H; y++) for (let x = 0; x < ROI_W; x++) {
    const fx = Math.max(0, Math.min(W - 1, Math.round(r.x + (x + 0.5) * r.scale - 0.5))), fy = Math.max(0, Math.min(H - 1, Math.round(r.y + (y + 0.5) * r.scale - 0.5)));
    const o = (y * ROI_W + x) * 4, s = (fy * W + fx) * 3;
    roi[o] = frame[s]; roi[o + 1] = frame[s + 1]; roi[o + 2] = frame[s + 2]; roi[o + 3] = 255;
  }
}
function sampleLow(frame: Buffer) {
  const k = Math.round(K);
  for (let y = 0; y < LOW_H; y++) for (let x = 0; x < LOW_W; x++) {
    let r = 0, g = 0, b = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const s = ((y * k + dy) * W + x * k + dx) * 3; r += frame[s]; g += frame[s + 1]; b += frame[s + 2]; }
    const o = (y * LOW_W + x) * 4, n = k * k;
    low[o] = r / n; low[o + 1] = g / n; low[o + 2] = b / n; low[o + 3] = 255;
  }
}

const frameBytes = W * H * 3;
const ff = spawn("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=${fps}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
let pending: Buffer[] = [], have = 0, frameNo = 0, shotNo = 0;
ff.stdout.on("data", (chunk: Buffer) => {
  pending.push(chunk); have += chunk.length;
  while (have >= frameBytes) {
    const all = Buffer.concat(pending);
    const frame = all.subarray(0, frameBytes);
    pending = [all.subarray(frameBytes)]; have -= frameBytes;
    const t = (frameNo++ / fps) * 1000;
    sampleRoi(frame); sampleLow(frame);
    flight.process(low, t, ballLow);
    const ev = det.process(roi, t, dbg);
    if (dumpDir) { keep.push({ t, frame: Buffer.from(frame) }); while (keep.length > 100) keep.shift(); }
    if (ev) {
      shotNo++;
      const q = roiRect(rim);
      const tail = ev.path.map((p) => ({ t: p.t, x: (q.x + (RIM_CX + p.x * RIM_PX) * q.scale) / K, y: (q.y + (RIM_CY + p.y * RIM_PX) * q.scale) / K }));
      const track = flight.traceBack(tail, ballLow);
      const rel = track[0];
      console.log(`#${shotNo} ${ev.result.toUpperCase()} rim@${(ev.t / 1000).toFixed(2)}s  release@${(rel.t / 1000).toFixed(2)}s at (${Math.round(rel.x * K)},${Math.round(rel.y * K)})  flight ${((ev.t - rel.t) / 1000).toFixed(2)}s  ${track.length} pts (tail ${tail.length})`);
      if (dumpDir) {
        const src = keep.reduce((a, b) => (Math.abs(b.t - rel.t) < Math.abs(a.t - rel.t) ? b : a)).frame;
        const img = Buffer.from(src);
        const dot = (x: number, y: number, r: number, c: number[]) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = Math.round(x) + dx, Y = Math.round(y) + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const o = (Y * W + X) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } };
        for (const p of track) dot(p.x * K, p.y * K, 3, [0, 255, 0]);
        dot(rel.x * K, rel.y * K, 8, [255, 0, 255]);
        writeFileSync(`${dumpDir}/rel_${shotNo}.ppm`, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), img]));
      }
    }
  }
});
