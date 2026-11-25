import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const labelCls = "block text-[11px] font-semibold tracking-[0.18em] uppercase text-gray-500 mb-1.5";
  const inputCls = "w-full border rounded px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy/30";

  return (
    <div className="max-w-md mx-auto mt-12 sm:mt-16">
      <form onSubmit={submit} className="bg-white border rounded-lg p-7 sm:p-9">
        <img src="/ludolytics-logo.svg" alt="Ludolytics" className="h-9 w-auto mx-auto mb-6" />
        <h1 className="headline-bold text-2xl uppercase tracking-wide" style={{ color: "#00142D" }}>Coaches / Managers Sign in</h1>
        <p className="mt-2 text-sm text-gray-500">VES Basketball — private. Accounts are created by the program.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="username" />
          </div>
          <div>
            <label className={labelCls}>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} autoComplete="current-password" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={busy} className="w-full bg-navy text-white rounded-lg py-3 font-semibold tracking-[0.12em] uppercase disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
