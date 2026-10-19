import { describe, it, expect } from "vitest";
import { MUSCLES, MUSCLE_GROUPS, PRESETS, REGION_DEFAULT, isMuscle, muscleName, musclesIn, regionOf, targetOf } from "./muscles";

describe("taxonomy", () => {
  it("has 18 muscles in display order", () => {
    expect(MUSCLES.map((m) => m.id)).toEqual(["upper_chest", "mid_chest", "lower_chest", "front_delts", "side_delts", "rear_delts",
      "lats", "upper_back", "traps", "lower_back", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "abs"]);
  });
  it("targets: 2 on the twelve named, null on the rest", () => {
    const targeted = MUSCLES.filter((m) => m.target === 2).map((m) => m.id);
    expect(targeted).toEqual(["upper_chest", "mid_chest", "side_delts", "rear_delts", "lats", "upper_back", "lower_back",
      "biceps", "triceps", "quads", "hamstrings", "glutes"]);
    expect(targetOf("forearms")).toBeNull();
  });
  it("every muscle maps to one of the 8 regions; every region has a default inside it", () => {
    const regions = new Set(MUSCLE_GROUPS.map((g) => g.id));
    for (const m of MUSCLES) expect(regions.has(m.region)).toBe(true);
    for (const g of MUSCLE_GROUPS) expect(regionOf(REGION_DEFAULT[g.id])).toBe(g.id);
    expect(REGION_DEFAULT.shoulders).toBe("side_delts");
  });
  it("musclesIn / muscleName / isMuscle", () => {
    expect(musclesIn("back")).toEqual(["lats", "upper_back", "traps", "lower_back"]);
    expect(muscleName("side_delts")).toBe("Side delts");
    expect(isMuscle("lats")).toBe(true);
    expect(isMuscle("quadz")).toBe(false);
  });
  it("region membership", () => {
    expect(musclesIn("chest")).toEqual(["upper_chest", "mid_chest", "lower_chest"]);
    expect(musclesIn("shoulders")).toEqual(["front_delts", "side_delts", "rear_delts"]);
    expect(musclesIn("biceps")).toEqual(["biceps", "forearms"]);
    expect(musclesIn("triceps")).toEqual(["triceps"]);
    expect(musclesIn("quads")).toEqual(["quads"]);
    expect(musclesIn("hamstrings_glutes")).toEqual(["hamstrings", "glutes", "calves"]);
    expect(musclesIn("core")).toEqual(["abs"]);
  });
  it("regions and presets moved intact", () => {
    expect(MUSCLE_GROUPS.map((m) => m.id)).toEqual(["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings_glutes", "core"]);
    expect(PRESETS.upper).toEqual(["chest", "back", "shoulders", "biceps", "triceps"]);
  });
});
