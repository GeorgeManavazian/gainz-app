import { addDays } from "./trend";

export const ACTIVITY_BASELINE_WINDOW_DAYS = 14;
export const ACTIVITY_MIN_BASELINE_DAYS = 7;

export type DailyActivity = { date: string /* YYYY-MM-DD */; active_kcal: number };

/**
 * Same-day activity bonus: how much more active energy today shows versus
 * the user's own trailing 14-day baseline, floored at 0 so a quiet day
 * never reduces the budget. Days with no row are gaps, never counted as 0.
 * Today's own row (if present) is never part of the baseline — only the
 * comparison point.
 */
export function computeActivityBonus(history: DailyActivity[], today: string): number {
  const start = addDays(today, -ACTIVITY_BASELINE_WINDOW_DAYS);
  const baselineEnd = addDays(today, -1);
  const inWindow = history.filter((d) => d.date >= start && d.date <= baselineEnd);
  if (inWindow.length < ACTIVITY_MIN_BASELINE_DAYS) return 0;

  const baseline = inWindow.reduce((sum, d) => sum + d.active_kcal, 0) / inWindow.length;
  const todayActive = history.find((d) => d.date === today)?.active_kcal ?? 0;
  return Math.max(0, Math.round(todayActive - baseline));
}
