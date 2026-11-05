import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { usePracticeData } from "../lib/usePracticeData";
import { buildReport } from "../lib/reportData";
import ReportView from "../components/ReportView";

export default function Report() {
  const { id = "" } = useParams();
  const { bundle, events, drills, error, loading } = usePracticeData(id);
  const model = useMemo(
    () => (bundle ? buildReport(bundle, events, drills) : null),
    [bundle, events, drills],
  );

  if (loading) return <p className="text-gray-500">Loading report…</p>;
  if (error) return <p className="text-red-600">Error: {error}</p>;
  if (!model) return <p className="text-red-600">Practice not found.</p>;

  return (
    <div>
      <div className="no-print mb-3 flex items-center gap-3">
        <button onClick={() => window.print()} className="bg-garnet text-white px-5 py-2 rounded-lg font-semibold">
          Save as PDF
        </button>
        <span className="text-sm text-gray-500">Print → Destination “Save as PDF”, Layout “Landscape”.</span>
      </div>
      <div className="report-wrap overflow-x-auto">
        <ReportView m={model} />
      </div>
    </div>
  );
}
