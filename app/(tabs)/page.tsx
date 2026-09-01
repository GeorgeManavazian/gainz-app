"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { supabase } from "@/lib/supabase";
import { computeTargets, type Targets } from "@/lib/targets";
import WeighInCard from "@/components/WeighInCard";
import ProgressCard from "@/components/ProgressCard";
import { applyAdjustment, getProfile, type ProfileRow } from "@/lib/profile";
import { listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, assessProgress, inCooldown, slopeLbPerWk, suggestAdjustment, trendWeight, type Assessment } from "@/lib/trend";
import { getActiveWorkout } from "@/lib/workouts-db";
import { formatElapsed, type WorkoutRow } from "@/lib/workouts";

type Meal = { id: string; food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; logged_at: string };
type Lift = { id: string; exercise: string; sets: number; reps: number;
  weight: number; logged_at: string };

export default function Dashboard() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [lifts, setLifts] = useState<Lift[]>([]);

  const [week, setWeek] = useState<{ day: string; kcal: number }[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null | "error" | undefined>(undefined);
  const [weighIns, setWeighIns] = useState<WeighInRow[]>([]);
  const [active, setActive] = useState<WorkoutRow | null>(null);

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const weekStart = new Date(start); weekStart.setDate(weekStart.getDate() - 6);
    const [m, l, w] = await Promise.all([
      supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
      supabase.from("lifts").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
      supabase.from("meals").select("logged_at,calories").gte("logged_at", weekStart.toISOString()).order("logged_at"),
    ]);
    setMeals((m.data as Meal[]) ?? []);
    setLifts((l.data as Lift[]) ?? []);
    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      byDay.set(localDateKey(d), 0);
    }
    for (const row of (w.data ?? []) as { logged_at: string; calories: number }[]) {
      const d = new Date(row.logged_at); d.setHours(0, 0, 0, 0);
      byDay.set(localDateKey(d), (byDay.get(localDateKey(d)) ?? 0) + Number(row.calories));
    }
    const weekArray: { day: string; kcal: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      const day = d.toLocaleDateString("en-US", { weekday: "short" });
      weekArray.push({ day, kcal: Math.round(byDay.get(localDateKey(d)) ?? 0) });
    }
    setWeek(weekArray);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lifts" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const loadTargets = useCallback((soft = false) => {
    if (!soft) setProfile(undefined);
    return Promise.allSettled([getProfile(), listWeighIns(addDays(localDateKey(), -120))]).then(([p, w]) => {
      setWeighIns(w.status === "fulfilled" ? w.value : []);
      setProfile(p.status === "fulfilled" ? p.value : "error");
    });
  }, []);
  useEffect(() => { loadTargets(); }, [loadTargets]);

  useEffect(() => {
    getActiveWorkout().then(setActive).catch(() => setActive(null));
  }, []);

  const today = localDateKey();
  const trend = trendWeight(weighIns);
  const targets =
    profile === undefined ? undefined
    : profile === null ? null
    : profile === "error" ? "error"
    : computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb });

  const todayRow = weighIns.find((r) => r.date === today) ?? null;
  const last = weighIns.length ? weighIns[weighIns.length - 1] : null;
  const slope = slopeLbPerWk(weighIns, today);
  const p = typeof profile === "object" && profile !== null ? profile : null;
  const phase = p?.phase ?? "cut";
  const rate = p?.rate_lb_per_wk ?? 0;
  const assessment: Assessment = p ? assessProgress(slope, phase, rate) : "insufficient_data";
  const delta = suggestAdjustment(slope, phase, rate);
  const newKcal = typeof targets === "object" && targets !== null
    ? (phase === "cut" ? targets.kcal - delta : targets.kcal + delta) : null;
  const suppressed = inCooldown(p?.last_adjusted_at ?? null, new Date());

  async function saveWeight(weight_lb: number) { await upsertWeighIn(today, weight_lb); await loadTargets(true); }
  async function apply() {
    if (!p || typeof targets !== "object" || targets === null) return;
    const base = p.tdee_override ?? targets.tdee_est;
    await applyAdjustment(p, phase === "cut" ? base - delta : base + delta);
    await loadTargets(true);
  }

  const sum = (k: keyof Pick<Meal, "calories" | "protein_g" | "carbs_g" | "fat_g">) =>
    Math.round(meals.reduce((a, m) => a + Number(m[k]), 0));

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 bg-background px-4 pb-10 pt-6 text-foreground">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Gainz</h1>
          <Link href="/profile" className="text-sm font-medium text-muted active:text-foreground">Profile</Link>
        </div>

        <WeighInCard todayWeight={todayRow?.weight_lb ?? null} lastWeight={last?.weight_lb ?? null}
          trend={trend} slope={slope} onSave={saveWeight} linkToDetail />
        <ProgressCard assessment={assessment} slope={slope} rate={rate} phase={phase} delta={delta}
          newKcal={newKcal} suppressed={suppressed} onApply={apply} />

        {targets === undefined ? (
          <section className="grid grid-cols-4 gap-2">
            {["kcal", "P", "C", "F"].map((label) => (
              <div key={label} className="h-[79px] rounded-2xl border border-border bg-surface" />
            ))}
          </section>
        ) : targets === "error" ? (
          <button type="button" onClick={() => loadTargets()}
            className="rounded-2xl border border-border bg-surface p-4 text-left text-sm active:bg-surface-2">
            <p className="font-semibold text-foreground">Couldn&apos;t load targets</p>
            <p className="mt-1 text-muted">Tap to retry.</p>
          </button>
        ) : targets === null ? (
          <Link href="/profile"
            className="rounded-2xl border border-accent/40 bg-surface p-4 text-sm active:bg-surface-2">
            <p className="font-semibold text-foreground">Set up your targets</p>
            <p className="mt-1 text-muted">Add height, weight, and goal to get daily kcal and macros.</p>
          </Link>
        ) : (
          <div className="flex flex-col gap-2">
            <section className="grid grid-cols-4 gap-2">
              {([["kcal", sum("calories"), targets.kcal],
                 ["P", sum("protein_g"), targets.protein_g],
                 ["C", sum("carbs_g"), targets.carbs_g],
                 ["F", sum("fat_g"), targets.fat_g]] as const).map(([label, v, t]) => (
                <div key={label} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 text-center">
                  <p className="text-xl font-bold tabular-nums leading-none">{v}</p>
                  <p className="text-[11px] leading-none text-muted">/{t} {label}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent"
                      style={{ width: `${t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0}%` }} />
                  </div>
                </div>
              ))}
            </section>
            {targets.warning && <p className="text-sm text-danger">{targets.warning}</p>}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            className="flex-1 rounded-xl bg-accent px-4 py-4 text-center text-base font-semibold text-accent-foreground active:opacity-80"
            href="/log/meal"
          >
            + Meal
          </Link>
          {active ? (
            <Link
              className="flex-1 rounded-xl border border-accent/60 bg-surface px-4 py-4 text-center text-base font-semibold text-accent active:bg-surface-2"
              href={`/workout/${active.id}`}
            >
              Resume · {formatElapsed(Date.now() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
            </Link>
          ) : (
            <Link
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-4 text-center text-base font-semibold text-foreground active:bg-surface-2"
              href="/workout/new"
            >
              Start workout
            </Link>
          )}
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Today&apos;s meals</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {meals.map((m) => (
              <li key={m.id} className="flex justify-between px-4 py-3">
                <span className="text-foreground">{m.food_name} · {m.grams}g</span>
                <span className="tabular-nums text-muted">{Math.round(m.calories)} kcal</span>
              </li>
            ))}
            {meals.length === 0 && <li className="px-4 py-3 text-muted">Nothing yet</li>}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Last 7 days</h2>
          <ul className="flex gap-2 text-center text-xs">
            {week.map((d) => (
              <li key={d.day} className="flex-1 rounded-xl border border-border bg-surface p-2">
                <p className="font-bold tabular-nums">{d.kcal}</p>
                <p className="text-muted">{d.day}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Today&apos;s lifts</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {lifts.map((l) => (
              <li key={l.id} className="px-4 py-3 text-foreground">
                {l.exercise} — {l.sets}x{l.reps} @ {l.weight}lbs
              </li>
            ))}
            {lifts.length === 0 && <li className="px-4 py-3 text-muted">Rest day so far</li>}
          </ul>
        </section>
      </main>
    </AuthGuard>
  );
}
