// Shot Cam drills — the three program drills a player can run on camera.
// Baylor and 90 Seconds run on a countdown clock; free throws end after a set
// number of shots (taken from the same config the practice report uses).
import { SHOOTING_DRILLS } from "../config";

export type CamDrillKey = "baylor" | "ft" | "ninety";

export interface CamDrill {
  key: CamDrillKey;
  label: string;
  blurb: string;
  /** Drill ends after this many shots (the clock counts up)… */
  attempts?: number;
  /** …or after this many seconds (the clock counts down). */
  seconds?: number;
}

const denom = (k: string, fallback: number) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? fallback;

export const CAM_DRILLS: CamDrill[] = [
  { key: "baylor", label: "Baylor Shooting", blurb: "As many makes as you can in 5 minutes", seconds: 300 },
  { key: "ft", label: `${denom("ft", 20)} Free Throws`, blurb: `${denom("ft", 20)} free throws`, attempts: denom("ft", 20) },
  { key: "ninety", label: "90 Seconds", blurb: "As many makes as you can in 90 seconds", seconds: 90 },
];

export const camDrill = (key: string) => CAM_DRILLS.find((d) => d.key === key);

/** One shot in a session. `t` is ms since the drill clock started. */
export interface CamShot {
  t: number; made: boolean; src: "cam" | "manual"; edited?: boolean;
  /** Where the shooter stood, in court feet (lib/court.ts system) — only when the court was marked and the shot could be traced. */
  x?: number; y?: number;
  /** Local key while the drill is running; not saved. */
  id?: number;
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const pctText = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : "–");
