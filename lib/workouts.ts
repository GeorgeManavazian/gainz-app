import { findExercise, normalizeName, type MuscleGroup } from "./exercises";

export type LiftRow = { id: string; exercise: string; sets: number; reps: number; weight: number;
  logged_at: string; workout_id: string | null };
export type WorkoutRow = { id: string; started_at: string; ended_at: string | null; muscle_groups: MuscleGroup[] };

export function localDateOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Distinct names, newest-first; custom names always, library names only when their muscles match. */
export function recentExercises(rows: LiftRow[], groups: MuscleGroup[], limit = 8): string[] {
  const set = new Set(groups);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = normalizeName(r.exercise);
    if (seen.has(key)) continue;
    seen.add(key);
    const lib = findExercise(r.exercise);
    if (lib && !lib.muscles.some((m) => set.has(m))) continue;
    out.push(r.exercise.trim());
    if (out.length >= limit) break;
  }
  return out;
}

/** Rows of the most recent session for `exercise`, oldest-first. */
export function lastSession(exercise: string, rows: LiftRow[]): LiftRow[] {
  const key = normalizeName(exercise);
  const mine = rows.filter((r) => normalizeName(r.exercise) === key)
    .sort((a, b) => (a.logged_at < b.logged_at ? 1 : a.logged_at > b.logged_at ? -1 : 0));
  const latest = mine[0];
  if (!latest) return [];
  const session = latest.workout_id
    ? mine.filter((r) => r.workout_id === latest.workout_id)
    : mine.filter((r) => r.workout_id === null && localDateOf(r.logged_at) === localDateOf(latest.logged_at));
  return session.reverse();
}

export function formatSession(rows: LiftRow[]): string {
  return rows.map((r) => `${r.weight}×${r.reps}${r.sets > 1 ? ` ×${r.sets}` : ""}`).join(", ");
}

export function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export function bestE1rm(rows: LiftRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => e1rm(r.weight, r.reps)));
}

export function beatLastTime(current: LiftRow[], previous: LiftRow[]): boolean {
  const c = bestE1rm(current), p = bestE1rm(previous);
  if (c === null || p === null) return false;
  return c > p;
}

export function groupByExercise(rows: LiftRow[]): { exercise: string; rows: LiftRow[] }[] {
  const groups: { exercise: string; rows: LiftRow[] }[] = [];
  const index = new Map<string, number>();
  for (const r of rows) {
    const key = normalizeName(r.exercise);
    const i = index.get(key);
    if (i === undefined) { index.set(key, groups.length); groups.push({ exercise: r.exercise.trim(), rows: [r] }); }
    else groups[i].rows.push(r);
  }
  return groups;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function totalSets(rows: LiftRow[]): number {
  return rows.reduce((a, r) => a + r.sets, 0);
}

export function totalVolume(rows: LiftRow[]): number {
  return rows.reduce((a, r) => a + r.sets * r.reps * r.weight, 0);
}
