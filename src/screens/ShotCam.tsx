// ---------------------------------------------------------------------------
// Shot Cam — camera-tracked shooting workouts (stage 1: makes & misses).
// ---------------------------------------------------------------------------
// The player picks one of the three program drills, props the phone up so it
// can see the hoop, marks the rim, and shoots. The camera counts makes and
// misses, runs the drill clock, and the result is saved to shot_cam_sessions.
// All video is processed on the phone — no footage is uploaded or stored.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getPlayers, type PlayerRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import { ShotDetector, ROI_W, ROI_H, RIM_PX, RIM_CX, RIM_CY, roiRect, type FrameDebug, type RimBox } from "../lib/shotcam/detector";
import { CAM_DRILLS, camDrill, fmtClock, pctText, type CamDrill, type CamShot } from "../lib/shotcam/drills";
import { listCamSessions, saveCamSession, deleteCamSession, type CamSessionRow } from "../lib/shotcam/store";

type Stage = "pick" | "aim" | "countdown" | "live" | "review";
const MIN_RIM_PX = 22; // below this the hoop is too small in the picture to track well
const GRACE_MS = 1000; // a shot in the air at the buzzer still counts

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
    try { await v.play(); } catch { setError("That video can't be played in this browser."); setStage("pick"); }
  }

  function chooseDrill(d: CamDrill, file?: File) {
    setDrill(d); setNotice(""); setShots([]); shotsRef.current = [];
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
    pushShots([...shotsRef.current, { t, made, src }]);
    (made ? sound.make : sound.miss)();
    if (d.attempts && shotsRef.current.length >= d.attempts) { sound.buzzer(); endDrill(t); }
  }, [endDrill]);

  function undoLast() { pushShots(shotsRef.current.slice(0, -1)); }

  function beginCountdown() {
    unlockAudio();
    pushShots([]); autoRef.current = { makes: 0, attempts: 0 };
    buzzedRef.current = false; lastTickRef.current = -1;
    goAtRef.current = clock() + (isFile ? 2000 : 10000);
    setElapsed(0);
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
    let stop = false, frames = 0, fpsAt = performance.now(), raf = 0, vfc = 0;
    const hasVfc = "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    const schedule = () => {
      if (stop) return;
      if (hasVfc) vfc = v.requestVideoFrameCallback(step); else raf = requestAnimationFrame(step);
    };

    function step() {
      if (stop || !v) return;
      if (v.videoWidth && (!videoSizeRef.current || videoSizeRef.current.w !== v.videoWidth || videoSizeRef.current.h !== v.videoHeight)) {
        videoSizeRef.current = { w: v.videoWidth, h: v.videoHeight };
        setVideoSize(videoSizeRef.current);
      }
      const now = clock();
      const r = rimRef.current;
      if (r && v.readyState >= 2) {
        const q = roiRect(r);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ROI_W, ROI_H);
        ctx.drawImage(v, q.x, q.y, q.w, q.h, 0, 0, ROI_W, ROI_H);
        const img = ctx.getImageData(0, 0, ROI_W, ROI_H);
        const ev = det.current.process(img.data, now, dbg);
        if (dbg.drift) { r.cx += dbg.drift.dx * q.scale; r.cy += dbg.drift.dy * q.scale; }
        if (ev && stageRef.current === "live") addShot(ev.result === "make", "cam", ev.t);
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
      if (!r) return;
      const q = roiRect(r);
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = lw / 2; c.strokeRect(q.x, q.y, q.w, q.h);
      c.strokeStyle = "#22c55e"; c.lineWidth = lw;
      c.beginPath(); c.moveTo(r.cx - r.width / 2, r.cy); c.lineTo(r.cx + r.width / 2, r.cy); c.stroke();
      if (boxesRef.current) {
        c.strokeStyle = "#facc15"; c.lineWidth = lw / 2;
        for (const b of d.balls) c.strokeRect(q.x + b.x * q.scale, q.y + b.y * q.scale, b.w * q.scale, b.h * q.scale);
      }
    }

    schedule();
    return () => { stop = true; cancelAnimationFrame(raf); if (hasVfc && vfc) v.cancelVideoFrameCallback(vfc); };
  }, [active, addShot, clock, endDrill]);

  const videoSizeRef = useRef<{ w: number; h: number } | null>(null);
  const tapsRef = useRef<{ x: number; y: number }[]>([]);
  tapsRef.current = taps;
  useEffect(() => { if (!videoSize) videoSizeRef.current = null; }, [videoSize]);

  // ---- aiming ---------------------------------------------------------------
  function onTap(e: React.PointerEvent<HTMLCanvasElement>) {
    if (stage !== "aim" || !videoSize) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - rect.left) / rect.width) * videoSize.w, y: ((e.clientY - rect.top) / rect.height) * videoSize.h };
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
        auto_makes: autoRef.current.makes, auto_attempts: autoRef.current.attempts, shots,
      });
      setNotice(`Saved — ${drill.label}: ${makes}/${shots.length} (${pctText(makes, shots.length)})`);
      loadHistory();
      setStage("pick");
    } catch (e) {
      setError(`Couldn't save: ${(e as Error).message}`);
    } finally { setSaving(false); }
  }
  function discard() { setStage("pick"); setNotice(""); }
  function leave() { stopSource(); setRim(null); setTaps([]); setStage("pick"); }

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
                    <tr key={h.id} className="border-b last:border-0">
                      <td className="p-2 whitespace-nowrap">{h.workout_date}</td>
                      {!isPlayer && <td className="p-2">{playerName(h.player_id)}</td>}
                      <td className="p-2">{camDrill(h.drill)?.label ?? h.drill}</td>
                      <td className="p-2 font-semibold">{h.makes}/{h.attempts}</td>
                      <td className="p-2">{pctText(h.makes, h.attempts)}</td>
                      <td className="p-2">{fmtClock(h.duration_ms)}</td>
                      <td className="p-2 text-right"><button onClick={() => removeSession(h.id)} className="text-xs text-gray-400 hover:text-garnet">Delete</button></td>
                    </tr>
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
          <h2 className="headline-bold text-xl text-garnet">{drill.label} — mark the rim</h2>
          <p className="text-sm text-gray-700">
            {!rim ? (taps.length === 0 ? "Tap the LEFT edge of the rim in the picture." : "Now tap the RIGHT edge of the rim.")
              : "Check the close-up: the green line should sit on the rim, edge to edge, with the net inside the dashed box."}
          </p>
          {rim && (
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
          <button disabled={!rim} onClick={beginCountdown} className="mt-4 w-full bg-garnet text-white rounded-lg px-5 py-4 font-semibold text-lg disabled:opacity-40">
            Start {drill.label} {isFile ? "" : "(10-second countdown)"}
          </button>
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
