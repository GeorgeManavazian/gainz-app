import { EXERCISES, findExercise, normalizeName, type Library } from "./exercises";
import { PRESETS } from "./muscles";
import { sessionsFor } from "./progress";
import type { LiftRow } from "./workouts";

export type Suggestion = { weight: number; kind: "up" | "stay" | "build"; lastWeight: number; lastReps: number };

/** Best set by heaviest weight; ties by most reps, then earliest logged_at. Not e1RM. */
export function bestByWeight(rows: LiftRow[]): LiftRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => {
    if (b.weight !== a.weight) return b.weight > a.weight ? b : a;
    if (b.reps !== a.reps) return b.reps > a.reps ? b : a;
    return b.logged_at < a.logged_at ? b : a;
  });
}

/** True when `a` is heavier than `b`, or the same weight for more reps. */
export function beats(a: LiftRow, b: LiftRow): boolean {
  return a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);
}

/** PR test against rows of the same exercise logged strictly earlier than `row`. */
export function isPr(row: LiftRow, before: LiftRow[]): boolean {
  const key = normalizeName(row.exercise);
  const prior = before.filter((r) => normalizeName(r.exercise) === key && r.logged_at < row.logged_at);
  const best = bestByWeight(prior);
  return best === null || beats(row, best);
}

/** Heaviest weight the set-sheet wheel offers. */
export const MAX_WEIGHT = 500;

const snap = (n: number) => Math.round(n / 2.5) * 2.5;
const wheelValue = (n: number) => Math.min(MAX_WEIGHT, snap(n));

/** Median of positive consecutive top-set weight deltas between sessions, snapped to 2.5; `fallback` if none. */
export function typicalJump(exercise: string, rows: LiftRow[], fallback: number): number {
  const tops = sessionsFor(exercise, rows).map((s) => bestByWeight(s.rows)!.weight);
  const deltas: number[] = [];
  for (let i = 1; i < tops.length; i++) if (tops[i] > tops[i - 1]) deltas.push(tops[i] - tops[i - 1]);
  if (deltas.length === 0) return fallback;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  const median = deltas.length % 2 ? deltas[mid] : (deltas[mid - 1] + deltas[mid]) / 2;
  return snap(median);
}

/** Lower body = the exercise's first muscle group is in the lower preset. Unknown exercise = upper. */
export function isLowerBody(exercise: string, lib: Library = EXERCISES): boolean {
  const first = findExercise(exercise, lib)?.muscles[0];
  return first !== undefined && PRESETS.lower.includes(first);
}

/** Next-load suggestion from the most recent session's top set; null with no history or a bodyweight top set. Always a valid wheel value. */
export function suggestNext(exercise: string, previousRows: LiftRow[], lib: Library = EXERCISES): Suggestion | null {
  const sessions = sessionsFor(exercise, previousRows);
  if (sessions.length === 0) return null;
  const top = bestByWeight(sessions[sessions.length - 1].rows)!;
  if (top.weight === 0) return null; // bodyweight: no load to progress
  const base = { lastWeight: top.weight, lastReps: top.reps };
  if (top.reps >= 8) {
    const jump = typicalJump(exercise, previousRows, isLowerBody(exercise, lib) ? 10 : 5);
    return { ...base, kind: "up", weight: wheelValue(top.weight + jump) };
  }
  return { ...base, kind: top.reps >= 5 ? "stay" : "build", weight: wheelValue(top.weight) };
}

/** Chip copy for a suggestion. */
export function suggestionLabel(s: Suggestion): string {
  if (s.kind === "up") return `Try ${s.weight} · hit ${s.lastReps} last time`;
  if (s.kind === "stay") return `Stay ${s.weight} · aim 8+`;
  return `Stay ${s.weight} · build to 5`;
}
