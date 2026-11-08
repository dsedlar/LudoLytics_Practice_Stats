// Per-player shot-zone chart: a half court (hoop at top) split into zones,
// each a colored area showing FG% + makes/attempts. No court lines — the
// colored areas and the percentages carry it. Zones match court.ts.
import type { PlayerZones } from "../lib/seasonData";
import type { PlayerZone } from "../lib/court";

const CREAM = "#F3EED4";
const EMPTY = "#EAE4CC"; // a zone with no attempts (blends into the court)

const hx = 150, Ty = 12, sc = 5.45;
const hy = Ty + 5.25 * sc; // basket, near the top
const rimR = 4 * sc;
const rArc = 19.75 * sc;
const OUTER = 360;
const COURT = { x: 12, y: 12, w: 276, h: 180 };

const rad = (d: number) => (d * Math.PI) / 180;
// hoop at top → shots go DOWN the court (increasing y)
const P = (r: number, d: number): [number, number] => [hx + r * Math.sin(rad(d)), hy + r * Math.cos(rad(d))];
const f = (n: number) => n.toFixed(1);

function wedge(ri: number, ro: number, d1: number, d2: number): string {
  const [ix1, iy1] = P(ri, d1), [ix2, iy2] = P(ri, d2);
  const [ox2, oy2] = P(ro, d2), [ox1, oy1] = P(ro, d1);
  return `M${f(ix1)},${f(iy1)} A${f(ri)},${f(ri)} 0 0 0 ${f(ix2)},${f(iy2)} L${f(ox2)},${f(oy2)} A${f(ro)},${f(ro)} 0 0 1 ${f(ox1)},${f(oy1)} Z`;
}

interface ZoneDef { key: PlayerZone; path: string; la: number; lr: number }
const ZONES: ZoneDef[] = [
  { key: "midLeft", path: wedge(rimR, rArc, -110, -30), la: -58, lr: (rimR + rArc) / 2 },
  { key: "paint", path: wedge(rimR, rArc, -30, 30), la: 0, lr: (rimR + rArc) / 2 },
  { key: "midRight", path: wedge(rimR, rArc, 30, 110), la: 58, lr: (rimR + rArc) / 2 },
  { key: "cornerLeft", path: wedge(rArc, OUTER, -110, -68), la: -82, lr: rArc + 22 },
  { key: "wingLeft", path: wedge(rArc, OUTER, -68, -24), la: -46, lr: rArc + 24 },
  { key: "top", path: wedge(rArc, OUTER, -24, 24), la: 0, lr: rArc + 24 },
  { key: "wingRight", path: wedge(rArc, OUTER, 24, 68), la: 46, lr: rArc + 24 },
  { key: "cornerRight", path: wedge(rArc, OUTER, 68, 110), la: 82, lr: rArc + 22 },
];

function color(m: number, a: number): { bg: string; fg: string } {
  if (a === 0) return { bg: EMPTY, fg: "#b3ab8e" };
  const p = m / a;
  if (p < 0.2) return { bg: "#F2D7D7", fg: "#7A1313" };
  if (p < 0.35) return { bg: "#E39B9B", fg: "#5A0A0A" };
  if (p < 0.5) return { bg: "#CC5B5B", fg: "#ffffff" };
  if (p < 0.65) return { bg: "#B20000", fg: "#ffffff" };
  return { bg: "#7A0000", fg: "#ffffff" };
}

function Label({ x, y, m, a, fg }: { x: number; y: number; m: number; a: number; fg: string }) {
  if (a === 0 && m === 0) return null; // don't clutter empty areas
  return (
    <g>
      <text x={x} y={y - 1} textAnchor="middle" fontSize="14" fontWeight={800} fill={fg}>
        {a ? `${Math.round((m / a) * 100)}%` : "–"}
      </text>
      <text x={x} y={y + 12} textAnchor="middle" fontSize="10.5" fill={fg} opacity={0.85}>
        {m}/{a}
      </text>
    </g>
  );
}

export default function ShotZones({ zones }: { zones: PlayerZones }) {
  const total = Object.values(zones).reduce((s, z) => ({ m: s.m + z.m, a: s.a + z.a }), { m: 0, a: 0 });
  const rim = zones.rim;
  const rimC = color(rim.m, rim.a);
  return (
    <div className="bg-white border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold">Shot zones</h2>
        <span className="text-sm text-gray-500">
          {total.a ? `${Math.round((total.m / total.a) * 100)}% · ${total.m}/${total.a} FG` : "No located shots"}
        </span>
      </div>
      <svg viewBox="0 0 300 204" className="w-full" style={{ maxHeight: 340 }}>
        <defs>
          <clipPath id="court"><rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" /></clipPath>
        </defs>
        <rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" fill={CREAM} />
        <g clipPath="url(#court)">
          {ZONES.map((z) => {
            const c = color(zones[z.key].m, zones[z.key].a);
            return <path key={z.key} d={z.path} fill={c.bg} stroke={CREAM} strokeWidth={2.5} />;
          })}
          <circle cx={hx} cy={hy} r={rimR} fill={rimC.bg} stroke={CREAM} strokeWidth={2.5} />
        </g>
        {ZONES.map((z) => {
          const [lx, ly] = P(z.lr, z.la);
          const c = color(zones[z.key].m, zones[z.key].a);
          return <Label key={z.key} x={lx} y={ly} m={zones[z.key].m} a={zones[z.key].a} fg={c.fg} />;
        })}
        <Label x={hx} y={hy + 4} m={rim.m} a={rim.a} fg={rimC.fg} />
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Low</span>
        {["#F2D7D7", "#E39B9B", "#CC5B5B", "#B20000", "#7A0000"].map((c) => (
          <span key={c} style={{ background: c, width: 16, height: 10, borderRadius: 2, display: "inline-block" }} />
        ))}
        <span>High FG%</span>
      </div>
    </div>
  );
}
