import { formatLongDate } from "../lib/reportData";
import { DRILL_DENOMS, type WeeklyModel, type TrendStat, type PlayerWeekRow } from "../lib/weeklyReport";

const F_COMPRESSED = "var(--font-compressed)";
const F_GOTHIC = "var(--font-gothic)";
const F_BODY = "var(--font-grotesque)";
const GARNET = "#B20000";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);

function Bar({ title }: { title: string }) {
  return (
    <div style={{ background: GARNET, color: "#fff", fontFamily: F_COMPRESSED, textTransform: "uppercase", fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", padding: "3px 8px", marginTop: 12 }}>
      {title}
    </div>
  );
}

function trendOf(s: TrendStat): { glyph: string; color: string; note: string } {
  if (s.prior == null) return { glyph: "", color: "#9ca3af", note: "—" };
  if (Math.abs(s.value - s.prior) < 1e-9) return { glyph: "–", color: "#9ca3af", note: `same as ${s.fmt(s.prior)}` };
  const improved = s.higherBetter ? s.value > s.prior : s.value < s.prior;
  return { glyph: improved ? "▲" : "▼", color: improved ? "#16a34a" : "#dc2626", note: `was ${s.fmt(s.prior)}` };
}

const th: React.CSSProperties = { padding: "3px 6px", fontWeight: 700, fontSize: 8.5, color: "#555", borderBottom: "1px solid #ddd", textAlign: "center", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "3px 6px", fontSize: 10, textAlign: "center", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" };

export default function WeeklyReportView({ m }: { m: WeeklyModel }) {
  return (
    <div style={{ width: 1060, background: "#fff", color: "#000", fontFamily: F_BODY, padding: 16 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${GARNET}`, paddingBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/ves-shield.png" alt="VES" style={{ height: 46, width: "auto" }} />
          <div>
            <div style={{ fontFamily: F_GOTHIC, fontSize: 8, letterSpacing: "0.2em", color: GARNET }}>VIRGINIA EPISCOPAL SCHOOL</div>
            <div style={{ fontFamily: F_COMPRESSED, fontSize: 30, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1 }}>BOYS BASKETBALL</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: F_COMPRESSED, fontSize: 18, letterSpacing: "0.12em", fontWeight: 600, color: GARNET }}>WEEKLY REPORT</div>
          <div style={{ fontSize: 10, color: "#3C0019" }}>
            {formatLongDate(m.startDate)} – {formatLongDate(m.endDate)} · {m.practiceCount} practice{m.practiceCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {m.practiceCount === 0 ? (
        <p style={{ marginTop: 16, color: "#6b7280" }}>No practices in this date range.</p>
      ) : (
        <>
          {/* team trends */}
          <Bar title={`Team Trends${m.hasPrior ? " · vs previous period" : ""}`} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {m.team.map((s) => {
              const t = trendOf(s);
              return (
                <div key={s.key} style={{ flex: "1 1 100px", minWidth: 100, border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 8px" }}>
                  <div style={{ fontFamily: F_GOTHIC, fontSize: 7.5, letterSpacing: "0.12em", color: "#6b7280", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontFamily: F_COMPRESSED, fontSize: 22, fontWeight: 700 }}>{s.fmt(s.value)}</span>
                    <span style={{ color: t.color, fontWeight: 700, fontSize: 12 }}>{t.glyph}</span>
                  </div>
                  <div style={{ fontSize: 7.5, color: "#9ca3af" }}>{t.note}</div>
                </div>
              );
            })}
          </div>

          {/* standouts */}
          <Bar title="Standouts" />
          <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "stretch" }}>
            {m.playerOfWeek && (
              <div style={{ flex: "0 0 240px", background: "#00142D", color: "#fff", borderRadius: 4, padding: "8px 12px" }}>
                <div style={{ fontFamily: F_GOTHIC, fontSize: 8, letterSpacing: "0.16em", color: "#F4C9C9" }}>PLAYER OF THE WEEK</div>
                <div style={{ fontFamily: F_COMPRESSED, fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{m.playerOfWeek.name}</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>{m.playerOfWeek.detail}</div>
              </div>
            )}
            <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {m.standouts.map((s) => (
                <div key={s.label} style={{ flex: "1 1 160px", border: "1px solid #e5e7eb", borderRadius: 4, padding: "6px 10px" }}>
                  <div style={{ fontFamily: F_GOTHIC, fontSize: 7.5, letterSpacing: "0.12em", color: GARNET, textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.name}</div>
                  <div style={{ fontSize: 9, color: "#6b7280" }}>{s.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* daily recap */}
          <Bar title="Practice-by-Practice" />
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 2 }}>
            <thead>
              <tr>
                {["Date", "Winner", "Player of the Day", "Tiebreak", "Grade", "Attendance", "Records (W-L-T)"].map((h, i, arr) => (
                  <th key={h} style={{ ...th, textAlign: i === 0 || i === arr.length - 1 ? "left" : "center" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.daily.map((d) => (
                <tr key={d.practiceId}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{formatLongDate(d.date)}</td>
                  <td style={{ ...td, fontWeight: 700, color: d.winnerColor ?? "#6b7280" }}>{d.winnerName ?? "—"}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{d.playerOfDayName ?? "–"}</td>
                  <td style={{ ...td, color: "#6b7280" }}>{d.reason === "Wins" ? "" : d.reason}</td>
                  <td style={td}>{d.grade ?? "–"}</td>
                  <td style={td}>{d.present}/{d.total}</td>
                  <td style={{ ...td, textAlign: "left" }}>
                    {d.teams.map((t, i) => (
                      <span key={t.name} style={{ color: t.color, fontWeight: 600 }}>
                        {i > 0 ? "  ·  " : ""}{t.name} {t.w}-{t.l}{t.t ? `-${t.t}` : ""}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* per-player */}
          <Bar title="Player Breakdown · the week" />
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 2 }}>
            <thead>
              <tr>
                <th colSpan={2} style={{ ...th, borderBottom: "none" }} />
                <th colSpan={13} style={{ ...th, background: "#f3f4f6", color: GARNET, letterSpacing: "0.06em" }}>Live Play Stats</th>
                <th colSpan={5} style={{ ...th, background: "#f3f4f6", borderLeft: "2px solid #d1d5db", color: GARNET, letterSpacing: "0.06em" }}>Shooting Drills</th>
              </tr>
              <tr>
                {["#", "Player", "W-L", "eFG%", "TS%", "3FG%", "FT%", "PPS", "Clutch FT", "AST", "REB", "DEF", "TO", "CP", "PER", "BAY", "90s", "FT", "Trans", "Thes"].map((h, i) => (
                  <th key={h} style={{ ...th, textAlign: i === 1 ? "left" : "center", borderLeft: i === 15 ? "2px solid #d1d5db" : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.players.map((p) => (
                <PlayerRow key={p.playerId} p={p} />
              ))}
              {m.players.length === 0 && (
                <tr><td colSpan={20} style={{ ...td, color: "#9ca3af" }}>No players practiced in this range.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      <div style={{ marginTop: 10, fontSize: 7.5, color: "#9ca3af", lineHeight: 1.4 }}>
        W-L is the overall practice result (tiebreaker-aware). eFG/TS/PPS/FT%/AST/DEF/PER from live scrimmage only (FT% includes validation FTs); TO includes transition/thespian turnovers. Clutch FT = validation free throws; DEF = deflections; PPS = points per shot.
        Shooting-drill cells are shooting % (Baylor /{DRILL_DENOMS.baylor}, 90s /{DRILL_DENOMS.ninety}, FT /{DRILL_DENOMS.ft}); Trans/Thes are made/attempted 3s with %. #BeLikeMitch
      </div>
    </div>
  );
}

function PlayerRow({ p }: { p: PlayerWeekRow }) {
  const dp = (makes: number | null, d: number) => (makes == null ? "–" : pct(makes / d));
  const seg = (s: { m: number; a: number }) => (s.a ? `${s.m}-${s.a} (${pct(s.m / s.a)})` : "–");
  const drillLeft: React.CSSProperties = { ...td, borderLeft: "2px solid #d1d5db" };
  return (
    <tr>
      <td style={{ ...td, color: "#6b7280" }}>{p.jersey}</td>
      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{p.name}</td>
      <td style={{ ...td, fontWeight: 600 }}>{p.record.w}-{p.record.l}</td>
      <td style={td}>{pct(p.efg)}</td>
      <td style={td}>{pct(p.ts)}</td>
      <td style={td}>{p.fg3Pct ? pct(p.fg3Pct) : "–"}</td>
      <td style={td}>{p.ftPct ? pct(p.ftPct) : "–"}</td>
      <td style={{ ...td, fontWeight: 600 }}>{f2(p.pps)}</td>
      <td style={td}>{p.clutch.a ? `${pct(p.clutch.pct)} (${p.clutch.m}/${p.clutch.a})` : "–"}</td>
      <td style={td}>{p.ast}</td>
      <td style={td}>{p.reb}</td>
      <td style={td}>{p.def}</td>
      <td style={td}>{p.to}</td>
      <td style={{ ...td, fontWeight: 600 }}>{f1(p.casper)}</td>
      <td style={td}>{f1(p.per)}</td>
      <td style={drillLeft}>{dp(p.drills.baylor, DRILL_DENOMS.baylor)}</td>
      <td style={td}>{dp(p.drills.ninety, DRILL_DENOMS.ninety)}</td>
      <td style={td}>{dp(p.drills.ft, DRILL_DENOMS.ft)}</td>
      <td style={td}>{seg(p.drills.trans)}</td>
      <td style={td}>{seg(p.drills.thes)}</td>
    </tr>
  );
}
