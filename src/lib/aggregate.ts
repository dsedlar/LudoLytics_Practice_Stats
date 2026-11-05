// ---------------------------------------------------------------------------
// Turn raw event rows into per-player / per-squad stat tallies.
// Pure functions — unit-testable without a database.
// ---------------------------------------------------------------------------
import { emptyTally, addTally, type RawTally } from "./stats";
import type { ShotType, CountingType } from "./config";

export interface EventRow {
  id: number;
  practice_id: string;
  squad_id: string;
  player_id: string;
  segment: string; // 'live' | 'transition'
  type: string; // ShotType | CountingType
  made: boolean | null;
}

const SHOT_FIELDS: Record<ShotType, [keyof RawTally, keyof RawTally]> = {
  // [makes field, attempts field]
  atr: ["atrM", "atrA"],
  nonatr2: ["nonatr2M", "nonatr2A"],
  fg3: ["fg3M", "fg3A"],
  ft: ["ftM", "ftA"],
};

const isShot = (t: string): t is ShotType => t in SHOT_FIELDS;

/** Apply a single event to a tally (mutates and returns it). */
export function applyEvent(t: RawTally, ev: Pick<EventRow, "type" | "made">): RawTally {
  if (isShot(ev.type)) {
    const [mField, aField] = SHOT_FIELDS[ev.type];
    t[aField] += 1;
    if (ev.made) t[mField] += 1;
  } else if (ev.type in t) {
    t[ev.type as CountingType] += 1;
  }
  return t;
}

/** Aggregate events into a tally per player id. */
export function tallyByPlayer(events: EventRow[]): Map<string, RawTally> {
  const map = new Map<string, RawTally>();
  for (const ev of events) {
    let t = map.get(ev.player_id);
    if (!t) {
      t = emptyTally();
      map.set(ev.player_id, t);
    }
    applyEvent(t, ev);
  }
  return map;
}

/** Sum a set of per-player tallies into one total. */
export function sumTallies(tallies: Iterable<RawTally>): RawTally {
  let total = emptyTally();
  for (const t of tallies) total = addTally(total, t);
  return total;
}

/** Aggregate events into one tally per squad id. */
export function tallyBySquad(events: EventRow[]): Map<string, RawTally> {
  const map = new Map<string, RawTally>();
  for (const ev of events) {
    let t = map.get(ev.squad_id);
    if (!t) {
      t = emptyTally();
      map.set(ev.squad_id, t);
    }
    applyEvent(t, ev);
  }
  return map;
}
