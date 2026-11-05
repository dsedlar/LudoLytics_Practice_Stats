import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPlayers, createPlayer, updatePlayer, deletePlayer, type PlayerRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import RosterView from "../components/RosterView";

export default function Roster() {
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setPlayers(await getPlayers());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to manage the roster.");
      return;
    }
    load();
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!players) return <p className="text-gray-500">Loading roster…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Season Roster</h1>
        <Link to="/" className="text-sm text-garnet font-medium">← Home</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Your master player list. Names here are matched when you import a practice plan.</p>
      <div className="mt-4">
        <RosterView
          players={players}
          onAdd={async (name, jersey) => { await createPlayer(name, jersey); await load(); }}
          onUpdate={async (id, fields) => { await updatePlayer(id, fields); await load(); }}
          onDelete={async (id) => { await deletePlayer(id); await load(); }}
        />
      </div>
    </div>
  );
}
