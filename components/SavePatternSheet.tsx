// components/SavePatternSheet.tsx
"use client";
import { useEffect, useState } from "react";
import { createPattern } from "@/lib/patterns-db";
import { itemsFromMeals, type MealLike } from "@/lib/patterns";

type Meal = MealLike & { id: string };

export default function SavePatternSheet({ meals, onSaved, onClose }: {
  meals: Meal[]; onSaved: () => void; onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(meals.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = name.trim().length > 0 && picked.size > 0 && !busy && !offline;

  async function save() {
    if (!canSave) return;
    setBusy(true); setErr("");
    try {
      await createPattern(name, itemsFromMeals(meals.filter((m) => picked.has(m.id))));
      onSaved();
    } catch { setErr("Couldn't save. Try again."); setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="save-pattern-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 id="save-pattern-title" className="text-2xl font-bold">Save as meal</h2>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakfast" autoFocus
          className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
        <p className="mt-4 text-[11px] font-medium uppercase tracking-wider text-muted">Today&apos;s foods</p>
        <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
          {meals.map((m) => {
            const on = picked.has(m.id);
            return (
              <li key={m.id}>
                <button type="button" role="checkbox" aria-checked={on}
                  onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(m.id); else n.add(m.id); return n; })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                    on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`} aria-hidden>{on ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{m.food_name}</span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">{m.grams} g · {Math.round(Number(m.calories))} kcal</span>
                </button>
              </li>
            );
          })}
        </ul>
        {offline && <p className="mt-3 text-sm text-muted">You&apos;re offline — saving a meal needs a connection.</p>}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <button type="button" onClick={save} disabled={!canSave}
          className="mt-4 w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-accent">Cancel</button>
      </div>
    </>
  );
}
