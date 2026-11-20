import type { TeamSeason, GradePoint, Trend, TeamRecord } from "../lib/seasonData";
import TeamRecords from "./TeamRecords";
import { GRADE_SCALE, STRENGTH_COLOR } from "../lib/config";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Arrow({ trend }: { trend: Trend }) {
  if (trend === "better") return <span title="Better than last practice" style={{ color: "#16a34a" }} className="text-xl font-bold leading-none">▲</span>;
  if (trend === "worse") return <span title="Worse than last practice" style={{ color: "#dc2626" }} className="text-xl font-bold leading-none">▼</span>;
  return <span title="Same as last practice" className="text-xl font-bold text-gray-400 leading-none">–</span>;
}

function GradeChart({ grades, liftGrades }: { grades: GradePoint[]; liftGrades: GradePoint[] }) {
  const W = 520, H = 230;
  const L = 28, R = 12, T = 14, B = 22;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const yFor = (g: number) => T + ((5 - g) / 4) * plotH;
  // Shared x-axis: the union of all graded dates, so the two lines line up.
  const dates = Array.from(new Set([...grades, ...liftGrades].map((d) => d.date))).sort((a, b) => (a < b ? -1 : 1));
  const n = dates.length;
  const xForDate = (date: string) => (n <= 1 ? L + plotW / 2 : L + (dates.indexOf(date) / (n - 1)) * plotW);
  const Series = ({ pts, color }: { pts: GradePoint[]; color: string }) => (
    <>
      {pts.length >= 2 && (
        <polyline points={pts.map((g) => `${xForDate(g.date).toFixed(1)},${yFor(g.grade).toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      )}
      {pts.map((g, i) => <circle key={i} cx={xForDate(g.date)} cy={yFor(g.grade)} r={3} fill={color} />)}
    </>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {[1, 2, 3, 4, 5].map((g) => (
        <g key={g}>
          <line x1={L} y1={yFor(g)} x2={W - R} y2={yFor(g)} stroke="#e5e5e5" strokeWidth={1} />
          <text x={L - 8} y={yFor(g) + 4} textAnchor="end" fontSize={12} fill="#999">{g}</text>
        </g>
      ))}
      <Series pts={grades} color="#B20000" />
      <Series pts={liftGrades} color={STRENGTH_COLOR} />
      {n === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#aaa">No graded practices yet</text>}
    </svg>
  );
}

function GradeLegend() {
  return (
    <div className="flex items-center justify-center gap-4 mt-1 text-xs text-gray-600">
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: "#B20000" }} /> Practice</span>
      <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ background: STRENGTH_COLOR }} /> Strength</span>
    </div>
  );
}

function Tile({ label, value, trend }: { label: string; value: string; trend: Trend }) {
  return (
    <div className="text-center px-2 py-4">
      <div className="eyebrow text-[11px] text-gray-500">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="text-4xl text-black" style={{ fontFamily: "var(--font-compressed)" }}>{value}</span>
        <Arrow trend={trend} />
      </div>
    </div>
  );
}

// Practice-level chart card (left of the top row): grade trend, the last
// practice's level, the team records, then three team KPIs.
export function PracticeLevel({ grades, liftGrades, teams, team }: { grades: GradePoint[]; liftGrades: GradePoint[]; teams: TeamRecord[]; team: TeamSeason }) {
  const last = grades.length ? grades[grades.length - 1].grade : null;
  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-1">Varsity Practice Level</h2>
      <div className="max-w-md mx-auto w-full">
        <GradeChart grades={grades} liftGrades={liftGrades} />
        <GradeLegend />
        {last != null && (
          <div className="text-center text-gray-700 mt-2">
            Last Practice: <b>{GRADE_SCALE[last].blurb}</b>
          </div>
        )}
        <div className="mt-3">
          <TeamRecords teams={teams} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-2">
          <Tile label="eFG%" value={pct(team.efg)} trend={team.trends.efg} />
          <Tile label="3FG%" value={pct(team.fg3Pct)} trend={team.trends.fg3} />
          <Tile label="TO / Prac" value={team.toPerPractice.toFixed(1)} trend={team.trends.to} />
        </div>
      </div>
    </div>
  );
}
