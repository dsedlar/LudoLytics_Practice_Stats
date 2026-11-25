import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAllCoachShots, getSeasonData } from "../lib/db";
import { buildSeason, type TeamRecord, type SeasonInput } from "../lib/seasonData";
import { seasonsIn, seasonOf, filterSeasonInput, currentSeason } from "../lib/season";
import { COACHES } from "../lib/config";
import { isSupabaseConfigured } from "../lib/supabase";
import SeasonPicker from "../components/SeasonPicker";

interface CoachLine {
  key: string;
  name: string;
  team: string;
  teamColor: string;
  made: number;
  att: number;
  pct: number;
  w: number;
  l: number;
  winPct: number;
}

const pct = (v: number, has: boolean) => (has ? `${Math.round(v * 100)}%` : "–");

export default function Coaches() {
  const [data, setData] = useState<SeasonInput | null>(null);
  const [shots, setShots] = useState<{ coach_key: string; practice_id: string | null; segment: string; made: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (!isSupabaseConfigured) { setError("Connect Supabase to track coaches."); return; }
    (async () => {
      try {
        const [d, s] = await Promise.all([getSeasonData(), getAllCoachShots()]);
        setData(d); setShots(s);
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  const seasons = useMemo(() => (data ? seasonsIn(data.practices.map((p) => p.practice_date)) : []), [data]);
  const selected = picked || seasons[0] || currentSeason();

  const rows = useMemo<CoachLine[] | null>(() => {
    if (!data) return null;
    const season = buildSeason(filterSeasonInput(data, selected));
    const dateById = new Map(data.practices.map((p) => [p.id, p.practice_date]));
    const teamOf = (name: string): TeamRecord | undefined => season.teams.find((t) => t.name === name);
    return COACHES.map((c) => {
      const s = shots.filter((x) => x.coach_key === c.key && x.practice_id && seasonOf(dateById.get(x.practice_id) ?? "") === selected);
      const made = s.filter((x) => x.made).length;
      const att = s.length;
      const tr = teamOf(c.team);
      const w = tr?.w ?? 0;
      const l = tr?.l ?? 0;
      return {
        key: c.key, name: c.name, team: c.team, teamColor: tr?.color ?? (c.team === "Grey" ? "#6B7280" : "#B20000"),
        made, att, pct: att ? made / att : 0,
        w, l, winPct: w + l ? w / (w + l) : 0,
      };
    });
  }, [data, shots, selected]);

  const best = rows && rows.some((r) => r.att > 0) ? rows.reduce((b, r) => (r.att > 0 && r.pct > b.pct ? r : b), rows.find((r) => r.att > 0)!) : null;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl headline-bold text-garnet">Coaches</h1>
            <SeasonPicker seasons={seasons} value={selected} onChange={setPicked} />
          </div>
          <p className="mt-1 text-gray-600 text-sm">Coach 3-point shooting (logged in the Transition tab) and each coach's team record. Kept separate from player stats.</p>
        </div>
        <Link to="/" className="text-sm text-garnet font-medium">← Home</Link>
      </div>

      {error && <p className="mt-4 text-red-600">{error}</p>}
      {!rows && !error && <p className="mt-6 text-gray-500">Loading…</p>}

      {rows && (
        <div className="mt-5 bg-white border rounded-lg overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-gray-500 border-b text-xs uppercase tracking-wide">
                <th className="p-3">Coach</th>
                <th className="p-3">Team</th>
                <th className="p-3 text-center">3FG%</th>
                <th className="p-3 text-center">Makes-Att</th>
                <th className="p-3 text-center">Win %</th>
                <th className="p-3 text-center">Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="p-3 font-semibold whitespace-nowrap">
                    {r.name}{best && best.key === r.key && <span title="Best shooter" className="ml-1">🏆</span>}
                  </td>
                  <td className="p-3 font-bold uppercase text-sm" style={{ color: r.teamColor }}>{r.team}</td>
                  <td className="p-3 text-center text-lg font-black">{pct(r.pct, r.att > 0)}</td>
                  <td className="p-3 text-center text-gray-500">{r.att ? `${r.made}-${r.att}` : "–"}</td>
                  <td className="p-3 text-center text-lg font-black">{pct(r.winPct, r.w + r.l > 0)}</td>
                  <td className="p-3 text-center text-gray-500">{r.w}-{r.l}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">Coaches on the same team share that team's record. Win % is from practice days only (shootarounds have no result).</p>
    </div>
  );
}
