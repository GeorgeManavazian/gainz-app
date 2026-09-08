"use client";
import { useEffect, useState } from "react";
import { manualItem, type PatternItem } from "@/lib/patterns";

export default function MacroSheet({ onAdd, onClose }: { onAdd: (item: PatternItem) => void; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [v, setV] = useState({ kcal: "", protein: "", carbs: "", fat: "" });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const num = (s: string) => Math.max(0, parseFloat(s) || 0);
  const canAdd = label.trim().length > 0 && num(v.kcal) > 0;
  const field = (key: keyof typeof v, name: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{name}</span>
      <input inputMode="decimal" placeholder="0" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-bold tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
    </label>
  );
  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="macro-sheet-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 id="macro-sheet-title" className="text-2xl font-bold">Add macros</h2>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Protein shake" autoFocus
          className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {field("kcal", "kcal")}{field("protein", "P")}{field("carbs", "C")}{field("fat", "F")}
        </div>
        <p className="mt-2 text-[12px] text-muted">One serving. You can log 1.5 or 2 servings later.</p>
        <button type="button" disabled={!canAdd}
          onClick={() => onAdd(manualItem(label, { kcal: num(v.kcal), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) }))}
          className="mt-4 w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-sm text-accent">Cancel</button>
      </div>
    </>
  );
}
