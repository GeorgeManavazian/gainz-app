import { addDays, slopeLbPerWk, KCAL_PER_LB_PER_WK, type WeighIn } from "./trend";

export const ADAPTIVE_WINDOW_DAYS = 21;
export const ADAPTIVE_MIN_LOGGED_DAYS = 14;

export type DailyKcal = { date: string /* YYYY-MM-DD */; kcal: number };

/**
 * Back-solves TDEE from logged intake vs. measured weight change over
 * ADAPTIVE_WINDOW_DAYS. Days with no dailyKcal row are gaps, never counted
 * as 0. Returns null if fewer than ADAPTIVE_MIN_LOGGED_DAYS are logged in
 * the window, or if slopeLbPerWk can't produce a slope (not enough weigh-ins).
 */
export function computeAdaptiveTdee(
  dailyKcal: DailyKcal[],
  weighIns: WeighIn[],
  today: string
): { tdee: number; loggedDays: number } | null {
  const start = addDays(today, -(ADAPTIVE_WINDOW_DAYS - 1));
  const inWindow = dailyKcal.filter((d) => d.date >= start && d.date <= today);
  if (inWindow.length < ADAPTIVE_MIN_LOGGED_DAYS) return null;

  const slope = slopeLbPerWk(weighIns, today, ADAPTIVE_WINDOW_DAYS);
  if (slope === null) return null;

  const avgLoggedKcal = inWindow.reduce((sum, d) => sum + d.kcal, 0) / inWindow.length;
  const tdee = Math.round(avgLoggedKcal - slope * KCAL_PER_LB_PER_WK);
  return { tdee, loggedDays: inWindow.length };
}
