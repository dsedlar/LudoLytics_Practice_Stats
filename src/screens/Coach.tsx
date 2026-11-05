import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { tallyByPlayer } from "../lib/aggregate";
import { compute, emptyTally, addTally, pct, type RawTally } from "../lib/stats";
import { GRADE_SCALE } from "../lib/config";
import { setGrade, finishPractice, setSquadWins, setSquadLosses, updatePractice } from "../lib/db";

export default function Coach() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { bundle, events, error, loading, reload } = usePracticeData(id);
  const [copied, setCopied] = useState("");
  const [actErr, setActErr] = useState("");

  // Run a write then reload so the UI reflects it immediately (don't rely on realtime).
  async function run(fn: () => Promise<void>) {
    try {
      setActErr("");
      await fn();
      await reload();
    } catch (e) {
      setActErr((e as Error).message);
    }
  }

  const playerTallies = useMemo(() => tallyByPlayer(events), [events]);

  if (loading) return <p className="text-gray-500">Loading practice…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  const squadTally = (squadId: string): RawTally => {
    let t = emptyTally();
    bundle.roster
      .filter((r) => r.squad_id === squadId)
      .forEach((r) => {
        const pt = playerTallies.get(r.player_id);
        if (pt) t = addTally(t, pt);
      });
    return t;
  };

  const combined = bundle.squads.reduce((acc, s) => addTally(acc, squadTally(s.id)), emptyTally());

  async function copyLink(squadId: string) {
    const url = `${window.location.origin}/practice/${id}/squad/${squadId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may be blocked; url still shown */
    }
    setCopied(squadId);
    setTimeout(() => setCopied(""), 1500);
  }

  const present = bundle.roster.filter((r) => r.present).length;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl headline-bold text-garnet">Coach view · {bundle.practice.practice_date}</h1>
        <span className="text-sm text-gray-500">{present}/{bundle.roster.length} present</span>
      </div>

      {/* summary cards */}
      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        {bundle.squads.map((s) => {
          const c = compute(squadTally(s.id));
          return <SummaryCard key={s.id} name={s.name} color={s.color} c={c} />;
        })}
        <SummaryCard name="Combined" color="#00142D" c={compute(combined)} wide={bundle.squads.length < 2} />
      </div>

      {/* device links */}
      <div className="mt-5 bg-white border rounded-lg p-3">
        <h2 className="font-semibold text-sm text-gray-600 mb-2">Analyst device links (open one per squad)</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {bundle.squads.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="font-semibold text-sm w-20 truncate" style={{ color: s.color }}>{s.name}</span>
              <code className="text-xs bg-gray-100 rounded px-2 py-1 flex-1 truncate">/practice/{id}/squad/{s.id}</code>
              <button onClick={() => copyLink(s.id)} className="text-sm bg-garnet text-white rounded px-3 py-1">
                {copied === s.id ? "Copied!" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* scrimmage record */}
      <div className="mt-5 bg-white border rounded-lg p-3">
        <h2 className="font-semibold text-sm text-gray-600 mb-2">Live-play record (set by analysts; adjust if needed)</h2>
        <div className="flex flex-wrap gap-6">
          {bundle.squads.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="font-bold w-20 truncate" style={{ color: s.color }}>{s.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-3">W</span>
                <button onClick={() => run(() => setSquadWins(s.id, (s.wins ?? 0) - 1))} className="w-7 h-7 rounded border leading-none">−</button>
                <span className="text-lg font-black w-6 text-center">{s.wins ?? 0}</span>
                <button onClick={() => run(() => setSquadWins(s.id, (s.wins ?? 0) + 1))} className="w-7 h-7 rounded bg-garnet text-white leading-none">+</button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-3">L</span>
                <button onClick={() => run(() => setSquadLosses(s.id, (s.losses ?? 0) - 1))} className="w-7 h-7 rounded border leading-none">−</button>
                <span className="text-lg font-black w-6 text-center">{s.losses ?? 0}</span>
                <button onClick={() => run(() => setSquadLosses(s.id, (s.losses ?? 0) + 1))} className="w-7 h-7 rounded bg-navy text-white leading-none">+</button>
              </div>
            </div>
          ))}
          <span className="text-sm text-gray-500 self-center">
            Winner of the day:{" "}
            <b>
              {(() => {
                const sorted = [...bundle.squads].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0));
                if ((sorted[0]?.wins ?? 0) === (sorted[1]?.wins ?? 0)) return "Tied";
                return sorted[0].name;
              })()}
            </b>
          </span>
        </div>
      </div>

      {/* grade + player of the day */}
      <div className="mt-5 bg-white border rounded-lg p-3 flex flex-wrap items-end gap-6">
        <div>
          <h2 className="font-semibold text-sm text-gray-600 mb-2">Practice grade</h2>
          <div className="flex flex-wrap gap-2">
            {[5, 4, 3, 2, 1].map((g) => (
              <button
                key={g}
                onClick={() => run(() => setGrade(id, g))}
                className={`px-3 py-2 rounded border text-sm ${bundle.practice.grade === g ? "bg-garnet text-white" : "bg-white"}`}
              >
                <b>{g}</b> {GRADE_SCALE[g].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-semibold text-sm text-gray-600 mb-2">Player of the Day</h2>
          <select
            value={bundle.practice.player_of_day ?? ""}
            onChange={(e) => run(() => updatePractice(id, { player_of_day: e.target.value || null }))}
            className="border rounded px-3 py-2 text-sm min-w-48"
          >
            <option value="">— none —</option>
            {bundle.roster
              .filter((r) => r.present)
              .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999))
              .map((r) => (
                <option key={r.player_id} value={r.player_id}>
                  #{r.jersey} {r.players?.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {actErr && <p className="mt-2 text-red-600 text-sm">Could not save: {actErr}</p>}

      {/* live per-player tables */}
      <div className="mt-5 grid lg:grid-cols-2 gap-4">
        {bundle.squads.map((s) => (
          <SquadTable
            key={s.id}
            name={s.name}
            color={s.color}
            rows={bundle.roster
              .filter((r) => r.squad_id === s.id && r.present)
              .map((r) => ({ name: r.players?.name ?? "—", jersey: r.jersey, c: compute(playerTallies.get(r.player_id) ?? emptyTally()) }))}
          />
        ))}
      </div>

      <div className="mt-6">
        <button
          onClick={() =>
            run(async () => {
              await finishPractice(id, new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
              navigate(`/practice/${id}/report`);
            })
          }
          className="bg-navy text-white px-5 py-3 rounded-lg font-semibold"
        >
          {bundle.practice.status === "finished" ? "Re-finish (update time)" : "Finish practice"}
        </button>
        <Link to={`/practice/${id}/report`} className="ml-3 bg-garnet text-white px-5 py-3 rounded-lg font-semibold">
          View report →
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({ name, color, c, wide }: { name: string; color: string; c: ReturnType<typeof compute>; wide?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-white ${wide ? "sm:col-span-3" : ""}`} style={{ background: color }}>
      <div className="font-bold tracking-wide">{name}</div>
      <div className="mt-1 flex gap-4">
        <Stat label="PPP" value={c.ppp.toFixed(2)} />
        <Stat label="Casper" value={String(c.casper)} />
        <Stat label="PTS" value={String(c.pts)} />
        <Stat label="POSS" value={c.poss.toFixed(0)} />
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-black leading-none">{value}</div>
      <div className="text-[10px] uppercase opacity-80">{label}</div>
    </div>
  );
}

function SquadTable({
  name,
  color,
  rows,
}: {
  name: string;
  color: string;
  rows: { name: string; jersey: string | null; c: ReturnType<typeof compute> }[];
}) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-3 py-2 font-bold text-white text-sm" style={{ background: color }}>{name}</div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="p-2">#</th><th className="p-2">Player</th><th className="p-2">PTS</th>
            <th className="p-2">TS%</th><th className="p-2">PER</th><th className="p-2">CP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="p-2 text-gray-500">{r.jersey}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2">{r.c.pts}</td>
              <td className="p-2">{pct(r.c.ts)}</td>
              <td className="p-2">{r.c.per.toFixed(1)}</td>
              <td className="p-2 font-semibold">{r.c.casper}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="p-3 text-gray-400">No players.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
