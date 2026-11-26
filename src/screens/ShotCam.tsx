// ---------------------------------------------------------------------------
// Shot Cam — camera-tracked shooting workouts (stage 1: makes & misses).
// ---------------------------------------------------------------------------
// The player picks one of the three program drills, props the phone up so it
// can see the hoop, marks the rim, and shoots. The camera counts makes and
// misses, runs the drill clock, and the result is saved to shot_cam_sessions.
// All video is processed on the phone — no footage is uploaded or stored.
// ---------------------------------------------------------------------------
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getPlayers, type PlayerRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import { ShotDetector, ROI_W, ROI_H, RIM_PX, RIM_CX, RIM_CY, roiRect, type FrameDebug, type RimBox } from "../lib/shotcam/detector";
import { CAM_DRILLS, camDrill, fmtClock, pctText, type CamDrill, type CamShot } from "../lib/shotcam/drills";
import { listCamSessions, saveCamSession, deleteCamSession, type CamSessionRow } from "../lib/shotcam/store";
import { FlightTracker } from "../lib/shotcam/flight";
import { applyH, calibrateFromLane, courtOutline, invertH, type Homography, type Pt } from "../lib/shotcam/geometry";
import { findFeet, loadPose } from "../lib/shotcam/pose";
import ShotCamChart, { ShotCamZones, HEAT, areaTotals } from "../components/ShotCamChart";
import type { ShotEvent } from "../lib/shotcam/detector";

type Stage = "pick" | "aim" | "countdown" | "live" | "review";
const MIN_RIM_PX = 22; // below this the hoop is too small in the picture to track well
const GRACE_MS = 1000; // a shot in the air at the buzzer still counts
const DEBUG = typeof location !== "undefined" && location.search.includes("debug"); // add ?debug to the address for tracking logs
const LOW_W = 480; // width of the low-res picture used to follow the ball's flight
const KEEP_W = 960; // width of the remembered frames used to find the shooter's feet
const KEEP_N = 36, KEEP_EVERY_MS = 95; // ~3.4 seconds of history

// ---- sound ----------------------------------------------------------------
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = audio ?? new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* no sound available — carry on silently */ }
}
function beep(freq: number, ms: number, vol = 0.25) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.frequency.value = freq; o.type = "square";
  g.gain.setValueAtTime(vol, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(audio.currentTime + ms / 1000);
}
const sound = {
  make: () => { beep(880, 120); setTimeout(() => beep(1320, 160), 110); },
  miss: () => beep(220, 220),
  tick: () => beep(660, 90),
  go: () => beep(990, 600),
  buzzer: () => beep(180, 1100, 0.35),
};

