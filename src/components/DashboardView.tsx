import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerSeason } from "../lib/seasonData";
import { pct } from "../lib/stats";

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

type SortKey = "jersey" | "wl" | "efg" | "fg3" | "ft" | "ts" | "pps" | "topg" | "rpg" | "per" | "cp" | "clutch";

const fg3 = (p: PlayerSeason) => (p.tally.fg3A ? p.tally.fg3M / p.tally.fg3A : 0);
const ftPct = (p: PlayerSeason) => (p.tally.ftA ? p.tally.ftM / p.tally.ftA : 0);
const toPerG = (p: PlayerSeason) => p.toTotal / Math.max(1, p.gp);
const rebPerG = (p: PlayerSeason) => (p.tally.or + p.tally.dr) / Math.max(1, p.gp);
const winPct = (p: PlayerSeason) => (p.record.w + p.record.l ? p.record.w / (p.record.w + p.record.l) : 0);

const COLS: { key: SortKey; label: string; get: (p: PlayerSeason) => number; fmt: (p: PlayerSeason) => string }[] = [
  { key: "wl", label: "W-L", get: winPct, fmt: (p) => `${p.record.w}-${p.record.l}` },
  { key: "efg", label: "eFG%", get: (p) => p.total.efg, fmt: (p) => pct(p.total.efg) },
  { key: "fg3", label: "3FG%", get: fg3, fmt: (p) => pct(fg3(p)) },
  { key: "ft", label: "FT%", get: ftPct, fmt: (p) => pct(ftPct(p)) },
  { key: "ts", label: "TS%", get: (p) => p.total.ts, fmt: (p) => pct(p.total.ts) },
  { key: "pps", label: "PPS", get: (p) => p.total.pps, fmt: (p) => f2(p.total.pps) },
  { key: "topg", label: "TO/P", get: toPerG, fmt: (p) => f1(toPerG(p)) },
  { key: "rpg", label: "Reb/P", get: rebPerG, fmt: (p) => f1(rebPerG(p)) },
  { key: "clutch", label: "Clutch FT", get: (p) => p.clutch.pct, fmt: (p) => (p.clutch.a ? `${pct(p.clutch.pct)} (${p.clutch.m}/${p.clutch.a})` : "–") },
  { key: "per", label: "PER", get: (p) => p.perAvg, fmt: (p) => f1(p.perAvg) },
  { key: "cp", label: "CP Total", get: (p) => p.total.casper, fmt: (p) => f1(p.total.casper) },
];

export default function DashboardView({ players, playerHref }: { players: PlayerSeason[]; playerHref?: (id: string) => string }) {
  const href = playerHref ?? ((id: string) => `/player/${id}`);
  const [sort, setSort] = useState<SortKey>("cp");

  const sorted = [...players].sort((a, b) => {
    if (sort === "jersey") return Number(a.jersey || 999) - Number(b.jersey || 999);
    // TO/practice: lower is "better" so sort ascending; others descending
    const col = COLS.find((c) => c.key === sort)!;
    return sort === "topg" ? col.get(a) - col.get(b) : col.get(b) - col.get(a);
  });

  if (players.length === 0)
    return <p className="text-gray-500">No practice data yet. Finish a practice and its stats will appear here.</p>;

  return (
    <div className="bg-white border rounded-lg overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left border-b bg-gray-50 whitespace-nowrap">
            <th className="p-2 cursor-pointer" onClick={() => setSort("jersey")}>#</th>
            <th className="p-2">Player</th>
            {COLS.map((c) => (
              <th key={c.key} className={`p-2 cursor-pointer ${sort === c.key ? "text-garnet font-bold" : ""}`} onClick={() => setSort(c.key)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.playerId} className="border-b last:border-0 hover:bg-gray-50 whitespace-nowrap">
              <td className="p-2 text-gray-500">{p.jersey}</td>
              <td className="p-2 font-semibold">
                <Link to={href(p.playerId)} className="text-garnet hover:underline">{p.name}</Link>
              </td>
              {COLS.map((c) => (
                <td key={c.key} className="p-2">{c.fmt(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
