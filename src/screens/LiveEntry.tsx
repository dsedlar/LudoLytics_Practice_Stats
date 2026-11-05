import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { tallyByPlayer } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import {
  SHOT_LABELS,
  COUNTING_LABELS,
  SHOOTING_DRILLS,
  type ShotType,
  type CountingType,
  type Segment,
} from "../lib/config";
import { logEvent, deleteEvent, upsertDrillResult, type DrillRow } from "../lib/db";
import Court, { type CourtShot } from "../components/Court";

const GROUPS: { title: string; keys: CountingType[] }[] = [
  { title: "Playmaking", keys: ["ast", "pot", "second", "to"] },
  { title: "Rebounding", keys: ["or", "dr", "tip"] },
  { title: "Defense", keys: ["stl", "blk", "def", "lb", "dive", "chg"] },
  { title: "Effort / Other", keys: ["fd", "gs", "ta", "misc"] },
];

export default function LiveEntry() {
  const { id = "", squadId = "" } = useParams();
  const { bundle, events, drills, error, loading } = usePracticeData(id);
  const [selected, setSelected] = useState<string>("");
  const [segment, setSegment] = useState<Segment>("live");
  const [tab, setTab] = useState<"play" | "drills">("play");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState<string>("");

  const tallies = useMemo(() => tallyByPlayer(events), [events]);

  if (loading) return <p className="text-gray-500">Loading practice…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  const squad = bundle.squads.find((s) => s.id === squadId);
  if (!squad) return <p className="text-red-600">Squad not found.</p>;

  const players = bundle.roster
    .filter((r) => r.squad_id === squadId && r.present)
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));

  const squadShots: CourtShot[] = events
    .filter(
      (e) =>
        e.squad_id === squadId &&
        e.shot_x != null &&
        e.shot_y != null &&
        (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"),
    )
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));

  async function log(type: string, made?: boolean, shotX?: number, shotY?: number) {
    if (!selected) {
      setFlash("Pick a player first");
      setTimeout(() => setFlash(""), 1200);
      return;
    }
    try {
      const row = await logEvent({
        practice_id: id,
        squad_id: squadId,
        player_id: selected,
        segment,
        type,
        made,
        shot_x: shotX,
        shot_y: shotY,
      });
      setUndoStack((s) => [...s, (row as { id: number }).id]);
      const label = type in SHOT_LABELS ? `${SHOT_LABELS[type as ShotType]} ${made ? "✓" : "✗"}` : COUNTING_LABELS[type as CountingType];
      setFlash(label);
      setTimeout(() => setFlash(""), 900);
    } catch (err) {
      setFlash(`Error: ${(err as Error).message}`);
    }
  }

  async function undo() {
    const last = undoStack[undoStack.length - 1];
    if (last == null) return;
    setUndoStack((s) => s.slice(0, -1));
    try {
      await deleteEvent(last);
    } catch {
      /* realtime will reconcile */
    }
  }

  const selectedName = players.find((p) => p.player_id === selected)?.players?.name;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-black" style={{ color: squad.color }}>
          {squad.name} · live entry
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setTab("play")} className={`px-3 py-1 rounded ${tab === "play" ? "bg-garnet text-white" : "bg-white border"}`}>Live / Transition</button>
          <button onClick={() => setTab("drills")} className={`px-3 py-1 rounded ${tab === "drills" ? "bg-garnet text-white" : "bg-white border"}`}>Shooting drills</button>
        </div>
      </div>

      {/* player picker */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {players.map((p) => {
          const c = compute(tallies.get(p.player_id) ?? emptyTally());
          const on = selected === p.player_id;
          return (
            <button
              key={p.player_id}
              onClick={() => setSelected(p.player_id)}
              className={`rounded-lg p-2 text-left border ${on ? "ring-2 ring-garnet bg-garnet/5" : "bg-white"}`}
            >
              <div className="text-xs text-gray-500">#{p.jersey}</div>
              <div className="font-semibold leading-tight truncate">{p.players?.name}</div>
              <div className="text-xs mt-1 text-gray-600">{c.pts} pts · {c.casper} CP</div>
            </button>
          );
        })}
        {players.length === 0 && <p className="text-gray-500 col-span-full">No players assigned to this squad.</p>}
      </div>

      {tab === "play" ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">Segment:</span>
            {(["live", "transition"] as Segment[]).map((s) => (
              <button key={s} onClick={() => setSegment(s)} className={`px-3 py-1 rounded text-sm capitalize ${segment === s ? "bg-navy text-white" : "bg-white border"}`}>{s}</button>
            ))}
            <div className="flex-1" />
            <span className="text-sm text-garnet font-medium h-5">{flash}</span>
            <button onClick={undo} disabled={!undoStack.length} className="px-3 py-1 rounded text-sm bg-white border disabled:opacity-40">↶ Undo</button>
          </div>

          <div className="mt-2 text-sm text-gray-500">
            {selectedName ? <>Logging for <b>{selectedName}</b></> : "Select a player above"}
          </div>

          <div className="mt-3 grid lg:grid-cols-2 gap-3 items-start">
            {/* shot chart */}
            <div className="bg-white border rounded-lg p-2">
              <div className="text-sm font-semibold mb-1">Shot chart — tap where the shot was taken, then Make/Miss</div>
              <Court color={squad.color} shots={squadShots} disabled={!selected} onLog={(z, m, x, y) => log(z, m, x, y)} />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-semibold">Free Throws:</span>
                <button onClick={() => log("ft", true)} className="bg-green-600 text-white rounded px-4 py-2 text-sm font-semibold">FT Make</button>
                <button onClick={() => log("ft", false)} className="bg-gray-200 rounded px-4 py-2 text-sm font-semibold">FT Miss</button>
                <span className="ml-auto text-xs text-gray-500">
                  ● filled = make&nbsp;&nbsp;○ ring = miss
                </span>
              </div>
            </div>

            {/* other stats */}
            <div className="space-y-2">
              {GROUPS.map((g) => (
                <div key={g.title} className="bg-white border rounded-lg p-2">
                  <div className="text-sm font-semibold mb-1">{g.title}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.keys.map((k) => (
                      <button key={k} onClick={() => log(k)} className="bg-navy/90 text-white rounded px-3 py-2 text-sm font-medium">
                        {COUNTING_LABELS[k]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <DrillsTab practiceId={id} squadId={squadId} players={players} drills={drills} />
      )}
    </div>
  );
}

function DrillsTab({
  practiceId,
  squadId,
  players,
  drills,
}: {
  practiceId: string;
  squadId: string;
  players: { player_id: string; jersey: string | null; players: { name: string } | null }[];
  drills: DrillRow[];
}) {
  function val(playerId: string, drill: string, field: "makes" | "attempts") {
    const row = drills.find((d) => d.player_id === playerId && d.drill === drill);
    return row ? (field === "makes" ? row.makes : row.attempts ?? "") : "";
  }
  async function save(playerId: string, drill: string, makes: number, attempts?: number | null) {
    await upsertDrillResult({ practice_id: practiceId, squad_id: squadId, player_id: playerId, drill, makes, attempts });
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm bg-white border rounded-lg">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Player</th>
            {SHOOTING_DRILLS.map((d) => (
              <th key={d.key} className="p-2 text-center">{d.label}{d.mode === "fixed" ? ` /${d.denominator}` : ""}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.player_id} className="border-b">
              <td className="p-2 whitespace-nowrap">#{p.jersey} {p.players?.name}</td>
              {SHOOTING_DRILLS.map((d) => (
                <td key={d.key} className="p-2 text-center">
                  <input
                    type="number"
                    defaultValue={val(p.player_id, d.key, "makes")}
                    onBlur={(e) =>
                      save(p.player_id, d.key, Number(e.target.value) || 0, d.mode === "ratio" ? Number(val(p.player_id, d.key, "attempts")) || null : null)
                    }
                    className="w-14 border rounded px-1 text-center"
                    placeholder="M"
                  />
                  {d.mode === "ratio" && (
                    <input
                      type="number"
                      defaultValue={val(p.player_id, d.key, "attempts")}
                      onBlur={(e) =>
                        save(p.player_id, d.key, Number(val(p.player_id, d.key, "makes")) || 0, Number(e.target.value) || null)
                      }
                      className="w-14 border rounded px-1 text-center ml-1"
                      placeholder="A"
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">Enter makes (M); Transition also takes attempts (A). Saves when you tab out of a field.</p>
    </div>
  );
}
