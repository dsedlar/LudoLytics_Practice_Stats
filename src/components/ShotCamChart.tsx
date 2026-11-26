// Half-court charts for Shot Cam.
//   ShotCamChart — every located shot as a mark (O = make, X = miss). No numbers.
//   ShotCamZones — after the workout: each section of the court shaded by how
//                  well the player shot there (blue = cold, orange = hot), with
//                  the percentage and makes-attempts.
import { COURT, ZONE_BENCHMARK, playerZoneFor, type PlayerZone } from "../lib/court";
import CourtBackdrop from "./CourtBackdrop";

export interface ChartShot { x?: number; y?: number; made: boolean; }
type Totals = Map<PlayerZone, { m: number; a: number }>;

export function zoneTotals(shots: ChartShot[]): Totals {
  const t: Totals = new Map();
  for (const s of shots) {
    if (s.x == null || s.y == null) continue;
    const z = playerZoneFor(s.x, s.y);
    const e = t.get(z) ?? { m: 0, a: 0 };
    e.a++; if (s.made) e.m++;
    t.set(z, e);
  }
  return t;
}

/** Makes/attempts for the three headline areas. */
export function areaTotals(shots: ChartShot[]) {
  const t = zoneTotals(shots);
  const sum = (keys: PlayerZone[]) => keys.reduce((acc, k) => { const e = t.get(k); return e ? { m: acc.m + e.m, a: acc.a + e.a } : acc; }, { m: 0, a: 0 });
  return {
    paint: sum(["rim", "paint"]),
    mid: sum(["midLeft", "midRight"]),
    three: sum(["cornerLeft", "wingLeft", "top", "wingRight", "cornerRight"]),
  };
}

const VIEW_H = 37; // baseline to a little past the arc
const W = COURT.width, B = COURT.basket;

// ---- marks ------------------------------------------------------------------
const clampPt = (s: ChartShot) => ({ x: Math.min(W - 0.8, Math.max(0.8, s.x!)), y: Math.min(VIEW_H - 0.8, Math.max(0.8, s.y!)) });

export default function ShotCamChart({ shots, dark = false, markSize = 0.9 }: { shots: ChartShot[]; dark?: boolean; markSize?: number }) {
  const located = shots.filter((s) => s.x != null && s.y != null);
  const r = markSize;
  return (
    <svg viewBox={`0 0 ${W} ${VIEW_H}`} className="w-full block" role="img" aria-label="Shot chart: O is a make, X is a miss">
      <CourtBackdrop color={dark ? "#ffffff" : "#6B7280"} />
      {located.map((s, i) => {
        const p = clampPt(s);
        return s.made
          ? <circle key={i} cx={p.x} cy={p.y} r={r} fill={dark ? "rgba(0,0,0,0.35)" : "#ffffff"} stroke={dark ? "#4ade80" : "#16a34a"} strokeWidth={r * 0.5} />
          : <g key={i} stroke={dark ? "#ffffff" : "#B20000"} strokeWidth={r * 0.45} strokeLinecap="round"><line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} /><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} /></g>;
      })}
    </svg>
  );
}

// ---- zones ------------------------------------------------------------------
// Cold -> hot, judged against what counts as good from that part of the floor
// (lib/court.ts ZONE_BENCHMARK: about 33-36% on threes, higher near the rim).
export const HEAT: { color: string; text: string; label: string; upTo: number }[] = [
  { color: "#1e3a8a", text: "#ffffff", label: "Cold", upTo: -0.1 },
  { color: "#7c9bdc", text: "#0f172a", label: "Below", upTo: -0.03 },
  { color: "#f6c38b", text: "#0f172a", label: "Solid", upTo: 0.04 },
  { color: "#f0832b", text: "#ffffff", label: "Hot", upTo: 0.12 },
  { color: "#e03a0c", text: "#ffffff", label: "On fire", upTo: Infinity },
];
const heatFor = (key: PlayerZone, m: number, a: number) => HEAT.find((h) => m / a - ZONE_BENCHMARK[key] < h.upTo)!;

