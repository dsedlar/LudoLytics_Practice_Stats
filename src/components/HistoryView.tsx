import { useState } from "react";
import { Link } from "react-router-dom";
import { GRADE_SCALE } from "../lib/config";
import type { PracticeSummary } from "../lib/db";

export interface HistoryViewProps {
  rows: PracticeSummary[];
  onChangeDate: (id: string, date: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export default function HistoryView({ rows, onChangeDate, onDelete }: HistoryViewProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function del(id: string) {
    setBusy(true);
    try {
      await onDelete(id);
      setConfirmId(null);
    } finally {
      setBusy(false);
    }
  }

  if (rows.length === 0) return <p className="mt-6 text-gray-500">No practices yet.</p>;

  return (
    <div className="mt-4 space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="bg-white border rounded-lg p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <input
            type="date"
            value={/^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : ""}
            onChange={(e) => onChangeDate(r.id, e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
          <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === "finished" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {r.status}
          </span>
          <span className="text-sm">
            {r.squads.map((s, i) => (
              <span key={i}>
                {i > 0 && <span className="text-gray-300"> · </span>}
                <b style={{ color: s.color }}>{s.name}</b> {s.wins}-{s.losses}
              </span>
            ))}
          </span>
          <span className="text-sm text-gray-600">
            {r.grade ? <>Grade <b>{r.grade}</b> {GRADE_SCALE[r.grade]?.label}</> : "No grade"}
          </span>
          <span className="text-sm text-gray-500">{r.present}/{r.total} present</span>

          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link to={`/practice/${r.id}/coach`} className="text-sm bg-garnet text-white rounded px-3 py-1.5 font-medium">Open / Edit</Link>
            <Link to={`/practice/${r.id}/report`} className="text-sm border rounded px-3 py-1.5 font-medium">Report</Link>
            {confirmId === r.id ? (
              <>
                <button onClick={() => del(r.id)} disabled={busy} className="text-sm bg-red-600 text-white rounded px-3 py-1.5 font-medium disabled:opacity-50">
                  {busy ? "Deleting…" : "Confirm delete"}
                </button>
                <button onClick={() => setConfirmId(null)} className="text-sm text-gray-400">cancel</button>
              </>
            ) : (
              <button onClick={() => setConfirmId(r.id)} className="text-sm border border-red-300 text-red-600 rounded px-3 py-1.5 font-medium">Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
