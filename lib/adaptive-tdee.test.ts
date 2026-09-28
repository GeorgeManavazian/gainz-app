import { describe, it, expect } from "vitest";
import { computeAdaptiveTdee, type DailyKcal } from "./adaptive-tdee";
import { addDays, type WeighIn } from "./trend";

const today = "2026-09-30";

function kcalDays(dates: string[], kcal: number): DailyKcal[] {
  return dates.map((date) => ({ date, kcal }));
}

/** n daily weigh-ins ending on `end`, weight = start + perDay * i (mirrors lib/trend.test.ts's series helper). */
function weighSeries(end: string, n: number, start: number, perDay: number): WeighIn[] {
  const out: WeighIn[] = [];
  for (let i = 0; i < n; i++) out.push({ date: addDays(end, i - (n - 1)), weight_lb: start + perDay * i });
  return out;
}

describe("computeAdaptiveTdee", () => {
  it("null with no data at all", () => {
    expect(computeAdaptiveTdee([], [], today)).toBeNull();
  });

  it("null with 13 logged days even with plenty of weigh-ins", () => {
    const dates = Array.from({ length: 13 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).toBeNull();
  });

  it("a number at exactly 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).not.toBeNull();
  });

  it("null with fewer than 8 weigh-ins in the window, even with 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 7, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).toBeNull();
  });

  it("worked example: avg 2200 kcal, slope −1.0 lb/wk → tdee 2700", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 210, -1.0 / 7);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBe(2700);
    expect(result!.loggedDays).toBe(14);
  });

  it("a 0-kcal logged day is still a logged day, not a gap — no NaN, no crash", () => {
    const dates = Array.from({ length: 13 }, (_, i) => addDays(today, -(i + 1)));
    const dailyKcal = [...kcalDays(dates, 2200), { date: addDays(today, -14), kcal: 0 }];
    const weighIns = weighSeries(today, 8, 203, 0);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.loggedDays).toBe(14);
    expect(Number.isNaN(result!.tdee)).toBe(false);
  });

  it("gap days are excluded from the average, not counted as 0", () => {
    // 14 logged days scattered across the 21-day window (offsets 1-20, today excluded), 6 gap days with no row at all.
    const dates = [1, 2, 3, 5, 6, 8, 9, 11, 13, 14, 16, 18, 19, 20].map((offset) => addDays(today, -offset));
    const dailyKcal = kcalDays(dates, 2000);
    const weighIns = weighSeries(today, 8, 203, 0); // flat, slope 0
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBe(2000);
    expect(result!.loggedDays).toBe(14);
  });

  it("ignores dailyKcal rows outside the 21-day window", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const dailyKcal = [...kcalDays(dates, 2200), { date: addDays(today, -30), kcal: 9000 }];
    const weighIns = weighSeries(today, 8, 203, 0);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result!.tdee).toBe(2200);
  });

  it("excludes today from the intake average — today's partial log doesn't shift tdee or loggedDays", () => {
    // 14 full logged days, all strictly before today, averaging 2200 kcal.
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const dailyKcal = [...kcalDays(dates, 2200), { date: today, kcal: 400 }]; // partial same-day log
    const weighIns = weighSeries(today, 21, 210, -1.0 / 7);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    const withoutToday = computeAdaptiveTdee(kcalDays(dates, 2200), weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.loggedDays).toBe(14);
    expect(result!.tdee).toBe(2700);
    expect(result).toEqual(withoutToday);
  });
});
