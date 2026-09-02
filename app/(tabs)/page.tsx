"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import Ring from "@/components/Ring";
import WeighInCard from "@/components/WeighInCard";
import { supabase } from "@/lib/supabase";
import { computeTargets } from "@/lib/targets";
import { getProfile, type ProfileRow } from "@/lib/profile";
import { listWeighIns, localDateKey, upsertWeighIn, type WeighInRow } from "@/lib/weighins";
import { addDays, slopeLbPerWk, trendWeight } from "@/lib/trend";
import { getActiveWorkout, getTodayCompletedWorkout, listLiftsForWorkout } from "@/lib/workouts-db";
import { formatElapsed, totalSets, workoutTitle, type WorkoutRow } from "@/lib/workouts";
import { nextMeal, remaining } from "@/lib/hub";

type Meal = { id: string; food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; logged_at: string };

function HubInner() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null | "error" | undefined>(undefined);
  const [weighIns, setWeighIns] = useState<WeighInRow[]>([]);
  const [active, setActive] = useState<WorkoutRow | null>(null);
  const [done, setDone] = useState<{ w: WorkoutRow; sets: number } | null>(null);
  const params = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState("");
  useEffect(() => {
    const n = Number(params.get("logged"));
    if (n > 0) {
      setToast(`Logged ${n} food${n === 1 ? "" : "s"} ✓`);
      router.replace("/");
      const t = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(t);
    }
  }, [params, router]);

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("meals").select("*")
      .gte("logged_at", start.toISOString()).order("logged_at");
    setMeals((data as Meal[]) ?? []);
  }, []);

  const loadWorkouts = useCallback(async () => {
    getActiveWorkout().then(setActive).catch(() => setActive(null));
    getTodayCompletedWorkout().then(async (w) => {
      if (!w) return setDone(null);
      const rows = await listLiftsForWorkout(w.id).catch(() => []);
      setDone({ w, sets: totalSets(rows) });
    }).catch(() => setDone(null));
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel("hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lifts" }, loadWorkouts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, loadWorkouts]);

  const loadTargets = useCallback((soft = false) => {
    if (!soft) setProfile(undefined);
    return Promise.allSettled([getProfile(), listWeighIns(addDays(localDateKey(), -120))]).then(([p, w]) => {
      setWeighIns(w.status === "fulfilled" ? w.value : []);
      setProfile(p.status === "fulfilled" ? p.value : "error");
    });
  }, []);
  useEffect(() => { loadTargets(); }, [loadTargets]);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

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

  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    Math.round(meals.reduce((a, m) => a + Number(m[k]), 0));
  const totals = { calories: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") };
  const t = typeof targets === "object" && targets !== null ? targets : null;
  const meal = t ? nextMeal(totals, { kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g }, meals.length) : null;

  async function saveWeight(weight_lb: number) { await upsertWeighIn(today, weight_lb); await loadTargets(true); }

  const kcalLeft = t ? remaining(totals.calories, t.kcal) : 0;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        {toast && (
          <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">{toast}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-black italic tracking-tight text-accent">GAINZ</span>
          <div className="flex items-center gap-2">
            {/* burn pill slot — hidden until Oura burn data exists (roadmap #6) */}
            <Link href="/profile" aria-label="Profile"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted active:text-foreground">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21 C4 16 20 16 20 21" /></svg>
            </Link>
          </div>
        </div>

        {targets === undefined ? (
          <div className="mx-auto h-[200px] w-[200px] rounded-full border border-border" />
        ) : targets === "error" ? (
          <button type="button" onClick={() => loadTargets()}
            className="rounded-2xl border border-border bg-surface p-4 text-left text-sm active:bg-surface-2">
            <p className="font-semibold">Couldn&apos;t load targets</p>
            <p className="mt-1 text-muted">Tap to retry.</p>
          </button>
        ) : targets === null ? (
          <Link href="/profile" className="rounded-2xl border border-accent/40 bg-surface p-4 text-sm active:bg-surface-2">
            <p className="font-semibold">Set up your targets</p>
            <p className="mt-1 text-muted">Add height, weight, and goal to get daily kcal and macros.</p>
          </Link>
        ) : (
          <>
            <div className="flex flex-col items-center gap-2">
              <Ring size={200} stroke={14} value={totals.calories} target={targets.kcal}>
                <span className={`text-5xl font-bold tabular-nums ${kcalLeft < 0 ? "text-danger" : ""}`}>
                  {Math.abs(Math.round(kcalLeft)).toLocaleString()}
                </span>
                <span className="text-sm text-muted">{kcalLeft < 0 ? "over" : "left"}</span>
              </Ring>
              <p className="text-sm text-muted">
                <span className="font-semibold text-accent tabular-nums">{totals.calories.toLocaleString()}</span>
                {" "}/ {targets.kcal.toLocaleString()} eaten
              </p>
            </div>

            <div className="flex items-start justify-center gap-6">
              {([["P", totals.protein_g, targets.protein_g],
                 ["C", totals.carbs_g, targets.carbs_g],
                 ["F", totals.fat_g, targets.fat_g]] as const).map(([label, v, target]) => {
                const left = remaining(v, target);
                return (
                  <div key={label} className="flex flex-col items-center gap-1">
                    <Ring size={72} stroke={7} value={v} target={target}>
                      <span className="text-[10px] font-medium uppercase text-muted">{label}</span>
                      <span className={`text-lg font-bold leading-none tabular-nums ${left < 0 ? "text-danger" : ""}`}>
                        {Math.abs(Math.round(left))}
                      </span>
                      <span className="text-[9px] text-muted">{left < 0 ? "over" : "left"}</span>
                    </Ring>
                    <span className="text-[11px] text-muted tabular-nums">
                      <span className="text-accent">{Math.round(v)}</span> / {target}g
                    </span>
                  </div>
                );
              })}
            </div>
            {targets.warning && <p className="text-center text-sm text-danger">{targets.warning}</p>}
          </>
        )}

        <div className="flex gap-3">
          <Link href="/log/meal"
            className="flex-1 rounded-xl bg-accent px-4 py-4 text-center text-base font-semibold text-accent-foreground active:opacity-80">
            + Log meal
          </Link>
          {active ? (
            <Link href={`/workout/${active.id}`}
              className="flex-1 rounded-xl border border-accent/60 bg-surface px-4 py-4 text-center text-base font-semibold text-accent active:bg-surface-2">
              Resume · {formatElapsed(Date.now() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
            </Link>
          ) : (
            <Link href="/workout/new"
              className="flex-1 rounded-xl border border-accent bg-surface px-4 py-4 text-center text-base font-semibold text-accent active:bg-surface-2">
              Start workout
            </Link>
          )}
        </div>

        {t && (
          <Link href="/log/meal" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:bg-surface-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-accent" aria-hidden>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round"><path d="M4 12 A8 5 0 0 0 20 12 Z" /><path d="M9 8 C9 6 11 6 11 8 M14 8 C14 5 17 5 17 8" /></svg>
            </span>
            <span className="flex-1">
              {meal ? (
                <>
                  <span className="block text-base font-semibold">
                    Next meal · ~{meal.kcal} kcal · {meal.protein_g} P · {meal.carbs_g} C · {meal.fat_g} F
                  </span>
                  <span className="block text-[13px] text-muted">{Math.min(meals.length, 4)} of 4 meals logged</span>
                </>
              ) : (
                <span className="block text-base text-muted">Target hit for today</span>
              )}
            </span>
            <span className="text-muted">›</span>
          </Link>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Today</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {meals.map((m) => (
              <li key={m.id} className="flex justify-between px-4 py-3">
                <span>{m.food_name} · {m.grams}g</span>
                <span className="tabular-nums text-muted">{Math.round(m.calories)} kcal</span>
              </li>
            ))}
            {meals.length === 0 && <li className="px-4 py-3 text-muted">Nothing logged yet</li>}
            {done ? (
              <li>
                <Link href={`/workout/${done.w.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20 text-xs text-success" aria-hidden>✓</span>
                  <span className="flex-1 font-medium">
                    {workoutTitle(done.w.muscle_groups)} · {done.sets} sets · {formatElapsed(new Date(done.w.ended_at!).getTime() - new Date(done.w.started_at).getTime())}
                  </span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ) : active ? (
              <li>
                <Link href={`/workout/${active.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="flex-1 font-medium text-muted">
                    Resume workout · {formatElapsed(Date.now() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
                  </span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ) : (
              <li className="px-4 py-3 text-muted">No workout yet</li>
            )}
          </ul>
        </section>

        <WeighInCard compact todayWeight={todayRow?.weight_lb ?? null} lastWeight={last?.weight_lb ?? null}
          trend={trend} slope={slope} onSave={saveWeight} />
      </main>
    </AuthGuard>
  );
}

export default function Hub() {
  return (
    <Suspense fallback={null}>
      <HubInner />
    </Suspense>
  );
}
