import { useMemo, useState } from "react";
import LiveEntryView, { type TilePlayer, type TransitionRow, type Tab } from "../components/LiveEntryView";
import { tallyByPlayer, type EventRow } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import { SHOT_LABELS, COUNTING_LABELS, type ShotType, type CountingType } from "../lib/config";
import type { CourtShot } from "../components/Court";
import type { DrillRow } from "../lib/db";

const SQUAD = { name: "Garnet", color: "#B20000" };
const ROSTER = [
  { player_id: "p1", jersey: "1", name: "Patrick Steptoe Jr." },
  { player_id: "p3", jersey: "3", name: "Malik Jordan" },
  { player_id: "p5", jersey: "5", name: "Sam Dewey" },
  { player_id: "p11", jersey: "11", name: "Jack Powers" },
  { player_id: "p13", jersey: "13", name: "Andrey Sharkov" },
  { player_id: "p15", jersey: "15", name: "Tommy Herzel" },
];

const seed = (): EventRow[] => {
  let id = 1;
  const mk = (player_id: string, type: string, made: boolean | null, segment = "live", x?: number, y?: number): EventRow => ({
    id: id++, practice_id: "demo", squad_id: "sA", player_id, segment, type, made, shot_x: x ?? null, shot_y: y ?? null, game_index: 1,
  });
  return [
    mk("p5", "atr", true, "live", 25, 7), mk("p5", "fg3", true, "live", 8, 12), mk("p5", "nonatr2", false, "live", 15, 14),
    mk("p5", "ast", null), mk("p5", "or", null), mk("p5", "stl", null),
    mk("p1", "fg3", false, "live", 40, 18), mk("p1", "atr", true, "live", 23, 8),
    mk("p13", "nonatr2", true, "live", 33, 12), mk("p13", "chg", null),
    // some transition 3s
    mk("p5", "fg3", true, "transition"), mk("p5", "fg3", false, "transition"), mk("p5", "fg3", true, "transition"),
    mk("p1", "fg3", true, "transition"), mk("p1", "fg3", true, "transition"),
  ];
};

export default function LiveEntryDemo() {
  const [events, setEvents] = useState<EventRow[]>(seed);
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [selected, setSelected] = useState("p5");
  const [tab, setTab] = useState<Tab>("live");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState("");
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const currentGame = wins + losses + 1;

  const tallies = useMemo(() => tallyByPlayer(events), [events]);
  const players: TilePlayer[] = ROSTER.map((r) => {
    const c = compute(tallies.get(r.player_id) ?? emptyTally());
    return { playerId: r.player_id, jersey: r.jersey, name: r.name, pts: c.pts, casper: c.casper };
  });
  const squadShots: CourtShot[] = events
    .filter((e) => e.segment === "live" && (e.game_index ?? 1) === currentGame && e.shot_x != null && e.shot_y != null && (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"))
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));
  const transitionRows: TransitionRow[] = ROSTER.map((r) => {
    const ev = events.filter((e) => e.segment === "transition" && e.type === "fg3" && e.player_id === r.player_id);
    return { ...r, made: ev.filter((e) => e.made).length, att: ev.length };
  });

  function add(playerId: string, type: string, made: boolean | undefined, segment: string, x?: number, y?: number) {
    const newId = (events[events.length - 1]?.id ?? 0) + 1;
    setEvents((e) => [...e, { id: newId, practice_id: "demo", squad_id: "sA", player_id: playerId, segment, type, made: made ?? null, shot_x: x ?? null, shot_y: y ?? null, game_index: currentGame }]);
    setUndoStack((s) => [...s, newId]);
  }
  function log(type: string, made?: boolean, x?: number, y?: number) {
    if (!selected) {
      setFlash("Pick a player first");
      setTimeout(() => setFlash(""), 1200);
      return;
    }
    add(selected, type, made, "live", x, y);
    const label = type in SHOT_LABELS ? `${SHOT_LABELS[type as ShotType]} ${made ? "✓" : "✗"}` : COUNTING_LABELS[type as CountingType];
    setFlash(label);
    setTimeout(() => setFlash(""), 900);
  }
  function onTransition(playerId: string, made: boolean) {
    add(playerId, "fg3", made, "transition");
  }
  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (last == null) return;
    setUndoStack((s) => s.slice(0, -1));
    setEvents((e) => e.filter((x) => x.id !== last));
  }
  function onEndDrill(won: boolean) {
    if (won) setWins((w) => w + 1);
    else setLosses((l) => l + 1);
    setSelected("");
  }
  function drillSave(playerId: string, drill: string, makes: number) {
    setDrills((d) => [...d.filter((r) => !(r.player_id === playerId && r.drill === drill)), { id: `${playerId}-${drill}`, squad_id: "sA", player_id: playerId, drill, makes, attempts: null }]);
  }

  return (
    <div>
      <div className="mb-2 text-xs bg-cream text-deep-garnet rounded px-3 py-1 inline-block">
        Interactive demo — Live (court), Transition (made/miss 3s), Shooting Drills. Try "End drill &amp; record result".
      </div>
      <LiveEntryView
        squadName={SQUAD.name}
        squadColor={SQUAD.color}
        tab={tab}
        setTab={setTab}
        players={players}
        selected={selected}
        setSelected={setSelected}
        selectedName={ROSTER.find((r) => r.player_id === selected)?.name}
        squadShots={squadShots}
        onLog={log}
        onUndo={undo}
        canUndo={undoStack.length > 0}
        flash={flash}
        wins={wins}
        losses={losses}
        onEndDrill={onEndDrill}
        transitionRows={transitionRows}
        onTransition={onTransition}
        drillPlayers={ROSTER}
        drills={drills}
        onDrillSave={drillSave}
      />
    </div>
  );
}
