import { useState } from "react";
import { Link } from "react-router-dom";
import HistoryView from "../components/HistoryView";
import type { PracticeSummary } from "../lib/db";

const GARNET = "#B20000";
const NAVY = "#00142D";
const seed: PracticeSummary[] = [
  { id: "p6", date: "2025-11-14", grade: 4, status: "finished", finish: "9:00 PM", squads: [{ name: "Garnet", color: GARNET, wins: 6, losses: 4 }, { name: "White", color: NAVY, wins: 4, losses: 6 }], present: 14, total: 15 },
  { id: "p5", date: "2025-11-13", grade: 3, status: "finished", finish: "8:55 PM", squads: [{ name: "Grey", color: "#555", wins: 5, losses: 5 }, { name: "Maroon", color: GARNET, wins: 5, losses: 5 }], present: 13, total: 15 },
  { id: "p4", date: "2025-11-11", grade: 5, status: "finished", finish: "9:05 PM", squads: [{ name: "Garnet", color: GARNET, wins: 7, losses: 3 }, { name: "White", color: NAVY, wins: 3, losses: 7 }], present: 15, total: 15 },
  { id: "p3", date: "2025-11-08", grade: null, status: "live", finish: null, squads: [{ name: "Garnet", color: GARNET, wins: 2, losses: 1 }, { name: "White", color: NAVY, wins: 1, losses: 2 }], present: 12, total: 15 },
];

export default function HistoryDemo() {
  const [rows, setRows] = useState<PracticeSummary[]>(seed);
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Practice history (demo)</h1>
        <Link to="/dashboard-demo" className="text-sm text-garnet font-medium">← Season dashboard</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">Open a practice to edit its stats, view its report, or delete it. Change a date inline.</p>
      <HistoryView
        rows={rows}
        onChangeDate={(id, date) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, date } : r)))}
        onDelete={(id) => setRows((rs) => rs.filter((r) => r.id !== id))}
      />
    </div>
  );
}
