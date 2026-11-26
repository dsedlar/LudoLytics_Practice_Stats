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

const rad = (d: number) => (d * Math.PI) / 180;
const P = (r: number, d: number): [number, number] => [B.x + r * Math.sin(rad(d)), B.y + r * Math.cos(rad(d))];
const f = (n: number) => n.toFixed(2);
function wedge(ri: number, ro: number, d1: number, d2: number): string {
  const [ix1, iy1] = P(ri, d1), [ix2, iy2] = P(ri, d2), [ox2, oy2] = P(ro, d2), [ox1, oy1] = P(ro, d1);
  return `M${f(ix1)},${f(iy1)} A${f(ri)},${f(ri)} 0 0 0 ${f(ix2)},${f(iy2)} L${f(ox2)},${f(oy2)} A${f(ro)},${f(ro)} 0 0 1 ${f(ox1)},${f(oy1)} Z`;
}
const RIM = COURT.atrR, ARC = COURT.threeR, OUT = 60; // outer edge is clipped to the picture
const MR = (RIM + ARC) / 2;
// Same sections the rest of the app uses (playerZoneFor); label spots chosen to sit inside each one.
const ZONES: { key: PlayerZone; path: string; lx: number; ly: number }[] = [
  { key: "midLeft", path: wedge(RIM, ARC, -110, -30), lx: P(MR, -62)[0], ly: P(MR, -62)[1] },
  { key: "paint", path: wedge(RIM, ARC, -30, 30), lx: B.x, ly: B.y + MR + 1 },
  { key: "midRight", path: wedge(RIM, ARC, 30, 110), lx: P(MR, 62)[0], ly: P(MR, 62)[1] },
  { key: "cornerLeft", path: wedge(ARC, OUT, -110, -68), lx: 3.5, ly: 6 },
  { key: "wingLeft", path: wedge(ARC, OUT, -68, -24), lx: 7.5, ly: 25 },
  { key: "top", path: wedge(ARC, OUT, -24, 24), lx: B.x, ly: 31 },
  { key: "wingRight", path: wedge(ARC, OUT, 24, 68), lx: W - 7.5, ly: 25 },
  { key: "cornerRight", path: wedge(ARC, OUT, 68, 110), lx: W - 3.5, ly: 6 },
];
const EMPTY = "#e5e7eb";

export function ShotCamZones({ shots }: { shots: ChartShot[] }) {
  const t = zoneTotals(shots);
  const rim = t.get("rim");
  const label = (key: PlayerZone, x: number, y: number, small = false) => {
    const e = t.get(key);
    if (!e) return <text key={key} x={x} y={y} textAnchor="middle" fontSize="1.6" fill="#9ca3af">–</text>;
    const h = heatFor(key, e.m, e.a);
    return (
      <g key={key} fill={h.text}>
        <text x={x} y={y} textAnchor="middle" fontSize={small ? 1.7 : 2.6} fontWeight={800}>{Math.round((e.m / e.a) * 100)}%</text>
        <text x={x} y={y + (small ? 1.6 : 2.1)} textAnchor="middle" fontSize={small ? 1.25 : 1.6}>({e.m}-{e.a})</text>
      </g>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${VIEW_H}`} className="w-full block rounded-lg" role="img" aria-label="Shooting percentage from each section of the court">
      <defs><clipPath id="shotcam-zones"><rect x={0} y={0} width={W} height={VIEW_H} /></clipPath></defs>
      <g clipPath="url(#shotcam-zones)" stroke="#ffffff" strokeWidth={0.35}>
        <rect x={0} y={0} width={W} height={VIEW_H} fill={EMPTY} stroke="none" />
        {ZONES.map((z) => { const e = t.get(z.key); return <path key={z.key} d={z.path} fill={e ? heatFor(z.key, e.m, e.a).color : EMPTY} />; })}
        <circle cx={B.x} cy={B.y} r={RIM} fill={rim ? heatFor("rim", rim.m, rim.a).color : EMPTY} />
      </g>
      {ZONES.map((z) => label(z.key, z.lx, z.ly, z.key === "cornerLeft" || z.key === "cornerRight"))}
      {label("rim", B.x, B.y + 0.4, true)}
    </svg>
  );
}
