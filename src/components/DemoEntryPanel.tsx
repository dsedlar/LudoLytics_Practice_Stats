import { useMemo, useState } from "react";
import LiveEntryView, { type TilePlayer, type TransitionRow, type Tab } from "./LiveEntryView";
import { tallyByPlayer, type EventRow } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import { SHOT_LABELS, COUNTING_LABELS, type ShotType, type CountingType } from "../lib/config";
import type { CourtShot } from "./Court";
import type { DrillRow } from "../lib/db";

export interface DemoRoster {
  player_id: string;
  jersey: string;
  name: string;
}

// A self-contained, interactive demo of the entry interface for one squad.
export default function DemoEntryPanel({
  squadName,
  squadColor,
  roster,
  compact,
  seedEvents,
}: {
  squadName: string;
  squadColor: string;
  roster: DemoRoster[];
  compact?: boolean;
  seedEvents?: EventRow[];
}) {
  const [events, setEvents] = useState<EventRow[]>(seedEvents ?? []);
  const [drills, setDrills] = useState<DrillRow[]>([]);
  const [selected, setSelected] = useState(roster[0]?.player_id ?? "");
  const [tab, setTab] = useState<Tab>("live");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState("");
  const [wins, setWins] = useState(0);
  const [losses] = useState(0); // demo is one squad; losses only accrue to the opponent
  const [ties, setTies] = useState(0);
  const currentGame = wins + losses + ties + 1;

  const tallies = useMemo(() => tallyByPlayer(events), [events]);
  const players: TilePlayer[] = roster.map((r) => {
    const c = compute(tallies.get(r.player_id) ?? emptyTally());
    return { playerId: r.player_id, jersey: r.jersey, name: r.name, pts: c.pts, casper: c.casper };
  });
  const squadShots: CourtShot[] = events
    .filter((e) => e.segment === "live" && (e.game_index ?? 1) === currentGame && e.shot_x != null && e.shot_y != null && (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"))
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));
  const segRows = (seg: string): TransitionRow[] =>
    roster.map((r) => {
      const ev = events.filter((e) => e.segment === seg && e.player_id === r.player_id);
      const shots = ev.filter((e) => e.type === "fg3");
      return { ...r, made: shots.filter((e) => e.made).length, att: shots.length, to: ev.filter((e) => e.type === "to").length };
    });
  const transitionRows = segRows("transition");
  const thespianRows = segRows("thespian");

  function add(playerId: string, type: string, made: boolean | undefined, segment: string, x?: number, y?: number) {
    const newId = (events[events.length - 1]?.id ?? 0) + 1 + Math.floor(Math.random() * 1000);
    setEvents((e) => [...e, { id: newId, practice_id: "demo", squad_id: "s", player_id: playerId, segment, type, made: made ?? null, shot_x: x ?? null, shot_y: y ?? null, game_index: currentGame }]);
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
  function onTransitionTO(playerId: string) {
    add(playerId, "to", undefined, "transition");
  }
  function onThespian(playerId: string, made: boolean) {
    add(playerId, "fg3", made, "thespian");
  }
  function onThespianTO(playerId: string) {
    add(playerId, "to", undefined, "thespian");
  }
  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (last == null) return;
    setUndoStack((s) => s.slice(0, -1));
    setEvents((e) => e.filter((x) => x.id !== last));
  }
  // Winning bench records the run: validation FT made = win, missed = tie.
  function onRecordResult(ftPlayerId: string, made: boolean) {
    add(ftPlayerId, "vft", made, "live");
    if (made) setWins((w) => w + 1);
    else setTies((t) => t + 1);
    setSelected("");
  }
  function drillSave(playerId: string, drill: string, makes: number) {
    setDrills((d) => [...d.filter((r) => !(r.player_id === playerId && r.drill === drill)), { id: `${playerId}-${drill}`, squad_id: "s", player_id: playerId, drill, makes, attempts: null }]);
  }

  return (
    <LiveEntryView
      squadName={squadName}
      squadColor={squadColor}
      compact={compact}
      tab={tab}
      setTab={setTab}
      players={players}
      selected={selected}
      setSelected={setSelected}
      selectedName={roster.find((r) => r.player_id === selected)?.name}
      squadShots={squadShots}
      onLog={log}
      onUndo={undo}
      canUndo={undoStack.length > 0}
      flash={flash}
      wins={wins}
      losses={losses}
      ties={ties}
      onRecordResult={onRecordResult}
      transitionRows={transitionRows}
      onTransition={onTransition}
      onTransitionTO={onTransitionTO}
      thespianRows={thespianRows}
      onThespian={onThespian}
      onThespianTO={onThespianTO}
      drillPlayers={roster}
      drills={drills}
      onDrillSave={drillSave}
    />
  );
}
