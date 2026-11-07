// Full-court shot chart (ESPN-style), page-filling in landscape.
// Grey team shoots at the LEFT hoop, Garnet at the RIGHT hoop, using the
// half-court shot coordinates (x: 0..50 width, y: 0..47 baseline->mid).
import type { EventRow } from "../lib/aggregate";
import { formatLongDate } from "../lib/reportData";

interface SquadLite {
  id: string;
  name: string;
  color: string;
}

const SHOT_TYPES = new Set(["atr", "nonatr2", "fg3"]);

// palette (muted hardwood, like the reference chart)
const FLOOR = "#DCC9A6";
const APRON = "#D3BF99";
const PAINT = "#CBB791";
const LINE = "#9A8C76";
const LW = 2.4;

// 10px per foot; court 94x50 ft inside a 30px apron.
const fx = (ft: number) => 30 + ft * 10;
const fy = (ft: number) => 30 + ft * 10;

export default function ShotChartView({
  squads,
  events,
  date,
  startTime,
}: {
  squads: SquadLite[];
  events: EventRow[];
  date: string;
  startTime?: string | null;
}) {
  const grey = squads.find((s) => /gr[ae]y/i.test(s.name)) ?? squads[0];
  const garnet = squads.find((s) => grey && s.id !== grey.id) ?? squads[1];
  const greyColor = grey?.color ?? "#6B7280";
  const garnetColor = garnet?.color ?? "#B20000";

  const shotsFor = (sq?: SquadLite) =>
    sq
      ? events.filter(
          (e) =>
            e.squad_id === sq.id &&
            e.segment !== "transition" && // transition 3s live only in the Transition summary
            SHOT_TYPES.has(e.type) &&
            e.shot_x != null &&
            e.shot_y != null,
        )
      : [];

  // Left team at the left hoop; right team mirrored (180°) to the right hoop.
  const leftDots = shotsFor(grey).map((e) => ({ cx: fx(e.shot_y as number), cy: fy(e.shot_x as number), made: !!e.made }));
  const rightDots = shotsFor(garnet).map((e) => ({ cx: fx(94 - (e.shot_y as number)), cy: fy(50 - (e.shot_x as number)), made: !!e.made }));

  return (
    <div className="w-full" style={{ background: "#fff", padding: 16, color: "#000" }}>
      {/* header — mirrors the Box Score */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "2px solid #B20000", paddingBottom: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/ves-shield.png" alt="VES" style={{ height: 48, width: "auto" }} />
          <div>
            <div style={{ fontFamily: "var(--font-gothic)", fontSize: 9, letterSpacing: "0.2em", color: "#B20000" }}>VIRGINIA EPISCOPAL SCHOOL</div>
            <div style={{ fontFamily: "var(--font-compressed)", fontSize: 28, fontWeight: 700, lineHeight: 1.05 }}>BOYS BASKETBALL · PRACTICE SHOT CHART</div>
            <div style={{ fontSize: 11, color: "#3C0019", marginTop: 2 }}>
              {formatLongDate(date)}{startTime ? <> &nbsp;·&nbsp; Time: <b>{startTime}</b></> : null}
            </div>
          </div>
        </div>
        <img src="/ludolytics-logo.svg" alt="Ludolytics" style={{ height: 26, width: "auto" }} />
      </div>

      <svg viewBox="0 0 1000 560" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
        {/* apron + floor */}
        <rect x="0" y="0" width="1000" height="560" fill={APRON} />
        <rect x="30" y="30" width="940" height="500" fill={FLOOR} />
        {/* paint / keys */}
        <rect x="30" y="220" width="190" height="120" fill={PAINT} />
        <rect x="780" y="220" width="190" height="120" fill={PAINT} />

        <g fill="none" stroke={LINE} strokeWidth={LW}>
          {/* boundary + division line */}
          <rect x="30" y="30" width="940" height="500" />
          <line x1="500" y1="30" x2="500" y2="530" />
          <circle cx="500" cy="280" r="60" />

          {/* ---- LEFT end ---- */}
          <rect x="30" y="220" width="190" height="120" />
          <path d="M220,220 A60,60 0 0 1 220,340" />
          <path d="M220,220 A60,60 0 0 0 220,340" strokeDasharray="7 7" />
          <line x1="70" y1="250" x2="70" y2="310" />
          <circle cx="82.5" cy="280" r="7.5" />
          <path d="M82.5,250 A30,30 0 0 1 82.5,310" />
          <line x1="30" y1="90" x2="136" y2="90" />
          <line x1="30" y1="470" x2="136" y2="470" />
          <path d="M136,90 A197.5,197.5 0 0 1 136,470" />

          {/* ---- RIGHT end ---- */}
          <rect x="780" y="220" width="190" height="120" />
          <path d="M780,220 A60,60 0 0 0 780,340" />
          <path d="M780,220 A60,60 0 0 1 780,340" strokeDasharray="7 7" />
          <line x1="930" y1="250" x2="930" y2="310" />
          <circle cx="917.5" cy="280" r="7.5" />
          <path d="M917.5,250 A30,30 0 0 0 917.5,310" />
          <line x1="970" y1="90" x2="864" y2="90" />
          <line x1="970" y1="470" x2="864" y2="470" />
          <path d="M864,90 A197.5,197.5 0 0 0 864,470" />

          {/* lane hash ticks */}
          {[120, 150, 180].map((x) => (
            <g key={`lh${x}`}>
              <line x1={x} y1="216" x2={x} y2="220" />
              <line x1={x} y1="340" x2={x} y2="344" />
            </g>
          ))}
          {[820, 850, 880].map((x) => (
            <g key={`rh${x}`}>
              <line x1={x} y1="216" x2={x} y2="220" />
              <line x1={x} y1="340" x2={x} y2="344" />
            </g>
          ))}
          {/* sideline hash ticks near each FT line + center */}
          {[310, 690].map((x) => (
            <g key={`st${x}`}>
              <line x1={x} y1="30" x2={x} y2="40" />
              <line x1={x} y1="520" x2={x} y2="530" />
            </g>
          ))}
        </g>

        {/* center logo — Fighting Bishop (slightly transparent) */}
        <image href="/ves-bishop.png" x="440" y="192" width="120" height="176" preserveAspectRatio="xMidYMid meet" opacity="0.82" />

        {/* ---- shots ---- */}
        {leftDots.map((d, i) => (
          <Dot key={`l${i}`} {...d} color={greyColor} />
        ))}
        {rightDots.map((d, i) => (
          <Dot key={`r${i}`} {...d} color={garnetColor} />
        ))}
      </svg>

      {/* legend */}
      <div className="mt-3 flex items-center justify-center gap-8 flex-wrap text-sm">
        <LegendSide name={grey?.name ?? "Grey"} color={greyColor} align="right" />
        <div className="h-8 w-px bg-gray-300" />
        <LegendSide name={garnet?.name ?? "Garnet"} color={garnetColor} align="left" />
      </div>
    </div>
  );
}

function Dot({ cx, cy, made, color }: { cx: number; cy: number; made: boolean; color: string }) {
  return made ? (
    <circle cx={cx} cy={cy} r={5.5} fill={color} stroke="#fff" strokeWidth={1.3} />
  ) : (
    <circle cx={cx} cy={cy} r={5.5} fill="#fff" stroke={color} strokeWidth={2.6} />
  );
}

function LegendSide({ name, color, align }: { name: string; color: string; align: "left" | "right" }) {
  const label = (
    <span className="font-bold uppercase tracking-wide" style={{ color }}>
      {name}
    </span>
  );
  const marks = (
    <div className="flex items-center gap-4">
      <span className="inline-flex items-center gap-1.5">
        <svg width="16" height="16"><circle cx="8" cy="8" r="6" fill={color} stroke="#fff" strokeWidth="1.3" /></svg>
        Shot Made
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="#fff" stroke={color} strokeWidth="2.6" /></svg>
        Shot Missed
      </span>
    </div>
  );
  return (
    <div className="flex items-center gap-3">
      {align === "right" ? (
        <>
          {marks}
          {label}
        </>
      ) : (
        <>
          {label}
          {marks}
        </>
      )}
    </div>
  );
}