export default function ShotCam() {
  const { isPlayer, playerId: myPlayerId } = useAuth();
  const [stage, setStage] = useState<Stage>("pick");
  const [drill, setDrill] = useState<CamDrill | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [forPlayer, setForPlayer] = useState<string>(""); // staff: who is shooting ("" = practice run, not saved)
  const [history, setHistory] = useState<CamSessionRow[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [isFile, setIsFile] = useState(false);
  const [rim, setRimState] = useState<RimBox | null>(null);
  const [taps, setTaps] = useState<{ x: number; y: number }[]>([]);
  const [fps, setFps] = useState(0);
  const [shots, setShots] = useState<CamShot[]>([]);
  const [elapsed, setElapsed] = useState(0); // ms on the drill clock
  const [countdown, setCountdown] = useState(0);
  const [finalMs, setFinalMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);
  const [aimStep, setAimStep] = useState<"rim" | "court">("rim");
  const [courtTaps, setCourtTaps] = useState<Pt[]>([]);
  const [court, setCourt] = useState<{ toCourt: Homography; toImg: Homography } | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const roiCanvas = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const det = useRef(new ShotDetector());
  const rimRef = useRef<RimBox | null>(null);
  const stageRef = useRef<Stage>("pick");
  const drillRef = useRef<CamDrill | null>(null);
  const shotsRef = useRef<CamShot[]>([]);
  const startRef = useRef(0); // clock value when the drill started
  const goAtRef = useRef(0); // clock value when the countdown ends
  const lastTickRef = useRef(-1);
  const buzzedRef = useRef(false);
  const autoRef = useRef({ makes: 0, attempts: 0 });
  const boxesRef = useRef(false);
  const isFileRef = useRef(false);
  const courtRef = useRef<{ toCourt: Homography; toImg: Homography } | null>(null);
  const courtTapsRef = useRef<Pt[]>([]);
  const flightRef = useRef<FlightTracker | null>(null);
  const lowCanvas = useRef<HTMLCanvasElement | null>(null);
  const keepRef = useRef<{ t: number; canvas: HTMLCanvasElement }[]>([]);
  const keepIdx = useRef(0);
  const keepAt = useRef(-1e9);
  const shotSeq = useRef(0);
  const arcsRef = useRef<{ id: number; made: boolean; pts: Pt[] }[]>([]); // traced flights, video pixels
  courtRef.current = court; courtTapsRef.current = courtTaps;

  stageRef.current = stage; drillRef.current = drill; boxesRef.current = showBoxes; isFileRef.current = isFile;

  const playerId = isPlayer ? myPlayerId : forPlayer || null;
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";

  const setRim = useCallback((r: RimBox | null) => { rimRef.current = r; setRimState(r); det.current.reset(); }, []);
  const clock = useCallback(() => (isFileRef.current ? (videoRef.current?.currentTime ?? 0) * 1000 : performance.now()), []);

  const loadHistory = useCallback(() => { listCamSessions().then(setHistory).catch(() => setHistory([])); }, []);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    getPlayers().then((p) => setPlayers(p.filter((x) => x.active))).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  // ---- camera / video source ----------------------------------------------
  const stopSource = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = null; }
    const v = videoRef.current;
    if (v) { v.pause(); v.srcObject = null; v.removeAttribute("src"); v.load(); }
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setVideoSize(null);
  }, []);
  useEffect(() => stopSource, [stopSource]); // release the camera when leaving the screen

  async function startCamera() {
    setError("");
    unlockAudio();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't open the camera. Use Safari on iPhone or Chrome on Android.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;
      setIsFile(false); isFileRef.current = false;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      try { wakeRef.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* screen may dim — not fatal */ }
    } catch (e) {
      const err = e as Error;
      setError(err.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access for this site in your browser settings, then try again." : err.message);
      setStage("pick");
    }
  }

  async function startFile(file: File) {
    setError("");
    unlockAudio();
    stopSource();
    const url = URL.createObjectURL(file);
    fileUrlRef.current = url;
    setIsFile(true); isFileRef.current = true;
    const v = videoRef.current!;
    v.src = url;
    // Hold on the first frame while the rim is marked; the drill restarts it from the top.
    v.onloadeddata = () => { v.pause(); v.currentTime = 0; };
    v.onerror = () => { setError("That video can't be played in this browser."); setStage("pick"); };
    v.load();
  }

  function chooseDrill(d: CamDrill, file?: File) {
    setDrill(d); setNotice(""); setShots([]); shotsRef.current = [];
    setAimStep("rim");
    if (file) { setRim(null); setCourt(null); setCourtTaps([]); }
    setStage("aim");
    if (file) void startFile(file);
    else if (!streamRef.current) void startCamera();
  }

  // ---- shots ----------------------------------------------------------------
  const pushShots = (next: CamShot[]) => { shotsRef.current = next; setShots(next); };

  const endDrill = useCallback((ms: number) => {
    if (stageRef.current !== "live") return;
    setFinalMs(ms);
    stageRef.current = "review";
    setStage("review");
    if (isFileRef.current) videoRef.current?.pause();
  }, []);

  const addShot = useCallback((made: boolean, src: CamShot["src"], tAbs: number) => {
    const d = drillRef.current;
    if (stageRef.current !== "live" || !d) return;
    const t = Math.max(0, Math.round(tAbs - startRef.current));
    if (d.seconds && t > d.seconds * 1000 + GRACE_MS) return;
    if (d.attempts && shotsRef.current.length >= d.attempts) return;
    if (src === "cam") { autoRef.current.attempts++; if (made) autoRef.current.makes++; }
    const id = ++shotSeq.current;
    pushShots([...shotsRef.current, { t, made, src, id }]);
    (made ? sound.make : sound.miss)();
    if (d.attempts && shotsRef.current.length >= d.attempts) { sound.buzzer(); endDrill(t); }
    return id;
  }, [endDrill]);

  // Work out where a shot was taken from: follow the ball back from the rim to
  // the release, find that player's feet in a remembered frame, map to the court.
  const locateShot = useCallback(async (ev: ShotEvent, id: number) => {
    const c = courtRef.current, r = rimRef.current, fl = flightRef.current, v = videoRef.current;
    if (!r || !fl || !v || !v.videoWidth) return;
    const K = v.videoWidth / LOW_W, q = roiRect(r), ballLow = (r.width * 0.52) / K;
    const tail = ev.path.map((p) => ({ t: p.t, x: (q.x + (RIM_CX + p.x * RIM_PX) * q.scale) / K, y: (q.y + (RIM_CY + p.y * RIM_PX) * q.scale) / K }));
    const track = fl.traceBack(tail, ballLow);
    const rel = track[0];
    if (!rel || ev.t - rel.t < 450 || Math.hypot(rel.x * K - r.cx, rel.y * K - r.cy) < r.width * 3) return; // couldn't follow the flight
    // The arc to draw: the traced flight, ending at the rim.
    const pts = track.map((p) => ({ x: p.x * K, y: p.y * K }));
    pts.push({ x: r.cx, y: r.cy });
    arcsRef.current = [...arcsRef.current.slice(-11), { id, made: ev.result === "make", pts }];
    if (!c) return; // court not marked: arcs only, no shot chart
    const frames = keepRef.current.filter((f) => f.t > -1e8);
    if (!frames.length) return;
    const want = rel.t - 250; // just before the release, feet still on the floor
    const fr = frames.reduce((a, b) => (Math.abs(b.t - want) < Math.abs(a.t - want) ? b : a));
    const F = fr.canvas.width / v.videoWidth;
    const feet = await findFeet(fr.canvas, { x: rel.x * K * F, y: rel.y * K * F });
    if (DEBUG) console.info("shotcam locate", id, "release", Math.round(rel.x * K), Math.round(rel.y * K), "flight ms", Math.round(ev.t - rel.t), "feet", feet && Math.round(feet.x / F), feet && Math.round(feet.y / F));
    if (!feet) return;
    const pt = applyH(c.toCourt, { x: feet.x / F, y: feet.y / F });
    if (!isFinite(pt.x) || !isFinite(pt.y) || pt.x < -4 || pt.x > 54 || pt.y < -4 || pt.y > 50) return;
    pushShots(shotsRef.current.map((s) => (s.id === id ? { ...s, x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 } : s)));
  }, []);

  function undoLast() { pushShots(shotsRef.current.slice(0, -1)); }

  function beginCountdown() {
    unlockAudio();
    pushShots([]); autoRef.current = { makes: 0, attempts: 0 };
    flightRef.current?.reset(); keepRef.current.forEach((f) => { f.t = -1e9; }); keepAt.current = -1e9;
    arcsRef.current = [];
    setError("");
    buzzedRef.current = false; lastTickRef.current = -1;
    setElapsed(0);
    if (isFile) {
      // Recorded video: play it from the start with the clock at zero.
      const v = videoRef.current!;
      det.current.reset();
      v.currentTime = 0;
      goAtRef.current = 0;
      void v.play();
    } else goAtRef.current = clock() + 10000;
    setStage("countdown");
  }

  // ---- processing loop ------------------------------------------------------
  const active = stage === "aim" || stage === "countdown" || stage === "live";
  useEffect(() => {
    if (!active) return;
    const v = videoRef.current;
    if (!v) return;
    if (!roiCanvas.current) { roiCanvas.current = document.createElement("canvas"); roiCanvas.current.width = ROI_W; roiCanvas.current.height = ROI_H; }
    const ctx = roiCanvas.current.getContext("2d", { willReadFrequently: true })!;
    const dbg: FrameDebug = { balls: [], netFill: 0, phase: "idle", drift: null };
    let stop = false, frames = 0, fpsAt = performance.now(), raf = 0, vfc = 0, watchdog = 0;
    const hasVfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    let lastMedia = -1, camOffset: number | null = null;
    // While the video is playing, run once per video frame and take that frame's
    // exact timestamp (the ball's path is fitted against time, so jitter matters).
    // A paused recording has no new frames, so fall back to the display clock —
    // and a watchdog keeps the drill clock alive if frames stop arriving.
    const schedule = () => {
      if (stop) return;
      if (hasVfc && !v.paused) {
        vfc = v.requestVideoFrameCallback((_n, meta) => step(meta.mediaTime));
        watchdog = window.setTimeout(() => { v.cancelVideoFrameCallback(vfc); vfc = 0; step(); }, 700);
      } else raf = requestAnimationFrame(() => step());
    };

    function step(mediaTime?: number) {
      if (stop || !v) return;
      clearTimeout(watchdog);
      if (v.videoWidth && (!videoSizeRef.current || videoSizeRef.current.w !== v.videoWidth || videoSizeRef.current.h !== v.videoHeight)) {
        videoSizeRef.current = { w: v.videoWidth, h: v.videoHeight };
        setVideoSize(videoSizeRef.current);
      }
      const now = clock();
      // this frame's own time, on the same timeline as the drill clock
      let ft = now;
      if (mediaTime != null) {
        if (isFileRef.current) ft = mediaTime * 1000;
        else { camOffset ??= now - mediaTime * 1000; ft = mediaTime * 1000 + camOffset; }
      }
      const r = rimRef.current;
      if (r && v.readyState >= 2) {
        const q = roiRect(r);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ROI_W, ROI_H);
        ctx.drawImage(v, q.x, q.y, q.w, q.h, 0, 0, ROI_W, ROI_H);
        // Only feed the tracker new pictures (a paused or slow video repeats frames).
        const stamp = mediaTime ?? v.currentTime;
        if (!isFileRef.current || stamp !== lastMedia) {
          lastMedia = stamp;
          const img = ctx.getImageData(0, 0, ROI_W, ROI_H);
          const ev = det.current.process(img.data, ft, dbg);
          if (dbg.drift) { r.cx += dbg.drift.dx * q.scale; r.cy += dbg.drift.dy * q.scale; }
          if (ev && stageRef.current === "live") {
            const id = addShot(ev.result === "make", "cam", ev.t);
            if (id) setTimeout(() => void locateShot(ev, id), 0); // after this frame's work is done
          }
          watchFlight(ft, r);
        }
        drawZoom();
      }
      drawOverlay(dbg);

      // drill clock
      const st = stageRef.current, d = drillRef.current;
      if (st === "countdown") {
        const left = goAtRef.current - now;
        const sec = Math.ceil(left / 1000);
        if (sec !== lastTickRef.current) { lastTickRef.current = sec; setCountdown(Math.max(0, sec)); if (sec > 0 && sec <= 3) sound.tick(); }
        if (left <= 0) { startRef.current = goAtRef.current; sound.go(); stageRef.current = "live"; setStage("live"); }
      } else if (st === "live" && d) {
        const ms = now - startRef.current;
        if (d.seconds) {
          const limit = d.seconds * 1000;
          if (ms >= limit && !buzzedRef.current) { buzzedRef.current = true; sound.buzzer(); }
          if (ms >= limit + GRACE_MS + 300) endDrill(limit);
        }
      }

      frames++;
      const real = performance.now();
      if (real - fpsAt >= 1000) {
        setFps(Math.round((frames * 1000) / (real - fpsAt))); frames = 0; fpsAt = real;
        if (stageRef.current === "live") setElapsed(clock() - startRef.current);
      }
      schedule();
    }

    // Low-res view of the whole picture (to follow the ball) + a short memory of
    // frames (to find the shooter) — only when the court has been marked.
    function watchFlight(now: number, r: RimBox) {
      const st = stageRef.current;
      if ((st !== "live" && st !== "countdown") || !v || !v.videoWidth) return;
      const lowH = Math.round((LOW_W * v.videoHeight) / v.videoWidth);
      if (!lowCanvas.current) lowCanvas.current = document.createElement("canvas");
      const lc = lowCanvas.current;
      if (lc.width !== LOW_W || lc.height !== lowH) { lc.width = LOW_W; lc.height = lowH; flightRef.current = null; }
      if (!flightRef.current) flightRef.current = new FlightTracker(LOW_W, lowH);
      const lctx = lc.getContext("2d", { willReadFrequently: true })!;
      lctx.drawImage(v, 0, 0, LOW_W, lowH);
      flightRef.current.process(lctx.getImageData(0, 0, LOW_W, lowH).data, now, (r.width * 0.52 * LOW_W) / v.videoWidth);
      if (courtRef.current && (now - keepAt.current >= KEEP_EVERY_MS || now < keepAt.current)) {
        keepAt.current = now;
        const kh = Math.round((KEEP_W * v.videoHeight) / v.videoWidth);
        if (keepRef.current.length < KEEP_N) keepRef.current.push({ t: -1e9, canvas: document.createElement("canvas") });
        const slot = keepRef.current[keepIdx.current++ % keepRef.current.length];
        if (slot.canvas.width !== KEEP_W || slot.canvas.height !== kh) { slot.canvas.width = KEEP_W; slot.canvas.height = kh; }
        slot.canvas.getContext("2d")!.drawImage(v, 0, 0, KEEP_W, kh);
        slot.t = now;
      }
    }

    function drawZoom() {
      const z = zoomRef.current;
      if (!z || stageRef.current !== "aim") return;
      const c = z.getContext("2d")!;
      c.imageSmoothingEnabled = false;
      c.drawImage(roiCanvas.current!, 0, 0, z.width, z.height);
      const k = z.width / ROI_W;
      // net box
      c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1; c.setLineDash([4, 3]);
      c.strokeRect((RIM_CX - RIM_PX / 2) * k, RIM_CY * k, RIM_PX * k, RIM_PX * k);
      c.setLineDash([]);
      // rim line
      c.strokeStyle = "#22c55e"; c.lineWidth = 3;
      c.beginPath(); c.moveTo((RIM_CX - RIM_PX / 2) * k, RIM_CY * k); c.lineTo((RIM_CX + RIM_PX / 2) * k, RIM_CY * k); c.stroke();
    }

    function drawOverlay(d: FrameDebug) {
      const o = overlayRef.current;
      if (!o || !v || !v.videoWidth) return;
      if (o.width !== v.videoWidth || o.height !== v.videoHeight) { o.width = v.videoWidth; o.height = v.videoHeight; }
      const c = o.getContext("2d")!;
      c.clearRect(0, 0, o.width, o.height);
      const lw = Math.max(2, o.width / 320);
      const r = rimRef.current;
      for (const p of tapsRef.current) { c.fillStyle = "#22c55e"; c.beginPath(); c.arc(p.x, p.y, lw * 2.5, 0, Math.PI * 2); c.fill(); }
      if (stageRef.current === "aim") {
        // court marking: the taps, and the painted lines as we think they lie
        for (const p of courtTapsRef.current) { c.fillStyle = "#facc15"; c.beginPath(); c.arc(p.x, p.y, lw * 2.5, 0, Math.PI * 2); c.fill(); }
        const ct = courtRef.current;
        if (ct) {
          c.strokeStyle = "#facc15"; c.lineWidth = lw;
          for (const line of courtOutline()) {
            c.beginPath();
            line.forEach((pt, i) => { const q2 = applyH(ct.toImg, pt); if (i) c.lineTo(q2.x, q2.y); else c.moveTo(q2.x, q2.y); });
            c.stroke();
          }
        }
      }
      if (!r) return;
      const q = roiRect(r);
      if (stageRef.current === "live") {
        // shot arcs: green for makes, red for misses; older ones fade
        const live = new Set(shotsRef.current.map((s2) => s2.id));
        const arcs = arcsRef.current.filter((a) => live.has(a.id));
        c.lineCap = "round"; c.lineJoin = "round";
        arcs.forEach((a, i) => {
          const age = arcs.length - 1 - i;
          c.globalAlpha = Math.max(0.18, 0.9 - age * 0.14);
          c.strokeStyle = a.made ? "#22c55e" : "#ef4444";
          c.lineWidth = Math.max(3, r.width * 0.16);
          c.beginPath();
          c.moveTo(a.pts[0].x, a.pts[0].y);
          for (let k = 1; k < a.pts.length - 1; k++) c.quadraticCurveTo(a.pts[k].x, a.pts[k].y, (a.pts[k].x + a.pts[k + 1].x) / 2, (a.pts[k].y + a.pts[k + 1].y) / 2);
          c.lineTo(a.pts[a.pts.length - 1].x, a.pts[a.pts.length - 1].y);
          c.stroke();
        });
        c.globalAlpha = 1;
        return; // keep the picture clean during the drill (no rim box)
      }
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = lw / 2; c.strokeRect(q.x, q.y, q.w, q.h);
      c.strokeStyle = "#22c55e"; c.lineWidth = lw;
      c.beginPath(); c.moveTo(r.cx - r.width / 2, r.cy); c.lineTo(r.cx + r.width / 2, r.cy); c.stroke();
      if (boxesRef.current) {
        c.strokeStyle = "#facc15"; c.lineWidth = lw / 2;
        for (const b of d.balls) c.strokeRect(q.x + b.x * q.scale, q.y + b.y * q.scale, b.w * q.scale, b.h * q.scale);
      }
    }

    schedule();
    return () => { stop = true; clearTimeout(watchdog); cancelAnimationFrame(raf); if (hasVfc && vfc) v.cancelVideoFrameCallback(vfc); };
  }, [active, isFile, addShot, locateShot, clock, endDrill]);

  const videoSizeRef = useRef<{ w: number; h: number } | null>(null);
  const tapsRef = useRef<{ x: number; y: number }[]>([]);
  tapsRef.current = taps;
  useEffect(() => { if (!videoSize) videoSizeRef.current = null; }, [videoSize]);

  // ---- aiming ---------------------------------------------------------------
  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (stage !== "aim" || !videoSize) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * videoSize.w, y: ((e.clientY - rect.top) / rect.height) * videoSize.h };
    if (aimStep === "court") {
      if (!rim) return;
      const next = courtTaps.length >= 4 ? [p] : [...courtTaps, p];
      setCourtTaps(next);
      if (next.length < 4) { setCourt(null); return; }
      const toCourt = calibrateFromLane(next, { x: rim.cx, y: rim.cy });
      const toImg = toCourt && invertH(toCourt);
      if (toCourt && toImg) { setCourt({ toCourt, toImg }); void loadPose(); }
      else { setCourt(null); setCourtTaps([]); setError("Those four points don't make a lane — tap its four corners again."); }
      return;
    }
    if (taps.length !== 1) { setTaps([p]); setRim(null); return; }
    const a = taps[0];
    const width = Math.hypot(p.x - a.x, p.y - a.y);
    setTaps([]);
    if (width < 8) return;
    setRim({ cx: (a.x + p.x) / 2, cy: (a.y + p.y) / 2, width });
  }
  function nudge(dx: number, dy: number, grow = 1) {
    const r = rimRef.current;
    if (!r) return;
    const s = r.width / RIM_PX;
    setRim({ cx: r.cx + dx * s, cy: r.cy + dy * s, width: r.width * grow });
  }

  // ---- review / save ---------------------------------------------------------
  const makes = shots.filter((s) => s.made).length;
  const flip = (i: number) => pushShots(shots.map((s, k) => (k === i ? { ...s, made: !s.made, edited: !s.edited } : s)));
  const addManual = (made: boolean) => pushShots([...shots, { t: finalMs, made, src: "manual" }]);

  async function save() {
    if (!drill || !playerId) return;
    setSaving(true); setError("");
    try {
      await saveCamSession({
        player_id: playerId, drill: drill.key, makes, attempts: shots.length, duration_ms: Math.round(finalMs),
        auto_makes: autoRef.current.makes, auto_attempts: autoRef.current.attempts,
        shots: shots.map(({ id: _id, ...rest }) => rest),
      });
      setNotice(`Saved — ${drill.label}: ${makes}/${shots.length} (${pctText(makes, shots.length)})`);
      loadHistory();
      setStage("pick");
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }
  function discard() { setStage("pick"); setNotice(""); }
  function leave() { stopSource(); setRim(null); setTaps([]); setCourt(null); setCourtTaps([]); setAimStep("rim"); setStage("pick"); }

  async function removeSession(id: string) {
    if (!window.confirm("Delete this Shot Cam workout?")) return;
    try { await deleteCamSession(id); loadHistory(); } catch (e) { setError((e as Error).message); }
  }

  // ---- render ----------------------------------------------------------------
  const showVideo = active;
  const clockText = drill?.seconds ? fmtClock(Math.max(0, drill.seconds * 1000 - elapsed)) : fmtClock(elapsed);
  const rimTooSmall = !!rim && rim.width < MIN_RIM_PX;
  const frameStyle = videoSize
    ? { aspectRatio: `${videoSize.w} / ${videoSize.h}`, width: `min(100%, calc(${stage === "aim" ? 62 : 46}vh * ${videoSize.w / videoSize.h}))` }
    : { aspectRatio: "16 / 9", width: "100%" };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-[11px] text-garnet mb-1">Shooting Workouts</div>
          <h1 className="text-3xl headline-bold text-garnet">Shot Cam</h1>
        </div>
        {stage === "pick" ? <Link to="/" className="text-sm text-garnet underline">← Home</Link>
          : <button onClick={leave} className="text-sm text-garnet underline">✕ Quit</button>}
      </div>

      {error && <p role="alert" className="mt-3 bg-red-50 border border-red-200 text-red-800 rounded px-3 py-2 text-sm">{error}</p>}
      {notice && stage === "pick" && <p className="mt-3 bg-green-50 border border-green-200 text-green-800 rounded px-3 py-2 text-sm font-medium">{notice}</p>}

      {/* ---- 1. pick a drill ---- */}
      {stage === "pick" && (
        <div className="mt-4">
          {!isPlayer && (
            <label className="block mb-4 text-sm">
              <span className="font-semibold">Who is shooting?</span>
              <select value={forPlayer} onChange={(e) => setForPlayer(e.target.value)} className="mt-1 block w-full border rounded px-3 py-2 bg-white">
                <option value="">Practice run — don't save</option>
                {players.map((p) => <option key={p.id} value={p.id}>{p.jersey ? `#${p.jersey} ` : ""}{p.name}</option>)}
              </select>
            </label>
          )}
          {isPlayer && !myPlayerId && <p className="mb-4 text-sm text-gray-600">Your account isn't linked to a player yet, so workouts can't be saved — ask your coach.</p>}
          <p className="text-gray-700">Pick a drill. Prop your phone up where it can see the whole hoop, and the camera does the counting.</p>
          <div className="mt-3 grid sm:grid-cols-3 gap-3">
            {CAM_DRILLS.map((d) => (
              <div key={d.key} className="bg-white border rounded-lg p-4 flex flex-col">
                <div className="headline-bold text-xl text-garnet">{d.label}</div>
                <div className="text-sm text-gray-600 flex-1">{d.blurb}</div>
                <button onClick={() => chooseDrill(d)} className="mt-3 bg-garnet text-white rounded-lg px-4 py-3 font-semibold">Start →</button>
                <label className="mt-2 text-xs text-gray-500 underline cursor-pointer text-center">
                  or test with a recorded video
                  <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) chooseDrill(d, f); }} />
                </label>
              </div>
            ))}
          </div>

          <details className="mt-4 bg-white border rounded-lg px-4 py-3 text-sm text-gray-700">
            <summary className="font-semibold text-garnet cursor-pointer">Setting up your phone</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Use a tripod or lean the phone on something solid. It must not move during the drill.</li>
              <li>Stand it off to the side, 15–30 feet from the hoop, with the rim, net and some space above the rim in the picture.</li>
              <li>One ball and one shooter. A rebounder is fine — just keep extra balls out of the air.</li>
              <li>Turn your volume up: a high beep is a make, a low beep is a miss. Fix any wrong call before you save.</li>
            </ul>
          </details>

          <h2 className="mt-6 headline-bold text-lg text-garnet">Recent Shot Cam workouts</h2>
          {history.length === 0 ? <p className="text-sm text-gray-500 mt-1">None yet.</p> : (
            <div className="mt-2 bg-white border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b">
                  <th className="p-2">Date</th>{!isPlayer && <th className="p-2">Player</th>}<th className="p-2">Drill</th><th className="p-2">Makes</th><th className="p-2">%</th><th className="p-2">Time</th><th className="p-2" />
                </tr></thead>
                <tbody>
                  {history.map((h) => (
                    <Fragment key={h.id}>
                    <tr className="border-b last:border-0">
                      <td className="p-2 whitespace-nowrap">{h.workout_date}</td>
                      {!isPlayer && <td className="p-2">{playerName(h.player_id)}</td>}
                      <td className="p-2">{camDrill(h.drill)?.label ?? h.drill}</td>
                      <td className="p-2 font-semibold">{h.makes}/{h.attempts}</td>
                      <td className="p-2">{pctText(h.makes, h.attempts)}</td>
                      <td className="p-2">{fmtClock(h.duration_ms)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        {h.shots?.some((x) => x.x != null) && <button onClick={() => setOpenSession(openSession === h.id ? null : h.id)} className="text-xs text-garnet underline mr-3">{openSession === h.id ? "Hide chart" : "Shot chart"}</button>}
                        <button onClick={() => removeSession(h.id)} className="text-xs text-gray-400 hover:text-garnet">Delete</button>
                      </td>
                    </tr>
                    {openSession === h.id && (
                      <tr className="border-b last:border-0"><td colSpan={isPlayer ? 6 : 7} className="p-3"><ZoneReport shots={h.shots} /></td></tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- camera picture (aim / countdown / live) ---- */}
      <div className={showVideo ? "mt-4" : "hidden"}>
        <div className="relative mx-auto bg-black rounded-lg overflow-hidden" style={frameStyle}>
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full" onEnded={() => { if (stageRef.current === "live") endDrill(clock() - startRef.current); }} />
          <canvas ref={overlayRef} onPointerDown={onTap} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: stage === "aim" ? "crosshair" : "default" }} />
          {/* mini shot chart */}
          {court && (stage === "live" || stage === "countdown") && (
            <div className="absolute top-0 right-[3%] w-[24%] min-w-[92px] pointer-events-none bg-black/55 rounded-b-lg px-1.5 pb-1.5 pt-1">
              <ShotCamChart shots={shots} dark markSize={1.5} />
            </div>
          )}
          {/* on-video scoreboard + Ludo Arc badge */}
          {(stage === "live" || stage === "countdown") && (
            <div className="absolute inset-x-0 bottom-0 pointer-events-none text-white flex items-end justify-between gap-2 px-[3%] pb-[2.5%] pt-[9%] bg-gradient-to-t from-black/75 to-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <img src="/ludo-arc.png" alt="" className="rounded-md flex-shrink-0" style={{ width: "clamp(26px, 7vw, 52px)", height: "clamp(26px, 7vw, 52px)" }} />
                <div className="leading-tight min-w-0">
                  <div className="text-white/80" style={{ fontSize: "clamp(8px, 1.9vw, 13px)" }}>Powered by</div>
                  <div className="headline-bold" style={{ fontSize: "clamp(13px, 3.4vw, 24px)" }}>Ludo Arc</div>
                </div>
              </div>
              <div className="flex items-end gap-3 flex-shrink-0" aria-hidden="true">
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 8vw, 60px)" }}>{makes}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.6vw, 11px)" }}>Makes</div></div>
                <div className="bg-white/60 self-stretch" style={{ width: 2 }} />
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 8vw, 60px)" }}>{shots.length}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.6vw, 11px)" }}>Attempts</div></div>
                <div className="bg-white/60 self-stretch" style={{ width: 2 }} />
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 8vw, 60px)" }}>{clockText}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.6vw, 11px)" }}>{drill?.seconds ? "Left" : "Time"}</div></div>
              </div>
            </div>
          )}
          {stage === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
              <div className="text-center"><div className="eyebrow text-xs">Get ready</div><div className="data-bold text-8xl">{countdown}</div></div>
            </div>
          )}
        </div>
      </div>

      {/* ---- 2. aim ---- */}
      {stage === "aim" && drill && (
        <div className="mt-3">
          <h2 className="headline-bold text-xl text-garnet">{drill.label} — {aimStep === "rim" ? "mark the rim" : "mark the court"}</h2>
          {aimStep === "rim" ? (
            <p className="text-sm text-gray-700">
              {!rim ? (taps.length === 0 ? "Tap the LEFT edge of the rim in the picture." : "Now tap the RIGHT edge of the rim.")
                : "Check the close-up: the green line should sit on the rim, edge to edge, with the net inside the dashed box."}
            </p>
          ) : (
            <div className="text-sm text-gray-700">
              {!court ? (
                <p>Tap the <b>four corners of the lane</b> (the painted rectangle under the basket: two corners on the baseline, two at the ends of the free-throw line), in any order. <b>{courtTaps.length % 4} of 4</b> marked.</p>
              ) : (
                <p>The yellow lines show where the app thinks your 3-point arc and lane are. If they sit on the painted lines, you're set. If not, tap <b>Redo court</b>.</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => { setCourt(null); setCourtTaps([]); }} className="border rounded px-3 py-2 bg-white text-xs">Redo court</button>
                <button onClick={() => { setCourt(null); setCourtTaps([]); setAimStep("rim"); }} className="border rounded px-3 py-2 bg-white text-xs">← Back to the rim</button>
              </div>
            </div>
          )}
          {rim && aimStep === "rim" && (
            <div className="mt-3 flex flex-wrap items-start gap-4">
              <canvas ref={zoomRef} width={ROI_W * 1.5} height={ROI_H * 1.5} className="rounded border bg-black" style={{ width: 224, height: 208 }} />
              <div className="text-sm">
                <div className="grid grid-cols-3 gap-1 w-36">
                  <span /><button onClick={() => nudge(0, -1)} className="border rounded py-2 bg-white" aria-label="Move up">↑</button><span />
                  <button onClick={() => nudge(-1, 0)} className="border rounded py-2 bg-white" aria-label="Move left">←</button>
                  <button onClick={() => { setRim(null); setTaps([]); }} className="border rounded py-2 bg-white text-xs">Redo</button>
                  <button onClick={() => nudge(1, 0)} className="border rounded py-2 bg-white" aria-label="Move right">→</button>
                  <span /><button onClick={() => nudge(0, 1)} className="border rounded py-2 bg-white" aria-label="Move down">↓</button><span />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 w-36">
                  <button onClick={() => nudge(0, 0, 1 / 1.04)} className="border rounded py-2 bg-white text-xs">Narrower</button>
                  <button onClick={() => nudge(0, 0, 1.04)} className="border rounded py-2 bg-white text-xs">Wider</button>
                </div>
                <p className="mt-2 text-xs text-gray-500">Camera speed: {fps} frames/sec</p>
              </div>
            </div>
          )}
          {rimTooSmall && <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">The hoop is very small in the picture — move the phone closer for better tracking.</p>}
          {rim && fps > 0 && fps < 14 && <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">This phone is processing slowly ({fps} frames/sec). Counting may be less reliable — close other apps and try again.</p>}
          {aimStep === "rim" && !court ? (
            <div className="mt-4 grid sm:grid-cols-2 gap-2">
              <button disabled={!rim} onClick={() => { setError(""); setAimStep("court"); }} className="bg-garnet text-white rounded-lg px-5 py-4 font-semibold text-lg disabled:opacity-40">Next: mark the court →</button>
              <button disabled={!rim} onClick={beginCountdown} className="border border-garnet text-garnet rounded-lg px-5 py-4 font-semibold disabled:opacity-40">Skip — just count makes</button>
            </div>
          ) : (
            <button disabled={!rim || (aimStep === "court" && !court)} onClick={beginCountdown} className="mt-4 w-full bg-garnet text-white rounded-lg px-5 py-4 font-semibold text-lg disabled:opacity-40">
              Start {drill.label} {isFile ? "" : "(10-second countdown)"}
            </button>
          )}
        </div>
      )}

      {/* ---- 3. live ---- */}
      {(stage === "live" || stage === "countdown") && drill && (
        <div className="mt-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">Makes</div><div className="data-bold text-5xl text-garnet">{makes}<span className="text-2xl text-gray-400">/{drill.attempts ?? shots.length}</span></div></div>
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">{drill.attempts ? "Shots" : "Percent"}</div><div className="data-bold text-5xl">{drill.attempts ? shots.length : pctText(makes, shots.length)}</div></div>
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">{drill.seconds ? "Time left" : "Time"}</div><div className="data-bold text-5xl">{clockText}</div></div>
          </div>
          {stage === "live" && (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button onClick={() => addShot(true, "manual", clock())} className="bg-green-600 text-white rounded-lg py-3 font-semibold">+ Make</button>
                <button onClick={() => addShot(false, "manual", clock())} className="bg-gray-700 text-white rounded-lg py-3 font-semibold">+ Miss</button>
                <button onClick={undoLast} disabled={!shots.length} className="border border-garnet text-garnet rounded-lg py-3 font-semibold disabled:opacity-40">Undo last</button>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600"><input type="checkbox" checked={showBoxes} onChange={(e) => setShowBoxes(e.target.checked)} /> Show ball tracking</label>
                <button onClick={() => endDrill(clock() - startRef.current)} className="text-garnet underline">End drill now</button>
              </div>
            </>
          )}
          {/* live half court: O = make, X = miss, where each shot was taken */}
          <div className="mt-3 bg-white border rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="eyebrow text-[10px] text-gray-500">Shot chart</div>
              <div className="text-xs text-gray-600"><span className="font-bold text-green-700">O</span> make · <span className="font-bold text-garnet">X</span> miss</div>
            </div>
            {court ? (
              <div className="max-w-xl mx-auto"><ShotCamChart shots={shots} markSize={1.1} /></div>
            ) : (
              <p className="text-sm text-gray-500">The court wasn't marked for this drill, so shots are counted but not placed. Next time choose “Mark the court” after marking the rim.</p>
            )}
          </div>
          <ShotStrip shots={shots} />
        </div>
      )}

      {/* ---- 4. review ---- */}
      {stage === "review" && drill && (
        <div className="mt-4">
          <h2 className="headline-bold text-xl text-garnet">{drill.label} — review</h2>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">Makes</div><div className="data-bold text-5xl text-garnet">{makes}<span className="text-2xl text-gray-400">/{shots.length}</span></div></div>
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">Percent</div><div className="data-bold text-5xl">{pctText(makes, shots.length)}</div></div>
            <div className="bg-white border rounded-lg py-3"><div className="eyebrow text-[10px] text-gray-500">Time</div><div className="data-bold text-5xl">{fmtClock(finalMs)}</div></div>
          </div>
          {shots.some((s) => s.x != null) && (
            <div className="mt-3 bg-white border rounded-lg p-3">
              <ZoneReport shots={shots} />
            </div>
          )}
          <p className="mt-3 text-sm text-gray-700">Did the camera get one wrong? Tap a shot to flip it between make and miss.</p>
          <ShotStrip shots={shots} onFlip={flip} />
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <button onClick={() => addManual(true)} className="border rounded px-3 py-2 bg-white">+ Add a make</button>
            <button onClick={() => addManual(false)} className="border rounded px-3 py-2 bg-white">+ Add a miss</button>
            <button onClick={undoLast} disabled={!shots.length} className="border rounded px-3 py-2 bg-white disabled:opacity-40">Remove last shot</button>
          </div>
          <div className="mt-5 grid sm:grid-cols-2 gap-2">
            <button onClick={save} disabled={saving || !playerId || !shots.length} className="bg-garnet text-white rounded-lg px-5 py-4 font-semibold text-lg disabled:opacity-40">
              {saving ? "Saving…" : playerId ? `Save for ${isPlayer ? "me" : playerName(playerId)}` : "Practice run — not saved"}
            </button>
            <button onClick={discard} className="border border-garnet text-garnet rounded-lg px-5 py-4 font-semibold">{playerId ? "Discard" : "Done"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// After the workout: percentage from each section of the court (blue = cold,
// orange = hot), the three headline areas, and where every shot was taken.
function ZoneReport({ shots }: { shots: CamShot[] }) {
  const areas = areaTotals(shots);
  const located = shots.filter((s) => s.x != null).length;
  const tiles: [string, { m: number; a: number }][] = [["In the paint", areas.paint], ["Mid range", areas.mid], ["3 point", areas.three]];
  return (
    <div>
      <div className="grid grid-cols-3 divide-x text-center mb-3">
        {tiles.map(([name, t]) => (
          <div key={name} className="px-1">
            <div className="data-bold text-3xl">{t.a ? pctText(t.m, t.a) : "–"}</div>
            <div className="eyebrow text-[10px] text-gray-500">{name}</div>
            <div className="text-xs text-gray-500">{t.a ? `${t.m}-${t.a}` : ""}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3 items-start">
        <div>
          <div className="eyebrow text-[10px] text-gray-500 mb-1">Percentage by section</div>
          <ShotCamZones shots={shots} />
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-600">
            <span>Cold</span>
            {HEAT.map((h) => <span key={h.label} title={h.label} className="inline-block h-2.5 flex-1 rounded-sm" style={{ background: h.color }} />)}
            <span>Hot</span>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="eyebrow text-[10px] text-gray-500">Where the shots came from</div>
            <div className="text-[10px] text-gray-600"><span className="font-bold text-green-700">O</span> make · <span className="font-bold text-garnet">X</span> miss</div>
          </div>
          <div className="border rounded-lg"><ShotCamChart shots={shots} /></div>
        </div>
      </div>
      {located < shots.length && <p className="mt-2 text-xs text-gray-500">{shots.length - located} of {shots.length} shots couldn't be placed on the court. They count in the overall total but not in the sections.</p>}
    </div>
  );
}

function ShotStrip({ shots, onFlip }: { shots: CamShot[]; onFlip?: (i: number) => void }) {
  if (!shots.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shots.map((s, i) => (
        <button
          key={i}
          disabled={!onFlip}
          onClick={() => onFlip?.(i)}
          title={`Shot ${i + 1}: ${s.made ? "make" : "miss"}${s.src === "manual" ? " (added by hand)" : ""}${s.edited ? " (corrected)" : ""}`}
          className={`w-9 h-9 rounded-full text-xs font-bold grid place-items-center border-2 ${s.made ? "bg-green-600 border-green-700 text-white" : "bg-white border-gray-400 text-gray-500"} ${s.edited || s.src === "manual" ? "ring-2 ring-amber-400" : ""}`}
        >
          {s.made ? "✓" : "✕"}
        </button>
      ))}
    </div>
  );
}
