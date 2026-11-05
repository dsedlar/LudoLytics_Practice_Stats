import { Link, Route, Routes } from "react-router-dom";
import { isSupabaseConfigured } from "./lib/supabase";
import Home from "./screens/Home";
import Setup from "./screens/Setup";
import Coach from "./screens/Coach";
import LiveEntry from "./screens/LiveEntry";
import Report from "./screens/Report";
import ReportDemo from "./screens/ReportDemo";
import Dashboard from "./screens/Dashboard";
import DashboardDemo from "./screens/DashboardDemo";

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="bg-garnet text-white no-print">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-black tracking-wide">
            VES BASKETBALL · <span className="font-light">LUDOLYTICS</span>
          </Link>
          <span className="text-xs opacity-80">Practice Stats</span>
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
          <Route path="/practice/:id/squad/:squadId" element={<LiveEntry />} />
          <Route path="/practice/:id/report" element={<Report />} />
          <Route path="/report-demo" element={<ReportDemo />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard-demo" element={<DashboardDemo />} />
        </Routes>
      </main>
    </div>
  );
}
