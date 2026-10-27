// components/SetSheet.tsx
"use client";
import { useEffect, useState } from "react";
import Wheel, { range } from "@/components/Wheel";
import { muscleShort, type MuscleGroup } from "@/lib/exercises";
import { isPr, suggestionLabel, type Suggestion } from "@/lib/progression";
import { formatSession, localDateOf, type LiftRow } from "@/lib/workouts";

export type SheetState = { sets: number; reps: number; weight: number };

export const SETS = range(1, 10);
export const REPS = range(1, 30);
export const WEIGHT = range(0, 500, 2.5);

function shortDate(iso: string): string {
  const [y, m, d] = localDateOf(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SetSheet({ exercise, muscle, previous, logged, history, best, suggestion, state, onState, onAdd, onDelete, onClose }: {
  exercise: string; muscle?: MuscleGroup; previous: LiftRow[]; logged: LiftRow[]; history: LiftRow[]; best: LiftRow | null; suggestion: Suggestion | null;
  state: SheetState; onState: (s: SheetState) => void; onAdd: () => Promise<void>; onDelete: (id: string) => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Parent passes a fresh filtered array every render, so key on the row ids, not the array identity.
  const loggedKey = logged.map((r) => r.id).join(",");
  useEffect(() => { setConfirmId(null); }, [loggedKey]);

  async function remove(rid: string) {
    if (deletingId) return;
    setDeletingId(rid); setErr("");
    try { await onDelete(rid); } catch { setErr("Couldn't delete. Please try again."); } finally { setDeletingId(null); setConfirmId(null); }
  }

  async function add() {
    if (busy) return;
    setBusy(true); setErr("");
    try { await onAdd(); } catch { setErr("Couldn't save. Please try again."); } finally { setBusy(false); }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="set-sheet-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
            {muscleShort(muscle)}
          </span>
          <div className="flex-1">
            <h2 id="set-sheet-title" className="text-[22px] font-bold leading-tight">{exercise}</h2>
            {(previous.length > 0 || !best) && (
              <p className="text-sm text-muted">
                {previous.length ? `Last: ${formatSession(previous)} · ${shortDate(previous[0].logged_at)}` : "First time"}
              </p>
            )}
            {best && <p className="text-sm text-muted">Best: <span className="font-semibold text-accent">{best.weight}×{best.reps}</span> · {shortDate(best.logged_at)}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-1.5 text-sm text-muted">Close</button>
        </div>

        {suggestion && (
          <div className="mt-3 flex">
            <button type="button" onClick={() => onState({ ...state, weight: suggestion.weight })}
              aria-pressed={state.weight === suggestion.weight}
              className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                state.weight === suggestion.weight ? "bg-accent/20 text-accent" : "border border-border text-muted active:text-foreground"}`}>
              {suggestionLabel(suggestion)}
            </button>
          </div>
        )}

        <div className="mt-4 flex items-end justify-center gap-1">
          <Wheel label="Sets" values={SETS} value={state.sets} onChange={(v) => onState({ ...state, sets: v })} />
          <span className="pb-16 text-xl text-muted">×</span>
          <Wheel label="Reps" values={REPS} value={state.reps} onChange={(v) => onState({ ...state, reps: v })} />
          <span className="pb-16 text-xl text-muted">×</span>
          <Wheel label="Lbs" values={WEIGHT} value={state.weight} onChange={(v) => onState({ ...state, weight: v })} />
        </div>

        <button type="button" onClick={add} disabled={busy}
          className="mt-4 w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80 disabled:opacity-60">
          Add set
        </button>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}

        {logged.length > 0 && (
          <section className="mt-4 flex flex-col gap-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">Sets logged this workout</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
              {logged.map((r, i) => {
                const pr = isPr(r, [...history, ...logged.slice(0, i)]);
                return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>
                  <span className="flex-1 text-base tabular-nums">{r.weight} × {r.reps}{r.sets > 1 ? ` ×${r.sets}` : ""}</span>
                  {pr && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">PR</span>}
                  {confirmId === r.id ? (
                    <button type="button" onClick={() => remove(r.id)} disabled={deletingId === r.id}
                      className="rounded-md bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger active:opacity-80 disabled:opacity-60">
                      Delete?
                    </button>
                  ) : (
                    <button type="button" aria-label="Remove set" onClick={() => setConfirmId(r.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted active:bg-surface-2">
                      ✕
                    </button>
                  )}
                </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
