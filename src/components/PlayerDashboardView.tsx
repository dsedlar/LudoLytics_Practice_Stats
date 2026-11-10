import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerSeason, HistoryPoint } from "../lib/seasonData";
import { pct } from "../lib/stats";
import { SHOOTING_DRILLS } from "../lib/config";
import ShotZones from "./ShotZones";
import HexShotChart from "./HexShotChart";
import type { Shot } from "../lib/seasonData";

function PlayerShotPanel({ zones, shots }: { zones: PlayerSeason["zones"]; shots: Shot[] }) {
  const [view, setView] = useState<"zones" | "hex">("zones");
  const made = shots.filter((s) => s.made).length;
  const seg = (on: boolean) => `px-2.5 py-1 text-xs font-semibold ${on ? "bg-garnet text-white" : "bg-white text-gray-600"}`;
  return (
    <div className="bg-white border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Shot chart</h2>
          <div className="flex rounded border overflow-hidden">
            <button onClick={() => setView("zones")} className={seg(view === "zones")}>Zones</button>
            <button onClick={() => setView("hex")} className={seg(view === "hex")}>Hexbin</button>
          </div>
        </div>
        <span className="text-sm text-gray-500">
          {shots.length ? `${Math.round((made / shots.length) * 100)}% · ${made}/${shots.length} FG` : "No located shots"}
        </span>
      </div>
      {view === "zones" ? <ShotZones zones={zones} /> : <HexShotChart shots={shots} />}
    </div>
  );
}

const denom = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
const BAY_D = denom("baylor"), NINETY_D = denom("ninetys"), FT_D = denom("ft");
const drillPct = (makes: number | null, d: number) => (makes == null ? "–" : pct(makes / d));

const f1 = (x: number) => x.toFixed(1);
const ma = (m: number, a: number) => `${m}-${a}`;

type Trend = "better" | "worse" | "same";
function Arrow({ t }: { t: Trend }) {
  if (t === "better") return <span style={{ color: "#16a34a" }} className="text-lg font-bold">▲</span>;
  if (t === "worse") return <span style={{ color: "#dc2626" }} className="text-lg font-bold">▼</span>;
  return <span className="text-lg font-bold text-gray-400">–</span>;
}
function trendOf(latest: number | null, prev: number | null, higherBetter = true): Trend {
  if (latest == null || prev == null || latest === prev) return "same";
  const better = higherBetter ? latest > prev : latest < prev;
  return better ? "better" : "worse";
}

// metric options for the line chart
const METRICS: { key: string; label: string; get: (h: HistoryPoint) => number; fmt: (v: number) => string }[] = [
  { key: "per", label: "PER", get: (h) => h.per, fmt: (v) => f1(v) },
  { key: "pts", label: "Points", get: (h) => h.pts, fmt: (v) => String(Math.round(v)) },
  { key: "cp", label: "Casper Points", get: (h) => h.cp, fmt: (v) => f1(v) },
  { key: "ts", label: "TS%", get: (h) => h.ts, fmt: (v) => pct(v) },
  { key: "efg", label: "eFG%", get: (h) => h.efg, fmt: (v) => pct(v) },
];

function LineChart({ values, fmt }: { values: number[]; fmt: (v: number) => string }) {
  const W = 640, H = 240, L = 44, R = 14, T = 14, B = 26;
  const plotW = W - L - R, plotH = H - T - B;
  const n = values.length;
  if (n === 0) return <div className="text-sm text-gray-400 py-10 text-center">No data yet</div>;
  const min = Math.min(...values), max = Math.max(...values);
  const lo = min === max ? min - 1 : min;
  const hi = min === max ? max + 1 : max;
  const yFor = (v: number) => T + (1 - (v - lo) / (hi - lo)) * plotH;
  const xFor = (i: number) => (n <= 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW);
  const pts = values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
  const ticks = [hi, (hi + lo) / 2, lo];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 250 }}>
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={L} y1={yFor(tk)} x2={W - R} y2={yFor(tk)} stroke="#eee" strokeWidth={1} />
          <text x={L - 6} y={yFor(tk) + 4} textAnchor="end" fontSize={11} fill="#999">{fmt(tk)}</text>
        </g>
      ))}
      {n >= 2 && <polyline points={pts} fill="none" stroke="#B20000" strokeWidth={2.5} strokeLinejoin="round" />}
      {values.map((v, i) => <circle key={i} cx={xFor(i)} cy={yFor(v)} r={3.2} fill="#B20000" />)}
    </svg>
  );
}

function KTile({ label, value, t }: { label: string; value: string; t: Trend }) {
  return (
    <div className="bg-white border rounded-lg px-3 py-4 text-center">
      <div className="eyebrow text-[10px] text-gray-500">{label}</div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <span className="text-3xl text-black" style={{ fontFamily: "var(--font-compressed)" }}>{value}</span>
        <Arrow t={t} />
      </div>
    </div>
  );
}

