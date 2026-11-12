import {
  formatLongDate,
  type ReportModel,
  type StatBlock,
  type BlockRow,
  type DrillLine,
  type PlayerLine,
} from "../lib/reportData";
import { GRADE_SCALE, SHOOTING_DRILLS } from "../lib/config";

// ---- formatting ----
const p = (x: number) => `${Math.round(x * 100)}%`;
const f2 = (x: number) => x.toFixed(2);
const f1 = (x: number) => x.toFixed(1);
const ma = (m: number, a: number) => `${m}-${a}`;
const dash = (s: string, show: boolean) => (show ? s : "–");

// fixed-denominator drills: individual lines show makes/denom as a percentage
const DRILL_DENOM = (k: string) => SHOOTING_DRILLS.find((d) => d.key === k)?.denominator ?? 1;
const BAY_D = DRILL_DENOM("baylor");
const NINETY_D = DRILL_DENOM("ninetys");
const FT_D = DRILL_DENOM("ft");

// ---- heat map ----
const TIER = ["#f4b8b8", "#f5e6a8", "#cfe8c0", "#9ed69e", "#4fae5a"];
function pctTier(v: number) {
  if (v < 0.35) return 0;
  if (v < 0.45) return 1;
  if (v < 0.52) return 2;
  if (v < 0.6) return 3;
  return 4;
}
function cpTier(v: number) {
  if (v < 5) return 0;
  if (v < 8) return 1;
  if (v < 11) return 2;
  if (v < 15) return 3;
  return 4;
}
function perTier(v: number) {
  if (v < 0) return 0;
  if (v < 8) return 1;
  if (v < 14) return 2;
  if (v < 20) return 3;
  return 4;
}
const bg = (tier: number | null): React.CSSProperties => (tier == null ? {} : { background: TIER[tier] });

const F_COMPRESSED = "var(--font-compressed)";
const F_GOTHIC = "var(--font-gothic)";
const F_BODY = "var(--font-grotesque)";

function Bar({ title }: { title: string }) {
  return (
    <div style={{ background: "#B20000", color: "#fff", fontFamily: F_COMPRESSED, textTransform: "uppercase", fontWeight: 600, fontSize: 11, letterSpacing: "0.08em", padding: "3px 8px" }}>
      {title}
    </div>
  );
}

