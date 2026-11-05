import { useMemo, useState } from "react";
import LiveEntryView, { type TilePlayer } from "../components/LiveEntryView";
import { tallyByPlayer, type EventRow } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import { SHOT_LABELS, COUNTING_LABELS, type ShotType, type CountingType, type Segment } from "../lib/config";
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
  const mk = (player_id: string, type: string, made: boolean | null, x?: number, y?: number): EventRow => ({
    id: id++, practice_id: "demo", squad_id: "sA", player_id, segment: "live", type, made, shot_x: x ?? null, shot_y: y ?? null,
  });
  return [
    mk("p5", "atr", true, 25, 7), mk("p5", "fg3", true, 8, 12), mk("p5", "nonatr2", false, 15, 14),
    mk("p5", "ast", null), mk("p5", "or", null), mk("p5", "stl", null),
    mk("p1", "fg3", false, 40, 18), mk("p1", "atr", true, 23, 8),
    mk("p13", "nonatr2", true, 33, 12), mk("p13", "chg", null),
  ];
};

export default function LiveEntryDemo() {
  const [events, setEvents] = useState<EventRow[]>(seed);
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [selected, setSelected] = useState("p5");
  const [segment, setSegment] = useState<Segment>("live");
  const [tab, setTab] = useState<"play" | "drills">("play");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState("");

  const tallies = useMemo(() => tallyByPlayer(events), [events]);
  const players: TilePlayer[] = ROSTER.map((r) => {
    const c = compute(tallies.get(r.player_id) ?? emptyTally());
    return { playerId: r.player_id, jersey: r.jersey, name: r.name, pts: c.pts, casper: c.casper };
  });
  const squadShots: CourtShot[] = events
    .filter((e) => e.shot_x != null && e.shot_y != null && (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"))
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));

  function log(type: string, made?: boolean, x?: number, y?: number) {
    if (!selected) {
      setFlash("Pick a player first");
      setTimeout(() => setFlash(""), 1200);
      return;
    }
    const newId = (events[events.length - 1]?.id ?? 0) + 1;
    setEvents((e) => [...e, { id: newId, practice_id: "demo", squad_id: "sA", player_id: selected, segment, type, made: made ?? null, shot_x: x ?? null, shot_y: y ?? null }]);
    setUndoStack((s) => [...s, newId]);
    const label = type in SHOT_LABELS ? `${SHOT_LABELS[type as ShotType]} ${made ? "✓" : "✗"}` : COUNTING_LABELS[type as CountingType];
    setFlash(label);
    setTimeout(() => setFlash(""), 900);
  }
  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (last == null) return;
    setUndoStack((s) => s.slice(0, -1));
    setEvents((e) => e.filter((x) => x.id !== last));
  }
  function drillSave(playerId: string, drill: string, makes: number, attempts?: number | null) {
    setDrills((d) => [...d.filter((r) => !(r.player_id === playerId && r.drill === drill)), { id: `${playerId}-${drill}`, squad_id: "sA", player_id: playerId, drill, makes, attempts: attempts ?? null }]);
  }

  return (
    <div>
      <div className="mb-2 text-xs bg-cream text-deep-garnet rounded px-3 py-1 inline-block">
        Interactive demo — click a player, then tap the court or a stat button.
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
        segment={segment}
        setSegment={setSegment}
        squadShots={squadShots}
        onLog={log}
        onUndo={undo}
        canUndo={undoStack.length > 0}
        flash={flash}
        drillPlayers={ROSTER}
        drills={drills}
        onDrillSave={drillSave}
      />
    </div>
  );
}
