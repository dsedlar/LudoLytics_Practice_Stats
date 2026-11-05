import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import type { ReactNode } from "react";

// Gate a route behind sign-in. Reads stay public; only write screens use this.
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (!isSupabaseConfigured) return <>{children}</>; // local dev without Supabase
  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  return <>{children}</>;
}
