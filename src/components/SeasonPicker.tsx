// A small season selector. Seasons are newest-first; shows nothing if there's
// only one season (no need to pick).
export default function SeasonPicker({ seasons, value, onChange }: { seasons: string[]; value: string; onChange: (s: string) => void }) {
  if (seasons.length <= 1) {
    return <span className="text-sm text-gray-500">{value ? `${value} season` : ""}</span>;
  }
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-gray-500">Season</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="border rounded px-2 py-1.5 font-semibold text-garnet">
        {seasons.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </label>
  );
}
