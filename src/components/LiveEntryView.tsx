import { useState } from "react";
import { COUNTING_LABELS, SHOOTING_DRILLS, type CountingType } from "../lib/config";
import Court, { type CourtShot } from "./Court";
import type { DrillRow } from "../lib/db";

const GROUPS: { title: string; keys: CountingType[] }[] = [
  { title: "Playmaking", keys: ["ast", "pot", "second", "to"] },
  { title: "Rebounding", keys: ["or", "dr", "tip"] },
  { title: "Defense", keys: ["stl", "blk", "def", "sld", "foul", "dive", "chg"] },
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
// One row of the manager's own-team box score (shown while taking stats).
export interface BoxScoreRow {
  playerId: string;
  jersey: string;
  name: string;
  foul: number;
  to: number; // live + transition/thespian turnovers
  live3: { m: number; a: number }; // live-play 3FG
  trans3: { m: number; a: number }; // Transition 3FG
  thes3: { m: number; a: number }; // Thespian 3FG
  baylorMakes: number | null; // Baylor (3PT) drill makes, or null if not entered
  ninetyMakes: number | null; // 90 Seconds drill makes
  ftDrillMakes: number | null; // Free-throw drill makes (/20) — used in shootaround FT%
  ft: { m: number; a: number }; // live FT (validation FTs included)
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
  ties: number;
  // The winning bench records the run: pick who shot the validation FT and
  // whether it was made (win) or missed (tie). The loss/tie is mirrored to the
  // opponent by the caller.
  onRecordResult: (ftPlayerId: string, made: boolean) => void;
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
  onDrillSave: (playerId: string, drill: string, makes: number | null, attempts?: number | null) => void;
  // own-team box score (summary shown under the entry tabs)
  boxScore: BoxScoreRow[];
  // shootaround mode: shooting-only (no Live scrimmage tab / win validation)
  shootaround?: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "Live" },
  { key: "transition", label: "Transition" },
  { key: "thespian", label: "Thespian" },
  { key: "drills", label: "Shooting Drills" },
];

