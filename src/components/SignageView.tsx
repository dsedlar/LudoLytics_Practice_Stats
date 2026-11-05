import { useEffect, useState } from "react";
import type { SeasonResult, PlayerSeason } from "../lib/seasonData";

const C = "var(--font-compressed)";
const G = "var(--font-gothic)";
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: G, letterSpacing: "0.25em", textTransform: "uppercase", fontSize: 16, color: "#B20000" }}>{children}</div>;
}
function Arrow({ t }: { t: "better" | "worse" | "same" }) {
  if (t === "better") return <span style={{ color: "#4ade80" }}>▲</span>;
  if (t === "worse") return <span style={{ color: "#f87171" }}>▼</span>;
  return <span style={{ color: "#9ca3af" }}>–</span>;
}

function TeamSlide({ s }: { s: SeasonResult }) {
  const kpis: { label: string; value: string; t: "better" | "worse" | "same" }[] = [
    { label: "TO / Practice", value: s.team.toPerPractice.toFixed(1), t: s.team.trends.to },
    { label: "3FG %", value: pct(s.team.fg3Pct), t: s.team.trends.fg3 },
    { label: "PPS", value: s.team.pps.toFixed(2), t: s.team.trends.pps },
    { label: "FT %", value: pct(s.team.ftPct), t: s.team.trends.ft },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 40, flexWrap: "wrap", justifyContent: "center" }}>
        {s.teams.map((t) => (
          <div key={t.name} style={{ textAlign: "center", border: `3px solid ${t.color}`, borderRadius: 14, padding: "20px 44px", minWidth: 300 }}>
            <div style={{ fontFamily: C, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 30, color: t.color }}>{t.name}</div>
            <div style={{ fontFamily: C, fontSize: 84, lineHeight: 1 }}>{t.w}-{t.l}</div>
            {t.streakType && (
              <div style={{ fontFamily: C, fontSize: 24, color: t.streakType === "W" ? "#4ade80" : "#f87171" }}>{t.streakType}{t.streakCount} streak</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 48, flexWrap: "wrap", justifyContent: "center" }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: G, letterSpacing: "0.15em", textTransform: "uppercase", fontSize: 15, color: "#cbd5e1" }}>{k.label}</div>
            <div style={{ fontFamily: C, fontSize: 64, lineHeight: 1 }}>{k.value} <Arrow t={k.t} /></div>
          </div>
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
        <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 20, padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontFamily: C, fontSize: 34, color: "#B20000", width: 48 }}>{i + 1}</div>
          <div style={{ fontFamily: C, fontSize: 22, color: "#94a3b8", width: 44 }}>#{p.jersey}</div>
          <div style={{ flex: 1, fontSize: 30, fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontFamily: C, fontSize: 40 }}>{fmt(p)}</div>
        </div>
      ))}
      {note && <div style={{ textAlign: "center", marginTop: 20, fontFamily: G, letterSpacing: "0.2em", fontSize: 14, color: "#94a3b8" }}>{note}</div>}
    </div>
  );
}

export default function SignageView({ season }: { season: SeasonResult }) {
  const top = (key: (p: PlayerSeason) => number, n = 6) => [...season.players].sort((a, b) => key(b) - key(a)).slice(0, n);
  const slides = [
    <TeamSlide key="team" s={season} />,
    <LeaderSlide key="cp" title="Casper Points" players={top((p) => p.total.casper)} fmt={(p) => p.total.casper.toFixed(1)} note="#BeLikeMitch" />,
    <LeaderSlide key="per" title="Efficiency (PER)" players={top((p) => p.perAvg)} fmt={(p) => p.perAvg.toFixed(1)} />,
  ];
  const [i, setI] = useState(0);
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
