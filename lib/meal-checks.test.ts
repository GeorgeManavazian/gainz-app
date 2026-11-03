import { describe, it, expect } from "vitest";
import { dailyChecks, type CheckMeal } from "./meal-checks";
import { preSaveWarning } from "./meal-warnings";

const day = (h: number, m = 0) => new Date(2026, 10, 2, h, m, 0, 0);
const iso = (h: number, m = 0) => day(h, m).toISOString();
const meal = (h: number, m: number, calories: number, protein_g = 30, fat_g = 10, carbs_g = 40): CheckMeal => ({ logged_at: iso(h, m), calories, protein_g, fat_g, carbs_g });
const clock = { wake: "07:00", bed: "23:00" };
const workout = { started_at: iso(17), ended_at: iso(18) };
const slots = [8 * 60, 12 * 60 + 30, 15 * 60, 19 * 60];

describe("dailyChecks", () => {
  it("a good training day passes all five", () => {
    const meals = [meal(8, 0, 500, 35, 12, 50), meal(12, 30, 600, 40, 15, 60), meal(15, 0, 450, 30, 8, 90), meal(18, 45, 700, 45, 20, 80)];
    const c = dailyChecks({ meals, workout, clock, slots, now: day(23, 30), dayOver: true });
    expect(c.map((x) => x.ok)).toEqual([true, true, true, true, true]);
    expect(c[0].detail).toMatch(/90 C · 8 F, 2.0 h before/);
  });
  it("fatty pre-meal fails fuelled; late dinner fails; protein after missing once the window closed", () => {
    const meals = [meal(8, 0, 500, 35), meal(12, 30, 600, 40), meal(15, 0, 450, 30, 30, 90), meal(21, 0, 800, 45)];
    const c = dailyChecks({ meals, workout, clock, slots, now: day(23, 30), dayOver: true });
    expect(c[0].ok).toBe(false); expect(c[0].detail).toMatch(/30 F/);
    expect(c[1].ok).toBe(false);
    expect(c[3].ok).toBe(false); expect(c[3].detail).toMatch(/800 kcal at 9pm/);
  });
  it("mid-day: undecided checks are null, not false", () => {
    const meals = [meal(8, 0, 500, 35)];
    const c = dailyChecks({ meals, workout: null, clock, slots: null, now: day(10), dayOver: false });
    expect(c.map((x) => x.ok)).toEqual([null, null, null, null, null]);
  });
  it("protein after counts a feeding within 2 h of the end", () => {
    const c = dailyChecks({ meals: [meal(19, 30, 600, 42)], workout, clock, slots: null, now: day(20), dayOver: false });
    expect(c[1].ok).toBe(true);
  });
});

describe("preSaveWarning", () => {
  const ctx = { now: day(20, 30), clock, training: null, trainingDone: false };
  it("heavy meal within 3 h of bed", () => {
    expect(preSaveWarning({ calories: 700, fat_g: 20 }, ctx)).toMatch(/700 kcal 2.5 h before bed/);
    expect(preSaveWarning({ calories: 250, fat_g: 5 }, ctx)).toBeNull();
    expect(preSaveWarning({ calories: 700, fat_g: 20 }, { ...ctx, now: day(18) })).toBeNull();
  });
  it("fatty or big meal before training", () => {
    const pre = { ...ctx, now: day(15), training: day(17) };
    expect(preSaveWarning({ calories: 600, fat_g: 28 }, pre)).toMatch(/28 g fat 2 h before training/);
    expect(preSaveWarning({ calories: 600, fat_g: 10 }, pre)).toBeNull();
    expect(preSaveWarning({ calories: 600, fat_g: 10 }, { ...pre, now: day(16, 20) })).toMatch(/under an hour before training/);
    expect(preSaveWarning({ calories: 600, fat_g: 28 }, { ...pre, trainingDone: true })).toBeNull();
  });
});
