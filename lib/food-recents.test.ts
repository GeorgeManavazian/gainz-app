import { describe, it, expect } from "vitest";
import { rankRecentFoods, type MealLike } from "./food-recents";

// All times local. `now` = Oct 29 2026, 08:00.
const now = new Date(2026, 9, 29, 8, 0);
const at = (daysAgo: number, h: number, m = 0) => {
  const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString();
};
const meal = (o: Partial<MealLike> & { food_name: string; logged_at: string }): MealLike => ({
  grams: 100, calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5, unit: "g", ...o });

describe("rankRecentFoods", () => {
  it("a food eaten at this time of day outranks one eaten more often at other times", () => {
    const meals = [
      meal({ food_name: "Oats", logged_at: at(1, 7, 30) }), meal({ food_name: "Oats", logged_at: at(3, 8, 15) }),
      meal({ food_name: "Rice", logged_at: at(1, 19) }), meal({ food_name: "Rice", logged_at: at(2, 19) }),
      meal({ food_name: "Rice", logged_at: at(3, 19) }), meal({ food_name: "Rice", logged_at: at(4, 19) }),
    ];
    const r = rankRecentFoods(meals, now);
    expect(r.map((f) => f.name)).toEqual(["Oats", "Rice"]);
    expect(r[0].sameTimeCount).toBe(2);
    expect(r[1].sameTimeCount).toBe(0);
  });
  it("recency bonus: logged within 48h beats an equal-count food logged a week ago", () => {
    const meals = [meal({ food_name: "A", logged_at: at(1, 14) }), meal({ food_name: "B", logged_at: at(7, 14) })];
    expect(rankRecentFoods(meals, now).map((f) => f.name)).toEqual(["A", "B"]);
  });
  it("dedupes by name case-insensitively and keeps the latest log's per-100g values", () => {
    const meals = [
      meal({ food_name: "greek yogurt", logged_at: at(5, 8), grams: 200, calories: 120 }),
      meal({ food_name: "Greek Yogurt", logged_at: at(1, 8), grams: 150, calories: 150 }),
    ];
    const r = rankRecentFoods(meals, now);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("Greek Yogurt");
    expect(r[0].count).toBe(2);
    expect(r[0].per100g.kcal).toBeCloseTo(100);
    expect(r[0].lastGrams).toBe(150);
    expect(r[0].lastCalories).toBe(150);
  });
  it("excludes serving-unit lines, zero grams, and logs outside the window", () => {
    const meals = [
      meal({ food_name: "Protein bar", logged_at: at(1, 8), unit: "serving" }),
      meal({ food_name: "Nothing", logged_at: at(1, 8), grams: 0 }),
      meal({ food_name: "Old", logged_at: at(40, 8) }),
      meal({ food_name: "Keep", logged_at: at(1, 8) }),
    ];
    expect(rankRecentFoods(meals, now).map((f) => f.name)).toEqual(["Keep"]);
  });
  it("non-numeric fdc_id is dropped rather than becoming NaN", () => {
    const r = rankRecentFoods([meal({ food_name: "X", logged_at: at(1, 8), fdc_id: "abc" }), meal({ food_name: "Y", logged_at: at(1, 8), fdc_id: "123" })], now);
    expect(r.find((f) => f.name === "X")?.fdcId).toBeUndefined();
    expect(r.find((f) => f.name === "Y")?.fdcId).toBe(123);
  });
  it("time-of-day band wraps across midnight", () => {
    const late = new Date(2026, 9, 29, 23, 30);
    const meals = [meal({ food_name: "Casein", logged_at: at(1, 0, 30) })]; // 00:30 vs 23:30 = 60 min apart
    expect(rankRecentFoods(meals, late)[0].sameTimeCount).toBe(1);
  });
  it("respects the limit and orders ties by most recent", () => {
    const meals = Array.from({ length: 12 }, (_, i) => meal({ food_name: `F${i}`, logged_at: at(10 + i, 15) }));
    const r = rankRecentFoods(meals, now, { limit: 5 });
    expect(r).toHaveLength(5);
    expect(r.map((f) => f.name)).toEqual(["F0", "F1", "F2", "F3", "F4"]);
  });
});