// The sections are the ones the rest of the app uses (playerZoneFor): slices
// fanning out from the basket, split by the 3-point line. Here they are drawn
// on the real court — each slice is clipped to "inside the arc" or "outside
// the arc" — so the picture is the same court as the shot chart, coloured in.
const rad = (d: number) => (d * Math.PI) / 180;
const FAR = 90; // well past every edge of the picture
/** A slice of floor seen from the basket between two angles (0 = straight out, + = right). */
function slice(d1: number, d2: number): string {
  const pts: string[] = [`M${B.x},${B.y}`];
  const n = Math.max(1, Math.ceil((d2 - d1) / 6));
  for (let k = 0; k <= n; k++) { const d = d1 + ((d2 - d1) * k) / n; pts.push(`L${(B.x + FAR * Math.sin(rad(d))).toFixed(2)},${(B.y + FAR * Math.cos(rad(d))).toFixed(2)}`); }
  return pts.join(" ") + " Z";
}
// Everything inside the painted 3-point line, baseline to arc.
const INSIDE_ARC = (() => {
  const a0 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x), a1 = Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x);
  const pts = [`M${COURT.cornerX0},0`, `L${COURT.cornerX0},${COURT.cornerJoinY.toFixed(2)}`];
  for (let k = 0; k <= 48; k++) { const a = a0 + ((a1 - a0) * k) / 48; pts.push(`L${(B.x + COURT.threeR * Math.cos(a)).toFixed(2)},${(B.y + COURT.threeR * Math.sin(a)).toFixed(2)}`); }
  pts.push(`L${COURT.cornerX1},0`, "Z");
  return pts.join(" ");
})();
const P = (r: number, d: number) => ({ x: B.x + r * Math.sin(rad(d)), y: B.y + r * Math.cos(rad(d)) });
const ZONES: { key: PlayerZone; inside: boolean; path: string; at: { x: number; y: number }; small?: boolean }[] = [
  { key: "midLeft", inside: true, path: slice(-180, -30), at: P(13.5, -66) },
  { key: "paint", inside: true, path: slice(-30, 30), at: { x: B.x, y: B.y + 6.6 }, small: true },
  { key: "midRight", inside: true, path: slice(30, 180), at: P(13.5, 66) },
  { key: "cornerLeft", inside: false, path: slice(-180, -68), at: { x: COURT.cornerX0 / 2, y: 6.2 }, small: true },
  { key: "wingLeft", inside: false, path: slice(-68, -24), at: P(25.5, -47) },
  { key: "top", inside: false, path: slice(-24, 24), at: { x: B.x, y: B.y + 25.2 } },
  { key: "wingRight", inside: false, path: slice(24, 68), at: P(25.5, 47) },
  { key: "cornerRight", inside: false, path: slice(68, 180), at: { x: W - COURT.cornerX0 / 2, y: 6.2 }, small: true },
];
const FLOOR = "#ffffff";

export function ShotCamZones({ shots }: { shots: ChartShot[] }) {
  const t = zoneTotals(shots);
  const rim = t.get("rim");
  const fillOf = (key: PlayerZone) => { const e = t.get(key); return e ? heatFor(key, e.m, e.a) : null; };
  const label = (key: PlayerZone, x: number, y: number, small = false) => {
    const e = t.get(key);
    if (!e) return null;
    const h = heatFor(key, e.m, e.a);
    return (
      <g key={key} fill={h.text}>
        <text x={x} y={y} textAnchor="middle" fontSize={small ? 1.9 : 2.7} fontWeight={800}>{Math.round((e.m / e.a) * 100)}%</text>
        <text x={x} y={y + (small ? 1.6 : 2.1)} textAnchor="middle" fontSize={small ? 1.3 : 1.6}>({e.m}-{e.a})</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${VIEW_H}`} className="w-full block" role="img" aria-label="Shooting percentage from each section of the court">
      <defs>
        <clipPath id="shotcam-in"><path d={INSIDE_ARC} /></clipPath>
        <clipPath id="shotcam-out"><path d={`M0,0 H${W} V${VIEW_H} H0 Z ${INSIDE_ARC}`} clipRule="evenodd" /></clipPath>
      </defs>
      <rect x={0} y={0} width={W} height={VIEW_H} fill={FLOOR} />
      {[true, false].map((inside) => (
        <g key={String(inside)} clipPath={`url(#shotcam-${inside ? "in" : "out"})`}>
          {ZONES.filter((z) => z.inside === inside).map((z) => { const h = fillOf(z.key); return <path key={z.key} d={z.path} fill={h ? h.color : FLOOR} stroke="#9ca3af" strokeWidth={0.15} />; })}
        </g>
      ))}
      {rim && <circle cx={B.x} cy={B.y} r={COURT.atrR} fill={heatFor("rim", rim.m, rim.a).color} clipPath="url(#shotcam-in)" />}
      {/* the same court drawing as the shot chart, on top of the colours */}
      <CourtBackdrop color="#4B5563" />
      {ZONES.map((z) => label(z.key, z.at.x, z.at.y, z.small))}
      {label("rim", B.x, B.y + 2.2, true)}
    </svg>
  );
}
