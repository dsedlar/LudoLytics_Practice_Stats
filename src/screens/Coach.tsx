import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { tallyByPlayer, tallyBySquad } from "../lib/aggregate";
import { compute, emptyTally, addTally, pct, type RawTally } from "../lib/stats";
import { GRADE_SCALE } from "../lib/config";
import { setGrade, finishPractice, setSquadWins, setSquadLosses, updateSquad, setPlayerSquad, updatePractice } from "../lib/db";

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

  // Transition 3s don't count toward team or player stats (they're a separate
  // drill), so the live tallies use non-transition events only.
  const playEvents = useMemo(() => events.filter((e) => e.segment !== "transition"), [events]);
  const playerTallies = useMemo(() => tallyByPlayer(playEvents), [playEvents]);
  const squadTallies = useMemo(() => tallyBySquad(playEvents), [playEvents]);

  if (loading) return <p className="text-gray-500">Loading practice…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  // Team totals follow where each stat was earned (the event's squad), so a
  // player moved mid-practice splits correctly between both teams.
  const squadTally = (squadId: string): RawTally => squadTallies.get(squadId) ?? emptyTally();

  const combined = bundle.squads.reduce((acc, s) => addTally(acc, squadTally(s.id)), emptyTally());

  // Two squads scrimmage each other, so a win for one is a loss for the other.
  // Mirror every W/L change to the opposing squad to keep the record consistent.
  const other = (squadId: string) => bundle!.squads.find((s) => s.id !== squadId);

  async function adjustWins(squadId: string, delta: number) {
    const me = bundle!.squads.find((s) => s.id === squadId);
    if (!me) return;
    const newWins = Math.max(0, (me.wins ?? 0) + delta);
    const applied = newWins - (me.wins ?? 0); // 0 if flooring at zero blocked it
    await setSquadWins(squadId, newWins);
    const opp = other(squadId);
    if (opp && applied !== 0) await setSquadLosses(opp.id, Math.max(0, (opp.losses ?? 0) + applied));
  }

  async function adjustLosses(squadId: string, delta: number) {
    const me = bundle!.squads.find((s) => s.id === squadId);
    if (!me) return;
    const newLosses = Math.max(0, (me.losses ?? 0) + delta);
    const applied = newLosses - (me.losses ?? 0);
    await setSquadLosses(squadId, newLosses);
    const opp = other(squadId);
    if (opp && applied !== 0) await setSquadWins(opp.id, Math.max(0, (opp.wins ?? 0) + applied));
  }

  // Only two teams (Grey/Garnet) — swap relabels each squad to the other
  // (name + color). Players/stats stay with their squad, just the label flips.
  async function swapTeams() {
    const [a, b] = bundle!.squads;
    if (!a || !b) return;
    await updateSquad(a.id, { name: b.name, color: b.color });
    await updateSquad(b.id, { name: a.name, color: a.color });
  }

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

  const present = bundle.roster.filter((r) => r.present && r.squad_id != null).length;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl headline-bold text-garnet">Coach view · {bundle.practice.practice_date}</h1>
        <span className="text-sm text-gray-500">{present}/{bundle.roster.length} present</span>
      </div>

      {/* summary cards */}
      <div className="mt-4 grid sm:grid-cols-3 gap-3">
        {bundle.squads.map((s) => {
          const t = squadTally(s.id);
          return <SummaryCard key={s.id} name={s.name} color={s.color} t={t} c={compute(t)} record={{ w: s.wins ?? 0, l: s.losses ?? 0 }} />;
        })}
        <SummaryCard name="Combined" color="#00142D" t={combined} c={compute(combined)} wide={bundle.squads.length < 2} />
      </div>

      {/* device links + coach take-stats */}
      <div className="mt-5 bg-white border rounded-lg p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-semibold text-sm text-gray-600">Analyst device links (open one per squad)</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => run(swapTeams)} className="border rounded px-3 py-2 font-semibold text-sm whitespace-nowrap">
              Swap Grey ↔ Garnet
            </button>
            <Link to={`/practice/${id}/entry`} className="bg-navy text-white px-4 py-2 rounded-lg font-semibold text-sm whitespace-nowrap">
              Take stats (both squads) →
            </Link>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {bundle.squads.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded border flex-shrink-0"
                style={{ background: s.color }}
                title={`${s.name} color`}
              />
              <span className="font-semibold text-sm w-20 truncate uppercase" style={{ color: s.color }}>{s.name}</span>
              <code className="text-xs bg-gray-100 rounded px-2 py-1 flex-1 truncate">/practice/{id}/squad/{s.id}</code>
              <button onClick={() => copyLink(s.id)} className="text-sm text-white rounded px-3 py-1" style={{ background: s.color }}>
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
              <span className="font-bold w-20 truncate uppercase" style={{ color: s.color }}>{s.name}</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-3">W</span>
                <button onClick={() => run(() => adjustWins(s.id, -1))} className="w-7 h-7 rounded border leading-none">−</button>
                <span className="text-lg font-black w-6 text-center">{s.wins ?? 0}</span>
                <button onClick={() => run(() => adjustWins(s.id, +1))} className="w-7 h-7 rounded bg-garnet text-white leading-none">+</button>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400 w-3">L</span>
                <button onClick={() => run(() => adjustLosses(s.id, -1))} className="w-7 h-7 rounded border leading-none">−</button>
                <span className="text-lg font-black w-6 text-center">{s.losses ?? 0}</span>
                <button onClick={() => run(() => adjustLosses(s.id, +1))} className="w-7 h-7 rounded bg-navy text-white leading-none">+</button>
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
        {bundle.squads.map((s) => {
          const target = bundle.squads.find((x) => x.id !== s.id) ?? null;
          return (
            <SquadTable
              key={s.id}
              name={s.name}
              color={s.color}
              moveToName={target?.name}
              onMove={target ? (playerId) => run(() => setPlayerSquad(id, playerId, target.id)) : undefined}
              rows={bundle.roster
                .filter((r) => r.squad_id === s.id && r.present)
                .map((r) => {
                  const t = playerTallies.get(r.player_id) ?? emptyTally();
                  return { playerId: r.player_id, name: r.players?.name ?? "—", jersey: r.jersey, t, c: compute(t) };
                })}
            />
          );
        })}
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

function SummaryCard({ name, color, t, c, record, wide }: { name: string; color: string; t: RawTally; c: ReturnType<typeof compute>; record?: { w: number; l: number }; wide?: boolean }) {
  return (
    <div className={`rounded-lg p-3 text-white ${wide ? "sm:col-span-3" : ""}`} style={{ background: color }}>
      <div className="font-bold tracking-wide uppercase">{name}</div>
      <div className="mt-1 flex gap-4">
        <Stat label="PPP" value={c.ppp.toFixed(2)} />
        <Stat label="PTS" value={String(c.pts)} />
        <Stat label="POSS" value={c.poss.toFixed(0)} />
        <Stat label="eFG%" value={pct(c.efg)} />
        <Stat label="TO" value={String(t.to)} />
        <Stat label="Casper" value={String(c.casper)} />
        {record && <Stat label="W" value={String(record.w)} />}
        {record && <Stat label="L" value={String(record.l)} />}
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
  moveToName,
  onMove,
}: {
  name: string;
  color: string;
  rows: { playerId: string; name: string; jersey: string | null; t: RawTally; c: ReturnType<typeof compute> }[];
  moveToName?: string;
  onMove?: (playerId: string) => void;
}) {
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-3 py-2 font-bold text-white text-sm uppercase" style={{ background: color }}>{name}</div>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="p-2">#</th><th className="p-2">Player</th><th className="p-2">3FG%</th>
            <th className="p-2">eFG%</th><th className="p-2">TO</th><th className="p-2">Reb</th><th className="p-2">CP</th>
            {onMove && <th className="p-2"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="p-2 text-gray-500">{r.jersey}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2">{pct(r.t.fg3A > 0 ? r.t.fg3M / r.t.fg3A : 0)}</td>
              <td className="p-2">{pct(r.c.efg)}</td>
              <td className="p-2">{r.t.to}</td>
              <td className="p-2">{r.t.or + r.t.dr}</td>
              <td className="p-2 font-semibold">{r.c.casper}</td>
              {onMove && (
                <td className="p-2 text-right">
                  <button
                    onClick={() => onMove(r.playerId)}
                    className="text-xs border rounded px-2 py-0.5 whitespace-nowrap hover:bg-gray-50"
                    title={`Move ${r.name} to ${moveToName}`}
                  >
                    → {moveToName}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={onMove ? 8 : 7} className="p-3 text-gray-400">No players.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
