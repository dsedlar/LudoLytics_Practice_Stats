import { useRef, useState } from "react";
import { COURT, zoneFor, ZONE_LABEL, type ShotZone } from "../lib/court";

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

// Build the 3-point arc as an explicit point path (avoids SVG arc-flag ambiguity).
function threeArcPath(): string {
  const { basket, threeR } = COURT;
  const off = Math.sqrt(threeR * threeR - basket.y * basket.y); // x-offset at baseline
  const thetaS = Math.atan2(0 - basket.y, basket.x - off - basket.x); // left baseline pt
  const thetaE = Math.atan2(0 - basket.y, basket.x + off - basket.x); // right baseline pt
  // sweep from left, down through the bottom (y max), to right
  const start = thetaS; // ~195°
  const end = thetaE - 2 * Math.PI; // ~ -15.4° (go the long way through bottom)
  const pts: string[] = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = start + ((end - start) * i) / N;
    const x = basket.x + threeR * Math.cos(t);
    const y = basket.y + threeR * Math.sin(t);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return "M " + pts.join(" L ");
}

const ARC = threeArcPath();

export default function Court({ color, shots, disabled, onLog }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<{ x: number; y: number; zone: ShotZone } | null>(null);
  const [hint, setHint] = useState("");

  function handleClick(e: React.MouseEvent) {
    if (disabled) {
      setHint("Pick a player first");
      setTimeout(() => setHint(""), 1200);
      return;
    }
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
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
        className="w-full h-full rounded-lg border bg-[#f7efe2] cursor-crosshair"
        onClick={handleClick}
      >
        {/* court outline */}
        <rect x={0.2} y={0.2} width={COURT.width - 0.4} height={COURT.height - 0.4} fill="none" stroke="#b08b5a" strokeWidth={0.3} />
        {/* lane */}
        <rect x={COURT.lane.x0} y={0} width={COURT.lane.x1 - COURT.lane.x0} height={COURT.lane.ftLineY} fill="none" stroke="#b08b5a" strokeWidth={0.3} />
        {/* free-throw circle */}
        <circle cx={COURT.basket.x} cy={COURT.lane.ftLineY} r={COURT.ftCircleR} fill="none" stroke="#b08b5a" strokeWidth={0.3} />
        {/* backboard + rim */}
        <line x1={COURT.basket.x - 3} y1={COURT.backboardY} x2={COURT.basket.x + 3} y2={COURT.backboardY} stroke="#333" strokeWidth={0.3} />
        <circle cx={COURT.basket.x} cy={COURT.basket.y} r={COURT.rimR} fill="none" stroke="#d1551f" strokeWidth={0.3} />
        {/* at-the-rim guide */}
        <circle cx={COURT.basket.x} cy={COURT.basket.y} r={COURT.atrR} fill="none" stroke="#b08b5a" strokeWidth={0.15} strokeDasharray="0.6 0.6" />
        {/* three-point arc */}
        <path d={ARC} fill="none" stroke={color} strokeWidth={0.35} />

        {/* existing shots */}
        {shots.map((s, i) =>
          s.made ? (
            <circle key={i} cx={s.x} cy={s.y} r={0.7} fill="#16a34a" opacity={0.85} />
          ) : (
            <g key={i} stroke="#dc2626" strokeWidth={0.3} opacity={0.85}>
              <line x1={s.x - 0.6} y1={s.y - 0.6} x2={s.x + 0.6} y2={s.y + 0.6} />
              <line x1={s.x - 0.6} y1={s.y + 0.6} x2={s.x + 0.6} y2={s.y - 0.6} />
            </g>
          ),
        )}

        {/* pending marker */}
        {pending && <circle cx={pending.x} cy={pending.y} r={1} fill="none" stroke="#111" strokeWidth={0.3} />}
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
