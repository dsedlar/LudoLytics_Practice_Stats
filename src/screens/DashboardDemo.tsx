import { useMemo } from "react";
import { makeSeasonDemo } from "../lib/demo";
import { buildSeason } from "../lib/seasonData";
import DashboardView from "../components/DashboardView";

export default function DashboardDemo() {
  const players = useMemo(() => buildSeason(makeSeasonDemo()), []);
  return (
    <div>
      <h1 className="text-3xl headline-bold text-garnet">Season Dashboard (demo)</h1>
      <p className="mt-1 text-gray-600 text-sm">Sample season data. Click a player to see their growth.</p>
      <div className="mt-4">
        <DashboardView players={players} />
      </div>
    </div>
  );
}
