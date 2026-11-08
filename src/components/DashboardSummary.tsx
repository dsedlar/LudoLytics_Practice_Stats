import type { TeamSeason, GradePoint, Trend, TeamRecord } from "../lib/seasonData";
import TeamRecords from "./TeamRecords";
import { GRADE_SCALE } from "../lib/config";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Arrow({ trend }: { trend: Trend }) {
  if (trend === "better") return <span title="Better than last practice" style={{ color: "#16a34a" }} className="text-xl font-bold leading-none">▲</span>;
  if (trend === "worse") return <span title="Worse than last practice" style={{ color: "#dc2626" }} className="text-xl font-bold leading-none">▼</span>;
  return <span title="Same as last practice" className="text-xl font-bold text-gray-400 leading-none">–</span>;
}

function GradeChart({ grades }: { grades: GradePoint[] }) {
  const W = 520, H = 230;
  const L = 28, R = 12, T = 14, B = 22;
  const plotW = W - L - R;
  const plotH = H - T - B;
  const yFor = (g: number) => T + ((5 - g) / 4) * plotH;
  const n = grades.length;
  const xFor = (i: number) => (n <= 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW);
  const pts = grades.map((g, i) => `${xFor(i).toFixed(1)},${yFor(g.grade).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {[1, 2, 3, 4, 5].map((g) => (
        <g key={g}>
          <line x1={L} y1={yFor(g)} x2={W - R} y2={yFor(g)} stroke="#e5e5e5" strokeWidth={1} />
          <text x={L - 8} y={yFor(g) + 4} textAnchor="end" fontSize={12} fill="#999">{g}</text>
        </g>
      ))}
      {n >= 2 && <polyline points={pts} fill="none" stroke="#B20000" strokeWidth={2.5} strokeLinejoin="round" />}
      {grades.map((g, i) => (
        <circle key={i} cx={xFor(i)} cy={yFor(g.grade)} r={3} fill="#B20000" />
      ))}
      {n === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="#aaa">No graded practices yet</text>}
    </svg>
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
export function PracticeLevel({ grades, teams, team }: { grades: GradePoint[]; teams: TeamRecord[]; team: TeamSeason }) {
  const last = grades.length ? grades[grades.length - 1].grade : null;
  return (
    <div className="bg-white border rounded-lg p-4">
      <h2 className="text-lg font-bold mb-1">Varsity Practice Level</h2>
      <div className="max-w-md mx-auto w-full">
        <GradeChart grades={grades} />
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
