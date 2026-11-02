"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import FoodPicker from "@/components/FoodPicker";
import { logMeal } from "@/lib/log";
import { listPatterns } from "@/lib/patterns-db";
import { scaleItem, sortPatterns, totals, type PatternRow } from "@/lib/patterns";

const MEAL_PREVIEW = 4;

export default function LogMeal() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { listPatterns().then((p) => setPatterns(sortPatterns(p))).catch(() => setPatterns([])); }, []);

  const yourMeals = (scanButton: React.ReactNode) => (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Your meals</h2>
        <span className="flex items-center gap-3">
          {patterns.length > MEAL_PREVIEW && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[12px] font-semibold text-accent active:opacity-80">
              {showAll ? "Less" : `All ${patterns.length} ›`}
            </button>
          )}
          {scanButton}
          <Link href="/log/meal/new" className="text-[12px] font-semibold text-accent active:opacity-80">New meal</Link>
        </span>
      </div>
      {patterns.length > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {(showAll ? patterns : patterns.slice(0, MEAL_PREVIEW)).map((p) => {
            const t = totals(p.items.map((it) => scaleItem(it, it.grams)));
            return (
              <li key={p.id}>
                <Link href={`/log/meal/pattern/${p.id}`}
                  className="card-grad flex h-full flex-col rounded-2xl border border-accent/30 px-3.5 py-3 active:opacity-80">
                  <span className="truncate text-[14px] font-semibold text-foreground">{p.name}</span>
                  <span className="mt-0.5 text-[11px] tabular-nums text-muted">
                    {p.items.length} food{p.items.length === 1 ? "" : "s"} · {t.kcal} kcal
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-10 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Log meal</h1>
        <FoodPicker confirmLabel="Save" successLabel="Logged ✓" onPick={logMeal} header={yourMeals} />
      </main>
    </AuthGuard>
  );
}