export default function LiveEntryView(p: LiveEntryViewProps) {
  const tabs = p.shootaround ? TABS.filter((t) => t.key !== "live") : TABS;
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className={`${p.compact ? "text-xl" : "text-2xl"} headline-bold`} style={{ color: p.squadColor }}>
          {p.squadName}{p.shootaround ? <span className="text-sm font-normal text-gray-500 ml-2">· shooting only</span> : null}
        </h1>
        <div className="flex items-center gap-1 text-sm bg-white border rounded-lg p-1">
          {tabs.map((t) => (
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

      <SquadBoxScore rows={p.boxScore} name={p.squadName} color={p.squadColor} shootaround={p.shootaround} />
    </div>
  );
}

// A live, read-only box score for the manager's own team, so they can glance at
// what they've logged. Shooting cells show "–" until there's an attempt/entry.
const BAYLOR_DENOM = SHOOTING_DRILLS.find((d) => d.key === "baylor")?.denominator ?? 75;
const NINETY_DENOM = SHOOTING_DRILLS.find((d) => d.key === "ninetys")?.denominator ?? 20;
const FT_DENOM = SHOOTING_DRILLS.find((d) => d.key === "ft")?.denominator ?? 20;
function SquadBoxScore({ rows, name, color, shootaround }: { rows: BoxScoreRow[]; name: string; color: string; shootaround?: boolean }) {
  const p3 = (s: { m: number; a: number }) => (s.a ? `${Math.round((s.m / s.a) * 100)}%` : "–");
  const fixed = (m: number | null, d: number) => (m == null ? "–" : `${Math.round((m / d) * 100)}%`);
  const headers = shootaround
    ? ["#", "Player", "3FG% Trans", "3FG% Thes", "Baylor%", "90s%", "FT%"]
    : ["#", "Player", "Foul", "TO", "3FG% Live", "3FG% Trans", "3FG% Thes", "Baylor%", "FT%"];
  // team totals: segment %s pool makes/attempts; fixed drills average the makes.
  const sum = (f: (r: BoxScoreRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const seg = (f: (r: BoxScoreRow) => { m: number; a: number }) => ({ m: sum((r) => f(r).m), a: sum((r) => f(r).a) });
  const avgMakes = (f: (r: BoxScoreRow) => number | null) => {
    const xs = rows.map(f).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };
  const tot = {
    foul: sum((r) => r.foul), to: sum((r) => r.to),
    live3: seg((r) => r.live3), trans3: seg((r) => r.trans3), thes3: seg((r) => r.thes3),
    baylor: avgMakes((r) => r.baylorMakes), ninety: avgMakes((r) => r.ninetyMakes),
    ft: seg((r) => r.ft), ftDrill: avgMakes((r) => r.ftDrillMakes),
  };
  return (
    <div className="mt-5 bg-white border rounded-lg overflow-hidden">
      <div className="px-3 py-2 font-bold text-white text-sm uppercase flex items-center justify-between" style={{ background: color }}>
        <span>{shootaround ? "Shooting" : "Box Score"} — {name}</span>
        <span className="text-xs font-medium opacity-80">{shootaround ? "whole team" : "your team"}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              {headers.map((h, i) => (
                <th key={h} className={`p-2 ${i <= 1 ? "" : "text-center"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b last:border-0">
                <td className="p-2 text-gray-500">{r.jersey}</td>
                <td className="p-2 font-medium whitespace-nowrap">{r.name}</td>
                {!shootaround && <td className="p-2 text-center">{r.foul}</td>}
                {!shootaround && <td className="p-2 text-center">{r.to}</td>}
                {!shootaround && <td className="p-2 text-center">{p3(r.live3)}</td>}
                <td className="p-2 text-center">{p3(r.trans3)}</td>
                <td className="p-2 text-center">{p3(r.thes3)}</td>
                <td className="p-2 text-center">{fixed(r.baylorMakes, BAYLOR_DENOM)}</td>
                {shootaround && <td className="p-2 text-center">{fixed(r.ninetyMakes, NINETY_DENOM)}</td>}
                <td className="p-2 text-center">{shootaround ? fixed(r.ftDrillMakes, FT_DENOM) : p3(r.ft)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={headers.length} className="p-3 text-gray-400">No players on this roster.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-bold bg-gray-50">
                <td className="p-2" />
                <td className="p-2">TEAM</td>
                {!shootaround && <td className="p-2 text-center">{tot.foul}</td>}
                {!shootaround && <td className="p-2 text-center">{tot.to}</td>}
                {!shootaround && <td className="p-2 text-center">{p3(tot.live3)}</td>}
                <td className="p-2 text-center">{p3(tot.trans3)}</td>
                <td className="p-2 text-center">{p3(tot.thes3)}</td>
                <td className="p-2 text-center">{fixed(tot.baylor, BAYLOR_DENOM)}</td>
                {shootaround && <td className="p-2 text-center">{fixed(tot.ninety, NINETY_DENOM)}</td>}
                <td className="p-2 text-center">{shootaround ? fixed(tot.ftDrill, FT_DENOM) : p3(tot.ft)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function LiveTab({ p }: { p: LiveEntryViewProps }) {
  const [ending, setEnding] = useState(false);
  const [ftShooter, setFtShooter] = useState<string | null>(null);
  const drillNo = p.wins + p.losses + p.ties + 1;
  const reset = () => { setEnding(false); setFtShooter(null); };
  const shooterName = p.players.find((pl) => pl.playerId === ftShooter)?.name;
  const record = (made: boolean) => { if (ftShooter) { p.onRecordResult(ftShooter, made); reset(); } };

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

      {/* drill bar — the winning bench records the run via the validation FT */}
      <div className="mt-3 bg-white border rounded-lg px-3 py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">Live drill #{drillNo}</span>
          <span className="text-xs text-gray-500">W-L {p.wins}-{p.losses}{p.ties ? ` · ${p.ties}T` : ""}</span>
          <div className="flex-1" />
          {!ending && (
            <button onClick={() => setEnding(true)} className="text-sm bg-navy text-white rounded px-3 py-1.5 font-medium">
              End drill — {p.squadName} won
            </button>
          )}
        </div>

        {ending && ftShooter == null && (
          <div className="mt-2 border-t pt-2">
            <div className="text-sm text-gray-600 mb-1">
              {p.squadName} won — tap who <b>shot the validation FT</b>:
              <button onClick={reset} className="ml-2 text-xs text-gray-400">cancel</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {p.players.map((pl) => (
                <button key={pl.playerId} onClick={() => setFtShooter(pl.playerId)} className="bg-white border hover:border-garnet rounded px-3 py-2 text-sm font-medium">
                  <span className="text-gray-400">#{pl.jersey}</span> {pl.name}
                </button>
              ))}
              {p.players.length === 0 && <span className="text-sm text-gray-400">No players assigned.</span>}
            </div>
          </div>
        )}

        {ending && ftShooter != null && (
          <div className="mt-2 border-t pt-2 flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600">Validation FT by <b className="text-black">{shooterName}</b>:</span>
            <button onClick={() => record(true)} className="text-sm bg-green-600 text-white rounded px-4 py-1.5 font-semibold">Made → Win</button>
            <button onClick={() => record(false)} className="text-sm bg-garnet text-white rounded px-4 py-1.5 font-semibold">Miss → Tie</button>
            <button onClick={() => setFtShooter(null)} className="text-sm text-gray-400 px-1">back</button>
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
  onSave: (playerId: string, drill: string, makes: number | null, attempts?: number | null) => void;
}) {
  const keyOf = (playerId: string, drill: string) => `${playerId}|${drill}`;
  const savedVal = (playerId: string, drill: string) => {
    const row = drills.find((d) => d.player_id === playerId && d.drill === drill);
    return row ? String(row.makes) : "";
  };
  // local draft so an empty box stays empty (rather than snapping back to a saved 0)
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const row of drills) m[keyOf(row.player_id, row.drill)] = String(row.makes);
    return m;
  });
  const [savedFlash, setSavedFlash] = useState(false);

  const current = (playerId: string, drill: string) => {
    const k = keyOf(playerId, drill);
    return k in vals ? vals[k] : savedVal(playerId, drill);
  };
  const setVal = (playerId: string, drill: string, v: string) => setVals((s) => ({ ...s, [keyOf(playerId, drill)]: v }));
  // Empty box -> null (delete the record = "not done"); a number -> save that score.
  const commit = (playerId: string, drill: string) => {
    const raw = current(playerId, drill).trim();
    onSave(playerId, drill, raw === "" ? null : Number(raw) || 0, null);
  };
  const saveAll = () => {
    for (const pl of players) for (const d of SHOOTING_DRILLS) commit(pl.player_id, d.key);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <p className="text-sm text-gray-500 mb-2">End of practice — enter each player's drill score. Leave a box empty for a drill that wasn't done.</p>
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
                    value={current(pl.player_id, d.key)}
                    onChange={(e) => setVal(pl.player_id, d.key, e.target.value)}
                    onBlur={() => commit(pl.player_id, d.key)}
                    className="w-16 border rounded px-1 text-center"
                    placeholder="—"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button onClick={saveAll} className="bg-navy text-white px-4 py-2 rounded-lg font-semibold text-sm">Save drills</button>
        {savedFlash && <span className="text-green-600 text-sm font-medium">Saved ✓</span>}
        <span className="text-xs text-gray-500">Changes also save when you tab out of a box. Clear a box to mark that drill as not done.</span>
      </div>
    </div>
  );
}
