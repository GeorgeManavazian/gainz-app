"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";

const TARGETS = { kcal: 2350, protein: 225, carbs: 212, fat: 67 };

type Meal = { id: string; food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; logged_at: string };
type Lift = { id: string; exercise: string; sets: number; reps: number;
  weight: number; logged_at: string };

export default function Dashboard() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [lifts, setLifts] = useState<Lift[]>([]);

  const [week, setWeek] = useState<{ day: string; kcal: number }[]>([]);

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const weekStart = new Date(start); weekStart.setDate(weekStart.getDate() - 6);
    const [m, l, w] = await Promise.all([
      supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
      supabase.from("lifts").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
      supabase.from("meals").select("logged_at,calories").gte("logged_at", weekStart.toISOString()),
    ]);
    setMeals((m.data as Meal[]) ?? []);
    setLifts((l.data as Lift[]) ?? []);
    const byDay = new Map<string, number>();
    for (const row of (w.data ?? []) as { logged_at: string; calories: number }[]) {
      const d = new Date(row.logged_at); d.setHours(0, 0, 0, 0);
      const key = d.toLocaleDateString("en-US", { weekday: "short" });
      byDay.set(key, (byDay.get(key) ?? 0) + Number(row.calories));
    }
    setWeek([...byDay].map(([day, kcal]) => ({ day, kcal: Math.round(kcal) })));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lifts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const sum = (k: keyof Pick<Meal, "calories" | "protein_g" | "carbs_g" | "fat_g">) =>
    Math.round(meals.reduce((a, m) => a + Number(m[k]), 0));

  return (
    <AuthGuard>
      <main className="mx-auto max-w-md p-4">
        <h1 className="mb-3 text-2xl font-bold">Gainz</h1>
        <section className="mb-4 grid grid-cols-4 gap-2 text-center">
          {([["kcal", sum("calories"), TARGETS.kcal],
             ["P", sum("protein_g"), TARGETS.protein],
             ["C", sum("carbs_g"), TARGETS.carbs],
             ["F", sum("fat_g"), TARGETS.fat]] as const).map(([label, v, t]) => (
            <div key={label} className="rounded border p-2">
              <p className="text-lg font-bold">{v}</p>
              <p className="text-xs text-gray-500">/{t} {label}</p>
            </div>
          ))}
        </section>
        <div className="mb-4 flex gap-2">
          <Link className="flex-1 rounded bg-black p-3 text-center text-white" href="/log/meal">+ Meal</Link>
          <Link className="flex-1 rounded bg-black p-3 text-center text-white" href="/log/lift">+ Lift</Link>
        </div>
        <section className="mb-4">
          <h2 className="mb-1 font-semibold">Today's meals</h2>
          <ul className="divide-y text-sm">
            {meals.map((m) => (
              <li key={m.id} className="flex justify-between py-2">
                <span>{m.food_name} · {m.grams}g</span>
                <span className="text-gray-500">{Math.round(m.calories)} kcal</span>
              </li>
            ))}
            {meals.length === 0 && <li className="py-2 text-gray-400">Nothing yet</li>}
          </ul>
        </section>
        <section className="mb-4">
          <h2 className="mb-1 font-semibold">Last 7 days</h2>
          <ul className="flex gap-2 text-center text-xs">
            {week.map((d) => (
              <li key={d.day} className="flex-1 rounded border p-1">
                <p className="font-bold">{d.kcal}</p>
                <p className="text-gray-500">{d.day}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-1 font-semibold">Today's lifts</h2>
          <ul className="divide-y text-sm">
            {lifts.map((l) => (
              <li key={l.id} className="py-2">
                {l.exercise} — {l.sets}x{l.reps} @ {l.weight}lbs
              </li>
            ))}
            {lifts.length === 0 && <li className="py-2 text-gray-400">Rest day so far</li>}
          </ul>
        </section>
      </main>
    </AuthGuard>
  );
}
