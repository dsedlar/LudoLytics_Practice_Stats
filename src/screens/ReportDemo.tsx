import { useMemo, useState } from "react";
import { makeDemoData } from "../lib/demo";
import { buildReport } from "../lib/reportData";
import ReportView from "../components/ReportView";
import ShotChartView from "../components/ShotChartView";

// Preview the report layout with synthetic data (no database needed).
export default function ReportDemo() {
  const { model, bundle, events } = useMemo(() => {
    const { bundle, events, drills } = makeDemoData();
    return { model: buildReport(bundle, events, drills), bundle, events };
  }, []);
  const [view, setView] = useState<"box" | "chart">("box");
  const tab = (active: boolean) => `px-4 py-2 rounded-lg font-semibold text-sm ${active ? "bg-garnet text-white" : "border text-gray-700"}`;

  return (
    <div>
      <div className="no-print mb-3 flex gap-2">
        <button onClick={() => setView("box")} className={tab(view === "box")}>Box Score</button>
        <button onClick={() => setView("chart")} className={tab(view === "chart")}>Shot Chart</button>
      </div>
      <div className="report-wrap overflow-x-auto">
        {view === "box" ? (
          <ReportView m={model} />
        ) : (
          <ShotChartView
            squads={bundle.squads}
            events={events}
            roster={bundle.roster}
            date={bundle.practice.practice_date}
            startTime={bundle.practice.start_time}
          />
        )}
      </div>
    </div>
  );
}
