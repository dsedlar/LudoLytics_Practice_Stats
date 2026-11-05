import { useEffect, useState } from "react";
import { getSeasonData } from "../lib/db";
import { buildSeason, type PlayerSeason } from "../lib/seasonData";
import { isSupabaseConfigured } from "../lib/supabase";
import DashboardView from "../components/DashboardView";

export default function Dashboard() {
  const [players, setPlayers] = useState<PlayerSeason[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see the season dashboard.");
      return;
    }
    getSeasonData()
      .then((d) => setPlayers(buildSeason(d)))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!players) return <p className="text-gray-500">Loading season…</p>;

  return (
    <div>
      <h1 className="text-2xl font-black text-garnet">Season Dashboard</h1>
      <p className="mt-1 text-gray-600 text-sm">
        Every practice, totaled for the season. Click a player to see their growth. Tap a column to sort.
      </p>
      <div className="mt-4">
        <DashboardView players={players} />
      </div>
    </div>
  );
}
