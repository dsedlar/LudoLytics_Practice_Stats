import { useMemo } from "react";
import { makeDemoData } from "../lib/demo";
import { buildReport } from "../lib/reportData";
import ReportView from "../components/ReportView";

// Preview the report layout with synthetic data (no database needed).
export default function ReportDemo() {
  const model = useMemo(() => {
    const { bundle, events, drills } = makeDemoData();
    return buildReport(bundle, events, drills);
  }, []);
  return (
    <div className="report-wrap overflow-x-auto">
      <ReportView m={model} />
    </div>
  );
}
