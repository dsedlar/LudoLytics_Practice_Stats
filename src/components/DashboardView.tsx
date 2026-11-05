import { Fragment, useState } from "react";
import type { PlayerSeason, HistoryPoint } from "../lib/seasonData";
import { pct } from "../lib/stats";

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

type SortKey = "jersey" | "gp" | "ptsPerG" | "pps" | "efg" | "ts" | "perAvg" | "cpPerG" | "cpTot";

const COLS: { key: SortKey; label: string; get: (p: PlayerSeason) => number; fmt: (p: PlayerSeason) => string }[] = [
  { key: "gp", label: "GP", get: (p) => p.gp, fmt: (p) => String(p.gp) },
  { key: "ptsPerG", label: "PTS/G", get: (p) => p.ptsPerG, fmt: (p) => f1(p.ptsPerG) },
  { key: "pps", label: "PPS", get: (p) => p.total.pps, fmt: (p) => f2(p.total.pps) },
  { key: "efg", label: "eFG%", get: (p) => p.total.efg, fmt: (p) => pct(p.total.efg) },
  { key: "ts", label: "TS%", get: (p) => p.total.ts, fmt: (p) => pct(p.total.ts) },
  { key: "perAvg", label: "PER", get: (p) => p.perAvg, fmt: (p) => f1(p.perAvg) },
  { key: "cpPerG", label: "CP/G", get: (p) => p.cpPerG, fmt: (p) => f1(p.cpPerG) },
  { key: "cpTot", label: "CP total", get: (p) => p.total.casper, fmt: (p) => f1(p.total.casper) },
];

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="text-xs text-gray-400">—</span>;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const w = 120, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * w} cy={h - ((v - min) / range) * h} r={1.8} fill={color} />
      ))}
    </svg>
  );
}

function PlayerDetail({ p }: { p: PlayerSeason }) {
  return (
    <div className="bg-gray-50 p-3">
      <div className="flex flex-wrap gap-8 mb-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">PER by practice</div>
          <Spark values={p.history.map((h) => h.per)} color="#7a0019" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Casper Points by practice</div>
          <Spark values={p.history.map((h) => h.cp)} color="#13293d" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Shooting drills (avg)</div>
          <div className="text-sm">Baylor {f1(p.drills.baylorAvg)} · 90s {f1(p.drills.ninetyAvg)} · Trans {pct(p.drills.transPct)} · FT {f1(p.drills.ftAvg)}</div>
        </div>
      </div>
      <table className="text-sm w-full">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-1 pr-3">Date</th><th className="py-1 pr-3">PTS</th><th className="py-1 pr-3">TS%</th>
            <th className="py-1 pr-3">eFG%</th><th className="py-1 pr-3">PER</th><th className="py-1 pr-3">CP</th>
          </tr>
        </thead>
        <tbody>
          {p.history.map((h: HistoryPoint) => (
            <tr key={h.practiceId} className="border-b last:border-0">
              <td className="py-1 pr-3">{h.date}</td>
              <td className="py-1 pr-3">{h.pts}</td>
              <td className="py-1 pr-3">{pct(h.ts)}</td>
              <td className="py-1 pr-3">{pct(h.efg)}</td>
              <td className="py-1 pr-3">{f1(h.per)}</td>
              <td className="py-1 pr-3 font-semibold">{f1(h.cp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DashboardView({ players }: { players: PlayerSeason[] }) {
  const [sort, setSort] = useState<SortKey>("cpTot");
  const [open, setOpen] = useState<string | null>(null);

  const sorted = [...players].sort((a, b) => {
    if (sort === "jersey") return Number(a.jersey || 999) - Number(b.jersey || 999);
    const col = COLS.find((c) => c.key === sort)!;
    return col.get(b) - col.get(a);
  });

  if (players.length === 0)
    return <p className="text-gray-500">No practice data yet. Finish a practice and its stats will appear here.</p>;

  return (
    <div className="bg-white border rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b bg-gray-50">
            <th className="p-2 cursor-pointer" onClick={() => setSort("jersey")}>#</th>
            <th className="p-2">Player</th>
            {COLS.map((c) => (
              <th key={c.key} className={`p-2 cursor-pointer whitespace-nowrap ${sort === c.key ? "text-garnet font-bold" : ""}`} onClick={() => setSort(c.key)}>
                {c.label}
              </th>
            ))}
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <Fragment key={p.playerId}>
              <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === p.playerId ? null : p.playerId)}>
                <td className="p-2 text-gray-500">{p.jersey}</td>
                <td className="p-2 font-semibold">{p.name}</td>
                {COLS.map((c) => (
                  <td key={c.key} className="p-2">{c.fmt(p)}</td>
                ))}
                <td className="p-2 text-garnet text-xs">{open === p.playerId ? "▲ hide" : "▼ growth"}</td>
              </tr>
              {open === p.playerId && (
                <tr>
                  <td colSpan={COLS.length + 3}>
                    <PlayerDetail p={p} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
