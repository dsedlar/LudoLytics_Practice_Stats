import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSeasonData } from "../lib/db";
import { buildWeekly } from "../lib/weeklyReport";
import type { SeasonInput } from "../lib/seasonData";
import { isSupabaseConfigured } from "../lib/supabase";
import WeeklyReportView from "../components/WeeklyReportView";

// Monday of the week containing d (local time).
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const back = (x.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  x.setDate(x.getDate() - back);
  return x;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function weekRange(base: Date): { start: string; end: string } {
  const mon = mondayOf(base);
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5); // Mon..Sat
  return { start: iso(mon), end: iso(sat) };
}

export default function Weekly() {
  const [data, setData] = useState<SeasonInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const init = useMemo(() => weekRange(new Date()), []);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to see the weekly report.");
      return;
    }
    getSeasonData().then(setData).catch((e) => setError((e as Error).message));
  }, []);

  const model = useMemo(() => (data ? buildWeekly(data, start, end) : null), [data, start, end]);

  const setThisWeek = () => { const r = weekRange(new Date()); setStart(r.start); setEnd(r.end); };
  const setLastWeek = () => { const d = new Date(); d.setDate(d.getDate() - 7); const r = weekRange(d); setStart(r.start); setEnd(r.end); };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!model) return <p className="text-gray-500">Loading…</p>;

  return (
    <div>
      <Controls start={start} end={end} setStart={setStart} setEnd={setEnd} onThisWeek={setThisWeek} onLastWeek={setLastWeek} back="/dashboard" />
      <div className="report-wrap overflow-x-auto">
        <WeeklyReportView m={model} />
      </div>
    </div>
  );
}

export function Controls({ start, end, setStart, setEnd, onThisWeek, onLastWeek, back }: {
  start: string; end: string; setStart: (s: string) => void; setEnd: (s: string) => void;
  onThisWeek: () => void; onLastWeek: () => void; back: string;
}) {
  return (
    <div className="no-print mb-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to={back} className="text-sm text-garnet font-medium">← Dashboard</Link>
        <span className="text-sm text-gray-500 ml-2">From</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <span className="text-sm text-gray-500">to</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        <button onClick={onThisWeek} className="text-sm border rounded px-3 py-1">This week</button>
        <button onClick={onLastWeek} className="text-sm border rounded px-3 py-1">Last week</button>
      </div>
      <button onClick={() => window.print()} className="bg-navy text-white px-5 py-2 rounded-lg font-semibold">Save as PDF</button>
    </div>
  );
}
