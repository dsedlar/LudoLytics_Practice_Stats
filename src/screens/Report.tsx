import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { buildReport } from "../lib/reportData";
import ReportView from "../components/ReportView";
import ShotChartView from "../components/ShotChartView";

export default function Report() {
  const { id = "" } = useParams();
  const { bundle, events, drills, error, loading } = usePracticeData(id);
  const [view, setView] = useState<"box" | "chart">("box");
  const model = useMemo(
    () => (bundle ? buildReport(bundle, events, drills) : null),
    [bundle, events, drills],
  );

  if (loading) return <p className="text-gray-500">Loading report…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!model || !bundle) return <p className="text-red-600">Practice not found.</p>;

  const tab = (active: boolean) =>
    `px-4 py-2 rounded-lg font-semibold text-sm ${active ? "bg-garnet text-white" : "border text-gray-700"}`;

  return (
    <div>
      <div className="no-print mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2">
          <button onClick={() => setView("box")} className={tab(view === "box")}>Box Score</button>
          <button onClick={() => setView("chart")} className={tab(view === "chart")}>Shot Chart</button>
        </div>
        <button onClick={() => window.print()} className="bg-navy text-white px-5 py-2 rounded-lg font-semibold">
          Save as PDF
        </button>
      </div>
      <div className="report-wrap overflow-x-auto">
        {view === "box" ? <ReportView m={model} /> : <ShotChartView squads={bundle.squads} events={events} />}
      </div>
    </div>
  );
}
