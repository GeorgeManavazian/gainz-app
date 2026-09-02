import { describe, it, expect } from "vitest";
import { itemsFromMeals, scaleItem, totals, sortPatterns, type PatternItem } from "./patterns";

const yogurt: PatternItem = { food_name: "Greek yogurt, nonfat", grams: 320,
  per100g: { kcal: 59.0625, protein: 10.3125, carbs: 3.59375, fat: 0.40625 }, fdc_id: "170903" };

describe("itemsFromMeals", () => {
  it("derives per-100g from a logged row and keeps grams + fdc_id", () => {
    const [it0] = itemsFromMeals([{ food_name: "Greek yogurt, nonfat", grams: 320, calories: 189,
      protein_g: 33, carbs_g: 11.5, fat_g: 1.3, fdc_id: "170903" }]);
    expect(it0.grams).toBe(320);
    expect(it0.fdc_id).toBe("170903");
    expect(it0.per100g.kcal).toBeCloseTo(59.06, 1);
    expect(it0.per100g.protein).toBeCloseTo(10.31, 1);
  });
  it("skips rows with grams <= 0 and maps a missing fdc_id to null", () => {
    const out = itemsFromMeals([
      { food_name: "Bad", grams: 0, calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0 },
      { food_name: "Honey", grams: 17, calories: 52, protein_g: 0, carbs_g: 14, fat_g: 0 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].fdc_id).toBeNull();
  });
});

describe("scaleItem", () => {
  it("scales to new grams, rounding to 0.1 like the meal page", () => {
    const e = scaleItem(yogurt, 250);
    expect(e).toEqual({ food_name: "Greek yogurt, nonfat", grams: 250, calories: 147.7,
      protein_g: 25.8, carbs_g: 9, fat_g: 1, fdc_id: "170903" });
  });
  it("omits fdc_id when the item has none", () => {
    const e = scaleItem({ ...yogurt, fdc_id: null }, 100);
    expect("fdc_id" in e).toBe(false);
  });
});

describe("totals", () => {
  it("sums and rounds to integers — today's breakfast is 810 · 54 · 92 · 27", () => {
    const t = totals([
      { food_name: "Plain bagel", grams: 105, calories: 290, protein_g: 11, carbs_g: 56, fat_g: 2 },
      { food_name: "Greek yogurt, nonfat", grams: 320, calories: 189, protein_g: 33, carbs_g: 11.5, fat_g: 1.3 },
      { food_name: "Skippy peanut butter", grams: 47, calories: 279, protein_g: 10.3, carbs_g: 10.3, fat_g: 23.5 },
      { food_name: "Honey", grams: 17, calories: 52, protein_g: 0, carbs_g: 14, fat_g: 0 },
    ]);
    expect(t).toEqual({ kcal: 810, protein_g: 54, carbs_g: 92, fat_g: 27 });
  });
  it("empty list is all zeros", () => {
    expect(totals([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe("sortPatterns", () => {
  it("most recently used first, never-used last by newest created", () => {
    const rows = [
      { id: "a", last_used_at: null, created_at: "2026-09-01T10:00:00Z" },
      { id: "b", last_used_at: "2026-09-01T08:00:00Z", created_at: "2026-08-01T00:00:00Z" },
      { id: "c", last_used_at: "2026-09-01T09:00:00Z", created_at: "2026-08-15T00:00:00Z" },
      { id: "d", last_used_at: null, created_at: "2026-09-02T10:00:00Z" },
    ];
    expect(sortPatterns(rows).map((r) => r.id)).toEqual(["c", "b", "d", "a"]);
  });
  it("does not mutate the input", () => {
    const rows = [{ id: "x", last_used_at: null, created_at: "2026-09-01T00:00:00Z" },
      { id: "y", last_used_at: "2026-09-01T00:00:00Z", created_at: "2026-09-01T00:00:00Z" }];
    const copy = [...rows];
    sortPatterns(rows);
    expect(rows).toEqual(copy);
  });
});
