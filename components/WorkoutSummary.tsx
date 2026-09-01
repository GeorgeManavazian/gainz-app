// components/WorkoutSummary.tsx
"use client";
import Link from "next/link";
import { findExercise, muscleShort } from "@/lib/exercises";
import { beatLastTime, formatElapsed, groupByExercise, lastSession, totalSets, totalVolume, workoutTitle,
  type LiftRow, type WorkoutRow } from "@/lib/workouts";

export default function WorkoutSummary({ workout, logged, history }: {
  workout: WorkoutRow; logged: LiftRow[]; history: LiftRow[];
}) {
  const started = new Date(workout.started_at);
  const ended = new Date(workout.ended_at ?? workout.started_at);
  const previousRows = history.filter((r) => r.logged_at < workout.started_at);
  const groups = groupByExercise(logged);
  const cards = groups.map((g) => ({ ...g, beat: beatLastTime(g.rows, lastSession(g.exercise, previousRows)) }));
  const beats = cards.filter((c) => c.beat).length;
  const title = workoutTitle(workout.muscle_groups);
  const when = `${started.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${started.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
        <span className="rounded-full border border-accent/40 px-3 py-1.5 text-lg font-semibold tabular-nums text-accent">
          ⏱ {formatElapsed(ended.getTime() - started.getTime())}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent text-2xl text-accent">✓</span>
        <h1 className="text-3xl font-bold">Workout complete</h1>
        <p className="text-[15px] text-muted">{title} · {when}</p>
        <p className="text-[15px] tabular-nums text-muted">{formatElapsed(ended.getTime() - started.getTime())}</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-base font-semibold">Performance summary</h2>
        <div className="grid grid-cols-3 divide-x divide-border text-center">
          {([["Sets", totalSets(logged)], ["Volume (lbs)", totalVolume(logged).toLocaleString()], ["Beat last time", beats]] as const).map(([label, v]) => (
            <div key={label} className="px-2">
              <p className="text-[22px] font-bold tabular-nums">{v}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {cards.map((g) => {
        const beat = g.beat;
        return (
          <section key={g.exercise} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
                {muscleShort(findExercise(g.exercise)?.muscles[0])}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{g.exercise}</h3>
                  {beat && <span className="rounded-full bg-accent/15 px-3 py-1 text-[13px] font-semibold text-accent">Beat last time</span>}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>
                      <span className="text-base tabular-nums">{r.weight} × {r.reps}{r.sets > 1 ? ` ×${r.sets}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
        <Link href="/" className="block w-full rounded-xl bg-accent py-4 text-center text-lg font-bold text-accent-foreground active:opacity-80">
          Done
        </Link>
      </div>
    </main>
  );
}
