import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import type { ReactNode } from "react";

// Gate a route to coaches (and admins). Managers/players are bounced home —
// they don't run practices, edit the roster, or manage history.
export default function RequireCoach({ children }: { children: ReactNode }) {
  const { user, loading, isCoach } = useAuth();
  const loc = useLocation();
  if (!isSupabaseConfigured) return <>{children}</>; // local dev without Supabase
  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!isCoach) return <Navigate to="/" replace />;
  return <>{children}</>;
}
