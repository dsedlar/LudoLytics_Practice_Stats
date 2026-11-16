import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getProfiles, setProfileRole, setProfilePlayer, sendPasswordReset, getPlayers, type ProfileRow, type PlayerRow } from "../lib/db";
import { isSupabaseConfigured } from "../lib/supabase";
import type { Role } from "../lib/auth";

const ROLES: Role[] = ["admin", "coach", "manager", "player"];
const ROLE_NOTE: Record<Role, string> = {
  admin: "Everything + manage users & roster",
  coach: "See & edit all stats",
  manager: "Read-only; enters one squad during practice",
  player: "Their own page only",
};

export default function Users() {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function load() {
    const [ps, pl] = await Promise.all([getProfiles(), getPlayers()]);
    setProfiles(ps);
    setPlayers(pl);
  }
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Connect Supabase to manage users.");
      return;
    }
    load().catch((e) => setError((e as Error).message));
  }, []);

  async function run(fn: () => Promise<void>, msg?: string) {
    setError("");
    try {
      await fn();
      await load();
      if (msg) { setFlash(msg); setTimeout(() => setFlash(""), 2500); }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !profiles) return <p className="text-red-600">{error}</p>;
  if (!profiles) return <p className="text-gray-500">Loading users…</p>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl headline-bold text-garnet">Users</h1>
        <Link to="/settings" className="text-sm text-garnet font-medium">← Settings</Link>
      </div>
      <p className="mt-1 text-gray-600 text-sm">
        Set each person's role, link player accounts to a roster player, and send password-reset emails.
        New accounts are created in the Supabase dashboard (Authentication → Users); they appear here automatically.
      </p>
      {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
      {flash && <p className="mt-2 text-green-600 text-sm font-medium">{flash}</p>}

      <div className="mt-4 bg-white border rounded-lg overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Linked player</th>
              <th className="p-3">Password</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b last:border-0 align-middle">
                <td className="p-3 whitespace-nowrap font-medium">{p.email ?? "—"}</td>
                <td className="p-3">
                  <select
                    value={p.role}
                    onChange={(e) => run(() => setProfileRole(p.id, e.target.value as Role))}
                    className="border rounded px-2 py-1"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-gray-400 mt-0.5">{ROLE_NOTE[p.role]}</div>
                </td>
                <td className="p-3">
                  {p.role === "player" ? (
                    <select
                      value={p.player_id ?? ""}
                      onChange={(e) => run(() => setProfilePlayer(p.id, e.target.value || null))}
                      className="border rounded px-2 py-1 min-w-44"
                    >
                      <option value="">— pick player —</option>
                      {players.map((pl) => (
                        <option key={pl.id} value={pl.id}>{pl.jersey ? `#${pl.jersey} ` : ""}{pl.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="p-3">
                  <button
                    onClick={() => p.email && run(() => sendPasswordReset(p.email as string), `Reset email sent to ${p.email}`)}
                    disabled={!p.email}
                    className="text-sm border rounded px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Send reset email
                  </button>
                </td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-gray-400">No users yet. Add accounts in the Supabase dashboard.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
