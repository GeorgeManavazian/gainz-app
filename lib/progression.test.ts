import { describe, it, expect } from "vitest";
import type { LiftRow } from "./workouts";
import { EXERCISES } from "./exercises";
import { mergeLibrary } from "./custom-exercises";
import { bestByWeight, isPr, isLowerBody, suggestNext, suggestionLabel, typicalJump } from "./progression";

const row = (o: Partial<LiftRow> & { logged_at: string }): LiftRow => ({
  id: o.logged_at, exercise: "DB Chest Press", sets: 1, reps: 6, weight: 95, workout_id: null, ...o });

/** One single-row session per entry, one day apart, ascending. */
const hist = (weights: number[], reps = 6, exercise = "DB Chest Press"): LiftRow[] =>
  weights.map((weight, i) => row({ logged_at: `2026-09-${String(i + 1).padStart(2, "0")}T15:00:00.000Z`,
    workout_id: `w${i}`, weight, reps, exercise }));

describe("bestByWeight", () => {
  it("returns null for empty", () => expect(bestByWeight([])).toBeNull());
  it("picks highest weight, ties by reps, then earliest logged_at", () => {
    const a = row({ logged_at: "2026-09-30T15:00:00.000Z", weight: 195, reps: 6 });
    const b = row({ logged_at: "2026-10-05T15:00:00.000Z", weight: 195, reps: 6 });
    const c = row({ logged_at: "2026-10-01T15:00:00.000Z", weight: 190, reps: 10 });
    expect(bestByWeight([c, b, a])).toBe(a);
    const d = row({ logged_at: "2026-10-06T15:00:00.000Z", weight: 195, reps: 7 });
    expect(bestByWeight([a, d])).toBe(d);
  });
});

describe("isPr", () => {
  const prev = [row({ logged_at: "2026-09-01T15:00:00.000Z", weight: 100, reps: 8 })];
  const at = (weight: number, reps: number, t = "2026-10-01T15:00:00.000Z") => row({ logged_at: t, weight, reps });
  it("true when before is empty", () => expect(isPr(at(50, 1), [])).toBe(true));
  it("heavier, more reps at same weight; not tie; not lighter", () => {
    expect(isPr(at(105, 1), prev)).toBe(true);
    expect(isPr(at(100, 9), prev)).toBe(true);
    expect(isPr(at(100, 8), prev)).toBe(false);
    expect(isPr(at(95, 12), prev)).toBe(false);
  });
  it("second PR in one workout: both rows PR with earlier same-workout rows in before", () => {
    const r1 = at(110, 5, "2026-10-01T15:00:00.000Z");
    const r2 = at(115, 5, "2026-10-01T15:10:00.000Z");
    expect(isPr(r1, [...prev, r1, r2])).toBe(true);
    expect(isPr(r2, [...prev, r1, r2])).toBe(true);
    expect(isPr(r1, [...prev, r1, r2].filter((x) => x !== r1))).toBe(true);
  });
  it("ignores other exercises and later rows", () => {
    const other = row({ logged_at: "2026-09-02T15:00:00.000Z", exercise: "Back Squat", weight: 300, reps: 5 });
    const later = row({ logged_at: "2026-10-09T15:00:00.000Z", weight: 500, reps: 5 });
    expect(isPr(at(105, 1), [...prev, other, later])).toBe(true);
  });
});

describe("typicalJump", () => {
  it("median of positive consecutive top-set deltas, rounded to 2.5", () => {
    expect(typicalJump("DB Chest Press", hist([185, 190, 200, 200, 210]), 5)).toBe(10);
  });
  it("even count: mean of middle values, rounded to 2.5", () => {
    expect(typicalJump("DB Chest Press", hist([185, 190, 200]), 5)).toBe(7.5);
  });
  it("fallback when only one session or no positive deltas", () => {
    expect(typicalJump("DB Chest Press", hist([185]), 5)).toBe(5);
    expect(typicalJump("DB Chest Press", hist([200, 190, 190]), 7)).toBe(7);
    expect(typicalJump("DB Chest Press", [], 10)).toBe(10);
  });
});

