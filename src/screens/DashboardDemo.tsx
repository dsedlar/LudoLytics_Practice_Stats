import { useMemo } from "react";
import { Link } from "react-router-dom";
import { makeSeasonDemo } from "../lib/demo";
import { buildSeason } from "../lib/seasonData";
import DashboardView from "../components/DashboardView";
import DashboardSummary, { PracticeLevel } from "../components/DashboardSummary";
import HexShotChart from "../components/HexShotChart";

export default function DashboardDemo() {
  const season = useMemo(() => buildSeason(makeSeasonDemo()), []);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Season Dashboard (demo)</h1>
        <Link to="/history-demo" className="text-sm bg-garnet text-white rounded px-4 py-2 font-medium">Practice history →</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Sample season data. Click a player to see their growth.</p>
      <div className="mt-4 grid lg:grid-cols-2 gap-4 items-stretch">
        <PracticeLevel grades={season.grades} />
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold">Team shot chart</h2>
            <span className="text-sm text-gray-500">{season.shots.length} FG</span>
          </div>
          <HexShotChart shots={season.shots} />
        </div>
      </div>
      <div className="mt-4">
        <DashboardSummary team={season.team} teams={season.teams} />
      </div>
      <div className="mt-4">
        <DashboardView players={season.players} playerHref={(id) => `/player-demo/${id}`} />
      </div>
    </div>
  );
}
