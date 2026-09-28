import { describe, it, expect } from "vitest";
import { computeActivityBonus, type DailyActivity } from "./activity-adjustment";
import { addDays } from "./trend";

const today = "2026-09-30";

function activityDays(dates: string[], active_kcal: number): DailyActivity[] {
  return dates.map((date) => ({ date, active_kcal }));
}

describe("computeActivityBonus", () => {
  it("0 with no history at all", () => {
    expect(computeActivityBonus([], today)).toBe(0);
  });

  it("0 with 6 days of baseline history (below ACTIVITY_MIN_BASELINE_DAYS)", () => {
    const dates = Array.from({ length: 6 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 300), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("a real number at exactly 7 days of baseline history", () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 300), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(600);
  });

  it("floors at 0 when today is below baseline — never a penalty", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 500), { date: today, active_kcal: 100 }];
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("worked example: baseline 400, today 650 → bonus 250", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 400), { date: today, active_kcal: 650 }];
    expect(computeActivityBonus(history, today)).toBe(250);
  });

  it("today missing from history entirely → treated as 0 active, bonus 0", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1)));
    const history = activityDays(dates, 400);
    expect(computeActivityBonus(history, today)).toBe(0);
  });

  it("gap days inside the baseline window are excluded from the average, not counted as 0", () => {
    // 7 logged baseline days scattered across offsets 1-14, 7 gap days with no row at all.
    const dates = [1, 2, 4, 6, 8, 11, 14].map((offset) => addDays(today, -offset));
    const history = [...activityDays(dates, 400), { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(500);
  });

  it("ignores history rows outside the 14-day baseline window", () => {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(today, -(i + 1)));
    const history = [...activityDays(dates, 400), { date: addDays(today, -30), active_kcal: 5000 }, { date: today, active_kcal: 900 }];
    expect(computeActivityBonus(history, today)).toBe(500);
  });
});