describe("isLowerBody", () => {
  it("Back Squat true, DB Chest Press false, unknown false", () => {
    expect(isLowerBody("Back Squat")).toBe(true);
    expect(isLowerBody("DB Chest Press")).toBe(false);
    expect(isLowerBody("Nonexistent Lift")).toBe(false);
  });
  it("custom quads exercise via merged library true", () => {
    const lib = mergeLibrary(EXERCISES, [{ id: "c1", name: "Zercher Hold Thing", primary_muscles: ["quads"], secondary_muscles: [] }]);
    expect(isLowerBody("Zercher Hold Thing", lib)).toBe(true);
    expect(isLowerBody("Zercher Hold Thing")).toBe(false);
  });
});

describe("suggestNext", () => {
  it("null with no history", () => expect(suggestNext("DB Chest Press", [])).toBeNull());
  it("null when history is only other exercises", () =>
    expect(suggestNext("DB Chest Press", hist([185], 9, "Back Squat"))).toBeNull());
  it("up: 185x9 -> 190 (fallback 5, upper)", () => {
    expect(suggestNext("DB Chest Press", hist([185], 9))).toEqual({ weight: 190, kind: "up", lastWeight: 185, lastReps: 9 });
  });
  it("up lower body with no deltas -> +10", () => {
    expect(suggestNext("Back Squat", hist([185], 8, "Back Squat"))!.weight).toBe(195);
  });
  it("stay: 185x6; build: 185x4; boundaries 7 and 5 stay, 4 builds", () => {
    expect(suggestNext("DB Chest Press", hist([185], 6))).toEqual({ weight: 185, kind: "stay", lastWeight: 185, lastReps: 6 });
    expect(suggestNext("DB Chest Press", hist([185], 7))!.kind).toBe("stay");
    expect(suggestNext("DB Chest Press", hist([185], 5))!.kind).toBe("stay");
    expect(suggestNext("DB Chest Press", hist([185], 4))).toEqual({ weight: 185, kind: "build", lastWeight: 185, lastReps: 4 });
  });
  it("uses most recent session only; sets>1 row counts once", () => {
    const rows = [...hist([225], 3), row({ logged_at: "2026-10-01T15:00:00.000Z", workout_id: "last", weight: 185, reps: 8, sets: 3 })];
    expect(suggestNext("DB Chest Press", rows)).toMatchObject({ kind: "up", weight: 190, lastWeight: 185 });
  });
  it("up weight is a 2.5 multiple: median of deltas 2.5 and 5 (3.75) rounds to 5", () => {
    const rows = [...hist([175, 177.5], 6), row({ logged_at: "2026-09-10T15:00:00.000Z", workout_id: "x", weight: 182.5, reps: 9 })];
    expect(suggestNext("DB Chest Press", rows)!.weight).toBe(187.5);
  });
  it("up caps at the wheel maximum (497.5x9 -> 500, 495x8 with +10 jump -> 500)", () => {
    expect(suggestNext("DB Chest Press", hist([497.5], 9))!.weight).toBe(500);
    expect(suggestNext("Back Squat", hist([495], 8, "Back Squat"))!.weight).toBe(500);
  });
  it("stay/build snap an off-wheel weight to 2.5", () => {
    expect(suggestNext("DB Chest Press", hist([132.3], 6))!.weight).toBe(132.5);
    expect(suggestNext("DB Chest Press", hist([132.3], 3))!.weight).toBe(132.5);
  });
  it("bodyweight top set (weight 0) -> null", () => {
    expect(suggestNext("DB Chest Press", hist([0], 9))).toBeNull();
    expect(suggestNext("DB Chest Press", hist([0], 6))).toBeNull();
  });
  it("custom lower-body exercise passed via lib gets the +10 fallback", () => {
    const lib = mergeLibrary(EXERCISES, [{ id: "c1", name: "Zercher Hold Thing", primary_muscles: ["quads"], secondary_muscles: [] }]);
    const rows = hist([100], 8, "Zercher Hold Thing");
    expect(suggestNext("Zercher Hold Thing", rows, lib)!.weight).toBe(110);
    expect(suggestNext("Zercher Hold Thing", rows)!.weight).toBe(105);
  });
});

describe("suggestionLabel", () => {
  it("exact copy for up / stay / build", () => {
    expect(suggestionLabel({ weight: 190, kind: "up", lastWeight: 185, lastReps: 9 })).toBe("Try 190 · hit 9 last time");
    expect(suggestionLabel({ weight: 185, kind: "stay", lastWeight: 185, lastReps: 6 })).toBe("Stay 185 · aim 8+");
    expect(suggestionLabel({ weight: 185, kind: "build", lastWeight: 185, lastReps: 4 })).toBe("Stay 185 · build to 5");
  });
});
