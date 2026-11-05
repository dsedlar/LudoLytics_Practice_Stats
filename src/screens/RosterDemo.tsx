import { useState } from "react";
import { Link } from "react-router-dom";
import RosterView from "../components/RosterView";
import type { PlayerRow } from "../lib/db";

const seed: PlayerRow[] = [
  { id: "1", name: "Patrick Steptoe Jr.", jersey: "1", active: true },
  { id: "2", name: "Thorpe Fussell", jersey: "2", active: true },
  { id: "3", name: "Malik Jordan", jersey: "3", active: true },
  { id: "5", name: "Sam Dewey", jersey: "5", active: true },
  { id: "10", name: "Zion Martin", jersey: "10", active: true },
  { id: "23", name: "Aubrey Williams", jersey: "23", active: false },
];

export default function RosterDemo() {
  const [players, setPlayers] = useState<PlayerRow[]>(seed);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Season Roster (demo)</h1>
        <Link to="/" className="text-sm text-garnet font-medium">← Home</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Your master player list. Names here are matched when you import a practice plan.</p>
      <div className="mt-4">
        <RosterView
          players={players}
          onAdd={(name, jersey) => setPlayers((ps) => [...ps, { id: Math.random().toString(), name: name.trim(), jersey: jersey.trim() || null, active: true }])}
          onUpdate={(id, fields) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...fields } : p)))}
          onDelete={(id) => setPlayers((ps) => ps.filter((p) => p.id !== id))}
        />
      </div>
    </div>
  );
}
