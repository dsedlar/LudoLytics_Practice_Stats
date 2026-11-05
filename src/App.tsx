import { Link, Route, Routes } from "react-router-dom";
import { isSupabaseConfigured } from "./lib/supabase";
import { useAuth } from "./lib/auth";
import RequireAuth from "./components/RequireAuth";
import RequireAdmin from "./components/RequireAdmin";
import Login from "./screens/Login";
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
import PlayerDashboard from "./screens/PlayerDashboard";
import PlayerDashboardDemo from "./screens/PlayerDashboardDemo";
import LiveEntryDemo from "./screens/LiveEntryDemo";
import CoachEntryDemo from "./screens/CoachEntryDemo";
import History from "./screens/History";
import HistoryDemo from "./screens/HistoryDemo";
import Signage from "./screens/Signage";
import SignageDemo from "./screens/SignageDemo";
import Roster from "./screens/Roster";
import RosterDemo from "./screens/RosterDemo";
import Settings from "./screens/Settings";

export default function App() {
  const { user, isAdmin, signOut } = useAuth();
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
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="eyebrow text-[10px] text-ivory/70 hidden sm:inline">{user.email}</span>
                {isAdmin && <Link
                  to="/settings"
                  title="Settings"
                  aria-label="Settings"
                  className="text-ivory/80 hover:text-white rounded p-1.5 hover:bg-white/15"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </Link>}
                <button onClick={() => signOut()} className="text-xs bg-white/15 hover:bg-white/25 rounded px-3 py-1.5 font-medium">Sign out</button>
              </>
            ) : (
              <Link to="/login" className="text-xs bg-white/15 hover:bg-white/25 rounded px-3 py-1.5 font-medium">Coach sign in</Link>
            )}
          </div>
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
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<RequireAuth><Setup /></RequireAuth>} />
          <Route path="/practice/:id/coach" element={<RequireAuth><Coach /></RequireAuth>} />
          <Route path="/practice/:id/entry" element={<RequireAuth><CoachEntry /></RequireAuth>} />
          <Route path="/practice/:id/squad/:squadId" element={<RequireAuth><LiveEntry /></RequireAuth>} />
          <Route path="/practice/:id/report" element={<RequireAuth><Report /></RequireAuth>} />
          <Route path="/report-demo" element={<ReportDemo />} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/dashboard-demo" element={<DashboardDemo />} />
          <Route path="/player/:playerId" element={<RequireAuth><PlayerDashboard /></RequireAuth>} />
          <Route path="/player-demo/:playerId" element={<PlayerDashboardDemo />} />
          <Route path="/court-demo" element={<CourtDemo />} />
          <Route path="/live-demo" element={<LiveEntryDemo />} />
          <Route path="/coach-entry-demo" element={<CoachEntryDemo />} />
          <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/history-demo" element={<HistoryDemo />} />
          <Route path="/display" element={<RequireAuth><Signage /></RequireAuth>} />
          <Route path="/display-demo" element={<SignageDemo />} />
          <Route path="/roster" element={<RequireAuth><Roster /></RequireAuth>} />
          <Route path="/roster-demo" element={<RosterDemo />} />
          <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
        </Routes>
      </main>
    </div>
  );
}
