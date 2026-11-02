import { describe, it, expect } from "vitest";
import { parseNutritionLabel, per100g } from "./label-parse";

const FDA = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%`;

describe("parseNutritionLabel", () => {
  it("reads a standard FDA label", () => {
    const p = parseNutritionLabel(FDA);
    expect(p).toMatchObject({ servingG: 55, kcal: 230, fat: 8, carbs: 37, protein: 3, found: 4 });
    expect(p.servingText).toContain("2/3 cup");
  });
  it("tolerates OCR noise: Og, Calorles, Carbohydrat3", () => {
    const p = parseNutritionLabel("Serving size 1 scoop (32g)\nCalorles 120\nTotal Fat Og\nTotal Carbohydrat3 3g\nProte1n 24g");
    expect(p).toMatchObject({ servingG: 32, kcal: 120, fat: 0, carbs: 3, protein: 24, found: 4 });
  });
  it("reads an EU-style per-100g panel with kcal", () => {
    const p = parseNutritionLabel("Nutrition information per 100 g\nEnergy 1046 kJ / 250 kcal\nFat 8.5 g\nof which saturates 1.2 g\nCarbohydrate 37 g\nof which sugars 12 g\nProtein 3.2 g\nSalt 0.4 g");
    expect(p).toMatchObject({ servingG: 100, kcal: 250, fat: 8.5, carbs: 37, protein: 3.2, found: 4 });
  });
  it("never takes saturated fat, fibre, or 'calories from fat' for the totals", () => {
    const p = parseNutritionLabel("Calories 230 Calories from Fat 72\nSaturated Fat 1g\nTotal Fat 8g\nDietary Fiber 4g\nTotal Carbohydrate 37g\nProtein 3g");
    expect(p).toMatchObject({ kcal: 230, fat: 8, carbs: 37, protein: 3 });
  });
  it("missing serving size → null, found counts what it got", () => {
    const p = parseNutritionLabel("Calories 90\nProtein 20g");
    expect(p.servingG).toBeNull();
    expect(p.found).toBe(2);
    expect(p.fat).toBeNull();
  });
  it("garbage → nothing found", () => {
    expect(parseNutritionLabel("lorem ipsum dolor").found).toBe(0);
  });
});

describe("per100g", () => {
  it("scales a 55 g serving to 100 g with one decimal", () => {
    expect(per100g({ kcal: 230, protein: 3, carbs: 37, fat: 8 }, 55)).toEqual({ kcal: 418.2, protein: 5.5, carbs: 67.3, fat: 14.5 });
  });
});
