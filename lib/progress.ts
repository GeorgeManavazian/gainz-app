import { normalizeName } from "./exercises";
import { bestE1rm, e1rm, localDateOf, type LiftRow } from "./workouts";

export type Session = { key: string; date: string; rows: LiftRow[]; best: number };

/** Sessions for one exercise, ascending by date. Grouped by workout_id; local date for legacy null rows. */
export function sessionsFor(exercise: string, rows: LiftRow[]): Session[] {
  const key = normalizeName(exercise);
  const mine = rows.filter((r) => normalizeName(r.exercise) === key);
  const groups = new Map<string, LiftRow[]>();
  for (const r of mine) {
    const k = r.workout_id ?? `d:${localDateOf(r.logged_at)}`;
    const g = groups.get(k);
    if (g) g.push(r); else groups.set(k, [r]);
  }
  return [...groups.entries()]
    .map(([k, g]) => {
      const sorted = [...g].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1));
      return { key: k, date: localDateOf(sorted[0].logged_at), rows: sorted, best: bestE1rm(sorted) ?? 0 };
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function bestSet(rows: LiftRow[]): LiftRow | null {
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (e1rm(b.weight, b.reps) > e1rm(a.weight, a.reps) ? b : a));
}

/** Cut Protocol — Fall 2026. Baselines set 2026-08-31; null = first logged session becomes the baseline. */
export const INDICATORS: { name: string; baseline: number | null }[] = [
  { name: "DB Chest Press", baseline: 111.0 },
  { name: "Seated Shoulder Press", baseline: 141.8 },
  { name: "Back Squat", baseline: null },
  { name: "Leg Press", baseline: null },
  { name: "Romanian Deadlift", baseline: null },
];

export type IndicatorStatus = { latest: number | null; baseline: number | null; pct: number | null;
  level: "ok" | "warn" | "bad" | "none" };

export function indicatorStatus(name: string, rows: LiftRow[]): IndicatorStatus {
  const sessions = sessionsFor(name, rows);
  const latest = sessions.length ? sessions[sessions.length - 1].best : null;
  const configured = INDICATORS.find((i) => normalizeName(i.name) === normalizeName(name))?.baseline ?? null;
  const baseline = configured ?? (sessions.length ? sessions[0].best : null);
  if (latest === null || baseline === null || baseline === 0) return { latest, baseline, pct: null, level: "none" };
  const pct = ((latest - baseline) / baseline) * 100;
  // Epsilon guards the inclusive thresholds against floating-point noise at the boundary
  // (e.g. 111 * 0.92 evaluates to -7.9999999999999964, not exactly -8).
  const EPS = 1e-9;
  const level = pct <= -8 + EPS ? "bad" : pct <= -5 + EPS ? "warn" : "ok";
  return { latest, baseline, pct, level };
}
