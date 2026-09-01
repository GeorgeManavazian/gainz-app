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
      const startedAt = sorted[0].logged_at;
      const session: Session = { key: k, date: localDateOf(startedAt), rows: sorted, best: bestE1rm(sorted) ?? 0 };
      return { session, startedAt };
    })
    .sort((a, b) => (a.session.date < b.session.date ? -1 : a.session.date > b.session.date ? 1
      : a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
    .map((x) => x.session);
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

export type IndexPoint = { date: string; value: number };

/**
 * Strength Index: every exercise's session-best e1RM normalized to its own first
 * session (=100), averaged across exercises per training day (carry-forward).
 */
export function strengthIndex(rows: LiftRow[]): IndexPoint[] {
  const byExercise = new Map<string, ReturnType<typeof sessionsFor>>();
  const names = new Set(rows.map((r) => normalizeName(r.exercise)));
  for (const n of names) {
    const sess = sessionsFor(n, rows).filter((s) => s.best > 0);
    if (sess.length > 0) byExercise.set(n, sess);
  }
  const dates = [...new Set([...byExercise.values()].flat().map((s) => s.date))].sort();
  const out: IndexPoint[] = [];
  for (const d of dates) {
    const rels: number[] = [];
    for (const sess of byExercise.values()) {
      if (sess[0].date > d) continue; // exercise not started yet
      let latest = sess[0];
      for (const s of sess) { if (s.date <= d) latest = s; else break; }
      rels.push((latest.best / sess[0].best) * 100);
    }
    if (rels.length) out.push({ date: d, value: Math.round((rels.reduce((a, b) => a + b, 0) / rels.length) * 10) / 10 });
  }
  return out;
}

export type IndexAdvice = { level: "ok" | "watch" | "warn"; text: string };

/** Cut Protocol-aligned read of the index: drops demand carbs, holding while cutting is a win. */
export function indexAdvice(series: IndexPoint[], phase: "cut" | "maintain" | "bulk"): IndexAdvice | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1].value;
  const peak = Math.max(...series.map((p) => p.value));
  const dropPct = ((peak - last) / peak) * 100;
  if (dropPct >= 5) {
    return { level: "warn", text: `Down ${dropPct.toFixed(1)}% from peak — add 150–200 kcal as carbs, retest in 3 weeks` };
  }
  if (dropPct >= 2.5) {
    return { level: "watch", text: `Slightly off peak (−${dropPct.toFixed(1)}%) — watch the next sessions` };
  }
  if (phase === "cut") return { level: "ok", text: "Holding strength while cutting — on plan" };
  return { level: "ok", text: last > 100 ? "Getting stronger — keep going" : "Holding steady" };
}

