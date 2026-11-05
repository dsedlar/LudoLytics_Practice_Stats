import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getLivePractice, type PracticeRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";

const FEATURES = [
  { n: 1, title: "Collect live — two analysts, one squad each, court shot chart + stat buttons, in real time" },
  { n: 2, title: "Generate the one-page Ludolytics report (PDF) the moment practice ends" },
  { n: 3, title: "Track every player's growth across the whole season" },
];

export default function Home() {
  const [live, setLive] = useState<PracticeRow | null>(null);
  useEffect(() => {
    if (isSupabaseConfigured) getLivePractice().then(setLive).catch(() => {});
  }, []);

  return (
    <div>
      {live && (
        <Link to={`/practice/${live.id}/coach`} className="mb-4 flex items-center gap-3 bg-green-100 text-green-800 border border-green-300 rounded-lg px-4 py-3 font-semibold">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600 animate-pulse" />
          Live practice in progress — {live.practice_date} · Resume →
        </Link>
      )}
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1">
          <div className="eyebrow text-[11px] text-garnet mb-1">VES Boys Basketball · Ludolytics</div>
          <h1 className="text-3xl md:text-4xl headline-serif text-garnet">Measure the Work. Relentless Growth.</h1>
          <p className="mt-2 text-gray-600 max-w-2xl">
            Live practice stat collection for VES Boys Basketball. Two analysts, one squad each,
            real-time sync, the Ludolytics report, and a season-long dashboard.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/setup" className="inline-block bg-garnet text-white px-5 py-3 rounded-lg font-semibold">
              Set up practice →
            </Link>
            <Link to="/dashboard" className="inline-block border border-garnet text-garnet px-5 py-3 rounded-lg font-semibold">
              Season dashboard →
            </Link>
            <Link to="/roster" className="inline-block border border-garnet text-garnet px-5 py-3 rounded-lg font-semibold">
              Roster →
            </Link>
            <Link to="/history" className="inline-block border border-garnet text-garnet px-5 py-3 rounded-lg font-semibold">
              Practice history →
            </Link>
          </div>
        </div>
        <img src="/ves-bishop.png" alt="VES Bishop" className="hidden md:block w-36 lg:w-48 flex-shrink-0" />
      </div>

      <ul className="mt-6 space-y-2">
        {FEATURES.map((f) => (
          <li key={f.n} className="bg-white rounded-lg border px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-garnet text-white grid place-items-center text-sm font-bold">
              {f.n}
            </span>
            <span className="flex-1">{f.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
