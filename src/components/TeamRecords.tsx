import type { TeamRecord } from "../lib/seasonData";

export default function TeamRecords({ teams }: { teams: TeamRecord[] }) {
  if (!teams.length) return null;
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {teams.map((t) => (
        <div key={t.name} className="bg-white border rounded-lg px-4 py-3 flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
          <span className="font-bold" style={{ color: t.color }}>{t.name}</span>
          <span className="text-2xl" style={{ fontFamily: "var(--font-compressed)" }}>{t.w}-{t.l}</span>
          {t.streakType && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${t.streakType === "W" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {t.streakType}{t.streakCount}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
