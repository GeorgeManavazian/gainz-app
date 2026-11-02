import { describe, it, expect } from "vitest";
import { rowFromRecord, normName } from "./custom-foods";

describe("rowFromRecord", () => {
  it("coerces numeric strings, keeps a null serving, trims the name", () => {
    expect(rowFromRecord({ id: "x", name: " Oikos ", serving_g: null, kcal: "95", protein_g: "17", carbs_g: 4, fat_g: 0 }))
      .toEqual({ id: "x", name: "Oikos", serving_g: null, kcal: 95, protein_g: 17, carbs_g: 4, fat_g: 0 });
  });
  it("turns garbage numbers into 0 rather than NaN", () => {
    const r = rowFromRecord({ id: "y", name: "Bad", serving_g: "abc", kcal: undefined });
    expect(r.serving_g).toBe(0);
    expect(r.kcal).toBe(0);
  });
});

describe("normName", () => {
  it("lower-cases and trims", () => expect(normName("  Greek Yogurt ")).toBe("greek yogurt"));
});
