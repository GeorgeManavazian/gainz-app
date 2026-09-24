import { describe, it, expect } from "vitest";
import { nextMeal, remaining, ringFractions } from "./hub";

describe("ringFractions", () => {
  it("under target", () => expect(ringFractions(1360, 2600)).toEqual({ fill: 1360 / 2600, over: 0 }));
  it("exactly at target", () => expect(ringFractions(2600, 2600)).toEqual({ fill: 1, over: 0 }));
  it("over target", () => expect(ringFractions(2780, 2600)).toEqual({ fill: 1, over: 180 / 2600 }));
  it("double-over clamps", () => expect(ringFractions(6000, 2600)).toEqual({ fill: 1, over: 1 }));
  it("zero/negative target", () => {
    expect(ringFractions(500, 0)).toEqual({ fill: 0, over: 0 });
    expect(ringFractions(500, -5)).toEqual({ fill: 0, over: 0 });
  });
});

describe("remaining", () => {
  it("positive under, negative over", () => {
    expect(remaining(1360, 2600)).toBe(1240);
    expect(remaining(2780, 2600)).toBe(-180);
  });
});

describe("nextMeal", () => {
  const targets = { kcal: 2600, protein_g: 206, carbs_g: 293, fat_g: 67 };
  const at = (h: number, m = 0) => new Date(`2026-09-24T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  it("no meals logged yet: window starts at now, splits across mealsPerDay", () => {
    // window 10:00→22:00 = 12h, hoursPerMeal = 3h, hoursRemaining = 12h → mealsLeft = 4
    const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const n = nextMeal(t, targets, [], at(10))!;
    expect(n.mealsLeft).toBe(4);
    expect(n.kcal).toBe(650); // 2600/4
  });

  it("early in the day with meals logged: many hours left → smaller per-meal split", () => {
    // first meal 8:00, window 8:00→22:00 = 14h, hoursPerMeal = 3.5h, now 9:00 → hoursRemaining 13h → mealsLeft = ceil(13/3.5) = 4
    const t = { calories: 1360, protein_g: 118, carbs_g: 153, fat_g: 36 };
    const meals = [{ logged_at: at(8).toISOString() }];
    const n = nextMeal(t, targets, meals, at(9))!;
    expect(n.mealsLeft).toBe(4);
    expect(n.kcal).toBe(310); // 1240/4 = 310
  });

  it("late in the day: few hours left → bigger per-meal split", () => {
    // first meal 8:00, window 8:00→22:00 = 14h, hoursPerMeal = 3.5h, now 20:00 → hoursRemaining 2h → mealsLeft = ceil(2/3.5) = 1
    const t = { calories: 1360, protein_g: 118, carbs_g: 153, fat_g: 36 };
    const meals = [{ logged_at: at(8).toISOString() }];
    const n = nextMeal(t, targets, meals, at(20))!;
    expect(n.mealsLeft).toBe(1);
    expect(n.kcal).toBe(1240);
  });

  it("past window end: meals-left floors at 1", () => {
    const meals = [{ logged_at: at(8).toISOString() }];
    const n = nextMeal({ calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 50 }, targets, meals, at(23))!;
    expect(n.mealsLeft).toBe(1);
    expect(n.kcal).toBe(600);
  });

  it("negative macro remainders clamp to 0", () => {
    const meals = [{ logged_at: at(8).toISOString() }];
    const n = nextMeal({ calories: 2000, protein_g: 210, carbs_g: 200, fat_g: 50 }, targets, meals, at(9))!;
    expect(n.protein_g).toBe(0);
  });

  it("null when kcal target hit", () => {
    const meals = [{ logged_at: at(8).toISOString() }];
    expect(nextMeal({ calories: 2600, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets, meals, at(9))).toBeNull();
    expect(nextMeal({ calories: 2700, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets, meals, at(9))).toBeNull();
  });
});
