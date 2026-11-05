import { useState } from "react";
import type { PlayerRow } from "../lib/db";

export interface RosterHandlers {
  onAdd: (name: string, jersey: string) => void | Promise<void>;
  onUpdate: (id: string, fields: Partial<{ name: string; jersey: string | null; active: boolean }>) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export default function RosterView({ players, onAdd, onUpdate, onDelete }: { players: PlayerRow[] } & RosterHandlers) {
  const [name, setName] = useState("");
  const [jersey, setJersey] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...players].sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onAdd(name, jersey);
      setName("");
      setJersey("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* add row */}
      <div className="bg-white border rounded-lg p-3 flex items-end gap-2 flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">#</label>
          <input value={jersey} onChange={(e) => setJersey(e.target.value)} className="w-16 border rounded px-2 py-1.5 text-center" placeholder="#" />
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Player name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} className="w-full border rounded px-3 py-1.5" placeholder="Full name" />
        </div>
        <button onClick={add} disabled={busy || !name.trim()} className="bg-garnet text-white rounded-lg px-5 py-2 font-semibold disabled:opacity-50">
          Add player
        </button>
      </div>

      <div className="mt-3 bg-white border rounded-lg divide-y">
        {sorted.length === 0 && <p className="p-4 text-gray-500">No players yet. Add your roster above.</p>}
        {sorted.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 p-2.5 ${p.active ? "" : "opacity-60"}`}>
            <input
              defaultValue={p.jersey ?? ""}
              onBlur={(e) => e.target.value !== (p.jersey ?? "") && onUpdate(p.id, { jersey: e.target.value || null })}
              className="w-14 border rounded px-2 py-1 text-center"
            />
            <input
              defaultValue={p.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && onUpdate(p.id, { name: e.target.value.trim() })}
              className="flex-1 border rounded px-3 py-1 font-medium"
            />
            <button
              onClick={() => onUpdate(p.id, { active: !p.active })}
              className={`text-xs rounded px-3 py-1.5 font-medium ${p.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}
            >
              {p.active ? "Active" : "Inactive"}
            </button>
            {confirmId === p.id ? (
              <>
                <button onClick={() => onDelete(p.id)} className="text-xs bg-red-600 text-white rounded px-3 py-1.5 font-medium">Delete forever</button>
                <button onClick={() => setConfirmId(null)} className="text-xs text-gray-400">cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmId(p.id)} className="text-xs border border-red-300 text-red-600 rounded px-3 py-1.5 font-medium" title="Removes the player and all their stats">
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Edit a name or number inline (saves when you click away). <b>Inactive</b> hides a player from the roster without touching their history;
        <b> Delete</b> permanently removes the player and all of their stats.
      </p>
    </div>
  );
}
