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
  it("splits remaining across meals left, rounded (kcal→10, grams→1)", () => {
    const t = { calories: 1360, protein_g: 118, carbs_g: 153, fat_g: 36 };
    const n = nextMeal(t, targets, 2)!; // 4 meals/day → 2 left
    expect(n.mealsLeft).toBe(2);
    expect(n.kcal).toBe(620);        // 1240/2
    expect(n.protein_g).toBe(44);    // 88/2
    expect(n.carbs_g).toBe(70);      // 140/2
    expect(n.fat_g).toBe(16);        // 31/2 → 15.5 → 16
  });
  it("meals-left floor of 1", () => {
    const n = nextMeal({ calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 50 }, targets, 9)!;
    expect(n.mealsLeft).toBe(1);
    expect(n.kcal).toBe(600);
  });
  it("negative macro remainders clamp to 0", () => {
    const n = nextMeal({ calories: 2000, protein_g: 210, carbs_g: 200, fat_g: 50 }, targets, 3)!;
    expect(n.protein_g).toBe(0);
  });
  it("null when kcal target hit", () => {
    expect(nextMeal({ calories: 2600, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets, 3)).toBeNull();
    expect(nextMeal({ calories: 2700, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets, 3)).toBeNull();
  });
});
