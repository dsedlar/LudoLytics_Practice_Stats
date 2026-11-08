// Hexbin shot chart on the same half court used during live stat collection.
// Hex SIZE = shot volume, COLOR = FG% vs the zone benchmark (garnet = poor ->
// green = great). Hover a hex for its shots + FG%. Works in feet coordinates.
import { useMemo, useState } from "react";
import type { Shot } from "../lib/seasonData";
import { COURT, playerZoneFor, ZONE_BENCHMARK } from "../lib/court";
import CourtBackdrop from "./CourtBackdrop";

const W = COURT.width, H = COURT.height; // feet
const FLOOR = "#F3EED4";

// garnet (poor) -> green (great)
const GG: [number, number, number][] = [
  [178, 0, 0], [209, 102, 46], [232, 196, 74], [134, 192, 106], [46, 139, 73],
];
function ramp(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const n = GG.length - 1, f = t * n, i = Math.min(Math.floor(f), n - 1), r = f - i;
  const a = GG[i], b = GG[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * r)},${Math.round(a[1] + (b[1] - a[1]) * r)},${Math.round(a[2] + (b[2] - a[2]) * r)})`;
}

const GRID_R = 2.1; // hex grid radius, feet
const DX = GRID_R * 2 * Math.sin(Math.PI / 3);
const DY = GRID_R * 1.5;

interface Bin { cx: number; cy: number; m: number; a: number }

function binShots(shots: Shot[]): Bin[] {
  const byId = new Map<string, Bin>();
  for (const s of shots) {
    const py = s.y / DY;
    const pj = Math.round(py);
    const pxv = s.x / DX - (pj & 1 ? 0.5 : 0);
    const pi = Math.round(pxv);
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
    if (!bin) { bin = { cx: (fi + (fj & 1 ? 0.5 : 0)) * DX, cy: fj * DY, m: 0, a: 0 }; byId.set(id, bin); }
    bin.a += 1;
    if (s.made) bin.m += 1;
  }
  return [...byId.values()];
}

function hexPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    d += (k === 0 ? "M" : "L") + (cx + Math.sin(ang) * r).toFixed(2) + "," + (cy - Math.cos(ang) * r).toFixed(2);
  }
  return d + "Z";
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
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg" style={{ background: FLOOR, maxHeight: 360 }}>
        <defs><clipPath id="hexcourt"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
        <CourtBackdrop color="#B20000" />
        <g clipPath="url(#hexcourt)">
          {bins.map((b, i) => {
            const r = GRID_R * (0.34 + 0.66 * Math.sqrt(b.a / maxA));
            const base = ZONE_BENCHMARK[playerZoneFor(b.cx, b.cy)];
            const t = (b.m / b.a - base + 0.12) / 0.24; // -12%..+12% -> 0..1
            return (
              <path
                key={i}
                d={hexPath(b.cx, b.cy, r)}
                fill={ramp(t)}
                stroke={FLOOR}
                strokeWidth={0.15}
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
          style={{ left: `${(hover.cx / W) * 100}%`, top: `${(hover.cy / H) * 100}%` }}
        >
          <b>{Math.round((hover.m / hover.a) * 100)}%</b> · {hover.m}/{hover.a} FG
        </div>
      )}
      <div className="mt-1 flex items-center justify-center gap-2 text-[10px] text-gray-400">
        <span>Poor</span>
        <span style={{ background: "linear-gradient(90deg,#B20000,#D1662E,#E8C44A,#86C06A,#2E8B49)", width: 90, height: 10, borderRadius: 2, display: "inline-block" }} />
        <span>Great · size = volume</span>
      </div>
    </div>
  );
}
