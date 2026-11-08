import Court, { type CourtShot } from "../components/Court";

const shots: CourtShot[] = [
  { x: 25, y: 6, made: true },
  { x: 22, y: 9, made: false },
  { x: 25, y: 16, made: true },
  { x: 10, y: 18, made: false },
  { x: 40, y: 20, made: true },
  { x: 25, y: 26, made: true },
  { x: 5, y: 3, made: false },
  { x: 45, y: 4, made: true },
  { x: 33, y: 12, made: false },
];

export default function CourtDemo() {
  return (
    <div>
      <h1 className="text-3xl headline-bold text-garnet">Court preview</h1>
      <div className="mt-4 grid md:grid-cols-2 gap-6 max-w-4xl">
        <div>
          <div className="eyebrow text-xs mb-1" style={{ color: "#6B7280" }}>Grey squad</div>
          <Court color="#6B7280" shots={shots} onLog={() => {}} />
        </div>
        <div>
          <div className="eyebrow text-xs text-garnet mb-1">Garnet squad</div>
          <Court color="#B20000" shots={shots} onLog={() => {}} />
        </div>
      </div>
    </div>
  );
}
