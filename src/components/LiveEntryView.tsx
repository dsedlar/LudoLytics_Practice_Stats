import { COUNTING_LABELS, SHOOTING_DRILLS, type CountingType, type Segment } from "../lib/config";
import Court, { type CourtShot } from "./Court";
import type { DrillRow } from "../lib/db";

const GROUPS: { title: string; keys: CountingType[] }[] = [
  { title: "Playmaking", keys: ["ast", "pot", "second", "to"] },
  { title: "Rebounding", keys: ["or", "dr", "tip"] },
  { title: "Defense", keys: ["stl", "blk", "def", "lb", "dive", "chg"] },
  { title: "Effort / Other", keys: ["fd", "gs", "ta", "misc"] },
];

export interface TilePlayer {
  playerId: string;
  jersey: string;
  name: string;
  pts: number;
  casper: number;
}
export interface DrillPlayer {
  player_id: string;
  jersey: string;
  name: string;
}

export interface LiveEntryViewProps {
  squadName: string;
  squadColor: string;
  tab: "play" | "drills";
  setTab: (t: "play" | "drills") => void;
  players: TilePlayer[];
  selected: string;
  setSelected: (id: string) => void;
  selectedName?: string;
  segment: Segment;
  setSegment: (s: Segment) => void;
  squadShots: CourtShot[];
  onLog: (type: string, made?: boolean, x?: number, y?: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  flash: string;
  drillPlayers: DrillPlayer[];
  drills: DrillRow[];
  onDrillSave: (playerId: string, drill: string, makes: number, attempts?: number | null) => void;
}

export default function LiveEntryView(p: LiveEntryViewProps) {
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl headline-bold" style={{ color: p.squadColor }}>
          {p.squadName} · Live Entry
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => p.setTab("play")} className={`px-3 py-1.5 rounded font-medium ${p.tab === "play" ? "bg-garnet text-white" : "bg-white border"}`}>Live / Transition</button>
          <button onClick={() => p.setTab("drills")} className={`px-3 py-1.5 rounded font-medium ${p.tab === "drills" ? "bg-garnet text-white" : "bg-white border"}`}>Shooting drills</button>
        </div>
      </div>

      {/* player picker */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {p.players.map((pl) => {
          const on = p.selected === pl.playerId;
          return (
            <button
              key={pl.playerId}
              onClick={() => p.setSelected(pl.playerId)}
              className={`rounded-lg p-2 text-left border transition ${on ? "ring-2 ring-garnet bg-garnet/5" : "bg-white hover:border-garnet/40"}`}
            >
              <div className="text-xs text-gray-500">#{pl.jersey}</div>
              <div className="font-semibold leading-tight truncate">{pl.name}</div>
              <div className="text-xs mt-1 text-gray-600">{pl.pts} pts · {pl.casper} CP</div>
            </button>
          );
        })}
        {p.players.length === 0 && <p className="text-gray-500 col-span-full">No players assigned to this squad.</p>}
      </div>

      {p.tab === "play" ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-500">Segment:</span>
            {(["live", "transition"] as Segment[]).map((s) => (
              <button key={s} onClick={() => p.setSegment(s)} className={`px-3 py-1.5 rounded text-sm capitalize font-medium ${p.segment === s ? "bg-navy text-white" : "bg-white border"}`}>{s}</button>
            ))}
            <div className="flex-1" />
            <span className="text-sm text-garnet font-medium h-5">{p.flash}</span>
            <button onClick={p.onUndo} disabled={!p.canUndo} className="px-3 py-1.5 rounded text-sm bg-white border disabled:opacity-40">↶ Undo</button>
          </div>

          <div className="mt-2 text-sm text-gray-500">
            {p.selectedName ? <>Logging for <b className="text-black">{p.selectedName}</b></> : "Select a player above"}
          </div>

          <div className="mt-3 grid lg:grid-cols-2 gap-3 items-start">
            {/* shot chart */}
            <div className="bg-white border rounded-lg p-2">
              <div className="text-sm font-semibold mb-1">Shot chart — tap where the shot was taken, then Make/Miss</div>
              <Court color={p.squadColor} shots={p.squadShots} disabled={!p.selected} onLog={(z, m, x, y) => p.onLog(z, m, x, y)} />
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-semibold">Free Throws:</span>
                <button onClick={() => p.onLog("ft", true)} className="bg-green-600 text-white rounded px-4 py-2 text-sm font-semibold">FT Make</button>
                <button onClick={() => p.onLog("ft", false)} className="bg-gray-200 rounded px-4 py-2 text-sm font-semibold">FT Miss</button>
                <span className="ml-auto text-xs text-gray-500">● filled = make&nbsp;&nbsp;○ ring = miss</span>
              </div>
            </div>

            {/* other stats */}
            <div className="space-y-2">
              {GROUPS.map((g) => (
                <div key={g.title} className="bg-white border rounded-lg p-2">
                  <div className="text-sm font-semibold mb-1">{g.title}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.keys.map((k) => (
                      <button key={k} onClick={() => p.onLog(k)} className="bg-navy/90 hover:bg-navy text-white rounded px-3 py-2 text-sm font-medium">
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
        <DrillsTab players={p.drillPlayers} drills={p.drills} onSave={p.onDrillSave} />
      )}
    </div>
  );
}

function DrillsTab({
  players,
  drills,
  onSave,
}: {
  players: DrillPlayer[];
  drills: DrillRow[];
  onSave: (playerId: string, drill: string, makes: number, attempts?: number | null) => void;
}) {
  function val(playerId: string, drill: string, field: "makes" | "attempts") {
    const row = drills.find((d) => d.player_id === playerId && d.drill === drill);
    return row ? (field === "makes" ? row.makes : row.attempts ?? "") : "";
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
          {players.map((pl) => (
            <tr key={pl.player_id} className="border-b">
              <td className="p-2 whitespace-nowrap">#{pl.jersey} {pl.name}</td>
              {SHOOTING_DRILLS.map((d) => (
                <td key={d.key} className="p-2 text-center">
                  <input
                    type="number"
                    defaultValue={val(pl.player_id, d.key, "makes")}
                    onBlur={(e) => onSave(pl.player_id, d.key, Number(e.target.value) || 0, d.mode === "ratio" ? Number(val(pl.player_id, d.key, "attempts")) || null : null)}
                    className="w-14 border rounded px-1 text-center"
                    placeholder="M"
                  />
                  {d.mode === "ratio" && (
                    <input
                      type="number"
                      defaultValue={val(pl.player_id, d.key, "attempts")}
                      onBlur={(e) => onSave(pl.player_id, d.key, Number(val(pl.player_id, d.key, "makes")) || 0, Number(e.target.value) || null)}
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
