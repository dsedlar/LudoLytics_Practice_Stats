import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "admin" | "coach" | "manager" | "player";

// Fallback admin check used only before migration 009 has run (no profiles yet).
// Add more addresses here (lowercase) to grant admin access during setup.
export const ADMIN_EMAILS = ["dsedlar@ves.org"];
export const isAdminEmail = (email: string | null | undefined): boolean =>
  !!email && ADMIN_EMAILS.includes(email.trim().toLowerCase());

interface AuthCtx {
  user: User | null;
  loading: boolean;
  role: Role;
  playerId: string | null; // for player accounts: which roster player they are
  isAdmin: boolean;
  isCoach: boolean; // admin or coach — full edit access
  isManager: boolean;
  isPlayer: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  role: "coach",
  playerId: null,
  isAdmin: false,
  isCoach: true,
  isManager: false,
  isPlayer: false,
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("coach");
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the signed-in user's role from `profiles`. If the table/row isn't there
  // yet (migration 009 not run), fall back to the email allowlist so the app and
  // admin access keep working during setup.
  useEffect(() => {
    let cancelled = false;
    if (!supabase || !user) {
      setRole("coach");
      setPlayerId(null);
      return;
    }
    supabase
      .from("profiles")
      .select("role, player_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setRole(isAdminEmail(user.email) ? "admin" : "coach");
          setPlayerId(null);
          return;
        }
        setRole((data.role as Role) ?? (isAdminEmail(user.email) ? "admin" : "coach"));
        setPlayerId((data as { player_id: string | null }).player_id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  };
  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  const isAdmin = role === "admin";
  const value: AuthCtx = {
    user,
    loading,
    role,
    playerId,
    isAdmin,
    isCoach: role === "admin" || role === "coach",
    isManager: role === "manager",
    isPlayer: role === "player",
    signIn,
    signOut,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
