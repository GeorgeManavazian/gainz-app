import { describe, it, expect } from "vitest";
import { EXERCISES, MUSCLE_GROUPS, PRESETS, exercisesFor, findExercise, makeExercise, muscleShort,
  normalizeName, searchExercises, exercisesForMuscle } from "./exercises";
import type { MuscleGroup } from "./exercises";
import { regionOf } from "./muscles";

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
  it("every exercise has ≥1 primary, no overlap, and derived regions from primary only", () => {
    for (const x of EXERCISES) {
      expect(x.primary.length).toBeGreaterThan(0);
      for (const m of x.secondary) expect(x.primary).not.toContain(m);
      const derived = [...new Set(x.primary.map(regionOf))];
      expect(x.muscles).toEqual(derived);
      expect(x.muscles[0]).toBe(regionOf(x.primary[0]));
    }
  });
  it("spec-pinned tags", () => {
    expect(findExercise("BB Bench Press")).toMatchObject({ primary: ["mid_chest"], secondary: ["triceps", "front_delts"] });
    expect(findExercise("Incline DB Press")).toMatchObject({ primary: ["upper_chest"], secondary: ["front_delts", "triceps"] });
    expect(findExercise("DB Lateral Raise")).toMatchObject({ primary: ["side_delts"], secondary: [] });
    expect(findExercise("Lat Pulldown")!.primary).toEqual(["lats"]);
    expect(findExercise("Deadlift")!.primary).toEqual(["hamstrings", "glutes", "lower_back"]);
    expect(findExercise("Standing Calf Raise")!.primary).toEqual(["calves"]);
    expect(findExercise("Hip Adduction")!.primary).toEqual(["glutes"]);
  });
  it("makeExercise rejects an empty primary", () => {
    expect(() => makeExercise("x", [])).toThrow();
  });
});

describe("exercisesFor", () => {
  it("returns entries whose muscles intersect the groups", () => {
    const chest = exercisesFor(["chest"]);
    expect(chest.some((e) => e.name === "DB Chest Press")).toBe(true);
    expect(chest.some((e) => e.name === "Lat Pulldown")).toBe(false);
  });
  it("secondary muscles do not put an exercise in another section", () => {
    const incline = (g: MuscleGroup[]) => exercisesFor(g).filter((x) => x.name === "Incline DB Press").length;
    expect(incline(["chest"])).toBe(1);
    expect(incline(["shoulders"])).toBe(0);
    const dl = (g: MuscleGroup[]) => exercisesFor(g).filter((x) => x.name === "Deadlift").length;
    expect(dl(["back"])).toBe(1);
    expect(dl(["hamstrings_glutes"])).toBe(1);
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

describe("exercisesForMuscle", () => {
  it("lists primary matches first, each group alphabetical", () => {
    const names = exercisesForMuscle("triceps").map((x) => x.name);
    const firstSecondary = names.findIndex((n) => findExercise(n)!.secondary.includes("triceps"));
    const lastPrimary = names.map((n) => findExercise(n)!.primary.includes("triceps")).lastIndexOf(true);
    expect(lastPrimary).toBeLessThan(firstSecondary);
    expect(names).toContain("BB Bench Press");
  });
});
