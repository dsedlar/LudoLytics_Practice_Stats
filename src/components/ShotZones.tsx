// Per-player shot-zone chart: a half court split into zones, each showing
// FG% + makes/attempts, shaded by efficiency. Zones match court.ts/playerZoneFor.
import type { PlayerZones } from "../lib/seasonData";
import type { PlayerZone } from "../lib/court";

const hx = 150, hy = 261, sc = 5.6;
const rimR = 4 * sc; // restricted area radius
const rArc = 19.75 * sc; // 3-point radius
const OUTER = 340;

const rad = (d: number) => (d * Math.PI) / 180;
const P = (r: number, d: number): [number, number] => [hx + r * Math.sin(rad(d)), hy - r * Math.cos(rad(d))];
const f = (n: number) => n.toFixed(1);

function wedge(ri: number, ro: number, d1: number, d2: number): string {
  const [ix1, iy1] = P(ri, d1), [ix2, iy2] = P(ri, d2);
  const [ox2, oy2] = P(ro, d2), [ox1, oy1] = P(ro, d1);
  return `M${f(ix1)},${f(iy1)} A${f(ri)},${f(ri)} 0 0 1 ${f(ix2)},${f(iy2)} L${f(ox2)},${f(oy2)} A${f(ro)},${f(ro)} 0 0 0 ${f(ox1)},${f(oy1)} Z`;
}

interface ZoneDef { key: PlayerZone; path?: string; la: number; lr: number }
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
  if (a === 0) return { bg: "#ECEDEF", fg: "#9aa0aa" };
  const p = m / a;
  if (p < 0.2) return { bg: "#F3DCDC", fg: "#7A1313" };
  if (p < 0.35) return { bg: "#E7A9A9", fg: "#5A0A0A" };
  if (p < 0.5) return { bg: "#D06A6A", fg: "#ffffff" };
  if (p < 0.65) return { bg: "#B20000", fg: "#ffffff" };
  return { bg: "#7A0000", fg: "#ffffff" };
}

function ZoneLabel({ z, fg }: { z: ZoneSplitUI; fg: string }) {
  return (
    <g>
      <text x={z.x} y={z.y - 2} textAnchor="middle" fontSize="15" fontWeight={800} fill={fg}>
        {z.a ? `${Math.round((z.m / z.a) * 100)}%` : "–"}
      </text>
      <text x={z.x} y={z.y + 13} textAnchor="middle" fontSize="11" fill={fg} opacity={0.85}>
        {z.m}/{z.a}
      </text>
    </g>
  );
}
interface ZoneSplitUI { x: number; y: number; m: number; a: number }

export default function ShotZones({ zones }: { zones: PlayerZones }) {
  const total = Object.values(zones).reduce((s, z) => ({ m: s.m + z.m, a: s.a + z.a }), { m: 0, a: 0 });
  const rim = zones.rim;
  const rimC = color(rim.m, rim.a);
  return (
    <div className="bg-white border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold">Shot zones</h2>
        <span className="text-sm text-gray-500">{total.a ? `${Math.round((total.m / total.a) * 100)}% · ${total.m}/${total.a} FG` : "No located shots"}</span>
      </div>
      <svg viewBox="0 0 300 300" className="w-full" style={{ maxHeight: 320 }}>
        <defs>
          <clipPath id="court"><rect x="10" y="16" width="280" height="274" /></clipPath>
        </defs>
        <rect x="10" y="16" width="280" height="274" fill="#ECEDEF" />
        <g clipPath="url(#court)">
          {ZONES.map((z) => {
            const c = color(zones[z.key].m, zones[z.key].a);
            return <path key={z.key} d={z.path} fill={c.bg} stroke="#fff" strokeWidth={2.5} />;
          })}
          {/* rim zone */}
          <circle cx={hx} cy={hy} r={rimR} fill={rimC.bg} stroke="#fff" strokeWidth={2.5} />
        </g>
        {/* subtle court lines */}
        <g fill="none" stroke="#ffffff" strokeWidth={1.5} opacity={0.6}>
          <line x1="120" y1="290" x2="120" y2="186" />
          <line x1="180" y1="290" x2="180" y2="186" />
          <line x1="120" y1="186" x2="180" y2="186" />
        </g>
        <rect x="10" y="16" width="280" height="274" fill="none" stroke="#d3d6db" strokeWidth={1.5} />

        {/* labels */}
        {ZONES.map((z) => {
          const [lx, ly] = P(z.lr, z.la);
          const c = color(zones[z.key].m, zones[z.key].a);
          return <ZoneLabel key={z.key} z={{ x: lx, y: ly, m: zones[z.key].m, a: zones[z.key].a }} fg={c.fg} />;
        })}
        <ZoneLabel z={{ x: hx, y: hy - 2, m: rim.m, a: rim.a }} fg={rimC.fg} />
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Low</span>
        {["#F3DCDC", "#E7A9A9", "#D06A6A", "#B20000", "#7A0000"].map((c) => (
          <span key={c} style={{ background: c, width: 16, height: 10, borderRadius: 2, display: "inline-block" }} />
        ))}
        <span>High FG%</span>
      </div>
    </div>
  );
}
