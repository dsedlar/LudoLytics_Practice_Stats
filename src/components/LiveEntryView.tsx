import { useState } from "react";
import { COUNTING_LABELS, SHOOTING_DRILLS, type CountingType } from "../lib/config";
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
export interface TransitionRow {
  player_id: string;
  jersey: string;
  name: string;
  made: number;
  att: number;
  to: number;
}

export type Tab = "live" | "transition" | "thespian" | "drills";

export interface LiveEntryViewProps {
  squadName: string;
  squadColor: string;
  tab: Tab;
  setTab: (t: Tab) => void;
  compact?: boolean; // stack court + stats vertically (for side-by-side squads)
  // live
  players: TilePlayer[];
  selected: string;
  setSelected: (id: string) => void;
  selectedName?: string;
  squadShots: CourtShot[];
  onLog: (type: string, made?: boolean, x?: number, y?: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  flash: string;
  wins: number;
  losses: number;
  onEndDrill: (won: boolean) => void;
  // transition + thespian (3-point shooting segments: 3s + turnovers)
  transitionRows: TransitionRow[];
  onTransition: (playerId: string, made: boolean) => void;
  onTransitionTO: (playerId: string) => void;
  thespianRows: TransitionRow[];
  onThespian: (playerId: string, made: boolean) => void;
  onThespianTO: (playerId: string) => void;
  // drills
  drillPlayers: DrillPlayer[];
  drills: DrillRow[];
  onDrillSave: (playerId: string, drill: string, makes: number, attempts?: number | null) => void;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "transition", label: "Transition" },
  { key: "thespian", label: "Thespian" },
  { key: "drills", label: "Shooting Drills" },
];

export default function LiveEntryView(p: LiveEntryViewProps) {
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className={`${p.compact ? "text-xl" : "text-2xl"} headline-bold`} style={{ color: p.squadColor }}>
          {p.squadName}
        </h1>
        <div className="flex items-center gap-1 text-sm bg-white border rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => p.setTab(t.key)}
              className={`px-3 py-1.5 rounded font-medium ${p.tab === t.key ? "bg-garnet text-white" : "hover:bg-gray-50"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {p.tab === "live" && <LiveTab p={p} />}
      {p.tab === "transition" && <ShootSegmentTab rows={p.transitionRows} onShot={p.onTransition} onTO={p.onTransitionTO} color={p.squadColor} label="Transition" />}
      {p.tab === "thespian" && <ShootSegmentTab rows={p.thespianRows} onShot={p.onThespian} onTO={p.onThespianTO} color={p.squadColor} label="Thespian" />}
      {p.tab === "drills" && <DrillsTab players={p.drillPlayers} drills={p.drills} onSave={p.onDrillSave} />}
    </div>
  );
}

function LiveTab({ p }: { p: LiveEntryViewProps }) {
  const [ending, setEnding] = useState(false);
  const drillNo = p.wins + p.losses + 1;

  return (
    <>
      {/* player picker */}
      <div className={`mt-3 grid gap-2 ${p.compact ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"}`}>
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

      {/* drill bar */}
      <div className="mt-3 flex items-center gap-3 flex-wrap bg-white border rounded-lg px-3 py-2">
        <span className="text-sm font-semibold">Live drill #{drillNo}</span>
        <span className="text-xs text-gray-500">Season W-L {p.wins}-{p.losses}</span>
        <div className="flex-1" />
        {!ending ? (
          <button onClick={() => setEnding(true)} className="text-sm bg-navy text-white rounded px-3 py-1.5 font-medium">
            End drill & record result
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">{p.squadName} result:</span>
            <button onClick={() => { p.onEndDrill(true); setEnding(false); }} className="text-sm bg-green-600 text-white rounded px-3 py-1.5 font-semibold">Won</button>
            <button onClick={() => { p.onEndDrill(false); setEnding(false); }} className="text-sm bg-garnet text-white rounded px-3 py-1.5 font-semibold">Lost</button>
            <button onClick={() => setEnding(false)} className="text-sm text-gray-400 px-1">cancel</button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-gray-500">
          {p.selectedName ? <>Logging for <b className="text-black">{p.selectedName}</b></> : "Select a player above"}
        </span>
        <div className="flex-1" />
        <span className="text-sm text-garnet font-medium h-5">{p.flash}</span>
        <button onClick={p.onUndo} disabled={!p.canUndo} className="px-3 py-1.5 rounded text-sm bg-white border disabled:opacity-40">↶ Undo</button>
      </div>

      <div className={p.compact ? "mt-3 space-y-3" : "mt-3 grid lg:grid-cols-2 gap-3 items-start"}>
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
  );
}

// Transition / Thespian: log 3-point makes/misses and turnovers per player.
function ShootSegmentTab({ rows, onShot, onTO, color, label }: {
  rows: TransitionRow[];
  onShot: (id: string, made: boolean) => void;
  onTO: (id: string) => void;
  color: string;
  label: string;
}) {
  const tot = rows.reduce((a, r) => ({ made: a.made + r.made, att: a.att + r.att, to: a.to + r.to }), { made: 0, att: 0, to: 0 });
  return (
    <div className="mt-4 max-w-3xl">
      <p className="text-sm text-gray-500 mb-2">{label} — log each 3-point attempt as a make or miss, and tap TO for a turnover.</p>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-50">
              <th className="p-2">#</th><th className="p-2">Player</th><th className="p-2 text-center">3PT</th><th className="p-2 text-center">%</th><th className="p-2 text-center">TO</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player_id} className="border-b last:border-0">
                <td className="p-2 text-gray-500">{r.jersey}</td>
                <td className="p-2 font-semibold">{r.name}</td>
                <td className="p-2 text-center">{r.made}-{r.att}</td>
                <td className="p-2 text-center">{r.att ? Math.round((r.made / r.att) * 100) : 0}%</td>
                <td className="p-2 text-center">{r.to}</td>
                <td className="p-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => onShot(r.player_id, true)} className="bg-green-600 text-white rounded px-3 py-1.5 text-sm font-semibold">Make</button>
                    <button onClick={() => onShot(r.player_id, false)} className="bg-gray-200 rounded px-3 py-1.5 text-sm font-semibold">Miss</button>
                    <button onClick={() => onTO(r.player_id)} className="bg-navy text-white rounded px-3 py-1.5 text-sm font-semibold">TO</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold" style={{ color }}>
              <td className="p-2" colSpan={2}>Squad total</td>
              <td className="p-2 text-center">{tot.made}-{tot.att}</td>
              <td className="p-2 text-center">{tot.att ? Math.round((tot.made / tot.att) * 100) : 0}%</td>
              <td className="p-2 text-center">{tot.to}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
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
  function val(playerId: string, drill: string) {
    const row = drills.find((d) => d.player_id === playerId && d.drill === drill);
    return row ? row.makes : "";
  }
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="text-sm text-gray-500 mb-2">End of practice — enter each player's drill score.</p>
      <table className="min-w-full text-sm bg-white border rounded-lg">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Player</th>
            {SHOOTING_DRILLS.map((d) => (
              <th key={d.key} className="p-2 text-center">{d.label}{d.denominator ? ` /${d.denominator}` : ""}</th>
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
                    defaultValue={val(pl.player_id, d.key)}
                    onBlur={(e) => onSave(pl.player_id, d.key, Number(e.target.value) || 0, null)}
                    className="w-16 border rounded px-1 text-center"
                    placeholder="makes"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500 mt-2">Saves when you tab out of a field.</p>
    </div>
  );
}
