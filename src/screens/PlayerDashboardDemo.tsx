import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { makeSeasonDemo } from "../lib/demo";
import { buildSeason } from "../lib/seasonData";
import PlayerDashboardView from "../components/PlayerDashboardView";

export default function PlayerDashboardDemo() {
  const { playerId = "" } = useParams();
  const player = useMemo(() => {
    const s = buildSeason(makeSeasonDemo());
    return s.players.find((p) => p.playerId === playerId) ?? s.players[0];
  }, [playerId]);
  if (!player) return <p className="text-gray-500">No data.</p>;
  return <PlayerDashboardView p={player} backHref="/dashboard-demo" />;
}
