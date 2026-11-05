import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSquads, type SquadRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import SquadEntry from "../components/SquadEntry";

export default function CoachEntry() {
  const { id = "" } = useParams();
  const [squads, setSquads] = useState<SquadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to take stats.");
      return;
    }
    getSquads(id)
      .then(setSquads)
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!squads) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="eyebrow text-xs text-gray-500">Coach · taking stats — both squads</span>
        <Link to={`/practice/${id}/coach`} className="text-sm text-garnet font-medium">← Coach view</Link>
      </div>

      <div className="mt-3 grid xl:grid-cols-2 gap-5">
        {squads.map((s) => (
          <div key={s.id} className="rounded-lg border-t-4 pt-3" style={{ borderColor: s.color }}>
            <SquadEntry practiceId={id} squadId={s.id} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
