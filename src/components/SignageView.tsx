import { useEffect, useState } from "react";
import type { SeasonResult, PlayerSeason, GradePoint } from "../lib/seasonData";

const C = "var(--font-compressed)";
const G = "var(--font-gothic)";
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: G, letterSpacing: "0.25em", textTransform: "uppercase", fontSize: 15, color: "#B20000" }}>{children}</div>;
}
function Arrow({ t }: { t: "better" | "worse" | "same" }) {
  if (t === "better") return <span style={{ color: "#4ade80" }}>▲</span>;
  if (t === "worse") return <span style={{ color: "#f87171" }}>▼</span>;
  return <span style={{ color: "#9ca3af" }}>–</span>;
}

function GradeChart({ grades }: { grades: GradePoint[] }) {
  const W = 560, H = 300, L = 34, R = 14, T = 16, B = 16;
  const plotH = H - T - B, plotW = W - L - R;
  const yFor = (g: number) => T + ((5 - g) / 4) * plotH;
  const n = grades.length;
  const xFor = (i: number) => (n <= 1 ? L + plotW / 2 : L + (i / (n - 1)) * plotW);
  const pts = grades.map((g, i) => `${xFor(i).toFixed(1)},${yFor(g.grade).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {[1, 2, 3, 4, 5].map((g) => (
        <g key={g}>
          <line x1={L} y1={yFor(g)} x2={W - R} y2={yFor(g)} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
          <text x={L - 8} y={yFor(g) + 5} textAnchor="end" fontSize={14} fill="#94a3b8">{g}</text>
        </g>
      ))}
      {n >= 2 && <polyline points={pts} fill="none" stroke="#B20000" strokeWidth={4} strokeLinejoin="round" />}
      {grades.map((g, i) => <circle key={i} cx={xFor(i)} cy={yFor(g.grade)} r={5} fill="#B20000" />)}
      {n === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fill="#64748b">No graded practices yet</text>}
    </svg>
  );
}

function TeamCard({ name, color, w, l, streakType, streakCount, big }: { name: string; color: string; w: number; l: number; streakType: "W" | "L" | null; streakCount: number; big?: boolean }) {
  return (
    <div style={{ textAlign: "center", border: `3px solid ${color}`, borderRadius: 14, padding: big ? "18px 40px" : "12px 28px", minWidth: big ? 280 : 200 }}>
      <div style={{ fontFamily: C, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: big ? 28 : 22, color }}>{name}</div>
      <div style={{ fontFamily: C, fontSize: big ? 72 : 48, lineHeight: 1 }}>{w}-{l}</div>
      {streakType && <div style={{ fontFamily: C, fontSize: big ? 22 : 16, color: streakType === "W" ? "#4ade80" : "#f87171" }}>{streakType}{streakCount} streak</div>}
    </div>
  );
}

function Kpi({ label, value, t, size = 56 }: { label: string; value: string; t?: "better" | "worse" | "same"; size?: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: G, letterSpacing: "0.15em", textTransform: "uppercase", fontSize: 14, color: "#cbd5e1" }}>{label}</div>
      <div style={{ fontFamily: C, fontSize: size, lineHeight: 1.1 }}>{value} {t && <Arrow t={t} />}</div>
    </div>
  );
}

function TeamSlide({ s }: { s: SeasonResult }) {
  return (
    <div style={{ display: "flex", gap: 56, alignItems: "center", width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
      <div style={{ flex: "0 0 46%", minWidth: 420 }}>
        <div style={{ fontFamily: G, letterSpacing: "0.25em", textTransform: "uppercase", fontSize: 17, color: "#fff" }}>Varsity Practice Level</div>
        <GradeChart grades={s.grades} />
      </div>
      <div style={{ flex: "0 0 44%", minWidth: 380, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px 48px" }}>
        <Kpi label="TO / P" value={s.team.toPerPractice.toFixed(1)} t={s.team.trends.to} size={56} />
        <Kpi label="REB / P" value={s.team.rebPerPractice.toFixed(1)} t={s.team.trends.reb} size={56} />
        <Kpi label="AST / P" value={s.team.astPerPractice.toFixed(1)} t={s.team.trends.ast} size={56} />
        <Kpi label="PPP" value={s.team.ppp.toFixed(2)} t={s.team.trends.ppp} size={56} />
        <Kpi label="PPS" value={s.team.pps.toFixed(2)} t={s.team.trends.pps} size={56} />
        <Kpi label="Casper / P" value={(s.team.casper / Math.max(1, s.team.practices)).toFixed(1)} t={s.team.trends.casper} size={56} />
      </div>
    </div>
  );
}

function ShootingSlide({ s }: { s: SeasonResult }) {
  return (
    <div style={{ textAlign: "center" }}>
      <Eyebrow>Team Shooting</Eyebrow>
      <div style={{ fontFamily: C, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 44, marginBottom: 44 }}>Shooting Percentages</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px 120px", maxWidth: 820, margin: "0 auto" }}>
        <Kpi label="eFG %" value={pct(s.team.efg)} t={s.team.trends.efg} size={96} />
        <Kpi label="3FG %" value={pct(s.team.fg3Pct)} t={s.team.trends.fg3} size={96} />
        <Kpi label="FT %" value={pct(s.team.ftPct)} t={s.team.trends.ft} size={96} />
        <Kpi label="TS %" value={pct(s.team.ts)} t={s.team.trends.ts} size={96} />
      </div>
    </div>
  );
}

// Current win/loss streak from a player's date-ordered history (most recent
// decided practice backwards). Ties / undecided days are skipped.
function playerStreak(p: PlayerSeason): { type: "W" | "L" | null; count: number } {
  const decided = p.history.filter((h) => h.won !== null);
  if (!decided.length) return { type: null, count: 0 };
  const last = decided[decided.length - 1].won;
  let count = 0;
  for (let i = decided.length - 1; i >= 0 && decided[i].won === last; i--) count++;
  return { type: last ? "W" : "L", count };
}

function RecordsSlide({ s }: { s: SeasonResult }) {
  const ranked = [...s.players].sort((a, b) => {
    const wa = a.record.w + a.record.l ? a.record.w / (a.record.w + a.record.l) : 0;
    const wb = b.record.w + b.record.l ? b.record.w / (b.record.w + b.record.l) : 0;
    return wb - wa || b.record.w - a.record.w;
  });
  const half = Math.ceil(ranked.length / 2);
  const cols = [ranked.slice(0, half), ranked.slice(half)];
  return (
    <div style={{ width: "min(1100px, 94vw)" }}>
      <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 24 }}>
        {s.teams.map((t) => <TeamCard key={t.name} {...t} big />)}
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}><Eyebrow>Player Records · Ranked</Eyebrow></div>
      <div style={{ display: "flex", gap: 40 }}>
        {cols.map((col, ci) => (
          <table key={ci} style={{ flex: 1, borderCollapse: "collapse" }}>
            <tbody>
              {col.map((p, i) => {
                const st = playerStreak(p);
                return (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <td style={{ fontFamily: C, fontSize: 22, color: "#B20000", padding: "6px 10px", width: 44 }}>{ci * half + i + 1}</td>
                    <td style={{ fontSize: 22, padding: "6px 10px" }}>{p.name}</td>
                    <td style={{ fontFamily: C, fontSize: 26, padding: "6px 10px", textAlign: "right" }}>{p.record.w}-{p.record.l}</td>
                    <td style={{ fontFamily: C, fontSize: 20, padding: "6px 10px", textAlign: "right", width: 52, color: st.type === "W" ? "#4ade80" : st.type === "L" ? "#f87171" : "#64748b" }}>
                      {st.type ? `${st.type}${st.count}` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

function LeaderSlide({ title, players, fmt, note }: { title: string; players: PlayerSeason[]; fmt: (p: PlayerSeason) => string; note?: string }) {
  return (
    <div style={{ width: "min(900px, 90vw)" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Eyebrow>Season Leaders</Eyebrow>
        <div style={{ fontFamily: C, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 52 }}>{title}</div>
      </div>
      {players.map((p, i) => (
        <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontFamily: C, fontSize: 32, color: "#B20000", width: 48 }}>{i + 1}</div>
          <div style={{ fontFamily: C, fontSize: 22, color: "#94a3b8", width: 44 }}>#{p.jersey}</div>
          <div style={{ flex: 1, fontSize: 28, fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontFamily: C, fontSize: 38 }}>{fmt(p)}</div>
        </div>
      ))}
      {note && <div style={{ textAlign: "center", marginTop: 18, fontFamily: G, letterSpacing: "0.2em", fontSize: 14, color: "#94a3b8" }}>{note}</div>}
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function weekLabel(start: string, end: string): string {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const sM = MONTHS[s.getUTCMonth()];
  const eM = MONTHS[e.getUTCMonth()];
  return sM === eM ? `${sM} ${s.getUTCDate()}–${e.getUTCDate()}` : `${sM} ${s.getUTCDate()} – ${eM} ${e.getUTCDate()}`;
}

// Casper points each player earned in the current week (Mon–Sun of the most
// recent practice), ranked. Using the latest practice's week means the board
// always shows a populated week during the season and advances on its own.
function currentWeekCasper(season: SeasonResult): { rows: { p: PlayerSeason; v: number }[]; label: string } {
  const dates = season.players.flatMap((p) => p.history.map((h) => h.date)).filter(Boolean);
  if (!dates.length) return { rows: [], label: "" };
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  const d = new Date(latest + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const start = mon.toISOString().slice(0, 10);
  const end = sun.toISOString().slice(0, 10);
  const rows = season.players
    .map((p) => ({ p, v: p.history.filter((h) => h.date >= start && h.date <= end).reduce((s, h) => s + h.cp, 0) }))
    .filter((r) => r.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 6);
  return { rows, label: weekLabel(start, end) };
}

function WeeklyCasperSlide({ rows, label }: { rows: { p: PlayerSeason; v: number }[]; label: string }) {
  return (
    <div style={{ width: "min(900px, 90vw)" }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Eyebrow>This Week{label ? ` · ${label}` : ""}</Eyebrow>
        <div style={{ fontFamily: C, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: 52 }}>Casper Points Leaders</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ textAlign: "center", fontSize: 26, color: "#94a3b8", padding: "40px 0" }}>No practices logged this week yet.</div>
      ) : (
        rows.map(({ p, v }, i) => (
          <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ fontFamily: C, fontSize: 32, color: "#B20000", width: 48 }}>{i + 1}</div>
            <div style={{ fontFamily: C, fontSize: 22, color: "#94a3b8", width: 44 }}>#{p.jersey}</div>
            <div style={{ flex: 1, fontSize: 28, fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontFamily: C, fontSize: 38 }}>{v.toFixed(1)}</div>
          </div>
        ))
      )}
      <div style={{ textAlign: "center", marginTop: 18, fontFamily: G, letterSpacing: "0.2em", fontSize: 14, color: "#94a3b8" }}>#BeLikeMitch</div>
    </div>
  );
}

export default function SignageView({ season, start = 0 }: { season: SeasonResult; start?: number }) {
  const top = (key: (p: PlayerSeason) => number, n = 6) => [...season.players].sort((a, b) => key(b) - key(a)).slice(0, n);
  const week = currentWeekCasper(season);
  const slides = [
    <TeamSlide key="team" s={season} />,
    <ShootingSlide key="shoot" s={season} />,
    <RecordsSlide key="rec" s={season} />,
    <WeeklyCasperSlide key="wcp" rows={week.rows} label={week.label} />,
    <LeaderSlide key="cp" title="Casper Points" players={top((p) => p.total.casper)} fmt={(p) => p.total.casper.toFixed(1)} note="Season · #BeLikeMitch" />,
    <LeaderSlide key="per" title="Efficiency (PER)" players={top((p) => p.perAvg)} fmt={(p) => p.perAvg.toFixed(1)} />,
  ];
  const [i, setI] = useState(start % slides.length);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 12000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#00142D", color: "#fff", display: "flex", flexDirection: "column", padding: "4vh 4vw" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/ves-shield.png" alt="VES" style={{ height: 54 }} />
          <div>
            <div style={{ fontFamily: G, letterSpacing: "0.25em", fontSize: 14, color: "#cbd5e1" }}>VES BOYS BASKETBALL</div>
            <div style={{ fontFamily: C, fontSize: 30, letterSpacing: "0.05em" }}>LUDO<span style={{ color: "#B20000" }}>LYTICS</span></div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {slides.map((_, k) => (
            <span key={k} style={{ width: 12, height: 12, borderRadius: 99, background: k === i ? "#B20000" : "rgba(255,255,255,0.25)" }} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{slides[i]}</div>
    </div>
  );
}
