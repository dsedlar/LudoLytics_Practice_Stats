import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getLivePractice, getSquads, claimSquad, releaseSquad, type PracticeRow, type SquadRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import { useAuth } from "../lib/auth";

const FEATURES = [
  { n: 1, title: "Collect live — two analysts, one squad each, court shot chart + stat buttons, in real time" },
  { n: 2, title: "Generate the one-page Ludolytics report (PDF) the moment practice ends" },
  { n: 3, title: "Track every player's growth across the whole season" },
];

export default function Home() {
  const { isManager, isPlayer, playerId } = useAuth();
  const [live, setLive] = useState<PracticeRow | null>(null);
  useEffect(() => {
    if (isSupabaseConfigured) getLivePractice().then(setLive).catch(() => {});
  }, []);

  // Players only ever see their own page.
  if (isPlayer) {
    return playerId ? (
      <Navigate to={`/player/${playerId}`} replace />
    ) : (
      <div className="bg-white border rounded-lg p-5 max-w-lg">
        <h1 className="text-2xl headline-bold text-garnet">Welcome</h1>
        <p className="mt-2 text-gray-600">Your account isn't linked to a player yet. Ask your coach to connect it in the roster, then sign in again.</p>
      </div>
    );
  }

  if (isManager) return <ManagerHome live={live} />;

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

// Managers land here: claim a squad for the current live practice, or (when no
// practice is live) just the read-only season views.
function ManagerHome({ live }: { live: PracticeRow | null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [squads, setSquads] = useState<SquadRow[] | null>(null);
  const [flash, setFlash] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (live) getSquads(live.id).then(setSquads).catch(() => setSquads([]));
  }, [live]);
  useEffect(() => { load(); }, [load]);

  async function claim(s: SquadRow) {
    setBusy(true);
    setFlash("");
    try {
      const ok = await claimSquad(s.id, user?.email ?? "manager");
      if (ok) navigate(`/practice/${live!.id}/squad/${s.id}`);
      else { setFlash(`${s.name} was just taken — pick the other team.`); load(); }
    } catch (e) {
      setFlash((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function release(s: SquadRow) {
    setBusy(true);
    try { await releaseSquad(s.id); load(); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="text-3xl headline-bold text-garnet">Take Stats</h1>
      {!live ? (
        <p className="mt-3 text-gray-600">
          No live practice right now. When a coach starts one, your team buttons will appear here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-gray-600 text-sm">
            Live practice — {live.practice_date}. Tap your team to start taking stats. Once a team is taken, the other manager takes the remaining one.
          </p>
          {flash && <p className="mt-2 text-garnet text-sm font-medium">{flash}</p>}
          <div className="mt-4 grid sm:grid-cols-2 gap-3 max-w-2xl">
            {(squads ?? []).map((s) => {
              const mine = s.claimed_by && s.claimed_by === user?.id;
              const takenByOther = s.claimed_by && s.claimed_by !== user?.id;
              return (
                <div key={s.id} className="rounded-lg border p-4" style={{ borderColor: s.color }}>
                  <div className="font-bold uppercase tracking-wide" style={{ color: s.color }}>{s.name}</div>
                  {mine ? (
                    <div className="mt-2 space-y-1">
                      <button onClick={() => navigate(`/practice/${live.id}/squad/${s.id}`)} className="w-full text-white rounded px-3 py-2 font-semibold" style={{ background: s.color }}>
                        Resume {s.name} entry →
                      </button>
                      <button onClick={() => release(s)} disabled={busy} className="w-full text-xs text-gray-500 hover:text-garnet">Leave this team</button>
                    </div>
                  ) : takenByOther ? (
                    <div className="mt-2 text-sm text-gray-500">Taken{s.claimed_label ? ` · ${s.claimed_label}` : ""}</div>
                  ) : (
                    <button onClick={() => claim(s)} disabled={busy} className="mt-2 w-full text-white rounded px-3 py-2 font-semibold disabled:opacity-50" style={{ background: s.color }}>
                      Take stats for {s.name}
                    </button>
                  )}
                </div>
              );
            })}
            {squads !== null && squads.length === 0 && <p className="text-gray-500">No squads set up for this practice yet.</p>}
          </div>
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/dashboard" className="inline-block border border-garnet text-garnet px-5 py-3 rounded-lg font-semibold">Season dashboard →</Link>
        <Link to="/weekly" className="inline-block border border-garnet text-garnet px-5 py-3 rounded-lg font-semibold">Weekly report →</Link>
      </div>
    </div>
  );
}
