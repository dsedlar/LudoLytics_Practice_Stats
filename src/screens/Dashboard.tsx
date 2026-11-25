import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSeasonData } from "../lib/db";
import { buildSeason, type SeasonInput } from "../lib/seasonData";
import { seasonsIn, filterSeasonInput, currentSeason } from "../lib/season";
import { isSupabaseConfigured } from "../lib/supabase";
import DashboardView from "../components/DashboardView";
import { PracticeLevel } from "../components/DashboardSummary";
import HexShotChart from "../components/HexShotChart";
import SeasonPicker from "../components/SeasonPicker";

export default function Dashboard() {
  const [data, setData] = useState<SeasonInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see the season dashboard.");
      return;
    }
    getSeasonData().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  const seasons = useMemo(() => (data ? seasonsIn(data.practices.map((p) => p.practice_date)) : []), [data]);
  const selected = picked || seasons[0] || currentSeason();
  const season = useMemo(() => (data ? buildSeason(filterSeasonInput(data, selected)) : null), [data, selected]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!season) return <p className="text-gray-500">Loading season…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl headline-bold text-garnet">Season Dashboard</h1>
          <SeasonPicker seasons={seasons} value={selected} onChange={setPicked} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/weekly" className="text-sm bg-garnet text-white rounded px-3 py-2 font-semibold">📄 Weekly Report</Link>
          <Link to="/display" className="text-sm border rounded px-3 py-2 font-medium">Locker-room display</Link>
        </div>
      </div>
      <p className="mt-1 text-gray-600 text-sm">
        Every practice, totaled for the season. Click a player to see their growth. Tap a column to sort.
      </p>
      <div className="mt-4 grid lg:grid-cols-2 gap-4 items-start">
        <PracticeLevel grades={season.grades} liftGrades={season.liftGrades} teams={season.teams} team={season.team} />
        <div className="bg-white border rounded-lg p-4">
          <div className="max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold">Team shot chart</h2>
              <span className="text-sm text-gray-500">
                {season.shots.length
                  ? `${Math.round((season.shots.filter((s) => s.made).length / season.shots.length) * 100)}% · ${season.shots.length} FG`
                  : "No located shots"}
              </span>
            </div>
            <HexShotChart shots={season.shots} />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <DashboardView players={season.players} />
      </div>
    </div>
  );
}
