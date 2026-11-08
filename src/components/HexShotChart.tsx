// Hexbin shot chart (BallR / NBA style): shots binned into a hex grid on a
// black half court. Hex SIZE = shot volume, hex COLOR = FG% vs the zone
// benchmark (viridis). Hover a hex for its shots + FG%.
import { useMemo, useState } from "react";
import type { Shot } from "../lib/seasonData";
import { playerZoneFor, ZONE_BENCHMARK } from "../lib/court";

// court geometry (hoop at top), shared layout with the zone chart
const sc = 5.52, OX = 12, OY = 12;
const hx = OX + 25 * sc, hy = OY + 5.25 * sc;
const rimR = 4 * sc, rArc = 19.75 * sc;
const COURT = { x: OX, y: OY, w: 50 * sc, h: 33 * sc };
const VB_W = 300, VB_H = 206;
const fx = (ft: number) => OX + ft * sc;
const fy = (ft: number) => OY + ft * sc;
const ff = (n: number) => n.toFixed(1);

// viridis-ish ramp (purple -> blue -> teal -> green -> yellow)
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
];
function viridis(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const n = VIRIDIS.length - 1, f = t * n, i = Math.min(Math.floor(f), n - 1), r = f - i;
  const a = VIRIDIS[i], b = VIRIDIS[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * r)},${Math.round(a[1] + (b[1] - a[1]) * r)},${Math.round(a[2] + (b[2] - a[2]) * r)})`;
}

const GRID_R = 8.5; // hex grid radius in px
const DX = GRID_R * 2 * Math.sin(Math.PI / 3);
const DY = GRID_R * 1.5;

interface Bin { cx: number; cy: number; m: number; a: number }

function binShots(shots: Shot[]): Bin[] {
  const byId = new Map<string, Bin>();
  for (const s of shots) {
    const px = fx(s.x), py0 = fy(s.y);
    let py = py0 / DY;
    const pj = Math.round(py);
    let pxv = px / DX - (pj & 1 ? 0.5 : 0);
    let pi = Math.round(pxv);
    const py1 = py - pj;
    let fi = pi, fj = pj;
    if (Math.abs(py1) * 3 > 1) {
      const px1 = pxv - pi;
      const pi2 = pi + (pxv < pi ? -1 : 1) / 2;
      const pj2 = pj + (py < pj ? -1 : 1);
      const px2 = pxv - pi2, py2 = py - pj2;
      if (px1 * px1 + py1 * py1 > px2 * px2 + py2 * py2) { fi = pi2 + (pj & 1 ? 1 : -1) / 2; fj = pj2; }
    }
    const id = `${fi}-${fj}`;
    let bin = byId.get(id);
    if (!bin) {
      bin = { cx: (fi + (fj & 1 ? 0.5 : 0)) * DX, cy: fj * DY, m: 0, a: 0 };
      byId.set(id, bin);
    }
    bin.a += 1;
    if (s.made) bin.m += 1;
  }
  return [...byId.values()];
}

function hexPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const x = cx + Math.sin(ang) * r, y = cy - Math.cos(ang) * r;
    d += (k === 0 ? "M" : "L") + ff(x) + "," + ff(y);
  }
  return d + "Z";
}

function CourtLines() {
  const cjY = 5.25 + Math.sqrt(19.75 * 19.75 - 19 * 19);
  const arcL = [hx + rArc * Math.sin((-68.3 * Math.PI) / 180), hy + rArc * Math.cos((-68.3 * Math.PI) / 180)];
  const arcR = [hx + rArc * Math.sin((68.3 * Math.PI) / 180), hy + rArc * Math.cos((68.3 * Math.PI) / 180)];
  const S = "#6b7280";
  return (
    <g fill="none" stroke={S} strokeWidth={1.3} strokeLinecap="round">
      <rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" />
      <rect x={fx(19)} y={fy(0)} width={12 * sc} height={19 * sc} />
      <path d={`M${ff(fx(19))},${ff(fy(19))} A${ff(6 * sc)},${ff(6 * sc)} 0 0 0 ${ff(fx(31))},${ff(fy(19))}`} />
      <path d={`M${ff(hx - rimR)},${ff(hy)} A${ff(rimR)},${ff(rimR)} 0 0 0 ${ff(hx + rimR)},${ff(hy)}`} />
      <line x1={fx(22)} y1={fy(4)} x2={fx(28)} y2={fy(4)} strokeWidth={2} />
      <circle cx={hx} cy={hy} r={0.75 * sc} />
      <line x1={fx(6)} y1={fy(0)} x2={fx(6)} y2={fy(cjY)} />
      <line x1={fx(44)} y1={fy(0)} x2={fx(44)} y2={fy(cjY)} />
      <path d={`M${ff(arcL[0])},${ff(arcL[1])} A${ff(rArc)},${ff(rArc)} 0 0 0 ${ff(arcR[0])},${ff(arcR[1])}`} />
    </g>
  );
}

export default function HexShotChart({ shots }: { shots: Shot[] }) {
  const [hover, setHover] = useState<Bin | null>(null);
  const bins = useMemo(() => binShots(shots), [shots]);
  const maxA = bins.reduce((m, b) => Math.max(m, b.a), 1);

  if (shots.length === 0) {
    return <div className="w-full text-center text-sm text-gray-400 py-16">No located shots yet</div>;
  }

  return (
    <div className="w-full relative">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" style={{ maxHeight: 340 }}>
        <defs><clipPath id="hexcourt"><rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" /></clipPath></defs>
        <rect x={COURT.x} y={COURT.y} width={COURT.w} height={COURT.h} rx="2" fill="#15171c" />
        <CourtLines />
        <g clipPath="url(#hexcourt)">
          {bins.map((b, i) => {
            const r = GRID_R * (0.34 + 0.66 * Math.sqrt(b.a / maxA));
            const ftx = (b.cx - OX) / sc, fty = (b.cy - OY) / sc;
            const base = ZONE_BENCHMARK[playerZoneFor(ftx, fty)];
            const t = (b.m / b.a - base + 0.12) / 0.24; // -12%..+12% -> 0..1
            return (
              <path
                key={i}
                d={hexPath(b.cx, b.cy, r)}
                fill={viridis(t)}
                stroke="#15171c"
                strokeWidth={0.5}
                onMouseEnter={() => setHover(b)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </g>
      </svg>
      {hover && (
        <div
          className="absolute pointer-events-none bg-black text-white text-xs rounded px-2 py-1 whitespace-nowrap -translate-x-1/2 -translate-y-full shadow"
          style={{ left: `${(hover.cx / VB_W) * 100}%`, top: `${(hover.cy / VB_H) * 100}%` }}
        >
          <b>{Math.round((hover.m / hover.a) * 100)}%</b> · {hover.m}/{hover.a} FG
        </div>
      )}
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Cold</span>
        <span style={{ background: "linear-gradient(90deg,#440154,#3b528b,#21918c,#5ec962,#fde725)", width: 90, height: 10, borderRadius: 2, display: "inline-block" }} />
        <span>Hot · size = volume</span>
      </div>
    </div>
  );
}
