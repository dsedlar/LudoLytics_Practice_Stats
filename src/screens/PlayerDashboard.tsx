import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getSeasonData } from "../lib/db";
import { buildSeason, type PlayerSeason } from "../lib/seasonData";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import PlayerDashboardView from "../components/PlayerDashboardView";

export default function PlayerDashboard() {
  const { playerId = "" } = useParams();
  const { isPlayer, playerId: myPlayerId } = useAuth();
  const [player, setPlayer] = useState<PlayerSeason | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see player dashboards.");
      return;
    }
    getSeasonData()
      .then((d) => setPlayer(buildSeason(d).players.find((p) => p.playerId === playerId) ?? null))
      .catch((e) => setError((e as Error).message));
  }, [playerId]);

  // Players can only view their own page — bounce them to it.
  if (isPlayer && myPlayerId && playerId !== myPlayerId) return <Navigate to={`/player/${myPlayerId}`} replace />;

  if (error) return <p className="text-red-600">{error}</p>;
  if (player === undefined) return <p className="text-gray-500">Loading player…</p>;
  if (!player) return <p className="text-red-600">Player not found or has no stats yet.</p>;
  // No "← Season dashboard" link for players (they stay on their own page).
  return <PlayerDashboardView p={player} backHref={isPlayer ? "" : "/dashboard"} />;
}
