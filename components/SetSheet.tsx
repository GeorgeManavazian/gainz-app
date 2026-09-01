// components/SetSheet.tsx
"use client";
import { useEffect, useState } from "react";
import Wheel, { range } from "@/components/Wheel";
import { muscleShort, type MuscleGroup } from "@/lib/exercises";
import { formatSession, localDateOf, type LiftRow } from "@/lib/workouts";

export type SheetState = { sets: number; reps: number; weight: number };

export const SETS = range(1, 10);
export const REPS = range(1, 30);
export const WEIGHT = range(0, 500, 2.5);

function shortDate(iso: string): string {
  const [y, m, d] = localDateOf(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SetSheet({ exercise, muscle, previous, logged, state, onState, onAdd, onClose }: {
  exercise: string; muscle?: MuscleGroup; previous: LiftRow[]; logged: LiftRow[];
  state: SheetState; onState: (s: SheetState) => void; onAdd: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
            <p className="text-sm text-muted">
              {previous.length ? `Last: ${formatSession(previous)} · ${shortDate(previous[0].logged_at)}` : "First time"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-1.5 text-sm text-muted">Close</button>
        </div>

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
              {logged.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>
                  <span className="flex-1 text-base tabular-nums">{r.weight} × {r.reps}{r.sets > 1 ? ` ×${r.sets}` : ""}</span>
                  <span className="text-accent">✓</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
