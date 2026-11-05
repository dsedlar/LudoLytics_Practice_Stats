import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { tallyByPlayer } from "../lib/aggregate";
import { compute, emptyTally } from "../lib/stats";
import { SHOT_LABELS, COUNTING_LABELS, type ShotType, type CountingType } from "../lib/config";
import { logEvent, deleteEvent, upsertDrillResult, setSquadWins, setSquadLosses } from "../lib/db";
import LiveEntryView, { type TilePlayer, type TransitionRow, type Tab } from "../components/LiveEntryView";
import type { CourtShot } from "../components/Court";

export default function LiveEntry() {
  const { id = "", squadId = "" } = useParams();
  const { bundle, events, drills, error, loading } = usePracticeData(id);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState<Tab>("live");
  const [undoStack, setUndoStack] = useState<number[]>([]);
  const [flash, setFlash] = useState("");

  const tallies = useMemo(() => tallyByPlayer(events), [events]);

  if (loading) return <p className="text-gray-500">Loading practice…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!bundle) return <p className="text-red-600">Practice not found.</p>;

  const squad = bundle.squads.find((s) => s.id === squadId);
  if (!squad) return <p className="text-red-600">Squad not found.</p>;

  const wins = squad.wins ?? 0;
  const losses = squad.losses ?? 0;
  const currentGame = wins + losses + 1;

  const roster = bundle.roster
    .filter((r) => r.squad_id === squadId && r.present)
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));

  const players: TilePlayer[] = roster.map((r) => {
    const c = compute(tallies.get(r.player_id) ?? emptyTally());
    return { playerId: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—", pts: c.pts, casper: c.casper };
  });

  // only the current live drill's shots (resets when a drill ends)
  const squadShots: CourtShot[] = events
    .filter(
      (e) =>
        e.squad_id === squadId &&
        e.segment === "live" &&
        (e.game_index ?? 1) === currentGame &&
        e.shot_x != null &&
        e.shot_y != null &&
        (e.type === "atr" || e.type === "nonatr2" || e.type === "fg3"),
    )
    .map((e) => ({ x: e.shot_x as number, y: e.shot_y as number, made: !!e.made }));

  const transitionRows: TransitionRow[] = roster.map((r) => {
    const ev = events.filter((e) => e.squad_id === squadId && e.segment === "transition" && e.type === "fg3" && e.player_id === r.player_id);
    return { player_id: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—", made: ev.filter((e) => e.made).length, att: ev.length };
  });

  async function pushEvent(playerId: string, type: string, made: boolean | undefined, segment: string, shotX?: number, shotY?: number) {
    try {
      const row = await logEvent({
        practice_id: id, squad_id: squadId, player_id: playerId, segment, type, made,
        shot_x: shotX, shot_y: shotY, game_index: currentGame,
      });
      setUndoStack((s) => [...s, (row as { id: number }).id]);
    } catch (err) {
      setFlash(`Error: ${(err as Error).message}`);
    }
  }

  async function log(type: string, made?: boolean, shotX?: number, shotY?: number) {
    if (!selected) {
      setFlash("Pick a player first");
      setTimeout(() => setFlash(""), 1200);
      return;
    }
    await pushEvent(selected, type, made, "live", shotX, shotY);
    const label = type in SHOT_LABELS ? `${SHOT_LABELS[type as ShotType]} ${made ? "✓" : "✗"}` : COUNTING_LABELS[type as CountingType];
    setFlash(label);
    setTimeout(() => setFlash(""), 900);
  }

  async function onTransition(playerId: string, made: boolean) {
    await pushEvent(playerId, "fg3", made, "transition");
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

  async function onEndDrill(won: boolean) {
    if (won) await setSquadWins(squadId, wins + 1);
    else await setSquadLosses(squadId, losses + 1);
    setSelected("");
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
      drillPlayers={roster.map((r) => ({ player_id: r.player_id, jersey: r.jersey ?? "", name: r.players?.name ?? "—" }))}
      drills={drills}
      onDrillSave={(playerId, drill, makes, attempts) =>
        upsertDrillResult({ practice_id: id, squad_id: squadId, player_id: playerId, drill, makes, attempts })
      }
    />
  );
}
