"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import LineChart from "@/components/LineChart";
import { INDICATORS, bestSet, indicatorStatus, sessionsFor } from "@/lib/progress";
import { listCompletedWorkouts, listRecentLifts } from "@/lib/workouts-db";
import { e1rm, formatElapsed, localDateOf, recentExercises, workoutTitle,
  type LiftRow, type WorkoutRow } from "@/lib/workouts";
import { MUSCLE_GROUPS, normalizeName } from "@/lib/exercises";

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDayLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const LIFT_ICON = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M3 12 H21 M6 8 V16 M18 8 V16 M4 10 V14 M20 10 V14" />
  </svg>
);

export default function Performance() {
  const [rows, setRows] = useState<LiftRow[]>([]);       // newest-first
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    listRecentLifts(2000).then(setRows).catch((e) => console.warn("gainz perf: lifts load failed", e));
    listCompletedWorkouts().then(setWorkouts).catch((e) => console.warn("gainz perf: workouts load failed", e));
  }, []);

  const recents = useMemo(
    () => recentExercises(rows, MUSCLE_GROUPS.map((m) => m.id), 20), [rows]);
  const indicatorNames = INDICATORS.map((i) => normalizeName(i.name));
  const others = recents.filter((n) => !indicatorNames.includes(normalizeName(n)));
  const defaultExercise = INDICATORS.find((i) => sessionsFor(i.name, rows).length > 0)?.name ?? recents[0] ?? null;
  const exercise = selected ?? defaultExercise;
  const sessions = useMemo(() => (exercise ? sessionsFor(exercise, rows) : []), [exercise, rows]);
  const recent12 = sessions.slice(-12);
  const allRows = sessions.flatMap((s) => s.rows);
  const best = bestSet(allRows);
  const current = sessions.length ? sessions[sessions.length - 1].best : null;
  const prev = sessions.length > 1 ? sessions[sessions.length - 2] : null;
  const delta = current !== null && prev !== null ? current - prev.best : null;

  const setsByWorkout = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.workout_id) m.set(r.workout_id, (m.get(r.workout_id) ?? 0) + r.sets);
    return m;
  }, [rows]);

  const latest = workouts[0] ?? null;
  const latestRows = useMemo(() => {
    if (!latest) return [];
    return [...rows.filter((r) => r.workout_id === latest.id)].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1));
  }, [rows, latest]);
  const latestByExercise = useMemo(() => {
    const order: string[] = [];
    const m = new Map<string, LiftRow[]>();
    for (const r of latestRows) {
      const k = normalizeName(r.exercise);
      if (!m.has(k)) { m.set(k, []); order.push(k); }
      m.get(k)!.push(r);
    }
    return order.map((k) => m.get(k)!);
  }, [latestRows]);

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-black italic tracking-tight text-accent">GAINZ</span>
          <Link href="/profile" aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted active:text-foreground">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21 C4 16 20 16 20 21" /></svg>
          </Link>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
          <p className="text-[13px] text-muted">Track strength. Beat your best.</p>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Indicator lifts</h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {INDICATORS.map((ind) => {
              const s = indicatorStatus(ind.name, rows);
              const active = exercise !== null && normalizeName(exercise) === normalizeName(ind.name);
              const has = s.latest !== null;
              return (
                <button key={ind.name} type="button" disabled={!has}
                  onClick={() => has && setSelected(ind.name)} aria-pressed={active}
                  className={`card-grad relative w-[148px] shrink-0 rounded-2xl border p-4 text-left ${
                    active ? "border-accent" : "border-border"} ${has ? "active:opacity-80" : "opacity-80"}`}>
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-foreground" aria-hidden>✓</span>
                  )}
                  <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent" aria-hidden>
                    {LIFT_ICON}
                  </span>
                  <p className="min-h-9 text-[13px] font-semibold leading-tight">{ind.name}</p>
                  {has ? (
                    <>
                      <p className="text-xl font-bold tabular-nums leading-tight">{Math.round(s.latest!)} <span className="text-sm font-normal text-muted">lb</span></p>
                      <p className="text-[11px]">
                        <span className="text-muted">e1RM </span>
                        {s.pct !== null && (
                          <span className={s.level === "bad" ? "font-semibold text-danger" : s.level === "warn" ? "font-semibold text-accent" : "font-semibold text-success"}>
                            {s.pct >= 0 ? "↑" : "↓"} {Math.abs(s.pct).toFixed(1)}%
                          </span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-semibold text-muted">No baseline</p>
                      <p className="text-[11px] text-muted">Log it in a workout</p>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {others.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {others.map((name) => (
                <button key={name} type="button" onClick={() => setSelected(name)}
                  aria-pressed={exercise === name}
                  className={`h-7 shrink-0 rounded-full px-3 text-[13px] font-semibold ${
                    exercise === name ? "bg-accent/20 text-accent" : "text-muted active:text-foreground"}`}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </section>

        {exercise && (
          <section className="card-grad rounded-3xl border border-border p-5">
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent" aria-hidden>{LIFT_ICON}</span>
              <h2 className="flex-1 text-[15px] font-semibold">{exercise} e1RM</h2>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">e1RM</span>
            </div>
            <div className="mb-1">
              <p className="text-[11px] font-medium text-muted">Current</p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {current !== null ? Math.round(current) : "—"} <span className="text-base font-normal text-muted">lb</span>
              </p>
              {delta !== null && prev !== null && (
                <p className={`text-[12px] font-semibold ${delta >= 0 ? "text-success" : "text-danger"}`}>
                  {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)} lb <span className="font-normal text-muted">vs {fmtDay(prev.date)}</span>
                </p>
              )}
            </div>
            <LineChart data={recent12.map((s) => ({ date: s.date, value: Math.round(s.best * 10) / 10 }))} />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-surface-2/60 p-3">
                <p className="text-[11px] font-medium text-muted">Best set</p>
                {best ? (
                  <>
                    <p className="text-[11px] text-muted">{fmtDay(localDateOf(best.logged_at))}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-accent">{best.weight} × {best.reps}</p>
                    <p className="text-[11px] text-muted">e1RM {Math.round(e1rm(best.weight, best.reps))}</p>
                  </>
                ) : <p className="text-sm text-muted">—</p>}
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">e1RM history</p>
                <ul className="flex flex-col gap-1">
                  {[...sessions].slice(-5).reverse().map((s) => (
                    <li key={s.key} className="flex justify-between rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-[12px]">
                      <span className="text-muted">{fmtDay(s.date)}</span>
                      <span className="font-semibold tabular-nums text-accent">{Math.round(s.best)} lb</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold">Workouts</h2>
          {latest ? (
            <div className="card-grad rounded-3xl border border-border p-4">
              <div className="mb-2 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent" aria-hidden>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3 V7 M16 3 V7 M4 10 H20" />
                  </svg>
                </span>
                <p className="flex-1 text-[15px] font-semibold">{fmtDayLong(localDateOf(latest.started_at))} · {workoutTitle(latest.muscle_groups)}</p>
                <Link href={`/workout/${latest.id}`} className="text-[13px] font-semibold text-accent">View ›</Link>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0 text-[13px]">
                <span className="pb-1 text-[11px] font-medium text-muted">Exercise</span>
                <span className="pb-1 text-right text-[11px] font-medium text-muted">Top set</span>
                <span className="pb-1 text-right text-[11px] font-medium text-muted">e1RM</span>
                {latestByExercise.map((g) => {
                  const b = bestSet(g)!;
                  const isSel = exercise !== null && normalizeName(g[0].exercise) === normalizeName(exercise);
                  return (
                    <button key={g[0].exercise} type="button" onClick={() => setSelected(g[0].exercise)}
                      className="col-span-3 grid grid-cols-subgrid border-t border-border py-2 text-left active:bg-surface-2">
                      <span className={`truncate font-medium ${isSel ? "text-accent" : ""}`}>{g[0].exercise}</span>
                      <span className="text-right tabular-nums">{b.weight} × {b.reps}{b.sets > 1 ? ` ×${b.sets}` : ""}</span>
                      <span className="text-right tabular-nums text-muted">{b.weight > 0 ? Math.round(e1rm(b.weight, b.reps)) : "—"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card-grad rounded-3xl border border-border px-4 py-3 text-sm text-muted">No workouts yet</div>
          )}
          {workouts.length > 1 && (
            <ul className="card-grad divide-y divide-border overflow-hidden rounded-3xl border border-border text-sm">
              {workouts.slice(1).map((w) => (
                <li key={w.id}>
                  <Link href={`/workout/${w.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-surface-2">
                    <span className="flex-1 font-medium">{fmtDayLong(localDateOf(w.started_at))} · {workoutTitle(w.muscle_groups)}</span>
                    <span className="tabular-nums text-muted">
                      {setsByWorkout.get(w.id) ?? 0} sets · {formatElapsed(new Date(w.ended_at!).getTime() - new Date(w.started_at).getTime())}
                    </span>
                    <span className="text-muted">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {sessions.length === 0 && rows.length === 0 && (
          <p className="text-center text-sm text-muted">Log a workout and your lifts show up here.</p>
        )}
      </main>
    </AuthGuard>
  );
}
