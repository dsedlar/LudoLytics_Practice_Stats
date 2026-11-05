import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSupabaseConfigured } from "../lib/supabase";
import type { ReactNode } from "react";

// Gate a route behind admin access. Requires sign-in first, then admin.
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (!isSupabaseConfigured) return <>{children}</>; // local dev without Supabase
  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (!isAdmin) return <Navigate to="/" replace />; // non-admins bounced home
  return <>{children}</>;
}
