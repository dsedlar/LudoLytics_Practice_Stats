// Half-court chart for Shot Cam: every located shot as a mark (O = make,
// X = miss) and, with `showSpots`, the percentage from each of the five
// spots behind the 3-point arc.
import { COURT, playerZoneFor, type PlayerZone } from "../lib/court";
import CourtBackdrop from "./CourtBackdrop";

export interface ChartShot { x?: number; y?: number; made: boolean; }

export const THREE_SPOTS: { key: PlayerZone; label: string; angle: number }[] = [
  { key: "cornerLeft", label: "Left corner", angle: -96 },
  { key: "wingLeft", label: "Left wing", angle: -46 },
  { key: "top", label: "Top", angle: 0 },
  { key: "wingRight", label: "Right wing", angle: 46 },
  { key: "cornerRight", label: "Right corner", angle: 96 },
];

export function spotTotals(shots: ChartShot[]) {
  const t = new Map<PlayerZone, { m: number; a: number }>();
  for (const s of shots) {
    if (s.x == null || s.y == null) continue;
    const z = playerZoneFor(s.x, s.y);
    const e = t.get(z) ?? { m: 0, a: 0 };
    e.a++; if (s.made) e.m++;
    t.set(z, e);
  }
  return t;
}

const VIEW_H = 37; // show baseline to a little past the arc
const clampPt = (s: ChartShot) => ({ x: Math.min(COURT.width - 0.8, Math.max(0.8, s.x!)), y: Math.min(VIEW_H - 0.8, Math.max(0.8, s.y!)) });

export default function ShotCamChart({ shots, showSpots = false, dark = false, markSize = 0.9 }: { shots: ChartShot[]; showSpots?: boolean; dark?: boolean; markSize?: number }) {
  const located = shots.filter((s) => s.x != null && s.y != null);
  const totals = spotTotals(shots);
  const line = dark ? "#ffffff" : "#6B7280";
  const B = COURT.basket, r = markSize;
  return (
    <svg viewBox={`0 0 ${COURT.width} ${VIEW_H}`} className="w-full block" role="img" aria-label="Shot chart">
      <CourtBackdrop color={line} />
      {showSpots && THREE_SPOTS.map((sp) => {
        const t = totals.get(sp.key);
        if (!t) return null;
        const a = (sp.angle * Math.PI) / 180, R = COURT.threeR + 8.2;
        const x = Math.min(46.5, Math.max(3.5, B.x + R * Math.sin(a))), y = Math.min(VIEW_H - 2.4, Math.max(2.6, B.y + R * Math.cos(a)));
        return (
          <g key={sp.key}>
            <rect x={x - 3.3} y={y - 2.5} width={6.6} height={4.6} rx={0.6} fill="#ffffff" stroke="#B20000" strokeWidth={0.15} opacity={0.95} />
            <text x={x} y={y - 0.1} textAnchor="middle" fontSize="2.3" fontWeight={800} fill="#B20000">{Math.round((t.m / t.a) * 100)}%</text>
            <text x={x} y={y + 1.6} textAnchor="middle" fontSize="1.5" fill="#374151">{t.m}/{t.a}</text>
          </g>
        );
      })}
      {located.map((s, i) => {
        const p = clampPt(s);
        return s.made
          ? <circle key={i} cx={p.x} cy={p.y} r={r} fill={dark ? "rgba(0,0,0,0.35)" : "#ffffff"} stroke={dark ? "#4ade80" : "#16a34a"} strokeWidth={r * 0.5} />
          : <g key={i} stroke={dark ? "#ffffff" : "#B20000"} strokeWidth={r * 0.45} strokeLinecap="round"><line x1={p.x - r} y1={p.y - r} x2={p.x + r} y2={p.y + r} /><line x1={p.x - r} y1={p.y + r} x2={p.x + r} y2={p.y - r} /></g>;
      })}
    </svg>
  );
}
