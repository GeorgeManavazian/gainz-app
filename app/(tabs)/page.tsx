"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { computeActivityBonus, ACTIVITY_BASELINE_WINDOW_DAYS } from "@/lib/activity-adjustment";
import { listHealthActivity, type HealthActivityRow } from "@/lib/health-activity";
import { getActiveWorkout, getTodayCompletedWorkout, listLiftsForWorkout, listCompletedWorkouts } from "@/lib/workouts-db";
import { formatElapsed, totalSets, workoutTitle, type WorkoutRow } from "@/lib/workouts";
import { remaining } from "@/lib/hub";
import { bedtimeFor, wakeFor, lateHeavyMeal, planLine, planNextMeal, proteinHits, usualTrainingStart, PROTEIN_HITS_TARGET } from "@/lib/meal-timing";
import MealTimeline from "@/components/MealTimeline";
import { usualMealSlots, WEEKDAY_WINDOW_DAYS } from "@/lib/meal-slots";
import { dailyChecks } from "@/lib/meal-checks";
import ChecksRow from "@/components/ChecksRow";
import SavePatternSheet from "@/components/SavePatternSheet";
import ConfirmDelete from "@/components/ConfirmDelete";
import { deleteMeal } from "@/lib/meals-db";

type Meal = { id: string; food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; logged_at: string; fdc_id?: string | null;
  unit?: string | null };

