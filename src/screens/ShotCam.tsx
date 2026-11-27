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
import { COURT } from "../lib/court";
import { ShotDetector, ROI_W, ROI_H, RIM_PX, RIM_CX, RIM_CY, roiRect, type FrameDebug, type RimBox } from "../lib/shotcam/detector";
import { CAM_DRILLS, camDrill, fmtClock, pctText, type CamDrill, type CamShot } from "../lib/shotcam/drills";
import { listCamSessions, saveCamSession, deleteCamSession, type CamSessionRow } from "../lib/shotcam/store";
import { FlightTracker, extendBack } from "../lib/shotcam/flight";
import { applyH, calibrateCourt, courtOutline, findCourt, type CourtFit, type Homography, type Pt } from "../lib/shotcam/geometry";
import { findFeet, loadPose } from "../lib/shotcam/pose";
import { detectRim } from "../lib/shotcam/rimfind";
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

// ---- recording with the overlays burned in ---------------------------------
const REC_W = 1280; // width of the saved video
let logoImg: HTMLImageElement | null = null;
const FONT = "Oswald, 'Franklin Gothic', Arial, sans-serif";
const fmtWhen = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
function pickRecorderType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** The half court with O / X marks, drawn straight onto a canvas (for the saved video). */
function paintMiniCourt(c: CanvasRenderingContext2D, x: number, y: number, w: number, shots: CamShot[]) {
  const VIEW_H = 37, k = w / COURT.width, h = VIEW_H * k, pad = w * 0.04;
  c.fillStyle = "rgba(0,0,0,0.55)";
  c.fillRect(x - pad, y, w + pad * 2, h + pad);
  c.save();
  c.translate(x, y); c.scale(k, k);
  c.beginPath(); c.rect(0, 0, COURT.width, VIEW_H); c.clip();
  c.strokeStyle = "#ffffff"; c.lineWidth = 0.4; c.lineJoin = "round";
  const B = COURT.basket, L = COURT.lane;
  c.strokeRect(0.25, 0.25, COURT.width - 0.5, COURT.height - 0.5);
  c.strokeRect(L.x0, 0, L.x1 - L.x0, L.ftLineY);
  c.beginPath(); c.arc(B.x, L.ftLineY, COURT.ftCircleR, 0, Math.PI); c.stroke();
  const a0 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x), a1 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x);
  c.beginPath(); c.moveTo(COURT.cornerX0, 0); c.lineTo(COURT.cornerX0, COURT.cornerJoinY); c.arc(B.x, B.y, COURT.threeR, a0, a1, true); c.lineTo(COURT.cornerX1, 0); c.stroke();
  c.beginPath(); c.moveTo(B.x - COURT.backboardHalf, COURT.backboardY); c.lineTo(B.x + COURT.backboardHalf, COURT.backboardY); c.stroke();
  c.beginPath(); c.arc(B.x, B.y, COURT.rimR, 0, Math.PI * 2); c.stroke();
  const r = 1.5;
  for (const s of shots) {
    if (s.x == null || s.y == null) continue;
    const px = Math.min(COURT.width - 0.8, Math.max(0.8, s.x)), py = Math.min(VIEW_H - 0.8, Math.max(0.8, s.y));
    if (s.made) { c.strokeStyle = "#4ade80"; c.lineWidth = r * 0.5; c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.stroke(); }
    else { c.strokeStyle = "#ffffff"; c.lineWidth = r * 0.45; c.beginPath(); c.moveTo(px - r, py - r); c.lineTo(px + r, py + r); c.moveTo(px - r, py + r); c.lineTo(px + r, py - r); c.stroke(); }
  }
  c.restore();
}

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
  const [rimMode, setRimMode] = useState<"auto" | "hand">("auto"); // find the rim automatically, or mark its two edges by hand
  const [rimNote, setRimNote] = useState<"" | "found" | "missed">("");
  const [fps, setFps] = useState(0);
  const [shots, setShots] = useState<CamShot[]>([]);
  const [elapsed, setElapsed] = useState(0); // ms on the drill clock
  const [countdown, setCountdown] = useState(0);
  const [finalMs, setFinalMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);
  const [aimStep, setAimStep] = useState<"rim" | "court">("rim");
  const [courtTaps, setCourtTaps] = useState<Pt[]>([]); // the four lane corners
  const [arcTaps, setArcTaps] = useState<Pt[]>([]); // spots along the painted 3-point line
  const [court, setCourt] = useState<{ toCourt: Homography; toImg: Homography } | null>(null);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<Date | null>(null); // when the drill clock started
  const [clip, setClip] = useState<{ url: string; file: File } | null>(null); // the recording of the last drill

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
  const arcTapsRef = useRef<Pt[]>([]);
  const flightRef = useRef<FlightTracker | null>(null);
  const lowCanvas = useRef<HTMLCanvasElement | null>(null);
  const keepRef = useRef<{ t: number; canvas: HTMLCanvasElement }[]>([]);
  const keepIdx = useRef(0);
  const keepAt = useRef(-1e9);
  const shotSeq = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);
  // Health numbers for the last drill, shown under "Diagnostics" on the review
  // screen so a player can screenshot them when something goes wrong.
  const statsRef = useRef({ frames: 0, ballFrames: 0, armedFrames: 0, events: 0, located: 0, clockSource: "?", clockGlitches: 0, slowestFps: 0, errors: [] as string[], rec: "not started", browser: "" });
  const [diagTick, setDiagTick] = useState(0);
  const [showDiag, setShowDiag] = useState(DEBUG);
  const showDiagRef = useRef(DEBUG);
  const liveDiagRef = useRef("");
  showDiagRef.current = showDiag;
  const noteError = (where: string, e: unknown) => { const m = `${where}: ${(e as Error)?.message ?? e}`; const errs = statsRef.current.errors; if (errs[errs.length - 1] !== m && errs.length < 6) errs.push(m); };
  const recCanvas = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef<Date | null>(null);
  const countdownRef = useRef(0);
  const dragRef = useRef<{ kind: "lane" | "arc"; idx: number; from: Pt; start: Pt } | null>(null);
  const placingRef = useRef<Pt | null>(null); // a mark being placed (finger still down)
  const loupeRef = useRef<Pt | null>(null); // where the magnifier is looking, video pixels
  const fitRef = useRef<CourtFit["state"] | null>(null);
  const [fitError, setFitError] = useState(0); // how far the marks are from the fitted court, in 1080p pixels
  const [courtGuess, setCourtGuess] = useState<"" | "looking" | "found" | "none">(""); // the automatic first guess at the court
  const [courtOk, setCourtOk] = useState(false); // the player has said the yellow lines look right
  const seededRef = useRef(false); // current court started from the automatic guess (so adjust it, don't start over)
  const guessTriedRef = useRef(false);
  const arcsRef = useRef<{ id: number; made: boolean; pts: Pt[] }[]>([]); // traced flights, video pixels
  courtRef.current = court; courtTapsRef.current = courtTaps; arcTapsRef.current = arcTaps;

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
    if (file) { setRim(null); resetCourt(); }
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
    if (DEBUG) console.info("shotcam trace", id, "release", rel && Math.round(rel.x * K), rel && Math.round(rel.y * K), "flight ms", rel && Math.round(ev.t - rel.t), "tail", tail.length, "frames kept", keepRef.current.filter((f) => f.t > -1e8).length);
    if (!rel || ev.t - rel.t < 450 || Math.hypot(rel.x * K - r.cx, rel.y * K - r.cy) < r.width * 3) return; // couldn't follow the flight
    // The arc to draw: the traced flight, ending at the rim.
    const pts = track.map((p) => ({ x: p.x * K, y: p.y * K }));
    pts.push({ x: r.cx, y: r.cy });
    arcsRef.current = [...arcsRef.current.slice(-11), { id, made: ev.result === "make", pts }];
    if (!c) return; // court not marked: arcs only, no shot chart
    const frames = keepRef.current.filter((f) => f.t > -1e8);
    if (!frames.length) return;
    const F = frames[0].canvas.width / v.videoWidth;
    // Look for the shooter at the release point. If the trace stopped short
    // (ball lost against a busy background), follow the same arc further back
    // in steps until it reaches a player.
    let feet: Pt | null = null;
    for (const back of [0, 200, 400, 600, 800]) {
      const at = back ? extendBack(track, back) : rel;
      if (!at || at.x < 0 || at.y < 0 || at.x > fl.w || at.y > fl.h) break;
      const want = at.t - 250; // just before the release, feet still on the floor
      const fr = frames.reduce((a2, b2) => (Math.abs(b2.t - want) < Math.abs(a2.t - want) ? b2 : a2));
      feet = await findFeet(fr.canvas, { x: at.x * K * F, y: at.y * K * F });
      if (DEBUG) console.info("shotcam locate", id, "back", back, "at", Math.round(at.x * K), Math.round(at.y * K), "feet", feet && Math.round(feet.x / F), feet && Math.round(feet.y / F));
      if (feet) break;
    }
    if (!feet) return;
    const pt = applyH(c.toCourt, { x: feet.x / F, y: feet.y / F });
    if (!isFinite(pt.x) || !isFinite(pt.y) || pt.x < -4 || pt.x > 54 || pt.y < -4 || pt.y > 50) return;
    statsRef.current.located++;
    pushShots(shotsRef.current.map((s) => (s.id === id ? { ...s, x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 } : s)));
  }, []);

  // The X on the full-screen picture: during the drill it stops and goes to the
  // review; during the countdown it backs out to the setup screen.
  function stopCapture() {
    if (stageRef.current === "live") endDrill(clock() - startRef.current);
    else if (stageRef.current === "countdown") { if (isFile) videoRef.current?.pause(); setStage("aim"); }
  }
  // Leave full-screen whenever the picture is no longer full-screen.
  useEffect(() => {
    if (stage === "countdown" || stage === "live") return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    try { (screen.orientation as unknown as { unlock?: () => void }).unlock?.(); } catch { /* ignore */ }
  }, [stage]);

  // ---- recording -------------------------------------------------------------
  function startRecording() {
    stopRecording();
    setClip((old) => { if (old) URL.revokeObjectURL(old.url); return null; });
    const v = videoRef.current, type = pickRecorderType(), stats = statsRef.current;
    if (!v || !v.videoWidth) { stats.rec = "no camera picture yet"; return; }
    if (!type) { stats.rec = "this browser can't record video"; return; } // the drill still works
    try {
      if (!recCanvas.current) {
        // Kept in the page (invisibly): some browsers only capture a canvas that is.
        const cv0 = document.createElement("canvas");
        cv0.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
        document.body.appendChild(cv0);
        recCanvas.current = cv0;
      }
      const cv = recCanvas.current;
      cv.width = Math.min(REC_W, v.videoWidth);
      cv.height = Math.round((cv.width * v.videoHeight) / v.videoWidth / 2) * 2;
      cv.getContext("2d")!.drawImage(v, 0, 0, cv.width, cv.height);
      const rec = new MediaRecorder(cv.captureStream(30), { mimeType: type, videoBitsPerSecond: 2_500_000 });
      const chunks: Blob[] = [];
      let bytes = 0;
      const d = drillRef.current, began = new Date();
      rec.ondataavailable = (e) => { if (e.data.size) { chunks.push(e.data); bytes += e.data.size; stats.rec = `${type} · recording · ${(bytes / 1e6).toFixed(1)} MB`; } };
      rec.onerror = (e) => { stats.rec = `${type} · error: ${(e as unknown as { error?: Error }).error?.message ?? "unknown"}`; };
      rec.onstop = () => {
        if (!chunks.length) { stats.rec = `${type} · stopped with no video data`; setDiagTick((n) => n + 1); return; }
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const stamp = `${began.getFullYear()}-${String(began.getMonth() + 1).padStart(2, "0")}-${String(began.getDate()).padStart(2, "0")}-${String(began.getHours()).padStart(2, "0")}${String(began.getMinutes()).padStart(2, "0")}`;
        const file = new File(chunks, `ludo-arc-${d?.key ?? "drill"}-${stamp}.${ext}`, { type: type.split(";")[0] });
        stats.rec = `${type} · saved in the page · ${(file.size / 1e6).toFixed(1)} MB`;
        setClip({ url: URL.createObjectURL(file), file });
      };
      rec.start(1000);
      stats.rec = `${type} · recording`;
      recorderRef.current = rec;
    } catch (e) { stats.rec = `couldn't start: ${(e as Error).message}`; recorderRef.current = null; }
  }
  function stopRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* already stopped */ } }
  }
  useEffect(() => () => { stopRecording(); recCanvas.current?.remove(); recCanvas.current = null; }, []); // leaving the screen
  // Stop a moment after the drill ends so the last make/miss is in the video.
  useEffect(() => {
    if (stage === "review") { const t = setTimeout(stopRecording, 700); return () => clearTimeout(t); }
    if (stage === "pick" || stage === "aim") stopRecording();
  }, [stage]);

  async function saveClip() {
    if (!clip) return;
    setError("");
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    // On a phone this opens the share sheet ("Save Video", AirDrop, Messages…).
    if (nav.canShare?.({ files: [clip.file] })) {
      try { await nav.share({ files: [clip.file] }); return; }
      catch (e) {
        if ((e as Error).name === "AbortError") return; // the player closed the sheet
        setError(`The share sheet didn't open (${(e as Error).name}). Use the "Download instead" link under the video.`);
        return;
      }
    }
    downloadClip();
  }
  function downloadClip() {
    if (!clip) return;
    const a = document.createElement("a");
    a.href = clip.url; a.download = clip.file.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

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
    } else goAtRef.current = clock() + 5000;
    startedAtRef.current = null; setStartedAt(null);
    statsRef.current = { frames: 0, ballFrames: 0, armedFrames: 0, events: 0, located: 0, clockSource: "?", clockGlitches: 0, slowestFps: 0, errors: [], rec: "not started", browser: navigator.userAgent };
    startRecording();
    // Take over the screen. Real full-screen and a landscape lock where the
    // browser allows them (Android); elsewhere the picture still fills the page.
    const el = screenRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    try {
      const req = el?.requestFullscreen?.({ navigationUI: "hide" });
      if (req) req.then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.("landscape").catch(() => {})).catch(() => {});
      else el?.webkitRequestFullscreen?.();
    } catch { /* not supported — the fixed layout covers the page anyway */ }
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
    let lastMedia = -1, camOffset: number | null = null, lastFt = -Infinity, trustMedia = true, secBall = 0;
    // A frame's own time. The camera's per-frame timestamp is the most accurate,
    // but not every browser reports a usable one (some give zero or a value that
    // doesn't advance) — so check it against the wall clock and fall back.
    const frameTime = (now: number, mediaTime?: number): number => {
      let ft = now;
      if (mediaTime != null && isFileRef.current) ft = mediaTime * 1000;
      else if (mediaTime != null && trustMedia) {
        camOffset ??= now - mediaTime * 1000;
        ft = mediaTime * 1000 + camOffset;
        if (!(ft > lastFt) || Math.abs(ft - now) > 300) {
          ft = now; camOffset = now - mediaTime * 1000;
          if (++statsRef.current.clockGlitches >= 4) trustMedia = false;
        }
      }
      if (!isFileRef.current) {
        if (ft <= lastFt) ft = lastFt + 1; // time must move forward
        statsRef.current.clockSource = mediaTime != null && trustMedia ? "camera frame time" : "wall clock";
      }
      lastFt = ft;
      return ft;
    };
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

    // One bad frame must never stop the drill: catch, note it, keep going.
    function step(mediaTime?: number) {
      if (stop || !v) return;
      clearTimeout(watchdog);
      try { work(mediaTime); } catch (e) { noteError("frame", e); }
      schedule();
    }

    function work(mediaTime?: number) {
      if (!v) return;
      if (v.videoWidth && (!videoSizeRef.current || videoSizeRef.current.w !== v.videoWidth || videoSizeRef.current.h !== v.videoHeight)) {
        videoSizeRef.current = { w: v.videoWidth, h: v.videoHeight };
        setVideoSize(videoSizeRef.current);
      }
      const now = clock();
      const ft = frameTime(now, mediaTime); // this frame's own time, on the drill clock's timeline
      const r = rimRef.current;
      if (r && v.readyState >= 2) {
        const q = roiRect(r);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ROI_W, ROI_H);
        // Crop only the part of the window that is inside the picture: some
        // browsers draw nothing at all if the source box pokes outside it.
        const sx0 = Math.max(0, q.x), sy0 = Math.max(0, q.y), sx1 = Math.min(v.videoWidth, q.x + q.w), sy1 = Math.min(v.videoHeight, q.y + q.h);
        if (sx1 > sx0 && sy1 > sy0) ctx.drawImage(v, sx0, sy0, sx1 - sx0, sy1 - sy0, (sx0 - q.x) / q.scale, (sy0 - q.y) / q.scale, (sx1 - sx0) / q.scale, (sy1 - sy0) / q.scale);
        // Only feed the tracker new pictures (a paused or slow video repeats frames).
        const stamp = mediaTime ?? v.currentTime;
        if (!isFileRef.current || stamp !== lastMedia) {
          lastMedia = stamp;
          const img = ctx.getImageData(0, 0, ROI_W, ROI_H);
          const ev = det.current.process(img.data, ft, dbg);
          if (dbg.drift) { r.cx += dbg.drift.dx * q.scale; r.cy += dbg.drift.dy * q.scale; }
          if (stageRef.current === "live") {
            const st2 = statsRef.current;
            st2.frames++; if (dbg.balls.length) { st2.ballFrames++; secBall++; } if (dbg.phase === "armed") st2.armedFrames++;
            if (ev) st2.events++;
          }
          if (ev && stageRef.current === "live") {
            const id = addShot(ev.result === "make", "cam", ev.t);
            if (id) setTimeout(() => void locateShot(ev, id), 0); // after this frame's work is done
          }
          watchFlight(ft, r);
        }
        drawZoom();
      }
      drawOverlay(dbg);
      try { drawRecording(now); } catch (e) { noteError("recording", e); }

      // drill clock
      const st = stageRef.current, d = drillRef.current;
      if (st === "countdown") {
        const left = goAtRef.current - now;
        const sec = Math.ceil(left / 1000);
        if (sec !== lastTickRef.current) { lastTickRef.current = sec; setCountdown(Math.max(0, sec)); if (sec > 0 && sec <= 3) sound.tick(); }
        countdownRef.current = Math.max(0, sec);
        if (left <= 0) { startRef.current = goAtRef.current; startedAtRef.current = new Date(); setStartedAt(startedAtRef.current); sound.go(); stageRef.current = "live"; setStage("live"); }
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
        const f = Math.round((frames * 1000) / (real - fpsAt));
        setFps(f); frames = 0; fpsAt = real;
        if (stageRef.current === "live") {
          setElapsed(clock() - startRef.current);
          const st2 = statsRef.current;
          if (!st2.slowestFps || f < st2.slowestFps) st2.slowestFps = f;
          if (showDiagRef.current) { liveDiagRef.current = `${f} fps · ball seen in ${secBall} frames · ${dbg.phase} · net ${dbg.netFill.toFixed(2)} · ${st2.clockSource} · rec ${recorderRef.current?.state ?? "off"}${st2.errors.length ? " · ERR " + st2.errors[st2.errors.length - 1] : ""}`; setDiagTick((n) => n + 1); }
        }
        secBall = 0;
      }
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
      // Show just the rim and net, large: 3.5 rim-widths across, centred on the rim.
      const vw = 3.5 * RIM_PX, vh = (vw * z.height) / z.width, vx = RIM_CX - vw / 2, vy = RIM_CY - vh * 0.42;
      c.drawImage(roiCanvas.current!, vx, vy, vw, vh, 0, 0, z.width, z.height);
      const k = z.width / vw, X = (x: number) => (x - vx) * k, Y = (y: number) => (y - vy) * k;
      // net box
      c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
      c.strokeRect(X(RIM_CX - RIM_PX / 2), Y(RIM_CY), RIM_PX * k, RIM_PX * k);
      c.setLineDash([]);
      // rim line
      c.strokeStyle = "#22c55e"; c.lineWidth = 4;
      c.beginPath(); c.moveTo(X(RIM_CX - RIM_PX / 2), Y(RIM_CY)); c.lineTo(X(RIM_CX + RIM_PX / 2), Y(RIM_CY)); c.stroke();
    }

    // shot arcs: green for makes, red for misses; older ones fade (video-pixel coordinates)
    function paintArcs(c: CanvasRenderingContext2D, rimWidth: number) {
      const live = new Set(shotsRef.current.map((s2) => s2.id));
      const arcs = arcsRef.current.filter((a) => live.has(a.id));
      c.lineCap = "round"; c.lineJoin = "round";
      arcs.forEach((a, i) => {
        const age = arcs.length - 1 - i;
        c.globalAlpha = Math.max(0.18, 0.9 - age * 0.14);
        c.strokeStyle = a.made ? "#22c55e" : "#ef4444";
        c.lineWidth = Math.max(3, rimWidth * 0.16);
        c.beginPath();
        c.moveTo(a.pts[0].x, a.pts[0].y);
        for (let k = 1; k < a.pts.length - 1; k++) c.quadraticCurveTo(a.pts[k].x, a.pts[k].y, (a.pts[k].x + a.pts[k + 1].x) / 2, (a.pts[k].y + a.pts[k + 1].y) / 2);
        c.lineTo(a.pts[a.pts.length - 1].x, a.pts[a.pts.length - 1].y);
        c.stroke();
      });
      c.globalAlpha = 1;
    }

    // The saved video: the camera picture with every overlay drawn into it.
    function drawRecording(now: number) {
      const rec = recorderRef.current, cv = recCanvas.current;
      if (!rec || rec.state !== "recording" || !cv || !v || !v.videoWidth) return;
      const c = cv.getContext("2d")!, W = cv.width, H = cv.height, u = W / 1280; // u = size unit
      c.drawImage(v, 0, 0, W, H);
      const st = stageRef.current, d = drillRef.current, shotsNow = shotsRef.current;
      if (rimRef.current && st === "live") { c.save(); c.scale(W / v.videoWidth, H / v.videoHeight); paintArcs(c, rimRef.current.width); c.restore(); }
      // bottom shade
      const g = c.createLinearGradient(0, H * 0.72, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.78)");
      c.fillStyle = g; c.fillRect(0, H * 0.72, W, H * 0.28);
      // bottom left: Ludo Arc
      if (!logoImg) { logoImg = new Image(); logoImg.src = "/ludo-arc.png"; }
      const m = 36 * u, logo = 74 * u;
      if (logoImg.complete && logoImg.naturalWidth) c.drawImage(logoImg, m, H - m - logo, logo, logo);
      c.fillStyle = "rgba(255,255,255,0.85)"; c.textAlign = "left"; c.textBaseline = "alphabetic";
      c.font = `400 ${20 * u}px Arial, sans-serif`; c.fillText("Powered by", m + logo + 14 * u, H - m - logo * 0.58);
      c.fillStyle = "#ffffff"; c.font = `600 ${38 * u}px ${FONT}`; c.fillText("LUDO ARC", m + logo + 14 * u, H - m - logo * 0.08);
      // bottom right: makes | attempts | clock
      const ms = st === "live" ? now - startRef.current : 0;
      const clockTxt = d?.seconds ? fmtClock(Math.max(0, d.seconds * 1000 - ms)) : fmtClock(ms);
      const cols: [string, string][] = [[String(shotsNow.filter((s2) => s2.made).length), "MAKES"], [String(shotsNow.length), "ATTEMPTS"], [clockTxt, d?.seconds ? "LEFT" : "TIME"]];
      let right = W - m;
      c.textAlign = "center";
      for (let i = cols.length - 1; i >= 0; i--) {
        c.font = `600 ${84 * u}px ${FONT}`;
        const colW = Math.max(c.measureText(cols[i][0]).width, 120 * u) + 30 * u;
        c.fillStyle = "#ffffff"; c.fillText(cols[i][0], right - colW / 2, H - m - 24 * u);
        c.font = `400 ${16 * u}px Arial, sans-serif`; c.fillStyle = "rgba(255,255,255,0.85)"; c.fillText(cols[i][1], right - colW / 2, H - m);
        right -= colW;
        if (i > 0) { c.fillStyle = "rgba(255,255,255,0.6)"; c.fillRect(right - 1 * u, H - m - 100 * u, 2 * u, 100 * u); }
      }
      // top right: shot chart
      if (courtRef.current) paintMiniCourt(c, W * 0.71, 0, W * 0.25, shotsNow);
      // top left: drill, date and time it started
      const when = fmtWhen(startedAtRef.current ?? new Date());
      c.textAlign = "left";
      c.font = `600 ${26 * u}px ${FONT}`;
      const label = (d?.label ?? "").toUpperCase(), tw = Math.max(c.measureText(label).width, 0);
      c.font = `400 ${18 * u}px Arial, sans-serif`;
      const bw = Math.max(tw, c.measureText(when).width) + 28 * u;
      c.fillStyle = "rgba(0,0,0,0.55)"; c.fillRect(0, 0, bw + m * 0.5, 78 * u);
      c.fillStyle = "#ffffff"; c.font = `600 ${26 * u}px ${FONT}`; c.fillText(label, m * 0.6, 34 * u);
      c.fillStyle = "rgba(255,255,255,0.9)"; c.font = `400 ${18 * u}px Arial, sans-serif`; c.fillText(when, m * 0.6, 60 * u);
      // countdown
      if (st === "countdown") {
        c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#ffffff"; c.textAlign = "center";
        c.font = `400 ${22 * u}px Arial, sans-serif`; c.fillText("GET READY", W / 2, H / 2 - 90 * u);
        c.font = `600 ${180 * u}px ${FONT}`; c.fillText(String(countdownRef.current), W / 2, H / 2 + 80 * u);
      }
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
        const dot = (p: Pt, fill: string) => { c.fillStyle = fill; c.strokeStyle = "#111827"; c.lineWidth = lw / 2; c.beginPath(); c.arc(p.x, p.y, lw * 2.6, 0, Math.PI * 2); c.fill(); c.stroke(); };
        const ct = courtRef.current;
        if (ct) {
          c.strokeStyle = "#facc15"; c.lineWidth = lw;
          for (const line of courtOutline()) {
            c.beginPath();
            line.forEach((pt, i) => { const q2 = applyH(ct.toImg, pt); if (i) c.lineTo(q2.x, q2.y); else c.moveTo(q2.x, q2.y); });
            c.stroke();
          }
        }
        for (const p of courtTapsRef.current) dot(p, "#facc15");
        for (const p of arcTapsRef.current) dot(p, "#22d3ee");
        // magnifier: a 3x view of what is under the finger, drawn clear of it
        const lp = loupeRef.current;
        if (lp) {
          const R = o.width * 0.1, zoom = 3, half = R / zoom;
          const cx = Math.min(o.width - R - 4, Math.max(R + 4, lp.x));
          const cy = lp.y - R * 1.7 > R + 4 ? lp.y - R * 1.7 : lp.y + R * 1.7;
          c.save();
          c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
          c.fillStyle = "#000"; c.fillRect(cx - R, cy - R, R * 2, R * 2);
          const sx0 = Math.max(0, lp.x - half), sy0 = Math.max(0, lp.y - half), sx1 = Math.min(v.videoWidth, lp.x + half), sy1 = Math.min(v.videoHeight, lp.y + half);
          if (sx1 > sx0 && sy1 > sy0) c.drawImage(v, sx0, sy0, sx1 - sx0, sy1 - sy0, cx + (sx0 - lp.x) * zoom, cy + (sy0 - lp.y) * zoom, (sx1 - sx0) * zoom, (sy1 - sy0) * zoom);
          c.restore();
          c.strokeStyle = "#ffffff"; c.lineWidth = lw; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
          c.strokeStyle = "#22c55e"; c.lineWidth = Math.max(1, lw / 2);
          c.beginPath(); c.moveTo(cx - R * 0.35, cy); c.lineTo(cx - R * 0.06, cy); c.moveTo(cx + R * 0.06, cy); c.lineTo(cx + R * 0.35, cy);
          c.moveTo(cx, cy - R * 0.35); c.lineTo(cx, cy - R * 0.06); c.moveTo(cx, cy + R * 0.06); c.lineTo(cx, cy + R * 0.35); c.stroke();
        }
      }
      if (!r) return;
      const q = roiRect(r);
      if (stageRef.current === "live") {
        paintArcs(c, r.width);
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
  // Marks are placed press–slide–release: while the finger is down a magnifier
  // shows exactly what is under it, and the mark lands where the finger lifts.
  const toVideo = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * videoSize!.w, y: ((e.clientY - rect.top) / rect.height) * videoSize!.h };
  };
  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (stage !== "aim" || !videoSize) return;
    const p = toVideo(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (aimStep === "court" && rim && courtTaps.length >= 4) {
      // Lane is marked. A touch on an existing dot grabs it to fine-tune (it moves
      // at 40% of the finger's speed); a touch anywhere else adds a 3-point-line spot.
      const grab = 30 * (videoSize.w / e.currentTarget.getBoundingClientRect().width); // ~30 screen pixels
      let hit: { kind: "lane" | "arc"; idx: number; start: Pt } | null = null, hd = grab;
      courtTaps.forEach((t, i) => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < hd) { hd = d; hit = { kind: "lane", idx: i, start: t }; } });
      arcTaps.forEach((t, i) => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < hd) { hd = d; hit = { kind: "arc", idx: i, start: t }; } });
      if (hit) {
        const h2 = hit as { kind: "lane" | "arc"; idx: number; start: Pt };
        dragRef.current = { ...h2, from: p };
        loupeRef.current = h2.start;
        return;
      }
    }
    if (aimStep === "court" && !rim) return;
    placingRef.current = p;
    loupeRef.current = p;
  }
  function onDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!videoSize) return;
    const d = dragRef.current;
    if (d) {
      const p = toVideo(e);
      const moved = { x: d.start.x + (p.x - d.from.x) * 0.4, y: d.start.y + (p.y - d.from.y) * 0.4 };
      const lane = d.kind === "lane" ? courtTaps.map((t, i) => (i === d.idx ? moved : t)) : courtTaps;
      const arc = d.kind === "arc" ? arcTaps.map((t, i) => (i === d.idx ? moved : t)) : arcTaps;
      setCourtTaps(lane); setArcTaps(arc);
      loupeRef.current = moved;
      solveCourt(lane, arc, true);
      return;
    }
    if (placingRef.current) { placingRef.current = toVideo(e); loupeRef.current = placingRef.current; }
  }
  function endDrag() {
    const p = placingRef.current, wasDrag = !!dragRef.current;
    dragRef.current = null; placingRef.current = null; loupeRef.current = null;
    if (wasDrag) { solveCourt(courtTaps, arcTaps); return; } // full re-fit once the dot is let go
    if (!p || stage !== "aim") return;
    if (aimStep === "court") {
      if (courtTaps.length < 4) {
        const next = [...courtTaps, p];
        setCourtTaps(next);
        if (next.length === 4) solveCourt(next, arcTaps);
      } else {
        const nextArc = [...arcTaps, p];
        setArcTaps(nextArc);
        solveCourt(courtTaps, nextArc);
      }
      return;
    }
    if (rimMode === "auto") { autoRim(p); return; } // "the hoop is about here"
    if (taps.length !== 1) { setTaps([p]); setRim(null); return; }
    const a = taps[0];
    const width = Math.hypot(p.x - a.x, p.y - a.y);
    setTaps([]);
    if (width < 8) return;
    setRim({ cx: (a.x + p.x) / 2, cy: (a.y + p.y) / 2, width });
  }
  // Look for the rim in the current picture — everywhere, or near where the player touched.
  function autoRim(near?: Pt): boolean {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return false;
    try {
      const fw = v.videoWidth, fh = v.videoHeight, sw = 960, sh = Math.round((960 * fh) / fw);
      const grab = (w: number, h: number) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const c = cv.getContext("2d", { willReadFrequently: true })!; c.drawImage(v, 0, 0, w, h); return c.getImageData(0, 0, w, h).data; };
      const found = detectRim(grab(sw, sh), sw, sh, grab(fw, fh), fw, fh, near);
      if (found) { setTaps([]); setRim(found); setRimNote("found"); return true; }
    } catch (e) { noteError("rim finder", e); }
    if (near) setRimNote("missed");
    return false;
  }
  // When the camera comes up, try to find the rim without being asked (a few tries, in case someone walks through).
  useEffect(() => {
    if (stage !== "aim" || aimStep !== "rim" || rim || rimMode !== "auto" || !videoSize) return;
    let tries = 0;
    const id = window.setInterval(() => { if (autoRim() || ++tries >= 6) { window.clearInterval(id); if (tries >= 6) setRimNote("missed"); } }, 700);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, aimStep, rim, rimMode, videoSize]);

  function cancelDrag() { dragRef.current = null; placingRef.current = null; loupeRef.current = null; }
  function solveCourt(lane: Pt[], arc: Pt[], quick = false) {
    if (!rim || !videoSize) return;
    const fit = calibrateCourt(lane, { x: rim.cx, y: rim.cy, width: rim.width }, videoSize, arc, quick || seededRef.current ? fitRef.current ?? undefined : undefined);
    setCourtOk(false);
    if (fit) { fitRef.current = fit.state; setFitError(fit.error * (1920 / videoSize.w)); setError(""); setCourt({ toCourt: fit.toCourt, toImg: fit.toImg }); void loadPose(); }
    else { fitRef.current = null; setCourt(null); setError("Those four points don't make a lane — tap Redo court and mark its four corners again."); }
  }
  function resetCourt() { fitRef.current = null; seededRef.current = false; setCourt(null); setCourtTaps([]); setArcTaps([]); setCourtOk(false); setCourtGuess((g) => (g === "found" ? "none" : g)); }
  // On reaching the court step, have a go at finding the court without any marks.
  useEffect(() => {
    if (stage !== "aim" || aimStep !== "court" || !rim || !videoSize || court || courtTaps.length || guessTriedRef.current) return;
    guessTriedRef.current = true;
    setCourtGuess("looking");
    const id = window.setTimeout(() => {
      const v = videoRef.current;
      let fit: ReturnType<typeof findCourt> = null;
      try {
        if (v && v.videoWidth) {
          const w = 960, h = Math.round((960 * v.videoHeight) / v.videoWidth);
          const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
          const c = cv.getContext("2d", { willReadFrequently: true })!;
          c.drawImage(v, 0, 0, w, h);
          const px = c.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) gray[i] = (px[i * 4] * 77 + px[i * 4 + 1] * 150 + px[i * 4 + 2] * 29) >> 8;
          fit = findCourt({ gray, w, h, scale: w / v.videoWidth }, { x: rim.cx, y: rim.cy, width: rim.width }, videoSize);
        }
      } catch (e) { noteError("court finder", e); }
      if (fit && fit.confidence >= 1.5) {
        fitRef.current = fit.state; seededRef.current = true;
        setCourtTaps(fit.corners); setArcTaps([]); setFitError(0);
        setCourt({ toCourt: fit.toCourt, toImg: fit.toImg }); setCourtGuess("found"); void loadPose();
      } else setCourtGuess("none");
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, aimStep, rim, videoSize, court, courtTaps.length]);
  useEffect(() => { guessTriedRef.current = false; }, [rim?.cx, rim?.cy, rim?.width, isFile]); // a new rim deserves a new guess
  function undoArc() { const arc = arcTaps.slice(0, -1); setArcTaps(arc); solveCourt(courtTaps, arc); }
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
  function dropClip() { setClip((old) => { if (old) URL.revokeObjectURL(old.url); return null; }); }
  function discard() { dropClip(); setStage("pick"); setNotice(""); }
  function leave() { stopSource(); setRim(null); setTaps([]); resetCourt(); setAimStep("rim"); setStage("pick"); }

  async function removeSession(id: string) {
    if (!window.confirm("Delete this Shot Cam workout?")) return;
    try { await deleteCamSession(id); loadHistory(); } catch (e) { setError((e as Error).message); }
  }

  // ---- render ----------------------------------------------------------------
  const showVideo = active;
  const clockText = drill?.seconds ? fmtClock(Math.max(0, drill.seconds * 1000 - elapsed)) : fmtClock(elapsed);
  const rimTooSmall = !!rim && rim.width < MIN_RIM_PX;
  // During the countdown and the drill the picture takes over the whole screen.
  const full = stage === "countdown" || stage === "live";
  const ratio = videoSize ? videoSize.w / videoSize.h : 16 / 9;
  const frameStyle = full
    ? { aspectRatio: `${ratio}`, width: `min(100vw, calc(100dvh * ${ratio}))`, maxHeight: "100dvh" }
    : videoSize
      ? { aspectRatio: `${videoSize.w} / ${videoSize.h}`, width: `min(100%, calc(88vh * ${ratio}))` } // as big as fits: marking needs the room
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
          {clip && (
            <div className="mb-4 bg-white border rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm"><b>Video of your last workout</b> is still on this phone. It's gone once you start another drill or leave this page.</div>
              <button onClick={saveClip} className="bg-garnet text-white rounded-lg px-4 py-2 font-semibold text-sm">Save video to this device</button>
            </div>
          )}
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
      <div ref={screenRef} className={full ? "fixed inset-0 z-50 bg-black flex items-center justify-center" : showVideo ? "mt-4" : "hidden"}>
        <div className={`relative mx-auto bg-black overflow-hidden ${full ? "" : "rounded-lg"}`} style={frameStyle}>
          <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full" onEnded={() => { if (stageRef.current === "live") endDrill(clock() - startRef.current); }} />
          <canvas ref={overlayRef} onPointerDown={onTap} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag} className="absolute inset-0 w-full h-full touch-none" style={{ cursor: stage === "aim" ? "crosshair" : "default" }} />
          {/* stop button */}
          {full && (
            <button
              onClick={stopCapture}
              aria-label={stage === "live" ? "Stop and review" : "Cancel"}
              title={stage === "live" ? "Stop and review" : "Cancel"}
              className="absolute z-10 grid place-items-center rounded-full bg-black/60 text-white border border-white/40"
              style={{ top: "max(10px, env(safe-area-inset-top))", left: "max(10px, env(safe-area-inset-left))", width: 44, height: 44, fontSize: 22, lineHeight: 1 }}
            >✕</button>
          )}
          {/* drill, date and time it started */}
          {full && (
            <div className="absolute pointer-events-none text-white leading-tight bg-black/55 rounded-lg px-2.5 py-1.5" style={{ top: "max(10px, env(safe-area-inset-top))", left: "calc(max(10px, env(safe-area-inset-left)) + 54px)" }}>
              <div className="headline-bold" style={{ fontSize: "clamp(11px, 2vw, 20px)" }}>{drill?.label}</div>
              <div className="text-white/90" style={{ fontSize: "clamp(9px, 1.4vw, 14px)" }}>{fmtWhen(startedAt ?? new Date())}</div>
            </div>
          )}
          {/* live diagnostics line */}
          {full && showDiag && stage === "live" && (
            <div data-tick={diagTick} className="absolute left-1/2 -translate-x-1/2 pointer-events-none bg-black/70 text-green-300 font-mono rounded px-2 py-1 text-center" style={{ top: "max(6px, env(safe-area-inset-top))", fontSize: 10, maxWidth: "46%" }}>{liveDiagRef.current || "starting…"}</div>
          )}
          {/* mini shot chart */}
          {court && full && (
            <div className="absolute top-0 right-[3%] w-[26%] min-w-[104px] pointer-events-none bg-black/55 rounded-b-lg px-1.5 pb-1.5 pt-1">
              <ShotCamChart shots={shots} dark markSize={1.5} />
            </div>
          )}
          {/* on-video scoreboard + Ludo Arc badge */}
          {(stage === "live" || stage === "countdown") && (
            <div className="absolute inset-x-0 bottom-0 pointer-events-none text-white flex items-end justify-between gap-2 px-[3%] pb-[2.5%] pt-[9%] bg-gradient-to-t from-black/75 to-transparent">
              <div className="flex items-center gap-2 min-w-0">
                <img src="/ludo-arc.png" alt="" className="rounded-md flex-shrink-0" style={{ width: "clamp(26px, 6vw, 72px)", height: "clamp(26px, 6vw, 72px)" }} />
                <div className="leading-tight min-w-0">
                  <div className="text-white/80" style={{ fontSize: "clamp(8px, 1.7vw, 18px)" }}>Powered by</div>
                  <div className="headline-bold" style={{ fontSize: "clamp(13px, 3vw, 34px)" }}>Ludo Arc</div>
                </div>
              </div>
              <div className="flex items-end gap-3 flex-shrink-0" aria-hidden="true">
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 7vw, 84px)" }}>{makes}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.5vw, 15px)" }}>Makes</div></div>
                <div className="bg-white/60 self-stretch" style={{ width: 2 }} />
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 7vw, 84px)" }}>{shots.length}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.5vw, 15px)" }}>Attempts</div></div>
                <div className="bg-white/60 self-stretch" style={{ width: 2 }} />
                <div className="text-center"><div className="data-bold leading-none" style={{ fontSize: "clamp(26px, 7vw, 84px)" }}>{clockText}</div><div className="eyebrow text-white/80" style={{ fontSize: "clamp(7px, 1.5vw, 15px)" }}>{drill?.seconds ? "Left" : "Time"}</div></div>
              </div>
            </div>
          )}
          {stage === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-white">
              <div className="text-center"><div className="eyebrow text-xs">Get ready</div><div className="data-bold text-8xl">{countdown}</div><div className="hidden portrait:block text-sm mt-2">Turn your phone sideways for the full picture</div></div>
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
              {rim
                ? (rimNote === "found" && rimMode === "auto" ? "Found the rim. Check the close-up: the green line should sit on the rim, edge to edge, with the net inside the dashed box. Use the arrows if it needs a nudge." : "Check the close-up: the green line should sit on the rim, edge to edge, with the net inside the dashed box.")
                : rimMode === "auto"
                  ? (rimNote === "missed" ? "Couldn't pick out the rim. Touch the picture on or near the hoop and it will look there — or mark it by hand." : "Looking for the rim… If it doesn't find it, touch the picture on or near the hoop.")
                  : (taps.length === 0 ? "Press on the LEFT edge of the rim. A magnifier appears: slide until the cross is on the edge, then lift." : "Now do the same on the RIGHT edge of the rim.")}
              <span className="block mt-1">
                {rimMode === "auto"
                  ? <button onClick={() => { setRimMode("hand"); setRim(null); setTaps([]); setRimNote(""); }} className="underline text-garnet text-xs">Mark the rim by hand instead</button>
                  : <button onClick={() => { setRimMode("auto"); setRim(null); setTaps([]); setRimNote(""); }} className="underline text-garnet text-xs">Find the rim automatically</button>}
              </span>
            </p>
          ) : (
            <div className="text-sm text-gray-700">
              {courtGuess === "looking" ? (
                <p>Looking for your court…</p>
              ) : courtGuess === "found" && seededRef.current ? (
                <>
                  <p><b>Here's my best guess at your court</b> (yellow). If the yellow arc and lane sit on the painted lines, tap <b>The lines look right</b>.</p>
                  <p className="mt-1">If they're off, <b>drag the yellow dots</b> onto the four corners of the lane, and add spots along the 3-point line (press, slide onto the line, lift). The lines follow as you go. <b>{arcTaps.length}</b> 3-point spot{arcTaps.length === 1 ? "" : "s"} added.</p>
                </>
              ) : courtTaps.length < 4 ? (
                <p>{courtGuess === "none" && <>Couldn't find the court by itself here, so mark it by hand. </>}<b>Step 1.</b> Mark the <b>four corners of the lane</b> (the painted rectangle under the basket: two corners on the baseline, two at the ends of the free-throw line), in any order. Press, slide until the magnifier's cross is exactly on the corner, then lift. <b>{courtTaps.length} of 4</b> marked.</p>
              ) : (
                <>
                  <p><b>Step 2.</b> Mark <b>4 or more spots along the painted 3-point line</b>, spread from one end to the other (blue dots), the same way: press, slide onto the line, lift. <b>{arcTaps.length}</b> marked{arcTaps.length < 4 ? "" : " — good"}.</p>
                  <p className="mt-1">The yellow lines show where the app thinks your arc and lane are. They should sit on the paint. To fix one, <b>drag a dot</b> — it moves slower than your finger so small changes are easy.</p>
                  {court && arcTaps.length < 4 && !courtOk && <p className="mt-1 text-amber-800">The court isn't pinned down yet — add {4 - arcTaps.length} more spot{4 - arcTaps.length === 1 ? "" : "s"} on the 3-point line, or tap “The lines look right” if they already do.</p>}
                  {court && arcTaps.length >= 4 && fitError > 14 && <p className="mt-1 text-amber-800">The marks don't fit a court very well (off by about {Math.round(fitError)} pixels). Check each yellow dot is exactly on a lane corner — drag any that isn't.</p>}
                  {court && arcTaps.length >= 4 && fitError <= 14 && <p className="mt-1 text-green-700 font-medium">The marks fit a court well.</p>}
                </>
              )}
              {court && courtOk && <p className="mt-1 text-green-700 font-medium">Court set.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {court && !courtOk && <button onClick={() => setCourtOk(true)} className="rounded px-3 py-2 bg-green-700 text-white text-xs font-semibold">✓ The lines look right</button>}
                {arcTaps.length > 0 && <button onClick={undoArc} className="border rounded px-3 py-2 bg-white text-xs">Undo last 3-point spot</button>}
                <button onClick={resetCourt} className="border rounded px-3 py-2 bg-white text-xs">{courtGuess === "found" && seededRef.current ? "Mark it by hand" : "Redo court"}</button>
                <button onClick={() => { resetCourt(); setAimStep("rim"); }} className="border rounded px-3 py-2 bg-white text-xs">← Back to the rim</button>
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
                  <button onClick={() => { setRim(null); setTaps([]); setRimNote(""); }} className="border rounded py-2 bg-white text-xs">Redo</button>
                  <button onClick={() => nudge(1, 0)} className="border rounded py-2 bg-white" aria-label="Move right">→</button>
                  <span /><button onClick={() => nudge(0, 1)} className="border rounded py-2 bg-white" aria-label="Move down">↓</button><span />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 w-36">
                  <button onClick={() => nudge(0, 0, 1 / 1.04)} className="border rounded py-2 bg-white text-xs">Narrower</button>
                  <button onClick={() => nudge(0, 0, 1.04)} className="border rounded py-2 bg-white text-xs">Wider</button>
                </div>
                <p className="mt-2 text-xs text-gray-500">Camera speed: {fps} frames/sec</p>
                <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-500"><input type="checkbox" checked={showDiag} onChange={(e) => setShowDiag(e.target.checked)} /> Show tracking info during the drill</label>
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
            <button disabled={!rim || (aimStep === "court" && (!court || (arcTaps.length < 4 && !courtOk)))} onClick={beginCountdown} className="mt-4 w-full bg-garnet text-white rounded-lg px-5 py-4 font-semibold text-lg disabled:opacity-40">
              Start {drill.label} {isFile ? "" : "(5-second countdown)"}
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
          {clip && (
            <div className="mt-3 bg-white border rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <div className="eyebrow text-[10px] text-gray-500">Video of this workout</div>
                  <div className="text-xs text-gray-600">Stays on this phone — it isn't uploaded. Save it now if you want to keep it.</div>
                </div>
                <button onClick={saveClip} className="bg-garnet text-white rounded-lg px-4 py-2 font-semibold text-sm">Save video to this device</button>
              </div>
              <video src={clip.url} controls playsInline className="w-full rounded bg-black" style={{ maxHeight: "50vh" }} />
              <p className="mt-2 text-xs text-gray-600">
                Button not working? <button onClick={downloadClip} className="underline text-garnet">Download instead</button> — on an iPhone it lands in the Files app under Downloads; open it there and choose Save Video.
              </p>
            </div>
          )}
          {!clip && (
            <p className="mt-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">No video was recorded for this workout ({statsRef.current.rec}). Your stats are not affected.</p>
          )}
          <DiagnosticsBlock key={diagTick} stats={statsRef.current} shots={shots.length} rimWidth={rim?.width ?? 0} video={videoSize} />
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

// What the tracker saw during the last drill — for screenshots when something goes wrong.
function DiagnosticsBlock({ stats, shots, rimWidth, video }: { stats: { frames: number; ballFrames: number; armedFrames: number; events: number; located: number; clockSource: string; clockGlitches: number; slowestFps: number; errors: string[]; rec: string; browser: string }; shots: number; rimWidth: number; video: { w: number; h: number } | null }) {
  const rows: [string, string][] = [
    ["Camera picture", video ? `${video.w} × ${video.h}` : "none"],
    ["Rim width in the picture", `${Math.round(rimWidth)} pixels`],
    ["Frames checked", String(stats.frames)],
    ["Slowest speed", `${stats.slowestFps} frames/sec`],
    ["Frames with a ball near the rim", String(stats.ballFrames)],
    ["Frames following a falling ball", String(stats.armedFrames)],
    ["Shots the camera called", `${stats.events} (${shots} on the sheet)`],
    ["Shots placed on the court", String(stats.located)],
    ["Frame clock", `${stats.clockSource}${stats.clockGlitches ? ` (${stats.clockGlitches} glitches)` : ""}`],
    ["Video recording", stats.rec],
    ["Errors", stats.errors.length ? stats.errors.join(" | ") : "none"],
    ["Browser", stats.browser],
  ];
  return (
    <details className="mt-3 bg-white border rounded-lg px-3 py-2 text-xs text-gray-700">
      <summary className="cursor-pointer font-semibold text-gray-600">Diagnostics (screenshot this if something went wrong)</summary>
      <table className="mt-2 w-full"><tbody>
        {rows.map(([k, v2]) => <tr key={k} className="border-t align-top"><td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{k}</td><td className="py-1 break-all">{v2}</td></tr>)}
      </tbody></table>
    </details>
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
