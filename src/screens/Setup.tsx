import { useRef, useState } from "react";
import { parsePlanFile } from "../lib/parsePracticePlan";
import { DEFAULT_SQUADS } from "../lib/config";
import { isSupabaseConfigured } from "../lib/supabase";
import { createPracticeFromDraft, toISODate } from "../lib/db";
import type { DraftPlayer, PracticeDraft } from "../lib/types";

function blankDraft(): PracticeDraft {
  return {
    dateISO: new Date().toISOString().slice(0, 10),
    squads: [
      { name: DEFAULT_SQUADS[0].name, color: DEFAULT_SQUADS[0].color },
      { name: DEFAULT_SQUADS[1].name, color: DEFAULT_SQUADS[1].color },
    ],
    players: [],
  };
}

export default function Setup() {
  const [draft, setDraft] = useState<PracticeDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const plan = await parsePlanFile(file);
      const players: DraftPlayer[] = [];
      plan.squads.forEach((sq, i) => {
        sq.players.forEach((p) =>
          players.push({ jersey: p.jersey, name: p.name, squad: (i === 0 ? 0 : 1) as 0 | 1, present: true }),
        );
      });
      // roster players not already placed on a squad -> "not practicing" bucket
      plan.roster.forEach((p) => {
        if (!players.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) {
          players.push({ jersey: p.jersey, name: p.name, squad: -1, present: true });
        }
      });
      setDraft({
        dateISO: toISODate(plan.date),
        startTime: plan.time,
        squads: [
          { name: plan.squads[0]?.name || DEFAULT_SQUADS[0].name, color: DEFAULT_SQUADS[0].color },
          { name: plan.squads[1]?.name || DEFAULT_SQUADS[1].name, color: DEFAULT_SQUADS[1].color },
        ],
        players,
      });
      setWarnings(plan.warnings);
    } catch (err) {
      setError(`Could not read that file: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function update(mut: (d: PracticeDraft) => void) {
    setDraft((d) => {
      if (!d) return d;
      const copy: PracticeDraft = structuredClone(d);
      mut(copy);
      return copy;
    });
  }

  async function startPractice() {
    if (!draft) return;
    if (!isSupabaseConfigured) {
      setError("Connect Supabase (.env) to save and start a practice.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createPracticeFromDraft(draft);
      setSaved(id);
    } catch (err) {
      setError(`Could not start practice: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // ---- render -----------------------------------------------------------
  if (saved) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-bold text-green-700">Practice started ✓</h2>
        <p className="mt-2 text-gray-600">
          Practice saved (id <code>{saved}</code>). Live entry & coach view land next.
        </p>
      </div>
    );
  }

  if (!draft) {
    return (
      <div>
        <h1 className="text-2xl font-black text-garnet">Set up practice</h1>
        <p className="mt-2 text-gray-600">Upload today's practice-plan Word doc to auto-fill the squads, or start from scratch.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <input ref={fileInput} type="file" accept=".docx" className="hidden" onChange={onFile} />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="bg-garnet text-white px-5 py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {busy ? "Reading…" : "Upload practice plan (.docx)"}
          </button>
          <button onClick={() => setDraft(blankDraft())} className="border px-5 py-3 rounded-lg font-semibold">
            Start blank
          </button>
        </div>
        {error && <p className="mt-4 text-red-600">{error}</p>}
      </div>
    );
  }

  const squadBuckets: DraftPlayer[][] = [[], [], []]; // A, B, Out
  draft.players.forEach((p) => squadBuckets[p.squad === -1 ? 2 : p.squad].push(p));

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-black text-garnet">Confirm practice</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Date</label>
          <input
            type="date"
            value={draft.dateISO}
            onChange={(e) => update((d) => (d.dateISO = e.target.value))}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="mt-3 bg-amber-100 text-amber-900 text-sm rounded px-3 py-2">
          {warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}

      <div className="mt-5 grid md:grid-cols-3 gap-4">
        {[0, 1, 2].map((bucket) => (
          <div key={bucket} className="bg-white border rounded-lg p-3">
            {bucket < 2 ? (
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="color"
                  value={draft.squads[bucket].color}
                  onChange={(e) => update((d) => (d.squads[bucket].color = e.target.value))}
                  className="w-7 h-7 rounded border"
                />
                <input
                  value={draft.squads[bucket].name}
                  onChange={(e) => update((d) => (d.squads[bucket].name = e.target.value))}
                  className="font-bold text-lg border-b flex-1 outline-none"
                />
              </div>
            ) : (
              <h3 className="font-bold text-gray-500 mb-2">Not practicing</h3>
            )}

            <div className="space-y-1">
              {squadBuckets[bucket].map((p) => {
                const idx = draft.players.indexOf(p);
                return (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <input
                      value={p.jersey}
                      onChange={(e) => update((d) => (d.players[idx].jersey = e.target.value))}
                      className="w-10 border rounded px-1 text-center"
                      placeholder="#"
                    />
                    <input
                      value={p.name}
                      onChange={(e) => update((d) => (d.players[idx].name = e.target.value))}
                      className="flex-1 border rounded px-2 py-1"
                    />
                    <select
                      value={p.squad}
                      onChange={(e) => update((d) => (d.players[idx].squad = Number(e.target.value) as 0 | 1 | -1))}
                      className="border rounded px-1 py-1"
                      title="Assign squad"
                    >
                      <option value={0}>{draft.squads[0].name}</option>
                      <option value={1}>{draft.squads[1].name}</option>
                      <option value={-1}>Out</option>
                    </select>
                    <button
                      onClick={() => update((d) => d.players.splice(idx, 1))}
                      className="text-gray-400 hover:text-red-600 px-1"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {bucket < 2 && (
              <button
                onClick={() =>
                  update((d) => d.players.push({ jersey: "", name: "", squad: bucket as 0 | 1, present: true }))
                }
                className="mt-2 text-sm text-garnet font-medium"
              >
                + Add player
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={startPractice}
          disabled={busy}
          className="bg-garnet text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start practice"}
        </button>
        <button onClick={() => setDraft(null)} className="text-gray-500">
          Start over
        </button>
      </div>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {!isSupabaseConfigured && (
        <p className="mt-2 text-sm text-amber-700">
          Preview mode — importing & editing work; saving turns on once Supabase is connected.
        </p>
      )}
    </div>
  );
}
