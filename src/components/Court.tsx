import { useRef, useState } from "react";
import { COURT, zoneFor, ZONE_LABEL, type ShotZone } from "../lib/court";
import CourtBackdrop from "./CourtBackdrop";

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

export default function Court({ color, shots, disabled, onLog }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<{ x: number; y: number; zone: ShotZone } | null>(null);
  const [hint, setHint] = useState("");
  const mark = color; // dots use the team's own color (grey for Grey, garnet for Garnet)

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
        <CourtBackdrop color={color} />

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
