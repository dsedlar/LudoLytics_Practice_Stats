// The exact court drawing used during live stat collection, extracted so the
// live-entry Court and the shot charts render an identical half court.
// Place inside an <svg viewBox={`0 0 ${COURT.width} ${COURT.height}`}>.
import { COURT } from "../lib/court";

const LINE = "#3C0019"; // deep garnet keylines (backboard / rim)

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 40): string {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(t)).toFixed(2)},${(cy + r * Math.sin(t)).toFixed(2)}`);
  }
  return pts.join(" L ");
}

const B = COURT.basket;

const THREE = (() => {
  const a0 = (Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX0 - B.x) * 180) / Math.PI;
  const a1 = (Math.atan2(COURT.cornerJoinY - B.y, COURT.cornerX1 - B.x) * 180) / Math.PI;
  return `M ${COURT.cornerX0},0 L ${COURT.cornerX0},${COURT.cornerJoinY.toFixed(2)} L ${arc(B.x, B.y, COURT.threeR, a0, a1)} L ${COURT.cornerX1},0`;
})();
const FT_SOLID = `M ${arc(B.x, COURT.lane.ftLineY, COURT.ftCircleR, 180, 0)}`;
const FT_DASH = `M ${arc(B.x, COURT.lane.ftLineY, COURT.ftCircleR, 180, 360)}`;
const RESTRICTED = `M ${arc(B.x, B.y, COURT.atrR, 180, 0)}`;
const CENTER = `M ${arc(B.x, COURT.height, COURT.centerR, 180, 360)}`;
const TICK_YS = [7.2, 9.4, 11.6, 13.8];

export default function CourtBackdrop({ color }: { color: string }) {
  return (
    <>
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
    </>
  );
}
