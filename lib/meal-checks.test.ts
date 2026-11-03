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
  it("on time ignores a small snack (< 300 kcal) far from any slot", () => {
    const meals = [meal(8, 0, 500), meal(12, 30, 600), meal(15, 0, 450), meal(19, 0, 700), meal(21, 30, 150, 25, 3, 5)];
    const c = dailyChecks({ meals, workout: null, clock, slots, now: day(23, 30), dayOver: true });
    expect(c[4].ok).toBe(true); expect(c[4].detail).toBe("4 of 4 meals");
  });
  it("dinner early: a big meal within 2 h after a late session is exempt; a late non-workout dinner still fails", () => {
    const late = { started_at: iso(19, 30), ended_at: iso(20, 30) };
    const c = dailyChecks({ meals: [meal(21, 0, 800, 50)], workout: late, clock, slots: null, now: day(23, 30), dayOver: true });
    expect(c[3].ok).toBe(true);
    const d = dailyChecks({ meals: [meal(21, 0, 800, 50)], workout: null, clock, slots: null, now: day(23, 30), dayOver: true });
    expect(d[3].ok).toBe(false);
  });
  it("dinner early stays undecided until the day is over (no ✓ → ✗ flip); a fail shows at once", () => {
    const c = dailyChecks({ meals: [meal(18, 0, 700)], workout: null, clock, slots: null, now: day(20, 30), dayOver: false });
    expect(c[3].ok).toBeNull();
    const f = dailyChecks({ meals: [meal(20, 30, 700)], workout: null, clock, slots: null, now: day(20, 45), dayOver: false });
    expect(f[3].ok).toBe(false);
  });
  it("session later today → the session checks read 'Not started', not 'No workout'", () => {
    const c = dailyChecks({ meals: [meal(8, 0, 500)], workout: null, clock, slots: null, now: day(10), dayOver: false, trainingLater: true });
    expect(c[0].detail).toBe("Not started"); expect(c[1].detail).toBe("Not started");
    expect(c[0].ok).toBeNull();
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
