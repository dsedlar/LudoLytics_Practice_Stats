import { useRef, useState } from "react";
import { COURT, zoneFor, ZONE_LABEL, markColorFor, type ShotZone } from "../lib/court";

export interface CourtShot {
  x: number;
  y: number;
  made: boolean;
}

interface Props {
  color: string;
  shots: CourtShot[];
  disabled?: boolean;
  onLog: (zone: ShotZone, made: boolean, x: number, y: number) => void;
}

const LINE = "#3C0019"; // deep garnet keylines

// Build "x,y L x,y ..." points along an arc (angles in degrees, SVG y-down).
function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 40): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(" L ");
}

const B = COURT.basket;

// three-point line: straight corner, arc through the bottom, straight corner
const THREE = (() => {
  const a0 = (Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x) * 180) / Math.PI;
  const a1 = (Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x) * 180) / Math.PI;
  return `M ${COURT.cornerX0},0 L ${COURT.cornerX0},${COURT.cornerJoinY.toFixed(2)} L ${arc(B.x, B.y, COURT.threeR, a0, a1)} L ${COURT.cornerX1},0`;
})();

const FT_SOLID = `M ${arc(B.x, COURT.lane.ftLineY, COURT.ftCircleR, 180, 0)}`; // lower half (toward center)
const FT_DASH = `M ${arc(B.x, COURT.lane.ftLineY, COURT.ftCircleR, 180, 360)}`; // upper half (in the lane)
const RESTRICTED = `M ${arc(B.x, B.y, COURT.atrR, 180, 0)}`; // under the rim
const CENTER = `M ${arc(B.x, COURT.height, COURT.centerR, 180, 360)}`; // half-court circle

const TICK_YS = [7.2, 9.4, 11.6, 13.8];

export default function Court({ color, shots, disabled, onLog }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<{ x: number; y: number; zone: ShotZone } | null>(null);
  const [hint, setHint] = useState("");
  const mark = markColorFor(color);

  function handleClick(e: React.MouseEvent) {
    if (disabled) {
      setHint("Pick a player first");
      setTimeout(() => setHint(""), 1200);
      return;
    }
    const rect = svgRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(COURT.width, ((e.clientX - rect.left) / rect.width) * COURT.width));
    const y = Math.max(0, Math.min(COURT.height, ((e.clientY - rect.top) / rect.height) * COURT.height));
    setPending({ x, y, zone: zoneFor(x, y) });
  }

  function choose(made: boolean) {
    if (!pending) return;
    onLog(pending.zone, made, pending.x, pending.y);
    setPending(null);
  }

  const pct = (v: number, max: number) => `${(v / max) * 100}%`;

  return (
    <div className="relative select-none" style={{ aspectRatio: `${COURT.width} / ${COURT.height}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${COURT.width} ${COURT.height}`}
        className="w-full h-full rounded-lg cursor-crosshair"
        style={{ background: "#F3EED4" }}
        onClick={handleClick}
      >
        {/* paint fill (tinted in the squad color) */}
        <rect x={COURT.lane.x0} y={0} width={COURT.lane.x1 - COURT.lane.x0} height={COURT.lane.ftLineY} fill={color} opacity={0.14} />

        {/* court outline */}
        <rect x={0.25} y={0.25} width={COURT.width - 0.5} height={COURT.height - 0.5} fill="none" stroke={color} strokeWidth={0.35} />

        {/* lane outline */}
        <rect x={COURT.lane.x0} y={0} width={COURT.lane.x1 - COURT.lane.x0} height={COURT.lane.ftLineY} fill="none" stroke={color} strokeWidth={0.35} />

        {/* lane hash marks */}
        {TICK_YS.map((y) => (
          <g key={y} stroke={color} strokeWidth={0.3}>
            <line x1={COURT.lane.x0 - 0.9} y1={y} x2={COURT.lane.x0} y2={y} />
            <line x1={COURT.lane.x1} y1={y} x2={COURT.lane.x1 + 0.9} y2={y} />
          </g>
        ))}

        {/* free-throw circle: solid toward center, dashed inside the lane */}
        <path d={FT_SOLID} fill="none" stroke={color} strokeWidth={0.35} />
        <path d={FT_DASH} fill="none" stroke={color} strokeWidth={0.3} strokeDasharray="0.9 0.9" />

        {/* three-point line */}
        <path d={THREE} fill="none" stroke={color} strokeWidth={0.4} />

        {/* restricted area + backboard + rim */}
        <path d={RESTRICTED} fill="none" stroke={color} strokeWidth={0.3} />
        <line x1={B.x - COURT.backboardHalf} y1={COURT.backboardY} x2={B.x + COURT.backboardHalf} y2={COURT.backboardY} stroke={LINE} strokeWidth={0.4} />
        <circle cx={B.x} cy={B.y} r={COURT.rimR} fill="none" stroke={LINE} strokeWidth={0.35} />

        {/* half-court center circle */}
        <path d={CENTER} fill="none" stroke={color} strokeWidth={0.35} />

        {/* existing shots — filled dot = make, open ring = miss, in the contrasting brand color */}
        {shots.map((s, i) =>
          s.made ? (
            <circle key={i} cx={s.x} cy={s.y} r={0.8} fill={mark} />
          ) : (
            <circle key={i} cx={s.x} cy={s.y} r={0.75} fill="#F3EED4" stroke={mark} strokeWidth={0.4} />
          ),
        )}

        {/* pending marker */}
        {pending && <circle cx={pending.x} cy={pending.y} r={1} fill="none" stroke="#000" strokeWidth={0.35} />}
      </svg>

      {/* pending make/miss control */}
      {pending && (
        <div
          className="absolute -translate-x-1/2 bg-white rounded-lg shadow-lg border p-1 flex items-center gap-1 z-10"
          style={{ left: pct(pending.x, COURT.width), top: pct(pending.y, COURT.height) }}
        >
          <span className="text-[11px] font-semibold text-gray-500 px-1">{ZONE_LABEL[pending.zone]}</span>
          <button onClick={() => choose(true)} className="bg-green-600 text-white rounded px-3 py-1 text-sm font-semibold">Make</button>
          <button onClick={() => choose(false)} className="bg-gray-200 rounded px-3 py-1 text-sm font-semibold">Miss</button>
          <button onClick={() => setPending(null)} className="text-gray-400 px-1">✕</button>
        </div>
      )}

      {hint && (
        <div className="absolute inset-x-0 top-2 text-center">
          <span className="bg-black/70 text-white text-sm rounded px-3 py-1">{hint}</span>
        </div>
      )}
    </div>
  );
}
