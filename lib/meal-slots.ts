/** Learn the times a person usually eats from their last two weeks, so suggestions are predictable. Pure, local time. */
import { feedings, type TimingMeal } from "./meal-timing";

export const PATTERN_WINDOW_DAYS = 14;
export const PATTERN_MIN_DAYS = 10;        // days with ≥ 2 feedings before we trust the pattern
export const SLOT_MIN_SHARE = 0.5;         // a slot must show up on ≥ half the eating days
export const SLOT_BUCKET_MIN = 90;         // feedings within 90 min of a slot centre belong to it
export const SLOT_HALF_WIDTH_MIN = 30;     // suggested window = usual time ± 30 min

export type MealSlot = { minute: number; share: number; days: number };
export type MealPattern = { ready: boolean; daysWithMeals: number; windowDays: number; slots: MealSlot[] };

const H = 3_600_000, DAY = 24 * H;
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Feeding minutes-of-day per day over the window (today excluded: it's still being written). */
export function feedingDays(meals: TimingMeal[], now: Date, windowDays = PATTERN_WINDOW_DAYS): Map<string, number[]> {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const since = todayStart.getTime() - windowDays * DAY;
  const byDay = new Map<string, number[]>();
  for (const f of feedings(meals)) {
    const d = new Date(f.at);
    if (d.getTime() < since || d.getTime() >= todayStart.getTime()) continue;
    const k = dayKey(d);
    byDay.set(k, [...(byDay.get(k) ?? []), minuteOfDay(d)]);
  }
  return byDay;
}

/** Usual eating slots: greedy clustering of feeding times across days; slots kept when they recur on ≥ half the days. */
export function usualMealSlots(meals: TimingMeal[], now: Date): MealPattern {
  const byDay = feedingDays(meals, now);
  const days = [...byDay.values()].filter((mins) => mins.length >= 2);
  const daysWithMeals = days.length;
  const ready = daysWithMeals >= PATTERN_MIN_DAYS;
  if (daysWithMeals === 0) return { ready: false, daysWithMeals, windowDays: PATTERN_WINDOW_DAYS, slots: [] };

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
  return { ready, daysWithMeals, windowDays: PATTERN_WINDOW_DAYS, slots };
}

/** The usual slot in progress (now within ± half-width) or the next one later today; null when the day's slots are done. */
export function nextSlot(slots: MealSlot[], now: Date): { slot: MealSlot; start: Date; end: Date } | null {
  const nowMin = minuteOfDay(now);
  for (const s of slots) {
    if (s.minute + SLOT_HALF_WIDTH_MIN < nowMin) continue;
    const at = (m: number) => { const d = new Date(now); d.setHours(0, m, 0, 0); return d; };
    return { slot: s, start: at(s.minute - SLOT_HALF_WIDTH_MIN), end: at(s.minute + SLOT_HALF_WIDTH_MIN) };
  }
  return null;
}
