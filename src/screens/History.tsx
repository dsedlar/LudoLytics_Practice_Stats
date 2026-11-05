import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getHistory, deletePractice, updatePractice, type PracticeSummary } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import HistoryView from "../components/HistoryView";

export default function History() {
  const [rows, setRows] = useState<PracticeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await getHistory());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see practice history.");
      return;
    }
    load();
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!rows) return <p className="text-gray-500">Loading history…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Practice history</h1>
        <Link to="/dashboard" className="text-sm text-garnet font-medium">← Season dashboard</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Open a practice to edit its stats, view its report, or delete it. Change a date inline.</p>
      <HistoryView
        rows={rows}
        onChangeDate={async (id, date) => {
          await updatePractice(id, { practice_date: date });
          setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, date } : r)) ?? rs);
        }}
        onDelete={async (id) => {
          await deletePractice(id);
          await load();
        }}
      />
    </div>
  );
}
