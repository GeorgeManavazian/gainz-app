import { findExercise } from "./exercises";
import type { Library } from "./exercises";
import { MUSCLES, regionOf, targetOf } from "./muscles";
import type { Muscle, MuscleGroup } from "./muscles";
import { localDateOf } from "./workouts";
import type { LiftRow } from "./workouts";

export type MuscleWeek = Record<Muscle, { hits: number; sets: number }>;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local Monday of the week containing `d`, as YYYY-MM-DD. */
export function weekStartOf(d: Date): string {
  const back = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
}

const weekOf = (r: LiftRow) => weekStartOf(new Date(r.logged_at));

export function muscleWeek(lifts: LiftRow[], lib: Library, weekStart: string): MuscleWeek {
  const week = Object.fromEntries(MUSCLES.map((m) => [m.id, { hits: 0, sets: 0 }])) as MuscleWeek;
  const seen = new Map<Muscle, Set<string>>();
  for (const r of lifts) {
    if (weekOf(r) !== weekStart) continue;
    const ex = findExercise(r.exercise, lib);
    if (!ex) continue;
    const key = r.workout_id ?? "d:" + localDateOf(r.logged_at);
    for (const m of new Set([...ex.primary, ...ex.secondary])) {
      const keys = seen.get(m) ?? new Set<string>();
      keys.add(key);
      seen.set(m, keys);
    }
    for (const m of ex.primary) week[m].sets += r.sets;
  }
  for (const [m, keys] of seen) week[m].hits = keys.size;
  return week;
}

export function behindThisWeek(week: MuscleWeek): Muscle[] {
  return MUSCLES.filter((m) => m.target !== null && week[m.id].hits < m.target).map((m) => m.id);
}

export function recentWeeks(lifts: LiftRow[], lib: Library, n: number, today: Date): { weekStart: string; week: MuscleWeek }[] {
  const out: { weekStart: string; week: MuscleWeek }[] = [];
  for (let i = 0; i < n; i++) {
    const weekStart = weekStartOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * i));
    out.push({ weekStart, week: muscleWeek(lifts, lib, weekStart) });
  }
  return out;
}

export function musclesHit(lifts: LiftRow[], lib: Library): Set<Muscle> {
  const out = new Set<Muscle>();
  for (const r of lifts) {
    const ex = findExercise(r.exercise, lib);
    if (ex) for (const m of [...ex.primary, ...ex.secondary]) out.add(m);
  }
  return out;
}

export function hasCompletedWorkoutThisWeek(history: LiftRow[], weekStart: string, currentWorkoutId: string): boolean {
  return history.some((r) => r.workout_id !== currentWorkoutId && weekOf(r) === weekStart);
}

export function splitByRegion(muscles: Muscle[], groups: MuscleGroup[]): { inRegion: Muscle[]; other: Muscle[] } {
  const inRegion: Muscle[] = [];
  const other: Muscle[] = [];
  for (const m of muscles) (groups.includes(regionOf(m)) ? inRegion : other).push(m);
  return { inRegion, other };
}
