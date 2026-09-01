import { describe, it, expect } from "vitest";
import { EXERCISES, MUSCLE_GROUPS, PRESETS, exercisesFor, findExercise, muscleShort,
  normalizeName, searchExercises } from "./exercises";

describe("library shape", () => {
  it("has the 8 muscle groups in display order", () => {
    expect(MUSCLE_GROUPS.map((m) => m.id)).toEqual([
      "chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings_glutes", "core"]);
  });
  it("presets", () => {
    expect(PRESETS.upper).toEqual(["chest", "back", "shoulders", "biceps", "triceps"]);
    expect(PRESETS.lower).toEqual(["quads", "hamstrings_glutes", "core"]);
  });
  it("contains the indicator lifts under their exact names", () => {
    for (const n of ["DB Chest Press", "Seated Shoulder Press", "Back Squat", "Leg Press", "Romanian Deadlift"]) {
      expect(findExercise(n)?.name).toBe(n);
    }
  });
  it("has no duplicate names (case-insensitive) and every exercise has ≥1 muscle", () => {
    const seen = new Set<string>();
    for (const e of EXERCISES) {
      expect(seen.has(normalizeName(e.name))).toBe(false);
      seen.add(normalizeName(e.name));
      expect(e.muscles.length).toBeGreaterThan(0);
    }
    expect(EXERCISES.length).toBeGreaterThanOrEqual(100);
  });
});

describe("exercisesFor", () => {
  it("returns entries whose muscles intersect the groups", () => {
    const chest = exercisesFor(["chest"]);
    expect(chest.some((e) => e.name === "DB Chest Press")).toBe(true);
    expect(chest.some((e) => e.name === "Lat Pulldown")).toBe(false);
  });
  it("multi-muscle exercise appears for either group, once for both", () => {
    const incline = (g: Parameters<typeof exercisesFor>[0]) =>
      exercisesFor(g).filter((e) => e.name === "Incline DB Press").length;
    expect(incline(["chest"])).toBe(1);
    expect(incline(["shoulders"])).toBe(1);
    expect(incline(["chest", "shoulders"])).toBe(1);
  });
  it("empty groups → empty", () => expect(exercisesFor([])).toEqual([]));
});

describe("searchExercises / findExercise", () => {
  it("is case-insensitive substring and ignores groups", () => {
    expect(searchExercises("lat pull").map((e) => e.name)).toContain("Lat Pulldown");
    expect(searchExercises("LAT PULL").map((e) => e.name)).toContain("Lat Pulldown");
  });
  it("empty query → empty", () => expect(searchExercises("   ")).toEqual([]));
  it("findExercise trims and ignores case", () => {
    expect(findExercise("  db chest press ")?.name).toBe("DB Chest Press");
    expect(findExercise("Nope")).toBeUndefined();
  });
  it("muscleShort", () => {
    expect(muscleShort("chest")).toBe("CH");
    expect(muscleShort("hamstrings_glutes")).toBe("HG");
    expect(muscleShort(undefined)).toBe("••");
  });
});
