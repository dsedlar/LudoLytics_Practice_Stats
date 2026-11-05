import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSeasonData } from "../lib/db";
import { buildSeason, type SeasonResult } from "../lib/seasonData";
import { isSupabaseConfigured } from "../lib/supabase";
import { exportSeasonCSV, exportBackupJSON } from "../lib/exporters";
import DashboardView from "../components/DashboardView";
import DashboardSummary from "../components/DashboardSummary";

export default function Dashboard() {
  const [season, setSeason] = useState<SeasonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see the season dashboard.");
      return;
    }
    getSeasonData()
      .then((d) => setSeason(buildSeason(d)))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!season) return <p className="text-gray-500">Loading season…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Season Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/display" className="text-sm border rounded px-3 py-2 font-medium">Locker-room display</Link>
          <button onClick={() => exportSeasonCSV().catch((e) => alert(e.message))} className="text-sm border rounded px-3 py-2 font-medium">Season CSV</button>
          <button onClick={() => exportBackupJSON().catch((e) => alert(e.message))} className="text-sm border rounded px-3 py-2 font-medium">Backup (JSON)</button>
        </div>
      </div>
      <p className="mt-1 text-gray-600 text-sm">
        Every practice, totaled for the season. Click a player to see their growth. Tap a column to sort.
      </p>
      <div className="mt-4">
        <DashboardSummary team={season.team} grades={season.grades} teams={season.teams} />
      </div>
      <div className="mt-4">
        <DashboardView players={season.players} />
      </div>
    </div>
  );
}