const th: React.CSSProperties = { padding: "2px 4px", fontWeight: 700, fontSize: 8, color: "#555", borderBottom: "1px solid #ddd", textAlign: "center", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "2px 4px", fontSize: 9, textAlign: "center", borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" };
const grp: React.CSSProperties = { fontSize: 7, fontWeight: 800, color: "#999", textAlign: "center", padding: "2px 4px", letterSpacing: 0.5, borderBottom: "1px solid #eee" };

export default function ReportView({ m }: { m: ReportModel }) {
  const g = m.grade ?? 0;
  return (
    <div style={{ width: 1120, background: "#fff", color: "#000", fontFamily: F_BODY, padding: 16 }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #B20000", paddingBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/ves-shield.png" alt="VES" style={{ height: 46, width: "auto" }} />
          <div>
            <div style={{ fontFamily: F_GOTHIC, fontSize: 8, letterSpacing: "0.2em", color: "#B20000" }}>VIRGINIA EPISCOPAL SCHOOL</div>
            <div style={{ fontFamily: F_COMPRESSED, fontSize: 30, fontWeight: 700, letterSpacing: "0.02em", color: "#000", lineHeight: 1 }}>BOYS BASKETBALL</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: F_COMPRESSED, fontSize: 18, letterSpacing: "0.12em", fontWeight: 600, color: "#B20000" }}>PRACTICE REPORT</div>
          <div style={{ fontSize: 10, color: "#3C0019" }}>
            {formatLongDate(m.date)}{m.startTime ? <> &nbsp;·&nbsp; Time: <b>{m.startTime}</b></> : null}
          </div>
        </div>
      </div>

      {/* summary cards */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {m.squads.map((s) => (
          <SummaryCard key={s.id} name={s.name} color={s.color} block={s.team} wins={s.wins} ties={s.ties} />
        ))}
        <SummaryCard name="Combined" color="#00142D" block={m.combined} wins={m.squads.reduce((a, s) => a + s.wins, 0)} />
        <div style={{ flex: "0 0 150px", border: "1px solid #ddd", borderRadius: 4, padding: 8 }}>
          <div style={{ fontFamily: F_GOTHIC, fontSize: 8, letterSpacing: "0.18em", color: "#B20000" }}>PRACTICE GRADE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ fontFamily: F_COMPRESSED, fontSize: 32, fontWeight: 700 }}>{g || "–"}</div>
            <div style={{ fontSize: 9 }}>
              <div style={{ fontWeight: 700 }}>{g ? GRADE_SCALE[g].label : ""}</div>
              <div style={{ color: "#3C0019" }}>{g ? GRADE_SCALE[g].blurb : ""}</div>
            </div>
          </div>
        </div>
        <div style={{ flex: "0 0 120px", border: "1px solid #ddd", borderRadius: 4, padding: 8 }}>
          <div style={{ fontFamily: F_GOTHIC, fontSize: 8, letterSpacing: "0.18em", color: "#B20000" }}>ATTENDANCE</div>
          <div style={{ fontFamily: F_COMPRESSED, fontSize: 26, fontWeight: 700, marginTop: 4 }}>{m.attPresent}/{m.attTotal}</div>
          <div style={{ fontSize: 9, color: "#3C0019" }}>{p(m.attPct)} present</div>
        </div>
      </div>

      {/* team stats */}
      <div style={{ marginTop: 10 }}>
        <Bar title="TEAM STATS" />
        <BlockTable rows={[...m.squads.map((s) => ({ name: s.name, color: s.color, block: s.team })), { name: "Combined", color: "#00142D", block: m.combined }]} />
      </div>

      {/* live play + transition summary + baylor — one row */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 3 }}>
          <Bar title="LIVE PLAY" />
          <LivePlayCompact rows={m.liveTeam} />
        </div>
        <div style={{ flex: 1 }}>
          <Bar title="Transition 3s Summary" />
          <Seg3Summary rows={m.drills} label="TRANS 3PT" get={(r) => r.transition} />
        </div>
        <div style={{ flex: 1 }}>
          <Bar title="Thespian 3s Summary" />
          <Seg3Summary rows={m.drills} label="THES 3PT" get={(r) => r.thespian} />
        </div>
        <div style={{ flex: 2 }}>
          <Bar title="BAYLOR SHOOTING & FREE THROWS" />
          <DrillTable rows={m.drills} />
        </div>
      </div>

      {/* individual */}
      <div style={{ marginTop: 10 }}>
        <Bar title="INDIVIDUAL STATS" />
        <IndividualTable m={m} />
      </div>

      {/* footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 10, fontSize: 8, alignItems: "center" }}>
          {["Below average", "Average", "Above average", "High level", "Elite"].map((l, i) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 10, height: 10, background: TIER[i], display: "inline-block", borderRadius: 2 }} />
              {l}
            </span>
          ))}
        </div>
        <img src="/ludolytics-logo.svg" alt="Ludolytics" style={{ height: 26, width: "auto" }} />
      </div>
      <div style={{ fontSize: 7, color: "#999", marginTop: 4, lineHeight: 1.3 }}>
        POSS (est) = FGA + TO + 0.44·FTA. PPP = pts/poss. PPS = pts/FGA (FT incl). eFG% = (FGM+0.5·3PM)/FGA. TS% = PTS/2/(FGA+0.44·FTA).
        A/TO = Ast/TO. PER = PTS + 4·FGM − 0.7·FGA − 0.4·missed FT + 0.7·OR + 0.3·DR + Ast + 0.7·STL + 0.7·BLK − TO.
        Casper Points (CP) honor Coach Mitch Casper: OR 1.5, DR 1, Tip 0.5, Dive 2, Chg 4, STL 1, BLK 1, Def 1, GS 1, TA 1, Misc 1. #BeLikeMitch
      </div>
    </div>
  );
}

function SummaryCard({ name, color, block, wins, ties = 0 }: { name: string; color: string; block: StatBlock; wins: number; ties?: number }) {
  return (
    <div style={{ flex: 1, border: `2px solid ${color}`, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ background: color, color: "#fff", fontFamily: F_COMPRESSED, fontWeight: 600, letterSpacing: "0.12em", fontSize: 12, textAlign: "center", padding: "2px 0" }}>{name.toUpperCase()}</div>
      <div style={{ display: "flex", justifyContent: "space-around", padding: "6px 4px" }}>
        {[
          [f2(block.ppp), "PPP"],
          [String(round1(block.casper)), "CASPER"],
          [String(wins), "WINS"],
          ...(ties > 0 ? [[String(ties), "TIES"]] : []),
          [String(Math.round(block.poss)), "POSS"],
        ].map(([v, l]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: F_COMPRESSED, fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{v}</div>
            <div style={{ fontFamily: F_GOTHIC, fontSize: 6.5, color: "#3C0019", letterSpacing: "0.1em" }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
const round1 = (x: number) => Math.round(x * 10) / 10;

function BlockTable({ rows }: { rows: BlockRow[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ ...grp }} colSpan={1}></th>
          <th style={grp} colSpan={5}></th>
          <th style={grp} colSpan={3}>AT THE RIM</th>
          <th style={grp} colSpan={3}>NON-ATR 2FG</th>
          <th style={grp} colSpan={3}>3FG</th>
          <th style={grp} colSpan={2}>FT</th>
          <th style={grp} colSpan={1}></th>
          <th style={grp} colSpan={6}>PLAYMAKING</th>
          <th style={grp} colSpan={5}>REBOUNDING</th>
          <th style={grp} colSpan={6}>DEFENSE</th>
          <th style={grp} colSpan={1}>CASPER</th>
        </tr>
        <tr>
          {["TEAM", "POSS", "PPP", "PPS", "eFG%", "TS%", "FGM-A", "FG%", "Fr%", "FGM-A", "FG%", "Fr%", "FGM-A", "FG%", "Fr%", "FTM-A", "FT%", "FD",
            "Pot", "2nd", "Ast", "TO", "TO%", "A/TO", "Tip", "OR", "DR", "OR%", "TOT", "STL", "BLK", "Def", "Foul", "Dive", "Chg", "PTS"].map((h, i) => (
            <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const b = r.block;
          return (
            <tr key={r.name}>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: r.color }}>{r.name}</td>
              <td style={td}>{Math.round(b.poss)}</td>
              <td style={td}>{f2(b.ppp)}</td>
              <td style={td}>{f2(b.pps)}</td>
              <td style={{ ...td, ...bg(pctTier(b.efg)) }}>{p(b.efg)}</td>
              <td style={{ ...td, ...bg(pctTier(b.ts)) }}>{p(b.ts)}</td>
              <ZoneCells z={b.atr} /><ZoneCells z={b.nonatr2} /><ZoneCells z={b.fg3} />
              <td style={td}>{ma(b.ft.m, b.ft.a)}</td>
              <td style={{ ...td, ...bg(b.ft.a ? pctTier(b.ft.pct) : null) }}>{dash(p(b.ft.pct), b.ft.a > 0)}</td>
              <td style={td}>{b.fd}</td>
              <td style={td}>{b.play.pot}</td><td style={td}>{b.play.second}</td><td style={td}>{b.play.ast}</td>
              <td style={td}>{b.play.to}</td><td style={td}>{p(b.play.toPct)}</td><td style={td}>{f2(b.play.ato)}</td>
              <td style={td}>{b.reb.tip}</td><td style={td}>{b.reb.or}</td><td style={td}>{b.reb.dr}</td>
              <td style={td}>{p(b.reb.orPct)}</td><td style={td}>{b.reb.tot}</td>
              <td style={td}>{b.def.stl}</td><td style={td}>{b.def.blk}</td><td style={td}>{b.def.def}</td>
              <td style={td}>{b.def.foul}</td><td style={td}>{b.def.dive}</td><td style={td}>{b.def.chg}</td>
              <td style={{ ...td, fontWeight: 700 }}>{round1(b.casper)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ZoneCells({ z }: { z: { m: number; a: number; pct: number; fr: number } }) {
  return (
    <>
      <td style={td}>{ma(z.m, z.a)}</td>
      <td style={{ ...td, ...bg(z.a ? pctTier(z.pct) : null) }}>{dash(p(z.pct), z.a > 0)}</td>
      <td style={td}>{dash(p(z.fr), z.a > 0)}</td>
    </>
  );
}

// Compact but rich Live Play table (fits alongside Transition + Baylor in one row).
function LivePlayCompact({ rows }: { rows: BlockRow[] }) {
  const z = (zz: { m: number; a: number; pct: number }) => (
    <>
      <td style={td}>{ma(zz.m, zz.a)}</td>
      <td style={{ ...td, ...bg(zz.a ? pctTier(zz.pct) : null) }}>{dash(p(zz.pct), zz.a > 0)}</td>
    </>
  );
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={grp}></th><th style={grp} colSpan={5}></th>
          <th style={grp} colSpan={2}>ATR</th><th style={grp} colSpan={2}>2FG</th><th style={grp} colSpan={2}>3FG</th>
          <th style={grp} colSpan={6}></th><th style={grp}>CASPER</th>
        </tr>
        <tr>
          {["TEAM", "POSS", "PPP", "PPS", "eFG%", "TS%", "M-A", "%", "M-A", "%", "M-A", "%", "FD", "Ast", "TO", "Foul", "OR", "DR%", "CP"].map((h, i) => (
            <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => {
          const b = r.block;
          const isCombined = idx === rows.length - 1; // combined row has no opponent, so no DR%
          const showDr = !isCombined && b.reb.dr > 0;
          return (
            <tr key={r.name}>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: r.color }}>{r.name}</td>
              <td style={td}>{Math.round(b.poss)}</td>
              <td style={td}>{f2(b.ppp)}</td>
              <td style={td}>{f2(b.pps)}</td>
              <td style={{ ...td, ...bg(pctTier(b.efg)) }}>{p(b.efg)}</td>
              <td style={{ ...td, ...bg(pctTier(b.ts)) }}>{p(b.ts)}</td>
              {z(b.atr)}{z(b.nonatr2)}{z(b.fg3)}
              <td style={td}>{b.fd}</td>
              <td style={td}>{b.play.ast}</td>
              <td style={td}>{b.play.to}</td>
              <td style={td}>{b.def.foul}</td>
              <td style={td}>{b.reb.or}</td>
              <td style={{ ...td, ...bg(showDr ? pctTier(b.reb.drPct) : null) }}>{showDr ? p(b.reb.drPct) : "–"}</td>
              <td style={{ ...td, fontWeight: 700 }}>{round1(b.casper)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Seg3Summary({ rows, label, get }: { rows: DrillLine[]; label: string; get: (r: DrillLine) => { m: number; a: number; pct: number } }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["TEAM", label, "%"].map((h, i) => (
            <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const v = get(r);
          return (
            <tr key={r.name}>
              <td style={{ ...td, textAlign: "left", fontWeight: 700, color: r.color }}>{r.name}</td>
              <td style={td}>{ma(v.m, v.a)}</td>
              <td style={{ ...td, ...bg(v.a ? pctTier(v.pct) : null) }}>{dash(p(v.pct), v.a > 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DrillTable({ rows }: { rows: DrillLine[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={grp}></th><th style={grp} colSpan={2}>BAYLOR /75</th><th style={grp} colSpan={2}>90SEC /20</th>
          <th style={grp} colSpan={2}>FT /20</th>
        </tr>
        <tr>
          {["TEAM", "AVG", "%", "AVG", "%", "AVG", "%"].map((h, i) => (
            <th key={i} style={{ ...th, textAlign: i === 0 ? "left" : "center" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td style={{ ...td, textAlign: "left", fontWeight: 700, color: r.color }}>{r.name}</td>
            <td style={td}>{f1(r.baylor.avg)}</td><td style={{ ...td, ...bg(pctTier(r.baylor.pct)) }}>{p(r.baylor.pct)}</td>
            <td style={td}>{f1(r.ninetys.avg)}</td><td style={{ ...td, ...bg(pctTier(r.ninetys.pct)) }}>{p(r.ninetys.pct)}</td>
            <td style={td}>{f1(r.ft.avg)}</td><td style={{ ...td, ...bg(pctTier(r.ft.pct)) }}>{p(r.ft.pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const IND_HEAD = ["AT", "W-L", "PTS", "PPS", "eFG%", "TS%", "FGM-A", "FG%", "FGM-A", "FG%", "FGM-A", "FG%", "FTM-A", "FT%", "FD",
  "Pot", "2nd", "Ast", "TO", "A/TO", "Tip", "OR", "DR", "TOT", "STL", "BLK", "Def", "Foul", "Dive", "Chg", "CP", "PER", "BAY", "90s", "Trans", "Thes", "FT"];

function IndividualTable({ m }: { m: ReportModel }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={grp} colSpan={2}>PLAYER</th><th style={grp} colSpan={5}></th>
          <th style={grp} colSpan={2}>ATR</th><th style={grp} colSpan={2}>NON-ATR 2FG</th><th style={grp} colSpan={2}>3FG</th>
          <th style={grp} colSpan={2}>FT</th><th style={grp}></th>
          <th style={grp} colSpan={5}>PLAYMAKING</th><th style={grp} colSpan={4}>REBOUNDING</th>
          <th style={grp} colSpan={6}>DEFENSE</th><th style={grp} colSpan={2}></th><th style={grp} colSpan={4}>SHOOTING DRILLS</th>
        </tr>
        <tr>
          <th style={{ ...th, textAlign: "left" }}>#</th>
          <th style={{ ...th, textAlign: "left" }}>Player</th>
          {IND_HEAD.map((h, i) => <th key={i} style={th}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {m.squads.map((s) => (
          <SquadRows key={s.id} name={s.name} color={s.color} players={s.players.filter((pl) => pl.present)} totals={s.totals} wl={s.wl} />
        ))}
        {m.absent.length > 0 && (
          <tr>
            <td colSpan={IND_HEAD.length + 2} style={{ ...td, textAlign: "left", color: "#999", fontSize: 8, paddingTop: 4 }}>
              {m.absent.map((a) => `#${a.jersey} ${a.name}`).join(", ")} — Not practicing (not counted in team totals)
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SquadRows({ name, color, players, totals, wl }: { name: string; color: string; players: PlayerLine[]; totals: StatBlock; wl: string }) {
  return (
    <>
      <tr>
        <td colSpan={38} style={{ background: color, color: "#fff", fontWeight: 800, fontSize: 8, letterSpacing: 1, padding: "2px 4px", textAlign: "left" }}>
          {name.toUpperCase()}
        </td>
      </tr>
      {players.map((pl) => <PlayerRow key={pl.playerId} pl={pl} />)}
      <tr style={{ borderTop: "1px solid #bbb" }}>
        <td style={{ ...td, textAlign: "left", fontWeight: 800 }} colSpan={2}>TEAM TOTALS</td>
        <BlockCells b={totals} drills={{ baylor: null, ninetys: null, transM: null, transA: null, thesM: null, thesA: null, ft: null }} wl={wl} bold />
      </tr>
    </>
  );
}

function PlayerRow({ pl }: { pl: PlayerLine }) {
  return (
    <tr>
      <td style={{ ...td, textAlign: "left", color: "#777" }}>#{pl.jersey}</td>
      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{pl.name}</td>
      <BlockCells b={pl.block} drills={pl.drills} wl={pl.wl} present={pl.present} />
    </tr>
  );
}

function BlockCells({ b, drills, wl, bold, present = true }: { b: StatBlock; drills: PlayerLine["drills"]; wl: string; bold?: boolean; present?: boolean }) {
  const w = bold ? 700 : 400;
  return (
    <>
      <td style={td}>{present ? "✓" : "–"}</td>
      <td style={td}>{wl}</td>
      <td style={{ ...td, fontWeight: w }}>{b.pts}</td>
      <td style={td}>{f2(b.pps)}</td>
      <td style={{ ...td, ...bg(b.efg ? pctTier(b.efg) : null) }}>{dash(p(b.efg), b.pts > 0 || b.atr.a + b.nonatr2.a + b.fg3.a > 0)}</td>
      <td style={{ ...td, ...bg(b.ts ? pctTier(b.ts) : null) }}>{dash(p(b.ts), b.atr.a + b.nonatr2.a + b.fg3.a > 0)}</td>
      <td style={td}>{ma(b.atr.m, b.atr.a)}</td><td style={{ ...td, ...bg(b.atr.a ? pctTier(b.atr.pct) : null) }}>{dash(p(b.atr.pct), b.atr.a > 0)}</td>
      <td style={td}>{ma(b.nonatr2.m, b.nonatr2.a)}</td><td style={{ ...td, ...bg(b.nonatr2.a ? pctTier(b.nonatr2.pct) : null) }}>{dash(p(b.nonatr2.pct), b.nonatr2.a > 0)}</td>
      <td style={td}>{ma(b.fg3.m, b.fg3.a)}</td><td style={{ ...td, ...bg(b.fg3.a ? pctTier(b.fg3.pct) : null) }}>{dash(p(b.fg3.pct), b.fg3.a > 0)}</td>
      <td style={td}>{ma(b.ft.m, b.ft.a)}</td><td style={{ ...td, ...bg(b.ft.a ? pctTier(b.ft.pct) : null) }}>{dash(p(b.ft.pct), b.ft.a > 0)}</td>
      <td style={td}>{b.fd}</td>
      <td style={td}>{b.play.pot}</td><td style={td}>{b.play.second}</td><td style={td}>{b.play.ast}</td><td style={td}>{b.play.to}</td><td style={td}>{f2(b.play.ato)}</td>
      <td style={td}>{b.reb.tip}</td><td style={td}>{b.reb.or}</td><td style={td}>{b.reb.dr}</td><td style={td}>{b.reb.tot}</td>
      <td style={td}>{b.def.stl}</td><td style={td}>{b.def.blk}</td><td style={td}>{b.def.def}</td><td style={td}>{b.def.foul}</td><td style={td}>{b.def.dive}</td><td style={td}>{b.def.chg}</td>
      <td style={{ ...td, fontWeight: 700, ...bg(cpTier(b.casper)) }}>{round1(b.casper)}</td>
      <td style={{ ...td, ...bg(perTier(b.per)) }}>{f1(b.per)}</td>
      <td style={td}>{drills.baylor != null ? p(drills.baylor / BAY_D) : "–"}</td>
      <td style={td}>{drills.ninetys != null ? p(drills.ninetys / NINETY_D) : "–"}</td>
      <td style={td}>{drills.transM != null && drills.transA ? p(drills.transM / drills.transA) : "–"}</td>
      <td style={td}>{drills.thesM != null && drills.thesA ? p(drills.thesM / drills.thesA) : "–"}</td>
      <td style={td}>{drills.ft != null ? p(drills.ft / FT_D) : "–"}</td>
    </>
  );
}
