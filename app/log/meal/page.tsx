"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import FoodPicker from "@/components/FoodPicker";
import { logMeal } from "@/lib/log";
import { listPatterns } from "@/lib/patterns-db";
import { scaleItem, sortPatterns, totals, type PatternRow } from "@/lib/patterns";

export default function LogMeal() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  useEffect(() => { listPatterns().then((p) => setPatterns(sortPatterns(p))).catch(() => setPatterns([])); }, []);

  const yourMeals = (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Your meals</h2>
        <Link href="/log/meal/new" className="text-[12px] font-semibold text-accent active:opacity-80">New meal</Link>
      </div>
      {patterns.length > 0 && (
        <ul className="card-grad divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {patterns.map((p) => {
            const t = totals(p.items.map((it) => scaleItem(it, it.grams)));
            return (
              <li key={p.id}>
                <Link href={`/log/meal/pattern/${p.id}`}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-foreground">{p.name}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
                      {p.items.length} food{p.items.length === 1 ? "" : "s"} · {t.kcal} kcal · {t.protein_g} P
                    </span>
                  </span>
                  <span className="text-muted">›</span>
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
