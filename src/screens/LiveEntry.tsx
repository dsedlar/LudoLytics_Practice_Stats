import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { tallyByPlayer } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import { SHOT_LABELS, COUNTING_LABELS, type ShotType, type CountingType, type Segment } from "../lib/config";
import { logEvent, deleteEvent, upsertDrillResult } from "../lib/db";
import LiveEntryView, { type TilePlayer } from "../components/LiveEntryView";
import type { CourtShot } from "../components/Court";

export default function LiveEntry() {
  const { id = "", squadId = "" } = useParams();
  const { bundle, events, drills, error, loading } = usePracticeData(id);
  const [selected, setSelected] = useState("");
  const [segment, setSegment] = useState<Segment>("live");
  const [tab, setTab] = useState<"play" | "drills">("play");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState("");

  const tallies = useMemo(() => tallyByPlayer(events), [events]);

  if (loading) return <p className="text-gray-500">Loading practice…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  const squad = bundle.squads.find((s) => s.id === squadId);
  if (!squad) return <p className="text-red-600">Squad not found.</p>;

  const roster = bundle.roster
    .filter((r) => r.squad_id === squadId && r.present)
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));

  const players: TilePlayer[] = roster.map((r) => {
    const c = compute(tallies.get(r.player_id) ?? emptyTally());
    return { playerId: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—", pts: c.pts, casper: c.casper };
  });

  const squadShots: CourtShot[] = events
    .filter((e) => e.squad_id === squadId && e.shot_x != null && e.shot_y != null && (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"))
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));

  async function log(type: string, made?: boolean, shotX?: number, shotY?: number) {
    if (!selected) {
      setFlash("Pick a player first");
      setTimeout(() => setFlash(""), 1200);
      return;
    }
    try {
      const row = await logEvent({ practice_id: id, squad_id: squadId, player_id: selected, segment, type, made, shot_x: shotX, shot_y: shotY });
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

  return (
    <LiveEntryView
      squadName={squad.name}
      squadColor={squad.color}
      tab={tab}
      setTab={setTab}
      players={players}
      selected={selected}
      setSelected={setSelected}
      selectedName={roster.find((r) => r.player_id === selected)?.players?.name}
      segment={segment}
      setSegment={setSegment}
      squadShots={squadShots}
      onLog={log}
      onUndo={undo}
      canUndo={undoStack.length > 0}
      flash={flash}
      drillPlayers={roster.map((r) => ({ player_id: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—" }))}
      drills={drills}
      onDrillSave={(playerId, drill, makes, attempts) =>
        upsertDrillResult({ practice_id: id, squad_id: squadId, player_id: playerId, drill, makes, attempts })
      }
    />
  );
}
