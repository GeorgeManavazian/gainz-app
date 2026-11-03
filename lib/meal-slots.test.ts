import { describe, it, expect } from "vitest";
import { usualMealSlots, feedingDays } from "./meal-slots";
import type { TimingMeal } from "./meal-timing";

const now = new Date(2026, 10, 3, 14, 0); // Tue 3 Nov 2026 2pm
const at = (daysAgo: number, h: number, m = 0): string => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
const meal = (logged_at: string, calories = 500, protein_g = 35): TimingMeal => ({ logged_at, calories, protein_g, fat_g: 10 });
/** A regular eater: 8:00, 12:30, 16:00, 19:30 (±15 min jitter) every day for `days` days. */
const regular = (days: number): TimingMeal[] => Array.from({ length: days }, (_, i) => {
  const j = (i % 3) * 7 - 7; // -7, 0, +7 minutes
  return [meal(at(i + 1, 8, 0 + j)), meal(at(i + 1, 12, 30 + j)), meal(at(i + 1, 16, 0 + j)), meal(at(i + 1, 19, 30 + j))];
}).flat();

describe("feedingDays", () => {
  it("groups feedings by local day, excludes today and beyond the window", () => {
    const m = [meal(at(0, 9)), meal(at(1, 9)), meal(at(1, 9, 20)), meal(at(20, 9))];
    const d = feedingDays(m, now);
    expect(d.size).toBe(1);
    expect([...d.values()][0]).toHaveLength(1); // 9:00 + 9:20 merge into one feeding
  });
});

describe("usualMealSlots", () => {
  it("not ready with fewer than 10 eating days; still reports progress", () => {
    const p = usualMealSlots(regular(6), now);
    expect(p.ready).toBe(false); expect(p.daysWithMeals).toBe(6); expect(p.windowDays).toBe(14);
  });
  it("finds the four usual slots from two regular weeks", () => {
    const p = usualMealSlots(regular(14), now);
    expect(p.ready).toBe(true);
    expect(p.slots.map((s) => Math.round(s.minute / 15) * 15)).toEqual([480, 750, 960, 1170]);
    expect(p.slots.every((s) => s.share >= 0.5)).toBe(true);
  });
  it("drops an occasional snack that only happens on a few days", () => {
    const m = [...regular(12), meal(at(2, 22), 150), meal(at(5, 22), 150)];
    const p = usualMealSlots(m, now);
    expect(p.slots.some((s) => s.minute >= 21 * 60)).toBe(false);
  });
  it("a day with a single feeding doesn't count toward readiness", () => {
    const m = Array.from({ length: 12 }, (_, i) => meal(at(i + 1, 12)));
    expect(usualMealSlots(m, now).daysWithMeals).toBe(0);
  });
});

describe("per-weekday patterns", () => {
  // Weekdays: 8:00/12:30/16:00/19:30. Saturdays: 10:00/14:00/19:30. Six weeks of history.
  const sixWeeks = (): TimingMeal[] => {
    const out: TimingMeal[] = [];
    for (let i = 1; i <= 42; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const sat = d.getDay() === 6;
      const times = sat ? [[10, 0], [14, 0], [19, 30]] : [[8, 0], [12, 30], [16, 0], [19, 30]];
      for (const [h, m] of times) out.push(meal(at(i, h, m)));
    }
    return out;
  };
  it("uses Saturday's own slots on a Saturday once three Saturdays are in", () => {
    const sat = new Date(2026, 10, 7, 9, 0); // Sat 7 Nov 2026
    const p = usualMealSlots(sixWeeks(), sat);
    expect(p.ready).toBe(true); expect(p.scope).toBe("weekday"); expect(p.weekdayDays).toBeGreaterThanOrEqual(3);
    expect(p.slots.map((s) => s.minute)).toEqual([600, 840, 1170]);
  });
  it("falls back to the overall pattern when that weekday is thin", () => {
    const twoWeeks = sixWeeks().filter((m) => new Date(m.logged_at).getTime() > now.getTime() - 14 * 86_400_000);
    const sat = new Date(2026, 10, 7, 9, 0);
    const p = usualMealSlots(twoWeeks, sat);
    expect(p.scope).toBe("all");
  });
});
