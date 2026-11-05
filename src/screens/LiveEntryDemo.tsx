import DemoEntryPanel from "../components/DemoEntryPanel";
import type { EventRow } from "../lib/aggregate";

const ROSTER = [
  { player_id: "p1", jersey: "1", name: "Patrick Steptoe Jr." },
  { player_id: "p3", jersey: "3", name: "Malik Jordan" },
  { player_id: "p5", jersey: "5", name: "Sam Dewey" },
  { player_id: "p11", jersey: "11", name: "Jack Powers" },
  { player_id: "p13", jersey: "13", name: "Andrey Sharkov" },
  { player_id: "p15", jersey: "15", name: "Tommy Herzel" },
];

let id = 1;
const mk = (player_id: string, type: string, made: boolean | null, segment = "live", x?: number, y?: number): EventRow => ({
  id: id++, practice_id: "demo", squad_id: "s", player_id, segment, type, made, shot_x: x ?? null, shot_y: y ?? null, game_index: 1,
});
const SEED: EventRow[] = [
  mk("p5", "atr", true, "live", 25, 7), mk("p5", "fg3", true, "live", 8, 12), mk("p5", "nonatr2", false, "live", 15, 14),
  mk("p5", "ast", null), mk("p5", "or", null),
  mk("p1", "fg3", false, "live", 40, 18), mk("p1", "atr", true, "live", 23, 8),
  mk("p5", "fg3", true, "transition"), mk("p5", "fg3", false, "transition"), mk("p1", "fg3", true, "transition"),
];

export default function LiveEntryDemo() {
  return (
    <div>
      <div className="mb-2 text-xs bg-cream text-deep-garnet rounded px-3 py-1 inline-block">
        Interactive demo — Live (court), Transition (made/miss 3s), Shooting Drills. Try "End drill &amp; record result".
      </div>
      <DemoEntryPanel squadName="Garnet" squadColor="#B20000" roster={ROSTER} seedEvents={SEED} />
    </div>
  );
}
