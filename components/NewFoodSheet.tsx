// components/NewFoodSheet.tsx
"use client";
import { useEffect, useState } from "react";
import { per100g, type ParsedLabel } from "@/lib/label-parse";
import type { CustomFoodRow } from "@/lib/custom-foods";

const FIELD = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-bold tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none";
const LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted";

/** Confirm/edit what the label scan read, then save it as a custom food (stored per 100 g). */
export default function NewFoodSheet({ parsed, onSave, onClose }: {
  parsed: ParsedLabel | null;
  onSave: (food: Omit<CustomFoodRow, "id">) => Promise<void>;
  onClose: () => void;
}) {
  const s = (v: number | null) => (v === null ? "" : String(v));
  const [name, setName] = useState("");
  const [serving, setServing] = useState(s(parsed?.servingG ?? null));
  const [v, setV] = useState({ kcal: s(parsed?.kcal ?? null), protein: s(parsed?.protein ?? null), carbs: s(parsed?.carbs ?? null), fat: s(parsed?.fat ?? null) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const num = (x: string) => Math.max(0, parseFloat(x) || 0);
  const servingG = num(serving);
  const perServing = { kcal: num(v.kcal), protein: num(v.protein), carbs: num(v.carbs), fat: num(v.fat) };
  const p100 = servingG > 0 ? per100g(perServing, servingG) : null;
  const canSave = !busy && name.trim().length > 0 && servingG > 0 && perServing.kcal > 0;
  const weak = parsed !== null && parsed.found < 2;

  async function save() {
    if (!canSave || !p100) return;
    setBusy(true); setErr("");
    try {
      await onSave({ name: name.trim(), serving_g: servingG, kcal: p100.kcal, protein_g: p100.protein, carbs_g: p100.carbs, fat_g: p100.fat });
    } catch (e) {
      setErr(e instanceof Error && /duplicate|23505|already/i.test(e.message) ? "You already have a food with that name." : "Couldn't save. Please try again.");
      setBusy(false);
    }
  }

  const field = (key: keyof typeof v, label: string) => (
    <label className="flex flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <input inputMode="decimal" placeholder="0" value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} className={FIELD} />
    </label>
  );

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="new-food-title"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <h2 id="new-food-title" className="text-2xl font-bold">New food</h2>
        {weak && <p className="mt-1 text-[12px] text-accent">Couldn&apos;t read much from the photo — check the numbers.</p>}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Oikos Triple Zero" autoFocus aria-label="Food name"
          className="mt-3 w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
        <label className="mt-3 flex flex-col gap-1">
          <span className={LABEL}>Serving size (g){parsed?.servingText ? ` · label says ${parsed.servingText}` : ""}</span>
          <input inputMode="decimal" placeholder="e.g. 55" value={serving} onChange={(e) => setServing(e.target.value)} className={FIELD} />
        </label>
        <p className={`mt-3 ${LABEL}`}>Per serving</p>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {field("kcal", "kcal")}{field("protein", "P")}{field("carbs", "C")}{field("fat", "F")}
        </div>
        <p className="mt-2 text-[12px] tabular-nums text-muted">
          {p100 ? `Per 100 g: ${p100.kcal} kcal · ${p100.protein} P · ${p100.carbs} C · ${p100.fat} F` : "Enter the serving size to see per 100 g."}
        </p>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <button type="button" disabled={!canSave} onClick={save}
          className="mt-4 w-full rounded-2xl bg-accent px-4 py-4 text-lg font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40">
          {busy ? "Saving…" : "Save food"}
        </button>
      </div>
    </>
  );
}
