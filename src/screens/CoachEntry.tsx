import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSquads, type SquadRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import SquadEntry from "../components/SquadEntry";

export default function CoachEntry() {
  const { id = "" } = useParams();
  const [squads, setSquads] = useState<SquadRow[] | null>(null);
  const [sel, setSel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to take stats.");
      return;
    }
    getSquads(id)
      .then((s) => {
        setSquads(s);
        if (s[0]) setSel(s[0].id);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!squads) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="eyebrow text-xs text-gray-500">Coach · taking stats</span>
          {squads.map((s) => (
            <button
              key={s.id}
              onClick={() => setSel(s.id)}
              className="px-4 py-2 rounded-lg font-semibold text-sm border-2"
              style={
                sel === s.id
                  ? { background: s.color, color: "#fff", borderColor: s.color }
                  : { color: s.color, borderColor: s.color }
              }
            >
              {s.name}
            </button>
          ))}
        </div>
        <Link to={`/practice/${id}/coach`} className="text-sm text-garnet font-medium">← Coach view</Link>
      </div>

      <div className="mt-4">
        {/* key by squad so player selection / undo reset when switching teams */}
        {sel && <SquadEntry key={sel} practiceId={id} squadId={sel} />}
      </div>
    </div>
  );
}
