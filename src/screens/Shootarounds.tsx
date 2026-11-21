import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getShootaroundHistory, createShootaround, type ShootaroundSummary } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import { formatLongDate } from "../lib/reportData";

const pct = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const seg = (s: { m: number; a: number }) => (s.a ? `${s.m}-${s.a} (${Math.round((s.m / s.a) * 100)}%)` : "–");

export default function Shootarounds() {
  const [rows, setRows] = useState<ShootaroundSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    if (!isSupabaseConfigured) { setError("Connect Supabase to track shootarounds."); return; }
    getShootaroundHistory().then(setRows).catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const id = await createShootaround();
      navigate(`/shootaround/${id}`);
    } catch (e) {
      setError(`Could not start shootaround: ${(e as Error).message}`);
      setBusy(false);
    }
  }

  const th = "p-2 text-xs font-bold text-gray-500 text-center whitespace-nowrap";
  const td = "p-2 text-sm text-center whitespace-nowrap";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl headline-bold text-garnet">Shootarounds</h1>
          <p className="mt-1 text-gray-600 text-sm">Shooting-only sessions — the whole team on one screen. Kept separate from practice stats.</p>
        </div>
        <button onClick={start} disabled={busy} className="bg-garnet text-white px-5 py-3 rounded-lg font-semibold disabled:opacity-50">
          {busy ? "Starting…" : "🏀 Start shootaround"}
        </button>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {rows && rows.length === 0 && <p className="mt-6 text-gray-500">No shootarounds yet. Tap “Start shootaround” to run one.</p>}

      {rows && rows.length > 0 && (
        <div className="mt-5 bg-white border rounded-lg overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b text-left">
                <th className={`${th} text-left`}>Date</th>
                <th className={th}>Players</th>
                <th className={th}>Transition 3s</th>
                <th className={th}>Thespian 3s</th>
                <th className={th}>Baylor%</th>
                <th className={th}>90s%</th>
                <th className={th}>FT%</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={`${td} text-left font-medium`}>{formatLongDate(r.date)}</td>
                  <td className={td}>{r.players}</td>
                  <td className={td}>{seg(r.trans)}</td>
                  <td className={td}>{seg(r.thes)}</td>
                  <td className={td}>{pct(r.baylorPct)}</td>
                  <td className={td}>{pct(r.ninetyPct)}</td>
                  <td className={td}>{pct(r.ftPct)}</td>
                  <td className={td}>
                    <Link to={`/shootaround/${r.id}`} className="text-sm bg-garnet text-white rounded px-3 py-1.5 font-medium">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5">
        <Link to="/dashboard" className="text-sm text-garnet font-medium">← Season dashboard</Link>
      </div>
    </div>
  );
}
