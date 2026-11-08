// Per-player shot-zone chart on a half court (hoop at top). Zones are colored
// areas (red = poor shooting → green = excellent) with FG% + makes/attempts;
// the court lines are drawn on top so it reads as a basketball half court.
import type { PlayerZones } from "../lib/seasonData";
import type { PlayerZone } from "../lib/court";

const FLOOR = "#D6D8DC"; // grey court
const LINE = "#8A8F98"; // grey court lines
const FILL_OP = 0.6; // zone colors are semi-transparent so the court shows through

const sc = 5.52; // px per foot
const OX = 12, OY = 12; // top-left of court; baseline is the top edge
const hx = OX + 25 * sc;          // basket x (center)
const hy = OY + 5.25 * sc;        // basket y (near top)
const rimR = 4 * sc;              // restricted area
const rArc = 19.75 * sc;          // 3-point radius
const OUTER = 360;
const COURT = { x: OX, y: OY, w: 50 * sc, h: 33 * sc };
const fx = (ft: number) => OX + ft * sc;
const fy = (ft: number) => OY + ft * sc;

const rad = (d: number) => (d * Math.PI) / 180;
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
  { key: "cornerLeft", path: wedge(rArc, OUTER, -110, -68), la: -83, lr: rArc + 20 },
  { key: "wingLeft", path: wedge(rArc, OUTER, -68, -24), la: -46, lr: rArc + 26 },
  { key: "top", path: wedge(rArc, OUTER, -24, 24), la: 0, lr: rArc + 26 },
  { key: "wingRight", path: wedge(rArc, OUTER, 24, 68), la: 46, lr: rArc + 26 },
  { key: "cornerRight", path: wedge(rArc, OUTER, 68, 110), la: 83, lr: rArc + 20 },
];

// Zone-relative grading: each zone is judged against a realistic benchmark FG%
// for that spot (rim shots expected high, threes lower), then colored by how far
// above/below the player shoots there.
const ZONE_AVG: Record<PlayerZone, number> = {
  rim: 0.58, paint: 0.42,
  midLeft: 0.38, midRight: 0.38,
  cornerLeft: 0.36, cornerRight: 0.36,
  wingLeft: 0.33, top: 0.33, wingRight: 0.33,
};

// red (poor) -> green (excellent); null bg = no shots (show bare grey court)
const RAMP = ["#D64545", "#E8894A", "#EFC84C", "#86C06A", "#3E9F54"];
function color(key: PlayerZone, m: number, a: number): string | null {
  if (a === 0) return null;
  const delta = m / a - ZONE_AVG[key]; // vs. what's good for this zone
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
      <text x={x} y={y - 1} textAnchor="middle" fontSize="14" fontWeight={800} fill="#1f2937">
        {`${Math.round((m / a) * 100)}%`}
      </text>
      <text x={x} y={y + 12} textAnchor="middle" fontSize="10.5" fill="#374151">
        {m}/{a}
      </text>
    </g>
  );
}

// 3-point arc + corner lines
const cornerJoinY = 5.25 + Math.sqrt(19.75 * 19.75 - 19 * 19); // ft where corner meets arc
const arcL = P(rArc, -68.3), arcR = P(rArc, 68.3); // approx arc endpoints at corners

function CourtLines() {
  return (
    <g fill="none" stroke={LINE} strokeWidth={1.6} strokeLinecap="round">
      {/* boundary */}
      <rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" />
      {/* paint / key */}
      <rect x={fx(19)} y={fy(0)} width={12 * sc} height={19 * sc} />
      {/* free-throw circle: solid toward court, dashed inside the key */}
      <path d={`M${f(fx(19))},${f(fy(19))} A${f(6 * sc)},${f(6 * sc)} 0 0 0 ${f(fx(31))},${f(fy(19))}`} />
      <path d={`M${f(fx(19))},${f(fy(19))} A${f(6 * sc)},${f(6 * sc)} 0 0 1 ${f(fx(31))},${f(fy(19))}`} strokeDasharray="5 5" />
      {/* restricted area */}
      <path d={`M${f(hx - rimR)},${f(hy)} A${f(rimR)},${f(rimR)} 0 0 0 ${f(hx + rimR)},${f(hy)}`} />
      {/* backboard + rim */}
      <line x1={fx(22)} y1={fy(4)} x2={fx(28)} y2={fy(4)} strokeWidth={2.2} />
      <circle cx={hx} cy={hy} r={0.75 * sc} />
      {/* 3-point line: straight corners + arc */}
      <line x1={fx(6)} y1={fy(0)} x2={fx(6)} y2={fy(cornerJoinY)} />
      <line x1={fx(44)} y1={fy(0)} x2={fx(44)} y2={fy(cornerJoinY)} />
      <path d={`M${f(arcL[0])},${f(arcL[1])} A${f(rArc)},${f(rArc)} 0 0 0 ${f(arcR[0])},${f(arcR[1])}`} />
    </g>
  );
}

export default function ShotZones({ zones }: { zones: PlayerZones }) {
  const total = Object.values(zones).reduce((s, z) => ({ m: s.m + z.m, a: s.a + z.a }), { m: 0, a: 0 });
  const rim = zones.rim;
  const rimC = color("rim", rim.m, rim.a);
  return (
    <div className="bg-white border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-bold">Shot zones</h2>
        <span className="text-sm text-gray-500">
          {total.a ? `${Math.round((total.m / total.a) * 100)}% · ${total.m}/${total.a} FG` : "No located shots"}
        </span>
      </div>
      <svg viewBox="0 0 300 206" className="w-full" style={{ maxHeight: 340 }}>
        <defs>
          <clipPath id="court"><rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" /></clipPath>
        </defs>
        <rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" fill={FLOOR} />
        <g clipPath="url(#court)">
          {ZONES.map((z) => {
            const c = color(z.key, zones[z.key].m, zones[z.key].a);
            return c ? <path key={z.key} d={z.path} fill={c} fillOpacity={FILL_OP} /> : null;
          })}
          {rimC && <circle cx={hx} cy={hy} r={rimR} fill={rimC} fillOpacity={FILL_OP} />}
        </g>
        <CourtLines />
        {ZONES.map((z) => {
          const [lx, ly] = P(z.lr, z.la);
          return <Label key={z.key} x={lx} y={ly} m={zones[z.key].m} a={zones[z.key].a} />;
        })}
        <Label x={hx} y={hy + 26} m={rim.m} a={rim.a} />
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Poor</span>
        {RAMP.map((c) => (
          <span key={c} style={{ background: c, width: 16, height: 10, borderRadius: 2, display: "inline-block", opacity: FILL_OP }} />
        ))}
        <span>Excellent</span>
      </div>
    </div>
  );
}
