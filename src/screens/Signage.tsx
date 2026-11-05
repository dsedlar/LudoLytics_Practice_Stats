import { useEffect, useState } from "react";
import { getSeasonData } from "../lib/db";
import { buildSeason, type SeasonResult } from "../lib/seasonData";
import { isSupabaseConfigured } from "../lib/supabase";
import SignageView from "../components/SignageView";

export default function Signage() {
  const [season, setSeason] = useState<SeasonResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase for the locker-room display.");
      return;
    }
    const load = () => getSeasonData().then((d) => setSeason(buildSeason(d))).catch((e) => setError((e as Error).message));
    load();
    const t = setInterval(load, 60000); // refresh for new practices
    return () => clearInterval(t);
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!season) return <p className="text-gray-500">Loading display…</p>;
  return <SignageView season={season} />;
}