export default function PlayerDashboardView({ p, backHref }: { p: PlayerSeason; backHref: string }) {
  const [metric, setMetric] = useState("per");
  const m = METRICS.find((x) => x.key === metric)!;
  const h = p.history;
  const last = h[h.length - 1];
  const prev = h[h.length - 2];
  const fg3Pct = (hp?: HistoryPoint) => (hp && hp.tally.fg3A ? hp.tally.fg3M / hp.tally.fg3A : null);
  const seasonFg3 = p.tally.fg3A ? p.tally.fg3M / p.tally.fg3A : 0;
  const rpg = (p.tally.or + p.tally.dr) / Math.max(1, p.gp);
  const topg = p.toTotal / Math.max(1, p.gp);
  const rebOf = (hp?: HistoryPoint) => (hp ? hp.tally.or + hp.tally.dr : null);
  const toOf = (hp?: HistoryPoint) => (hp ? hp.toCount : null);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="eyebrow text-xs text-gray-500">#{p.jersey} · {p.gp} practices{p.pod ? ` · ${p.pod}× Player of the Day` : ""}</div>
          <h1 className="text-4xl headline-bold text-garnet">{p.name}</h1>
        </div>
        <Link to={backHref} className="text-sm text-garnet font-medium">← Season dashboard</Link>
      </div>

      {/* trend chart (wider) + shot chart (narrower) side by side */}
      <div className="mt-4 grid lg:grid-cols-5 gap-4 items-stretch">
        <div className="lg:col-span-3 bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <h2 className="text-lg font-bold">Trend by practice</h2>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="border rounded px-2 py-1 text-sm">
              {METRICS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </div>
          <LineChart values={h.map(m.get)} fmt={m.fmt} />
        </div>
        <div className="lg:col-span-2">
          <PlayerShotPanel zones={p.zones} shots={p.shots} />
        </div>
      </div>

      {/* KPIs row */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KTile label="eFG %" value={pct(p.total.efg)} t={trendOf(last?.efg ?? null, prev?.efg ?? null)} />
        <KTile label="TS %" value={pct(p.total.ts)} t={trendOf(last?.ts ?? null, prev?.ts ?? null)} />
        <KTile label="3FG %" value={pct(seasonFg3)} t={trendOf(fg3Pct(last), fg3Pct(prev))} />
        <KTile label="Reb / Game" value={f1(rpg)} t={trendOf(rebOf(last), rebOf(prev))} />
        <KTile label="TO / Game" value={f1(topg)} t={trendOf(toOf(last), toOf(prev), false)} />
        <KTile label="Casper / Practice" value={f1(p.cpPerG)} t={trendOf(last?.cp ?? null, prev?.cp ?? null)} />
      </div>

      {/* detailed table */}
      <div className="mt-4 bg-white border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b bg-gray-50 whitespace-nowrap">
              {["Date", "W-L", "PTS", "ATR", "2FG", "3FG", "FT", "OR", "DR", "AST", "TO", "STL", "BLK", "CP", "PER", "TS%", "Trans", "Baylor", "90s", "FT drill"].map((x) => (
                <th key={x} className="p-2">{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.map((hp) => {
              const t = hp.tally;
              return (
                <tr key={hp.practiceId} className="border-b last:border-0 whitespace-nowrap">
                  <td className="p-2">{hp.date}</td>
                  <td className="p-2 font-bold" style={{ color: hp.wl.w > hp.wl.l ? "#16a34a" : "#dc2626" }}>
                    {hp.wl.w > hp.wl.l ? "W" : "L"}
                  </td>
                  <td className="p-2 font-semibold">{hp.pts}</td>
                  <td className="p-2">{ma(t.atrM, t.atrA)}</td>
                  <td className="p-2">{ma(t.nonatr2M, t.nonatr2A)}</td>
                  <td className="p-2">{ma(t.fg3M, t.fg3A)}</td>
                  <td className="p-2">{ma(t.ftM, t.ftA)}</td>
                  <td className="p-2">{t.or}</td>
                  <td className="p-2">{t.dr}</td>
                  <td className="p-2">{t.ast}</td>
                  <td className="p-2">{hp.toCount}</td>
                  <td className="p-2">{t.stl}</td>
                  <td className="p-2">{t.blk}</td>
                  <td className="p-2 font-semibold">{f1(hp.cp)}</td>
                  <td className="p-2">{f1(hp.per)}</td>
                  <td className="p-2">{pct(hp.ts)}</td>
                  <td className="p-2">{hp.trans.a ? pct(hp.trans.m / hp.trans.a) : "–"}</td>
                  <td className="p-2">{drillPct(hp.drills.baylor, BAY_D)}</td>
                  <td className="p-2">{drillPct(hp.drills.ninety, NINETY_D)}</td>
                  <td className="p-2">{drillPct(hp.drills.ft, FT_D)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t font-bold whitespace-nowrap">
              <td className="p-2">Season</td>
              <td className="p-2">{p.record.w}-{p.record.l}</td>
              <td className="p-2">{p.total.pts}</td>
              <td className="p-2">{ma(p.tally.atrM, p.tally.atrA)}</td>
              <td className="p-2">{ma(p.tally.nonatr2M, p.tally.nonatr2A)}</td>
              <td className="p-2">{ma(p.tally.fg3M, p.tally.fg3A)}</td>
              <td className="p-2">{ma(p.tally.ftM, p.tally.ftA)}</td>
              <td className="p-2">{p.tally.or}</td>
              <td className="p-2">{p.tally.dr}</td>
              <td className="p-2">{p.tally.ast}</td>
              <td className="p-2">{p.toTotal}</td>
              <td className="p-2">{p.tally.stl}</td>
              <td className="p-2">{p.tally.blk}</td>
              <td className="p-2">{f1(p.total.casper)}</td>
              <td className="p-2">{f1(p.total.per)}</td>
              <td className="p-2">{pct(p.total.ts)}</td>
              <td className="p-2">{pct(p.drills.transPct)}</td>
              <td className="p-2">{pct(p.drills.baylorAvg / BAY_D)}</td>
              <td className="p-2">{pct(p.drills.ninetyAvg / NINETY_D)}</td>
              <td className="p-2">{pct(p.drills.ftAvg / FT_D)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
