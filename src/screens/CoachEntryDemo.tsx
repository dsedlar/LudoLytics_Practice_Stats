import DemoEntryPanel from "../components/DemoEntryPanel";

const GARNET = [
  { player_id: "g1", jersey: "1", name: "Patrick Steptoe Jr." },
  { player_id: "g3", jersey: "3", name: "Malik Jordan" },
  { player_id: "g5", jersey: "5", name: "Sam Dewey" },
  { player_id: "g11", jersey: "11", name: "Jack Powers" },
  { player_id: "g13", jersey: "13", name: "Andrey Sharkov" },
  { player_id: "g15", jersey: "15", name: "Tommy Herzel" },
];
const NAVY = [
  { player_id: "n2", jersey: "2", name: "Thorpe Fussell" },
  { player_id: "n4", jersey: "4", name: "Khairi Douglin" },
  { player_id: "n10", jersey: "10", name: "Zion Martin" },
  { player_id: "n12", jersey: "12", name: "Austin Lian" },
  { player_id: "n14", jersey: "14", name: "Preston Avery" },
  { player_id: "n0", jersey: "0", name: "Kam Waller" },
];

export default function CoachEntryDemo() {
  return (
    <div>
      <span className="eyebrow text-xs text-gray-500">Coach · taking stats — both squads (demo)</span>
      <div className="mt-3 grid xl:grid-cols-2 gap-5">
        <div className="rounded-lg border-t-4 pt-3" style={{ borderColor: "#B20000" }}>
          <DemoEntryPanel squadName="Garnet" squadColor="#B20000" roster={GARNET} compact />
        </div>
        <div className="rounded-lg border-t-4 pt-3" style={{ borderColor: "#00142D" }}>
          <DemoEntryPanel squadName="Navy" squadColor="#00142D" roster={NAVY} compact />
        </div>
      </div>
    </div>
  );
}
