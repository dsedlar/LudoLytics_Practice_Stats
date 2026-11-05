import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { exportSeasonCSV, exportBackupJSON } from "../lib/exporters";

export default function Settings() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  async function runExport(key: string, fn: () => Promise<void>) {
    setErr("");
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <h1 className="text-3xl headline-bold text-garnet">Settings</h1>
      <p className="mt-1 text-gray-600 text-sm">Manage the roster, practices, and your season data.</p>

      {/* Manage */}
      <h2 className="mt-6 eyebrow text-[11px] text-garnet">Manage</h2>
      <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card
          to="/roster"
          title="Roster"
          desc="Add, edit, or remove players. Set who's active for the season."
        />
        <Card
          to="/history"
          title="Practice history"
          desc="Open, edit, or delete past practices. Change dates and export box scores."
        />
        <Card
          to="/setup"
          title="Set up a practice"
          desc="Create a new practice, assign squads, and mark attendance."
        />
      </div>

      {/* Season */}
      <h2 className="mt-7 eyebrow text-[11px] text-garnet">Season</h2>
      <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card
          to="/dashboard"
          title="Season dashboard"
          desc="Every practice totaled for the season, per player and team."
        />
        <Card
          to="/display"
          title="Locker-room display"
          desc="Full-screen rotating leaderboards for the locker-room screen."
        />
      </div>

      {/* Export / backup */}
      <h2 className="mt-7 eyebrow text-[11px] text-garnet">Export &amp; backup</h2>
      <div className="mt-2 bg-white border rounded-lg p-4">
        <p className="text-sm text-gray-600 mb-3">
          Download the whole season as a spreadsheet, or a full JSON backup of every record.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runExport("csv", exportSeasonCSV)}
            disabled={busy === "csv"}
            className="text-sm border rounded px-4 py-2 font-medium disabled:opacity-50"
          >
            {busy === "csv" ? "Preparing…" : "Season box score (CSV)"}
          </button>
          <button
            onClick={() => runExport("json", exportBackupJSON)}
            disabled={busy === "json"}
            className="text-sm border rounded px-4 py-2 font-medium disabled:opacity-50"
          >
            {busy === "json" ? "Preparing…" : "Full backup (JSON)"}
          </button>
        </div>
        {err && <p className="mt-3 text-red-600 text-sm">Could not export: {err}</p>}
      </div>

      {/* Account */}
      <h2 className="mt-7 eyebrow text-[11px] text-garnet">Account</h2>
      <div className="mt-2 bg-white border rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {user ? (
            <>Signed in as <b className="text-gray-800">{user.email}</b></>
          ) : (
            "Not signed in."
          )}
        </div>
        {user && (
          <button
            onClick={() => signOut()}
            className="text-sm bg-garnet text-white rounded px-4 py-2 font-semibold"
          >
            Sign out
          </button>
        )}
      </div>

      <div className="mt-6">
        <Link to="/" className="text-sm text-garnet font-medium">← Back to home</Link>
      </div>
    </div>
  );
}

function Card({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="block bg-white border rounded-lg p-4 hover:border-garnet hover:shadow-sm transition"
    >
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="mt-1 text-sm text-gray-500">{desc}</div>
    </Link>
  );
}
