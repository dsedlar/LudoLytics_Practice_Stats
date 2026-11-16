import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import type { ReactNode } from "react";

// Gate a route so players can't reach it — they only ever see their own page.
// Coaches, managers, and admins pass through.
export default function RequireNotPlayer({ children }: { children: ReactNode }) {
  const { user, loading, isPlayer, playerId } = useAuth();
  const loc = useLocation();
  if (!isSupabaseConfigured) return <>{children}</>; // local dev without Supabase
  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (isPlayer) return <Navigate to={playerId ? `/player/${playerId}` : "/"} replace />;
  return <>{children}</>;
}
