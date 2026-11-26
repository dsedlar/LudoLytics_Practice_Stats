// Shot Cam — find the shooter's feet.
// Given a picture and the spot where the ball left the shooter's hands, run a
// body-pose model on the area around it and return where that player's feet
// are. The model (MediaPipe Pose, ~6 MB) is loaded on first use and runs on
// the device.
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Pt } from "./geometry";

let loader: Promise<PoseLandmarker | null> | null = null;

export function loadPose(): Promise<PoseLandmarker | null> {
  loader ??= (async () => {
    try {
      const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks("/shotcam/wasm");
      const make = (delegate: "GPU" | "CPU") => PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/shotcam/pose_landmarker_lite.task", delegate },
        runningMode: "IMAGE", numPoses: 3, minPoseDetectionConfidence: 0.3, minPosePresenceConfidence: 0.3,
      });
      let pose: PoseLandmarker;
      try { pose = await make("GPU"); } catch { pose = await make("CPU"); }
      // Warm up now: the first run is slow, and we don't want that pause mid-drill.
      const blank = document.createElement("canvas");
      blank.width = blank.height = 384;
      blank.getContext("2d")!.fillRect(0, 0, 384, 384);
      pose.detect(blank);
      return pose;
    } catch (e) {
      console.warn("Shot Cam: pose model unavailable — shot locations are off.", e);
      return null;
    }
  })();
  return loader;
}

let crop: HTMLCanvasElement | null = null;

/**
 * Find the feet of the player nearest `release` in `frame` (both in the
 * frame's own pixels). Returns the point on the floor between the feet, or null.
 */
export async function findFeet(frame: HTMLCanvasElement, release: Pt): Promise<Pt | null> {
  const pose = await loadPose();
  if (!pose) return null;
  crop ??= document.createElement("canvas");
  // Try a wide look first, then a tighter one (helps when the player is small in the picture).
  // Looks: [size as a fraction of picture height, how far above the release point the look starts].
  // Wide first, then tighter (player small in the picture), then centred on the
  // point (in case the trace ran down to the player's body instead of the hands).
  for (const [frac, above] of [[0.55, 0.15], [0.32, 0.15], [0.55, 0.6]]) {
    const side = Math.round(frame.height * frac);
    const x0 = Math.round(release.x - side / 2), y0 = Math.round(release.y - side * above);
    crop.width = crop.height = 384;
    const ctx = crop.getContext("2d")!;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 384, 384);
    ctx.drawImage(frame, x0, y0, side, side, 0, 0, 384, 384);
    const res = pose.detect(crop);
    let best: Pt | null = null, bestD = Infinity;
    for (const lm of res.landmarks) {
      const px = (i: number) => ({ x: x0 + lm[i].x * side, y: y0 + lm[i].y * side });
      // closest of nose / wrists / hips to the release point decides whose shot it was
      const d = Math.min(...[0, 15, 16, 23, 24].map((i) => Math.hypot(px(i).x - release.x, px(i).y - release.y)));
      const feet = [29, 30, 31, 32].map(px); // heels and toes
      const f = { x: feet.reduce((s, p) => s + p.x, 0) / 4, y: feet.reduce((s, p) => s + p.y, 0) / 4 };
      if (f.y <= release.y - side * 0.08) continue; // feet can't be above the ball
      const tall = f.y - px(0).y; // nose to floor, in frame pixels
      if (tall < side * 0.1 || d > tall * 1.2) continue; // not a real standing player, or too far from the ball to be the shooter
      if (d < bestD) { bestD = d; best = f; }
    }
    if (best && bestD < side * 0.45) return best;
  }
  return null;
}
