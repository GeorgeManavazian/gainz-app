import { describe, it, expect } from "vitest";
import { FOODS, searchFoods, matchScore, foodByFdcId, defaultHalf, type CuratedFood } from "./foods";

const both = FOODS.filter((f) => f.raw && f.cooked);

describe("curated food table integrity", () => {
  it("has entries", () => { expect(FOODS.length).toBeGreaterThan(50); });
  it("every food has a name, ≥1 alias and at least one USDA half", () => {
    for (const f of FOODS) {
      expect(f.name.trim().length, f.name).toBeGreaterThan(0);
      expect(f.aliases.length, f.name).toBeGreaterThan(0);
      expect(f.cooked || f.raw, f.name).toBeTruthy();
    }
  });
  it("no duplicate names", () => {
    const seen = new Set<string>();
    for (const f of FOODS) {
      const k = f.name.toLowerCase();
      expect(seen.has(k), `dup ${f.name}`).toBe(false);
      seen.add(k);
    }
  });
  it("no fdcId is used by two different foods", () => {
    const owner = new Map<number, string>();
    for (const f of FOODS) for (const h of [f.cooked, f.raw]) {
      if (!h) continue;
      const prev = owner.get(h.fdcId);
      expect(prev === undefined || prev === f.name, `${h.fdcId} in ${prev} and ${f.name}`).toBe(true);
      owner.set(h.fdcId, f.name);
    }
  });
  it("halves carry plausible per-100g numbers", () => {
    for (const f of FOODS) for (const h of [f.cooked, f.raw]) {
      if (!h) continue;
      expect(h.kcal, `${f.name} kcal`).toBeGreaterThan(0);
      expect(h.kcal, `${f.name} kcal`).toBeLessThan(950);
      expect(h.protein, `${f.name} P`).toBeGreaterThanOrEqual(0);
      expect(h.protein + h.carbs + h.fat, `${f.name} macros`).toBeLessThanOrEqual(105);
    }
  });
  it("raw vs cooked densities point the right way", () => {
    for (const f of both) {
      const r = f.raw!, c = f.cooked!;
      if (f.rawLabel === "Dry") {
        // Dry grains/legumes soak up water: dry is far denser than cooked.
        expect(r.kcal, `${f.name} dry should be denser`).toBeGreaterThan(c.kcal * 1.5);
      } else {
        // Meat/fish lose water when cooked: raw is less dense. Boiled veg can gain a little water, so allow 15%.
        // Very fatty cuts (pork belly, bacon) render fat out, so raw can be denser — skip those.
        if (r.fat > 30) continue;
        expect(r.kcal, `${f.name} raw denser than cooked?`).toBeLessThanOrEqual(c.kcal * 1.15);
      }
    }
  });
  it("paired foods have a rawLabel", () => {
    for (const f of both) expect(f.rawLabel, f.name).toBeTruthy();
  });
});

describe("search", () => {
  it("exact alias wins", () => {
    const f: CuratedFood = { name: "Chicken breast", aliases: ["chicken breast", "chicken"], cooked: null, raw: null };
    expect(matchScore(f, "Chicken Breast")).toBe(100);
    expect(matchScore(f, "chicken breasts")).toBe(95);
    expect(matchScore(f, "chick")).toBe(50);
    expect(matchScore(f, "breast chicken")).toBe(60);
    expect(matchScore(f, "salmon")).toBe(0);
  });
  it("the searches the user complained about land on the right row", () => {
    const first = (q: string) => searchFoods(q)[0]?.name;
    expect(first("chicken breast")).toBe("Chicken breast");
    expect(first("grilled chicken breast")).toBe("Chicken breast");
    expect(first("steak")?.toLowerCase()).toContain("steak");
    expect(first("eggs")?.toLowerCase()).toContain("egg");
    expect(first("rice")?.toLowerCase()).toContain("rice");
    expect(first("greek yogurt")?.toLowerCase()).toContain("greek yogurt");
  });
  it("a bare 'chicken' lists chicken cuts, breast first", () => {
    const names = searchFoods("chicken").map((f) => f.name);
    expect(names[0]).toBe("Chicken breast");
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const n of names) expect(n.toLowerCase()).toContain("chicken");
  });
  it("'eggs' lists eggs, never eggplant; 'oats' never oat milk first", () => {
    const names = searchFoods("eggs").map((f) => f.name.toLowerCase());
    expect(names[0]).toContain("egg");
    expect(names.some((n) => n.includes("eggplant"))).toBe(false);
    expect(searchFoods("oats")[0].name.toLowerCase()).toContain("oats");
  });
  it("fdcId lookup and default half", () => {
    const f = FOODS.find((x) => x.raw && x.cooked)!;
    expect(foodByFdcId(f.raw!.fdcId)).toEqual({ food: f, half: "raw" });
    expect(defaultHalf({ name: "x", aliases: [], cooked: { fdcId: 1, description: "", kcal: 1, protein: 0, carbs: 0, fat: 0 }, raw: null })).toBe("cooked");
  });
});
