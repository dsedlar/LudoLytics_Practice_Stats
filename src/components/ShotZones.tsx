// Per-player shot-zone chart on the same half court as the hexbin / live entry.
// Zones are colored areas (red = poor -> green = great, vs. each zone's
// benchmark) with FG% + makes/attempts; grey court lines are drawn on top.
import type { PlayerZones } from "../lib/seasonData";
import { COURT, ZONE_BENCHMARK, type PlayerZone } from "../lib/court";
import CourtBackdrop from "./CourtBackdrop";

const FLOOR = "#F3EED4";
const FILL_OP = 0.6;
const B = COURT.basket;        // (25, 5.25) feet
const rimR = COURT.atrR;       // 4
const rArc = COURT.threeR;     // 19.75
const OUTER = 30;              // zones cover the scoring area; deep backcourt stays plain
const W = COURT.width, H = COURT.height; // 50 x 47 feet

const rad = (d: number) => (d * Math.PI) / 180;
const P = (r: number, d: number): [number, number] => [B.x + r * Math.sin(rad(d)), B.y + r * Math.cos(rad(d))];
const f = (n: number) => n.toFixed(2);

function wedge(ri: number, ro: number, d1: number, d2: number): string {
  const [ix1, iy1] = P(ri, d1), [ix2, iy2] = P(ri, d2);
  const [ox2, oy2] = P(ro, d2), [ox1, oy1] = P(ro, d1);
  return `M${f(ix1)},${f(iy1)} A${f(ri)},${f(ri)} 0 0 0 ${f(ix2)},${f(iy2)} L${f(ox2)},${f(oy2)} A${f(ro)},${f(ro)} 0 0 1 ${f(ox1)},${f(oy1)} Z`;
}

interface ZoneDef { key: PlayerZone; path: string; la: number; lr: number }
const MR = (rimR + rArc) / 2;
const TR = rArc + 4;
const ZONES: ZoneDef[] = [
  { key: "midLeft", path: wedge(rimR, rArc, -110, -30), la: -58, lr: MR },
  { key: "paint", path: wedge(rimR, rArc, -30, 30), la: 0, lr: MR },
  { key: "midRight", path: wedge(rimR, rArc, 30, 110), la: 58, lr: MR },
  { key: "cornerLeft", path: wedge(rArc, OUTER, -110, -68), la: -83, lr: TR },
  { key: "wingLeft", path: wedge(rArc, OUTER, -68, -24), la: -46, lr: TR },
  { key: "top", path: wedge(rArc, OUTER, -24, 24), la: 0, lr: TR },
  { key: "wingRight", path: wedge(rArc, OUTER, 24, 68), la: 46, lr: TR },
  { key: "cornerRight", path: wedge(rArc, OUTER, 68, 110), la: 83, lr: TR },
];

// red (poor) -> green (great) vs each zone's benchmark; null = no shots
const RAMP = ["#D64545", "#E8894A", "#EFC84C", "#86C06A", "#3E9F54"];
function color(key: PlayerZone, m: number, a: number): string | null {
  if (a === 0) return null;
  const delta = m / a - ZONE_BENCHMARK[key];
  if (delta < -0.12) return RAMP[0];
  if (delta < -0.04) return RAMP[1];
  if (delta < 0.04) return RAMP[2];
  if (delta < 0.12) return RAMP[3];
  return RAMP[4];
}

function Label({ x, y, m, a }: { x: number; y: number; m: number; a: number }) {
  if (a === 0) return null;
  return (
    <g>
      <text x={x} y={y} textAnchor="middle" fontSize="2.6" fontWeight={800} fill="#1f2937">{`${Math.round((m / a) * 100)}%`}</text>
      <text x={x} y={y + 2.2} textAnchor="middle" fontSize="1.9" fill="#374151">{m}/{a}</text>
    </g>
  );
}

export default function ShotZones({ zones }: { zones: PlayerZones }) {
  const rim = zones.rim;
  const rimC = color("rim", rim.m, rim.a);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: FLOOR, maxHeight: 360 }}>
        <defs><clipPath id="zonecourt"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
        {/* colored zone areas (under the court lines) */}
        <g clipPath="url(#zonecourt)">
          {ZONES.map((z) => {
            const c = color(z.key, zones[z.key].m, zones[z.key].a);
            return c ? <path key={z.key} d={z.path} fill={c} fillOpacity={FILL_OP} /> : null;
          })}
          {rimC && <circle cx={B.x} cy={B.y} r={rimR} fill={rimC} fillOpacity={FILL_OP} />}
        </g>
        {/* grey court lines on top */}
        <CourtBackdrop color="#6B7280" />
        {/* labels */}
        {ZONES.map((z) => {
          const [lx, ly] = P(z.lr, z.la);
          return <Label key={z.key} x={lx} y={ly} m={zones[z.key].m} a={zones[z.key].a} />;
        })}
        <Label x={B.x} y={B.y + 2.8} m={rim.m} a={rim.a} />
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Poor</span>
        {RAMP.map((c) => (
          <span key={c} style={{ background: c, width: 16, height: 10, borderRadius: 2, display: "inline-block", opacity: FILL_OP }} />
        ))}
        <span>Great</span>
      </div>
    </div>
  );
}
