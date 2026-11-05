import { useMemo } from "react";
import { Link } from "react-router-dom";
import { makeSeasonDemo } from "../lib/demo";
import { buildSeason } from "../lib/seasonData";
import DashboardView from "../components/DashboardView";

export default function DashboardDemo() {
  const players = useMemo(() => buildSeason(makeSeasonDemo()), []);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Season Dashboard (demo)</h1>
        <Link to="/history-demo" className="text-sm bg-garnet text-white rounded px-4 py-2 font-medium">Practice history →</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Sample season data. Click a player to see their growth.</p>
      <div className="mt-4">
        <DashboardView players={players} />
      </div>
    </div>
  );
}
