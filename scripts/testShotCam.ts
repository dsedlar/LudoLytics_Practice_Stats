// Runs the Shot Cam detector over a recorded video and prints every make/miss.
//
//   npx tsx scripts/testShotCam.ts <video> <rimCx> <rimCy> <rimWidth> [fps] [--dump dir]
//
// rimCx/rimCy/rimWidth are the rim centre and width in the video's own pixels
// (first frame). Requires ffmpeg on the PATH. --dump writes a picture of the
// hoop crop for every decided shot so results can be checked by eye.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ShotDetector, ROI_W, ROI_H, roiRect, type FrameDebug, type RimBox } from "../src/lib/shotcam/detector";

const args = process.argv.slice(2);
const dumpIdx = args.indexOf("--dump");
const dumpDir = dumpIdx >= 0 ? args.splice(dumpIdx, 2)[1] : null;
const verbose = args.includes("--verbose") ? (args.splice(args.indexOf("--verbose"), 1), true) : false;

if (!args[0] || !args[3]) { console.error("usage: testShotCam.ts <video> <rimCx> <rimCy> <rimWidth> [fps] [--dump dir]"); process.exit(1); }

const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const ss = Number(opt("--ss") ?? 0), dur = opt("--t"); // start offset / duration in seconds
const cropIdx = args.indexOf("--crop"); // x:y:w:h pre-crop (speeds things up); rim coords stay in full-video pixels
const crop = cropIdx >= 0 ? args.splice(cropIdx, 2)[1].split(":").map(Number) : null;
const [video, cx, cy, rw, fpsArg] = args;
const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", video]).toString().trim().split(",");
const W = crop ? crop[2] : Number(probe[0]), H = crop ? crop[3] : Number(probe[1]);
const fps = Number(fpsArg ?? 30);
const rim: RimBox = { cx: Number(cx) - (crop ? crop[0] : 0), cy: Number(cy) - (crop ? crop[1] : 0), width: Number(rw) };
const offX = crop ? crop[0] : 0, offY = crop ? crop[1] : 0;

// Crop + scale the ROI out of a full RGB frame (bilinear), like canvas drawImage does in the app.
function sampleRoi(frame: Buffer, out: Uint8ClampedArray) {
  const r = roiRect(rim);
  for (let y = 0; y < ROI_H; y++) for (let x = 0; x < ROI_W; x++) {
    const fx = r.x + (x + 0.5) * r.scale - 0.5, fy = r.y + (y + 0.5) * r.scale - 0.5;
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
    const o = (y * ROI_W + x) * 4;
    for (let c = 0; c < 3; c++) {
      const p = (yy: number, xx: number) => frame[(yy * W + xx) * 3 + c];
      out[o + c] = (p(y0, x0) * (1 - ax) + p(y0, x0 + 1) * ax) * (1 - ay) + (p(y0 + 1, x0) * (1 - ax) + p(y0 + 1, x0 + 1) * ax) * ay;
    }
    out[o + 3] = 255;
  }
}

const det = new ShotDetector();
const roi = new Uint8ClampedArray(ROI_W * ROI_H * 4);
const frameBytes = W * H * 3;
const ff = spawn("ffmpeg", ["-v", "error", "-ss", String(ss), ...(dur ? ["-t", dur] : []), "-i", video, "-vf", `fps=${fps}${crop ? `,crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}` : ""}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });

let pending = Buffer.alloc(0), frameNo = 0, makes = 0, misses = 0;
const dbg: FrameDebug = { balls: [], netFill: 0, phase: "idle", drift: null };
if (dumpDir) mkdirSync(dumpDir, { recursive: true });

ff.stdout.on("data", (chunk: Buffer) => {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= frameBytes) {
    const frame = pending.subarray(0, frameBytes);
    pending = pending.subarray(frameBytes);
    const t = (ss + frameNo / fps) * 1000;
    sampleRoi(frame, roi);
    const ev = det.process(roi, t, dbg);
    if (dbg.drift) { const s = rim.width / 32; rim.cx += dbg.drift.dx * s; rim.cy += dbg.drift.dy * s; }
    if (verbose && (dbg.balls.length || dbg.netFill > 0.05)) {
      console.log(`  f${frameNo} t=${(t / 1000).toFixed(2)} ${dbg.phase} net=${dbg.netFill.toFixed(2)} balls=${dbg.balls.map((b) => `(${(((b.x + b.w / 2) - ROI_W / 2) / 32).toFixed(2)},${(((b.y + b.h / 2) - 128) / 32).toFixed(2)})`).join(" ")}`);
    }
    if (ev) {
      if (ev.result === "make") makes++; else misses++;
      console.log(`${ev.result.toUpperCase().padEnd(4)} at ${(ev.t / 1000).toFixed(2)}s (decided ${(t / 1000).toFixed(2)}s)  rim=(${(rim.cx + offX).toFixed(0)},${(rim.cy + offY).toFixed(0)})`);
      if (dumpDir) {
        const ppm = Buffer.concat([Buffer.from(`P6\n${ROI_W} ${ROI_H}\n255\n`), Buffer.from(Array.from({ length: ROI_W * ROI_H * 3 }, (_, i) => roi[((i / 3) | 0) * 4 + (i % 3)]))]);
        writeFileSync(`${dumpDir}/shot_${String(makes + misses).padStart(2, "0")}_${ev.result}_${(ev.t / 1000).toFixed(1)}s.ppm`, ppm);
      }
    }
    frameNo++;
  }
});
ff.on("close", () => {
  const n = makes + misses;
  console.log(`\n${makes}/${n} made (${n ? Math.round((makes / n) * 100) : 0}%) — ${misses} missed — ${frameNo} frames @ ${fps}fps`);
});
