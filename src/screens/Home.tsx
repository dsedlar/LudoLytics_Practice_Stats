import { Link } from "react-router-dom";

// Temporary landing page. Phase 1 will replace this with the real navigation:
// Practice Setup, Live Entry (per analyst), Coach View, Report, Season Dashboard.
const PHASES = [
  { n: 1, title: "Core: setup, roster import, two-analyst live entry + sync", status: "building" },
  { n: 2, title: "The exact Ludolytics one-page PDF report", status: "next" },
  { n: 3, title: "Season dashboard for players", status: "planned" },
];

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-black text-garnet">Measure the work. Relentless growth.</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Live practice stat collection for VES Boys Basketball. Two analysts, one squad each,
        real-time sync, the Ludolytics report, and a season-long dashboard.
      </p>

      <Link
        to="/setup"
        className="inline-block mt-5 bg-garnet text-white px-5 py-3 rounded-lg font-semibold"
      >
        Set up practice →
      </Link>

      <ul className="mt-6 space-y-2">
        {PHASES.map((p) => (
          <li key={p.n} className="bg-white rounded-lg border px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-full bg-garnet text-white grid place-items-center text-sm font-bold">
              {p.n}
            </span>
            <span className="flex-1">{p.title}</span>
            <span className="text-xs uppercase tracking-wide text-gray-500">{p.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
