"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import LineChart from "@/components/LineChart";
import { INDICATORS, bestSet, indicatorStatus, sessionsFor } from "@/lib/progress";
import { listCompletedWorkouts, listRecentLifts } from "@/lib/workouts-db";
import { e1rm, formatElapsed, formatSession, localDateOf, recentExercises, workoutTitle,
  type LiftRow, type WorkoutRow } from "@/lib/workouts";
import { MUSCLE_GROUPS } from "@/lib/exercises";

const LEVEL_CLS = { ok: "bg-success/15 text-success", warn: "bg-accent/15 text-accent",
  bad: "bg-danger/15 text-danger", none: "bg-surface-2 text-muted" } as const;

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function Performance() {
  const [rows, setRows] = useState<LiftRow[]>([]);       // newest-first
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    listRecentLifts(2000).then(setRows).catch((e) => console.warn("gainz perf: lifts load failed", e));
    listCompletedWorkouts().then(setWorkouts).catch((e) => console.warn("gainz perf: workouts load failed", e));
  }, []);

  const exercises = useMemo(
    () => recentExercises(rows, MUSCLE_GROUPS.map((m) => m.id), 20), [rows]);
  const exercise = selected ?? exercises[0] ?? null;
  const sessions = useMemo(() => (exercise ? sessionsFor(exercise, rows) : []), [exercise, rows]);
  const recent = sessions.slice(-12);
  const best = bestSet(sessions.flatMap((s) => s.rows));
  const setsByWorkout = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.workout_id) m.set(r.workout_id, (m.get(r.workout_id) ?? 0) + r.sets);
    return m;
  }, [rows]);

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <h1 className="text-xl font-bold tracking-tight">Performance</h1>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Indicator lifts</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {INDICATORS.map((ind) => {
              const s = indicatorStatus(ind.name, rows);
              return (
                <li key={ind.name} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 font-medium">{ind.name}</span>
                  {s.latest !== null ? (
                    <>
                      <span className="tabular-nums text-muted">e1RM {s.latest.toFixed(1)}</span>
                      {s.pct !== null && (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${LEVEL_CLS[s.level]}`}>
                          {s.pct >= 0 ? "+" : "−"}{Math.abs(s.pct).toFixed(1)}%
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted">no baseline yet</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Exercise progress</h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {exercises.map((name) => (
              <button key={name} type="button" onClick={() => setSelected(name)}
                aria-pressed={name === exercise}
                className={`h-7 shrink-0 rounded-full px-3 text-sm font-semibold ${
                  name === exercise ? "bg-accent/20 text-accent" : "text-muted active:text-foreground"}`}>
                {name}
              </button>
            ))}
            {exercises.length === 0 && <p className="text-sm text-muted">No lifts logged yet</p>}
          </div>
          {exercise && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <LineChart data={recent.map((s) => ({ date: s.date, value: Math.round(s.best * 10) / 10 }))} />
              {best && (
                <p className="mt-2 text-sm text-muted">
                  Best: <span className="font-semibold text-foreground tabular-nums">{best.weight}×{best.reps}</span>
                  {" "}· e1RM <span className="font-semibold text-accent tabular-nums">{e1rm(best.weight, best.reps).toFixed(0)}</span>
                  {" "}· {fmtDay(localDateOf(best.logged_at))}
                </p>
              )}
              <ul className="mt-2 divide-y divide-border text-[13px]">
                {sessions.slice(-5).reverse().map((s) => (
                  <li key={s.key} className="flex justify-between py-2">
                    <span className="text-muted">{fmtDay(s.date)}</span>
                    <span className="tabular-nums">{formatSession(s.rows)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Workouts</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface text-sm">
            {workouts.map((w) => (
              <li key={w.id}>
                <Link href={`/workout/${w.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                  <span className="flex-1 font-medium">{fmtDay(localDateOf(w.started_at))} · {workoutTitle(w.muscle_groups)}</span>
                  <span className="tabular-nums text-muted">
                    {setsByWorkout.get(w.id) ?? 0} sets · {formatElapsed(new Date(w.ended_at!).getTime() - new Date(w.started_at).getTime())}
                  </span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
            {workouts.length === 0 && <li className="px-4 py-3 text-muted">No workouts yet</li>}
          </ul>
        </section>
      </main>
    </AuthGuard>
  );
}
