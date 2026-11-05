import type { TeamSeason, GradePoint, Trend, TeamRecord } from "../lib/seasonData";
import TeamRecords from "./TeamRecords";

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

export default function DashboardSummary({ team, grades, teams }: { team: TeamSeason; grades: GradePoint[]; teams: TeamRecord[] }) {
  return (
    <div className="bg-white border rounded-lg p-4 grid lg:grid-cols-2 gap-6 items-center">
      <div>
        <h2 className="text-lg font-bold mb-1">Varsity Practice Level</h2>
        <GradeChart grades={grades} />
      </div>
      <div>
        <TeamRecords teams={teams} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Tile label="Team TO / Practice" value={team.toPerPractice.toFixed(1)} trend={team.trends.to} />
          <Tile label="Team 3FG %" value={pct(team.fg3Pct)} trend={team.trends.fg3} />
          <Tile label="Team PPS" value={team.pps.toFixed(2)} trend={team.trends.pps} />
          <Tile label="Team FT %" value={pct(team.ftPct)} trend={team.trends.ft} />
        </div>
      </div>
    </div>
  );
}