function HubInner() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null | "error" | undefined>(undefined);
  const [weighIns, setWeighIns] = useState<WeighInRow[]>([]);
  const [activity, setActivity] = useState<HealthActivityRow[]>([]);
  const [active, setActive] = useState<WorkoutRow | null>(null);
  const [done, setDone] = useState<{ w: WorkoutRow; sets: number } | null>(null);
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutRow[]>([]);
  const [recentMeals, setRecentMeals] = useState<Meal[] | null>(null); // last six weeks, for the usual-slot learner; null until loaded
  const params = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  // Clock tick so the meal-timing line and elapsed times stay current while the app stays open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const n = Number(params.get("logged"));
    if (n > 0) {
      setToast(`Logged ${n} food${n === 1 ? "" : "s"} ✓`);
      router.replace("/");
    }
  }, [params, router]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("meals").select("*")
      .gte("logged_at", start.toISOString()).order("logged_at");
    setMeals((data as Meal[]) ?? []);
    const since = new Date(start); since.setDate(since.getDate() - WEEKDAY_WINDOW_DAYS);
    supabase.from("meals").select("logged_at,calories,protein_g,fat_g").gte("logged_at", since.toISOString()).lt("logged_at", start.toISOString())
      .then(({ data: d, error }) => { if (!error) setRecentMeals((d as Meal[]) ?? []); });
  }, []);

  async function removeMeal(id: string) {
    setMeals((ms) => ms.filter((m) => m.id !== id));
    try { await deleteMeal(id); }
    catch { setToast("Couldn't delete — try again"); await load(); }
  }

  const loadWorkouts = useCallback(async () => {
    getActiveWorkout().then(setActive).catch(() => setActive(null));
    listCompletedWorkouts(60).then(setRecentWorkouts).catch(() => setRecentWorkouts([]));
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
    return Promise.allSettled([
      getProfile(),
      listWeighIns(addDays(localDateKey(), -120)),
      listHealthActivity(addDays(localDateKey(), -ACTIVITY_BASELINE_WINDOW_DAYS)),
    ]).then(([p, w, a]) => {
      setWeighIns(w.status === "fulfilled" ? w.value : []);
      setProfile(p.status === "fulfilled" ? p.value : "error");
      setActivity(a.status === "fulfilled" ? a.value : []);
    });
  }, []);
  useEffect(() => { loadTargets(); }, [loadTargets]);
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") loadTargets(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadTargets]);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  const today = localDateKey();
  const trend = trendWeight(weighIns);
  const activityBonus = computeActivityBonus(activity, today);
  const targets =
    profile === undefined ? undefined
    : profile === null ? null
    : profile === "error" ? "error"
    : computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }, new Date(), activityBonus);

  const todayRow = weighIns.find((r) => r.date === today) ?? null;
  const last = weighIns.length ? weighIns[weighIns.length - 1] : null;
  const slope = slopeLbPerWk(weighIns, today);

  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    Math.round(meals.reduce((a, m) => a + Number(m[k]), 0));
  const totals = { calories: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") };
  const t = typeof targets === "object" && targets !== null ? targets : null;
  // Meal timing: fuel model + next window from today's meals, training and sleep clock.
  const prof = typeof profile === "object" && profile !== null ? profile : null;
  const clock = { wake: prof?.wake_time ?? "07:00", bed: prof?.bed_time ?? "23:00" };
  const todayWorkout = active ? { started_at: active.started_at, ended_at: null }
    : done ? { started_at: done.w.started_at, ended_at: done.w.ended_at } : null;
  const dayKey = now.toDateString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pattern = useMemo(() => (recentMeals ? usualMealSlots(recentMeals, now) : undefined), [recentMeals, dayKey]);
  const plan = t && prof ? planNextMeal({
    meals, todayWorkout, usualTraining: usualTrainingStart(recentWorkouts, now),
    totals, targets: { kcal: t.kcal, protein_g: t.protein_g }, weight_lb: trend ?? prof.weight_lb, now, clock, pattern,
  }) : null;
  const hits = proteinHits(meals);
  const checks = dailyChecks({ meals, workout: todayWorkout, clock, slots: pattern?.ready ? pattern.slots.map((sl) => sl.minute) : null, now, dayOver: false });
  const late = lateHeavyMeal(meals, now, clock);

  async function saveWeight(weight_lb: number) { await upsertWeighIn(today, weight_lb); await loadTargets(true); }

  const kcalLeft = t ? remaining(totals.calories, t.kcal) : 0;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        {toast && (
          <div className="pointer-events-none fixed inset-x-0 top-3 z-30 mx-auto max-w-md px-4">
            <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success shadow-lg">{toast}</p>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-2xl font-black italic tracking-tight text-accent">GAINZ</span>
          <div className="flex items-center gap-2">
            {activityBonus > 0 && (
              <span className="flex h-9 items-center rounded-full border border-accent/30 bg-accent/10 px-3 text-[13px] font-semibold text-accent"
                aria-label={`Plus ${activityBonus} calories today from activity`}>
                +{activityBonus}
              </span>
            )}
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
              Resume · {formatElapsed(now.getTime() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
            </Link>
          ) : (
            <Link href="/workout/new"
              className="flex-1 rounded-xl border border-accent bg-surface px-4 py-4 text-center text-base font-semibold text-accent active:bg-surface-2">
              Start workout
            </Link>
          )}
        </div>

        {t && plan && (
          <Link href="/log/meal" className="card-grad flex flex-col gap-2 rounded-2xl border border-border px-4 py-3 active:opacity-90">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Meal timing</span>
              <span className={`text-[12px] font-semibold tabular-nums ${hits >= PROTEIN_HITS_TARGET ? "text-success" : "text-muted"}`}>
                Protein hits {hits} / {PROTEIN_HITS_TARGET}
              </span>
            </div>
            <MealTimeline wake={wakeFor(now, clock)} bed={bedtimeFor(now, clock)} now={now} meals={meals} workout={todayWorkout} plan={plan} usualMinutes={pattern?.ready ? pattern.slots.map((sl) => sl.minute) : []} />
            <p className="text-[14px] font-semibold leading-snug">{planLine(plan, now)}</p>
            <ChecksRow checks={checks} />
            {late && (
              <p className="text-[12px] text-danger">
                Heavy meal {late.hoursBeforeBed <= 0 ? "after bedtime" : `${Math.round(late.hoursBeforeBed * 10) / 10} h before bed`} — expect worse sleep.
              </p>
            )}
          </Link>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Today</h2>
            {meals.length > 0 && (
              <button type="button" onClick={() => setSaveOpen(true)} className="text-[12px] font-semibold text-accent active:opacity-80">
                Save as meal
              </button>
            )}
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {meals.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1">{m.food_name} · {m.unit === "serving" ? `${m.grams} serving${Number(m.grams) === 1 ? "" : "s"}` : `${m.grams}g`}</span>
                <span className="tabular-nums text-muted">{Math.round(m.calories)} kcal</span>
                <ConfirmDelete label={m.food_name} resetKey={meals.length} onConfirm={() => removeMeal(m.id)} />
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
                    Resume workout · {formatElapsed(now.getTime() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
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

        {saveOpen && (
          <SavePatternSheet meals={meals} onClose={() => setSaveOpen(false)}
            onSaved={() => { setSaveOpen(false); setToast("Saved ✓"); }} />
        )}
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
