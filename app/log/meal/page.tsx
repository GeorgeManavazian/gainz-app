"use client";
import { useEffect, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { logMeal } from "@/lib/log";

type Food = { fdcId: number; description: string;
  per100g: { kcal: number; protein: number; carbs: number; fat: number } };

export default function LogMeal() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState("");
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.foods);
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const g = parseFloat(grams) || 0;
  const scale = (v: number) => Math.round(v * g / 100 * 10) / 10;

  async function save() {
    if (!picked || g <= 0) return;
    await logMeal({
      food_name: picked.description, grams: g,
      calories: scale(picked.per100g.kcal), protein_g: scale(picked.per100g.protein),
      carbs_g: scale(picked.per100g.carbs), fat_g: scale(picked.per100g.fat),
      fdc_id: String(picked.fdcId),
    });
    setPicked(null); setQ(""); setGrams(""); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Log meal</h1>
        {saved && (
          <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
            Logged ✓
          </p>
        )}
        {!picked ? (
          <>
            <input
              className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              placeholder="Search food…"
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {results.map((f) => (
                <li key={f.fdcId}>
                  <button className="w-full px-4 py-3.5 text-left active:bg-surface-2" onClick={() => setPicked(f)}>
                    <span className="text-foreground">{f.description}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {Math.round(f.per100g.kcal)} kcal / 100g
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-semibold text-foreground">{picked.description}</p>
            <input
              className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              inputMode="decimal" placeholder="Grams"
              value={grams} onChange={(e) => setGrams(e.target.value)} autoFocus />
            <div className="flex justify-between rounded-2xl border border-border bg-surface px-4 py-3.5 text-center text-sm">
              <span className="flex-1"><span className="block font-bold tabular-nums text-foreground">{scale(picked.per100g.kcal)}</span><span className="text-muted">kcal</span></span>
              <span className="flex-1"><span className="block font-bold tabular-nums text-foreground">{scale(picked.per100g.protein)}</span><span className="text-muted">P</span></span>
              <span className="flex-1"><span className="block font-bold tabular-nums text-foreground">{scale(picked.per100g.carbs)}</span><span className="text-muted">C</span></span>
              <span className="flex-1"><span className="block font-bold tabular-nums text-foreground">{scale(picked.per100g.fat)}</span><span className="text-muted">F</span></span>
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground disabled:opacity-40"
                onClick={save} disabled={g <= 0}>Save</button>
              <button
                className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base font-semibold text-foreground active:bg-surface-2"
                onClick={() => setPicked(null)}>Back</button>
            </div>
          </div>
        )}
      </main>
    </AuthGuard>
  );
}
