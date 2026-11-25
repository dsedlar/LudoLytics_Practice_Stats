import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { logEvent, deleteEvent, updateEvent } from "../lib/db";
import { SHOT_LABELS, COUNTING_LABELS, COUNTING_TYPES, type ShotType, type CountingType } from "../lib/config";
import Court from "../components/Court";
import type { EventRow } from "../lib/aggregate";

type Seg = "live" | "transition" | "thespian";
const SHOT_ORDER: ShotType[] = ["atr", "nonatr2", "fg3", "ft"];
const COUNT_GROUPS: { title: string; keys: CountingType[] }[] = [
  { title: "Playmaking", keys: ["ast", "pot", "second", "to"] },
  { title: "Rebounding", keys: ["or", "dr", "tip"] },
  { title: "Defense", keys: ["stl", "blk", "def", "sld", "foul", "dive", "chg"] },
  { title: "Effort / Other", keys: ["fd", "gs", "ta", "misc"] },
];
const isShot = (t: string): t is ShotType => t in SHOT_LABELS;
const typeLabel = (t: string) => (t in SHOT_LABELS ? SHOT_LABELS[t as ShotType] : t === "vft" ? "Validation FT" : COUNTING_LABELS[t as CountingType] ?? t);
// Every type that can be edited/added, grouped for the dropdowns.
const ALL_TYPES = [...SHOT_ORDER, "vft", ...COUNTING_TYPES];

