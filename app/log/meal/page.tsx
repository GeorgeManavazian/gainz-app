"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";
import { logMeal } from "@/lib/log";

type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
type Food = { fdcId?: number; description: string; badge?: "raw" | "cooked" | null; per100g: Per100; fromHistory?: boolean };
type Unit = { label: string; grams: number };

const BASE_UNITS: Unit[] = [
  { label: "g", grams: 1 },
  { label: "oz", grams: 28.35 },
  { label: "lb", grams: 453.6 },
];

export default function LogMeal() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [history, setHistory] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [units, setUnits] = useState<Unit[]>(BASE_UNITS);
  const [unit, setUnit] = useState<Unit>(BASE_UNITS[0]);
  const [amount, setAmount] = useState("");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Foods you've logged before — instant, same values as last time.
  useEffect(() => {
    supabase.from("meals").select("food_name,grams,calories,protein_g,carbs_g,fat_g,fdc_id,logged_at")
      .order("logged_at", { ascending: false }).limit(300)
      .then(({ data }) => {
        const seen = new Set<string>();
        const out: Food[] = [];
        for (const m of data ?? []) {
          const key = m.food_name.trim().toLowerCase();
          if (seen.has(key) || !(Number(m.grams) > 0)) continue;
          seen.add(key);
          const s = 100 / Number(m.grams);
          out.push({
            description: m.food_name,
            fdcId: m.fdc_id ? Number(m.fdc_id) : undefined,
            fromHistory: true,
            per100g: { kcal: Number(m.calories) * s, protein: Number(m.protein_g) * s,
              carbs: Number(m.carbs_g) * s, fat: Number(m.fat_g) * s },
          });
          if (out.length >= 30) break;
        }
        setHistory(out);
      });
  }, []);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.foods ?? []);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const historyHits = useMemo(() => {
    const nq = q.trim().toLowerCase();
    if (nq.length < 2) return history.slice(0, 8);
    return history.filter((h) => h.description.toLowerCase().includes(nq)).slice(0, 5);
  }, [history, q]);

  async function pick(f: Food) {
    setPicked(f);
    setUnits(BASE_UNITS);
    setUnit(BASE_UNITS[0]);
    setAmount("");
    if (f.fdcId && !f.fromHistory) {
      try {
        const res = await fetch(`/api/food-search?id=${f.fdcId}`);
        const data = await res.json();
        const extra: Unit[] = (data.portions ?? []).map((p: { label: string; grams: number }) =>
          ({ label: p.label, grams: p.grams }));
        if (extra.length) setUnits([...BASE_UNITS, ...extra]);
      } catch { /* base units are fine */ }
    }
  }

  const n = parseFloat(amount) || 0;
  const grams = Math.round(n * unit.grams * 10) / 10;
  const scale = (v: number) => Math.round(v * grams / 100 * 10) / 10;

  async function save() {
    if (!picked || grams <= 0) return;
    try {
      await logMeal({
        food_name: picked.description, grams,
        calories: scale(picked.per100g.kcal), protein_g: scale(picked.per100g.protein),
        carbs_g: scale(picked.per100g.carbs), fat_g: scale(picked.per100g.fat),
        fdc_id: picked.fdcId ? String(picked.fdcId) : undefined,
      });
      setErr("");
      setPicked(null); setQ(""); setAmount(""); setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setErr("Couldn't save. Please try again.");
    }
  }

  const Badge = ({ badge }: { badge?: "raw" | "cooked" | null }) => badge ? (
    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
      badge === "cooked" ? "bg-success/15 text-success" : "bg-accent/15 text-accent"}`}>
      {badge}
    </span>
  ) : null;

  const foodList = (items: Food[], title: string) => items.length > 0 && (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</h2>
      <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
        {items.map((f) => (
          <li key={`${f.fromHistory ? "h" : "u"}-${f.fdcId ?? f.description}`}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2" onClick={() => pick(f)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-foreground">{f.description}</span>
                <span className="mt-0.5 block text-[12px] text-muted">
                  {Math.round(f.per100g.kcal)} kcal · {Math.round(f.per100g.protein)} P / 100g
                </span>
              </span>
              <Badge badge={f.badge} />
              <span className="text-muted">›</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

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
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              placeholder="Search food…"
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            {foodList(historyHits, q.trim().length < 2 ? "Recent foods" : "Your foods")}
            {foodList(results.filter((r) => !historyHits.some((h) => h.description.toLowerCase() === r.description.toLowerCase())), "USDA")}
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold leading-snug text-foreground">{picked.description}</p>
              <Badge badge={picked.badge} />
            </div>

            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <button key={u.label} type="button" onClick={() => setUnit(u)} aria-pressed={unit.label === u.label}
                  className={`h-8 rounded-full border px-3 text-[13px] font-semibold ${
                    unit.label === u.label ? "border-accent bg-accent/20 text-accent" : "border-border text-muted active:text-foreground"}`}>
                  {u.label}
                </button>
              ))}
            </div>

            <label className="relative">
              <input
                className="w-full rounded-2xl border border-border bg-surface px-4 py-3.5 pr-24 text-2xl font-bold tabular-nums text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                inputMode="decimal" placeholder="0" autoFocus
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="pointer-events-none absolute right-4 top-1/2 max-w-[40%] -translate-y-1/2 truncate text-sm text-muted">
                {unit.label}{unit.grams !== 1 && n > 0 ? ` = ${grams} g` : ""}
              </span>
            </label>

            <div className="card-grad flex justify-between rounded-2xl border border-border px-4 py-3.5 text-center text-sm">
              <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-accent">{scale(picked.per100g.kcal)}</span><span className="text-muted">kcal</span></span>
              <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.protein)}</span><span className="text-muted">P</span></span>
              <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.carbs)}</span><span className="text-muted">C</span></span>
              <span className="flex-1"><span className="block text-xl font-bold tabular-nums text-foreground">{scale(picked.per100g.fat)}</span><span className="text-muted">F</span></span>
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <div className="flex gap-3">
              <button
                className="flex-1 rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-foreground active:opacity-80 disabled:opacity-40"
                onClick={save} disabled={grams <= 0}>Save</button>
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
