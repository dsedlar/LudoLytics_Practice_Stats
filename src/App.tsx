import { Link, Route, Routes } from "react-router-dom";
import { isSupabaseConfigured } from "./lib/supabase";
import Home from "./screens/Home";
import Setup from "./screens/Setup";
import Coach from "./screens/Coach";
import CoachEntry from "./screens/CoachEntry";
import LiveEntry from "./screens/LiveEntry";
import Report from "./screens/Report";
import ReportDemo from "./screens/ReportDemo";
import Dashboard from "./screens/Dashboard";
import DashboardDemo from "./screens/DashboardDemo";
import CourtDemo from "./screens/CourtDemo";
import LiveEntryDemo from "./screens/LiveEntryDemo";
import CoachEntryDemo from "./screens/CoachEntryDemo";
import History from "./screens/History";
import HistoryDemo from "./screens/HistoryDemo";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-deep-garnet text-ivory no-print">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/ves-shield.png" alt="VES" className="h-7 w-auto" />
            <span className="sport-lockup text-lg">
              VES Basketball · <span className="text-white/70">Ludolytics</span>
            </span>
          </Link>
          <span className="eyebrow text-[10px] text-ivory/70">Practice Stats</span>
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="bg-amber-100 text-amber-900 text-sm px-4 py-2 text-center no-print">
          Supabase is not configured yet — copy <code>.env.example</code> to{" "}
          <code>.env</code> and add your project keys to enable saving & live sync.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/practice/:id/coach" element={<Coach />} />
          <Route path="/practice/:id/entry" element={<CoachEntry />} />
          <Route path="/practice/:id/squad/:squadId" element={<LiveEntry />} />
          <Route path="/practice/:id/report" element={<Report />} />
          <Route path="/report-demo" element={<ReportDemo />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard-demo" element={<DashboardDemo />} />
          <Route path="/court-demo" element={<CourtDemo />} />
          <Route path="/live-demo" element={<LiveEntryDemo />} />
          <Route path="/coach-entry-demo" element={<CoachEntryDemo />} />
          <Route path="/history" element={<History />} />
          <Route path="/history-demo" element={<HistoryDemo />} />
        </Routes>
      </main>
    </div>
  );
}
