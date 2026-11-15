import { useMemo, useState } from "react";
import { makeSeasonDemo } from "../lib/demo";
import { buildWeekly } from "../lib/weeklyReport";
import WeeklyReportView from "../components/WeeklyReportView";
import { Controls } from "./Weekly";

// The season demo runs 2025-11-04 .. 2025-11-14; default to the second half so
// there's a prior period to compare against.
export default function WeeklyDemo() {
  const data = useMemo(() => makeSeasonDemo(), []);
  const [start, setStart] = useState("2025-11-10");
  const [end, setEnd] = useState("2025-11-15");
  const model = useMemo(() => buildWeekly(data, start, end), [data, start, end]);
  const setThisWeek = () => { setStart("2025-11-10"); setEnd("2025-11-15"); };
  const setLastWeek = () => { setStart("2025-11-03"); setEnd("2025-11-08"); };
  return (
    <div>
      <Controls start={start} end={end} setStart={setStart} setEnd={setEnd} onThisWeek={setThisWeek} onLastWeek={setLastWeek} back="/dashboard-demo" />
      <div className="report-wrap overflow-x-auto">
        <WeeklyReportView m={model} />
      </div>
    </div>
  );
}
