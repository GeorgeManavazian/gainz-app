/** Learn the times a person usually eats from their last two weeks, so suggestions are predictable. Pure, local time. */
import { feedings, type TimingMeal } from "./meal-timing";

export const PATTERN_WINDOW_DAYS = 14;
export const PATTERN_MIN_DAYS = 10;        // days with ≥ 2 feedings before we trust the pattern
export const WEEKDAY_WINDOW_DAYS = 42;     // per-weekday pattern looks back six weeks…
export const WEEKDAY_MIN_DAYS = 3;         // …and needs three of that weekday to be used
export const SLOT_MIN_SHARE = 0.5;         // a slot must show up on ≥ half the eating days
export const SLOT_BUCKET_MIN = 90;         // feedings within 90 min of a slot centre belong to it

export type MealSlot = { minute: number; share: number; days: number };
export type MealPattern = {
  ready: boolean; daysWithMeals: number; windowDays: number; slots: MealSlot[];
  /** "weekday": slots learned from the same weekday (schedules differ by day); "all": the two-week overall pattern. */
  scope: "weekday" | "all"; weekdayDays: number;
};

const H = 3_600_000, DAY = 24 * H;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Feeding minutes-of-day per day over the window (today excluded: it's still being written). `weekday` keeps only that weekday. */
export function feedingDays(meals: TimingMeal[], now: Date, windowDays = PATTERN_WINDOW_DAYS, weekday?: number): Map<string, number[]> {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const since = todayStart.getTime() - windowDays * DAY;
  const byDay = new Map<string, number[]>();
  for (const f of feedings(meals)) {
    const d = new Date(f.at);
    if (d.getTime() < since || d.getTime() >= todayStart.getTime()) continue;
    if (weekday !== undefined && d.getDay() !== weekday) continue;
    const k = dayKey(d);
    byDay.set(k, [...(byDay.get(k) ?? []), minuteOfDay(d)]);
  }
  return byDay;
}

/** Greedy clustering of feeding minutes across days; slots kept when they recur on ≥ half the days. */
export function clusterSlots(days: number[][]): MealSlot[] {
  const daysWithMeals = days.length;
  if (daysWithMeals === 0) return [];

  // Each day contributes each feeding minute once; cluster greedily around the densest centres.
  const all = days.flatMap((mins, i) => mins.map((m) => ({ m, day: i })));
  const slots: MealSlot[] = [];
  const used = new Set<number>();
  while (true) {
    let best: { centre: number; members: number[] } | null = null;
    for (let i = 0; i < all.length; i++) {
      if (used.has(i)) continue;
      const c = all[i].m;
      const members = all.map((x, j) => ({ x, j })).filter(({ x, j }) => !used.has(j) && Math.abs(x.m - c) <= SLOT_BUCKET_MIN).map(({ j }) => j);
      if (!best || members.length > best.members.length) best = { centre: c, members };
    }
    if (!best || best.members.length === 0) break;
    const dayset = new Set(best.members.map((j) => all[j].day));
    const share = dayset.size / daysWithMeals;
    for (const j of best.members) used.add(j);
    if (share >= SLOT_MIN_SHARE) slots.push({ minute: Math.round(median(best.members.map((j) => all[j].m))), share, days: dayset.size });
    if (used.size >= all.length) break;
  }
  slots.sort((a, b) => a.minute - b.minute);
  return slots;
}

/** Usual eating slots. Ready after ≥ 10 eating days in two weeks; once there are ≥ 3 of today's weekday
 *  in the last six weeks, that weekday's own pattern is used (schedules differ by day). */
export function usualMealSlots(meals: TimingMeal[], now: Date): MealPattern {
  const eatingDays = (m: Map<string, number[]>) => [...m.values()].filter((mins) => mins.length >= 2);
  const overall = eatingDays(feedingDays(meals, now));
  const daysWithMeals = overall.length;
  const ready = daysWithMeals >= PATTERN_MIN_DAYS;
  const sameWeekday = eatingDays(feedingDays(meals, now, WEEKDAY_WINDOW_DAYS, now.getDay()));
  const useWeekday = ready && sameWeekday.length >= WEEKDAY_MIN_DAYS;
  return {
    ready, daysWithMeals, windowDays: PATTERN_WINDOW_DAYS,
    slots: ready ? clusterSlots(useWeekday ? sameWeekday : overall) : [],
    scope: useWeekday ? "weekday" : "all", weekdayDays: sameWeekday.length,
  };
}