export default function EditStats() {
  const { id = "" } = useParams();
  const { bundle, events, loading, error, reload } = usePracticeData(id);
  const [playerId, setPlayerId] = useState("");
  const [seg, setSeg] = useState<Seg>("live");
  const [selShot, setSelShot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [addType, setAddType] = useState<string>("dr");
  const [addMade, setAddMade] = useState(true);

  const roster = useMemo(
    () => (bundle?.roster ?? []).slice().sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999)),
    [bundle],
  );
  const shootaround = bundle?.practice.session_type === "shootaround";
  useEffect(() => { if (shootaround) setSeg((s) => (s === "live" ? "transition" : s)); }, [shootaround]);

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  const pid = playerId || roster[0]?.player_id || "";
  const squadOf = (p: string) => bundle.roster.find((r) => r.player_id === p)?.squad_id ?? bundle.squads[0]?.id ?? "";
  const nameOf = (p: string) => bundle.roster.find((r) => r.player_id === p)?.players?.name ?? "—";
  const maxGame = Math.max(1, ...events.filter((e) => e.segment === "live").map((e) => e.game_index ?? 1));

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg("");
    try { await fn(); await reload(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  // --- quick-adjust helpers (operate on the selected player + segment) ---
  const matches = (type: string, made?: boolean) =>
    events.filter((e) => e.player_id === pid && e.segment === seg && e.type === type && (made === undefined || e.made === made));
  const count = (type: string, made?: boolean) => matches(type, made).length;
  const add = (type: string, made: boolean | null) =>
    run(() => logEvent({ practice_id: id, squad_id: squadOf(pid), player_id: pid, segment: seg, type, made, game_index: seg === "live" ? maxGame : 1 }));
  const removeOne = (type: string, made?: boolean) => {
    const ms = matches(type, made);
    if (!ms.length) return;
    // prefer removing a non-located event so stepping down doesn't eat a chart dot
    const target = ms.find((e) => e.shot_x == null) ?? ms[ms.length - 1];
    return run(() => deleteEvent(target.id));
  };

  // --- located shots (live) for the court editor ---
  const located = events
    .filter((e) => e.player_id === pid && e.segment === "live" && e.shot_x != null && e.shot_y != null && (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"))
    .sort((a, b) => a.id - b.id);
  const courtShots = located.map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));
  const selEvent: EventRow | null = selShot != null ? located[selShot] ?? null : null;

  // --- raw event list (selected player + segment, newest first) ---
  const listRows = events
    .filter((e) => e.player_id === pid && e.segment === seg)
    .sort((a, b) => b.id - a.id);

  const Stepper = ({ type, made, label }: { type: string; made?: boolean; label: string }) => (
    <div className="flex items-center justify-between gap-2 bg-gray-50 rounded px-2 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-1">
        <button disabled={busy} onClick={() => removeOne(type, made)} className="w-7 h-7 rounded border leading-none disabled:opacity-40">−</button>
        <span className="w-6 text-center font-bold">{count(type, made)}</span>
        <button disabled={busy} onClick={() => add(type, made ?? null)} className="w-7 h-7 rounded bg-navy text-white leading-none disabled:opacity-40">+</button>
      </div>
    </div>
  );

  const segTabs: Seg[] = shootaround ? ["transition", "thespian"] : ["live", "transition", "thespian"];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl headline-bold text-garnet">Edit stats · {bundle.practice.practice_date}</h1>
        <Link to={shootaround ? `/practice/${id}/coach` : `/practice/${id}/coach`} className="text-sm text-garnet font-medium">← Coach view</Link>
      </div>
      <p className="mt-1 text-sm text-gray-500">Fix anything logged during the session. Every change recomputes the report, dashboard and season automatically.</p>

      {/* scope: player + segment */}
      <div className="mt-4 bg-white border rounded-lg p-3 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-600">Player</label>
        <select value={pid} onChange={(e) => { setPlayerId(e.target.value); setSelShot(null); }} className="border rounded px-3 py-2 text-sm min-w-56">
          {roster.map((r) => (
            <option key={r.player_id} value={r.player_id}>#{r.jersey} {r.players?.name}{r.present ? "" : " (out)"}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {segTabs.map((s) => (
            <button key={s} onClick={() => { setSeg(s); setSelShot(null); }} className={`px-3 py-1.5 rounded text-sm font-medium capitalize ${seg === s ? "bg-garnet text-white" : "hover:bg-white"}`}>{s}</button>
          ))}
        </div>
        {busy && <span className="text-xs text-gray-400">saving…</span>}
      </div>
      {msg && <p className="mt-2 text-red-600 text-sm">Could not save: {msg}</p>}

      <div className="mt-4 grid lg:grid-cols-2 gap-4 items-start">
        {/* quick-adjust */}
        <div className="bg-white border rounded-lg p-3">
          <h2 className="font-bold text-garnet mb-2">Quick adjust — {nameOf(pid)}</h2>
          {/* shooting */}
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Shooting ({seg})</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {(seg === "live" ? SHOT_ORDER : (["fg3"] as ShotType[])).flatMap((t) => [
                <Stepper key={`${t}-m`} type={t} made label={`${SHOT_LABELS[t]} — Make`} />,
                <Stepper key={`${t}-x`} type={t} made={false} label={`${SHOT_LABELS[t]} — Miss`} />,
              ])}
            </div>
          </div>
          {/* counting */}
          {(seg === "live" ? COUNT_GROUPS : [{ title: "Turnovers", keys: ["to"] as CountingType[] }]).map((g) => (
            <div key={g.title} className="mb-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{g.title}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {g.keys.map((k) => <Stepper key={k} type={k} label={COUNTING_LABELS[k]} />)}
              </div>
            </div>
          ))}
        </div>

        {/* court editor (live shots only) */}
        {seg === "live" && (
          <div className="bg-white border rounded-lg p-3">
            <h2 className="font-bold text-garnet mb-1">Shot chart — {nameOf(pid)}</h2>
            <p className="text-xs text-gray-500 mb-2">Tap the court to add a shot; tap a dot to edit or delete it.</p>
            <Court
              color={bundle.squads.find((s) => s.id === squadOf(pid))?.color ?? "#B20000"}
              shots={courtShots}
              disabled={!pid}
              onLog={(zone, made, x, y) => { setSelShot(null); run(() => logEvent({ practice_id: id, squad_id: squadOf(pid), player_id: pid, segment: "live", type: zone, made, shot_x: x, shot_y: y, game_index: maxGame })); }}
              onShotClick={(i) => setSelShot(i === selShot ? null : i)}
              selectedShot={selShot}
            />
            {selEvent && (
              <div className="mt-2 flex items-center gap-2 flex-wrap bg-gray-50 border rounded-lg p-2">
                <span className="text-sm text-gray-600">Selected shot ({typeLabel(selEvent.type)}, {selEvent.made ? "make" : "miss"}):</span>
                <button onClick={() => run(() => updateEvent(selEvent.id, { made: true }))} className="text-sm bg-green-600 text-white rounded px-3 py-1 font-semibold">Make</button>
                <button onClick={() => run(() => updateEvent(selEvent.id, { made: false }))} className="text-sm bg-gray-200 rounded px-3 py-1 font-semibold">Miss</button>
                <button onClick={() => { run(() => deleteEvent(selEvent.id)); setSelShot(null); }} className="text-sm bg-red-600 text-white rounded px-3 py-1 font-semibold">Delete</button>
                <button onClick={() => setSelShot(null)} className="text-sm text-gray-400 px-1">cancel</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* raw event list */}
      <div className="mt-4 bg-white border rounded-lg overflow-hidden">
        <div className="px-3 py-2 font-bold text-white text-sm uppercase bg-navy flex items-center justify-between">
          <span>Events — {nameOf(pid)} · {seg}</span>
          <span className="text-xs font-medium opacity-80">{listRows.length} logged</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="p-2">Type</th><th className="p-2">Make/Miss</th><th className="p-2">Player</th>{seg === "live" && <th className="p-2">Game</th>}<th className="p-2">Loc</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {listRows.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="p-2">
                    <select value={e.type} onChange={(ev) => run(() => updateEvent(e.id, { type: ev.target.value, made: isShot(ev.target.value) || ev.target.value === "vft" ? (e.made ?? false) : null }))} className="border rounded px-2 py-1">
                      {ALL_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    {isShot(e.type) || e.type === "vft" ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => run(() => updateEvent(e.id, { made: true }))} className={`rounded px-2 py-1 text-xs font-semibold ${e.made ? "bg-green-600 text-white" : "bg-gray-100"}`}>Make</button>
                        <button onClick={() => run(() => updateEvent(e.id, { made: false }))} className={`rounded px-2 py-1 text-xs font-semibold ${e.made === false ? "bg-gray-700 text-white" : "bg-gray-100"}`}>Miss</button>
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="p-2">
                    <select value={e.player_id} onChange={(ev) => run(() => updateEvent(e.id, { player_id: ev.target.value, squad_id: squadOf(ev.target.value) }))} className="border rounded px-2 py-1 max-w-40">
                      {roster.map((r) => <option key={r.player_id} value={r.player_id}>#{r.jersey} {r.players?.name}</option>)}
                    </select>
                  </td>
                  {seg === "live" && <td className="p-2 text-gray-500">{e.game_index ?? 1}</td>}
                  <td className="p-2 text-gray-400">{e.shot_x != null ? "📍" : ""}</td>
                  <td className="p-2 text-right">
                    <button onClick={() => run(() => deleteEvent(e.id))} className="text-xs border border-red-300 text-red-600 rounded px-2 py-1 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
              {listRows.length === 0 && <tr><td colSpan={6} className="p-3 text-gray-400">No {seg} events for {nameOf(pid)} yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {/* add event */}
        <div className="border-t p-2 flex items-center gap-2 flex-wrap bg-gray-50">
          <span className="text-sm font-semibold text-gray-600">Add {seg} event:</span>
          <select value={addType} onChange={(e) => setAddType(e.target.value)} className="border rounded px-2 py-1 text-sm">
            {(seg === "live" ? ALL_TYPES : (["fg3", "to"] as string[])).map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          {(isShot(addType) || addType === "vft") && (
            <div className="flex items-center gap-1">
              <button onClick={() => setAddMade(true)} className={`rounded px-2 py-1 text-xs font-semibold ${addMade ? "bg-green-600 text-white" : "bg-gray-100"}`}>Make</button>
              <button onClick={() => setAddMade(false)} className={`rounded px-2 py-1 text-xs font-semibold ${!addMade ? "bg-gray-700 text-white" : "bg-gray-100"}`}>Miss</button>
            </div>
          )}
          <button disabled={busy || !pid} onClick={() => add(addType, isShot(addType) || addType === "vft" ? addMade : null)} className="text-sm bg-garnet text-white rounded px-3 py-1.5 font-semibold disabled:opacity-50">+ Add for {nameOf(pid)}</button>
        </div>
      </div>

      <div className="mt-5">
        <Link to={`/practice/${id}/coach`} className="bg-navy text-white px-5 py-3 rounded-lg font-semibold">Done — back to Coach view</Link>
        <Link to={`/practice/${id}/report`} className="ml-3 text-sm text-garnet font-medium">View report →</Link>
      </div>
    </div>
  );
}
