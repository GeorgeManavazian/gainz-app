import { describe, it, expect } from "vitest";
import { EXERCISES } from "./exercises";
import { behindThisWeek, hasCompletedWorkoutThisWeek, muscleWeek, musclesHit, recentWeeks, splitByRegion, weekStartOf } from "./muscle-week";
import type { LiftRow } from "./workouts";

const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString(); // October 2026; Mon = 12
const lift = (exercise: string, logged_at: string, workout_id: string | null, sets = 3, reps = 8): LiftRow =>
  ({ id: `${exercise}-${logged_at}`, exercise, sets, reps, weight: 100, logged_at, workout_id });
const WEEK = "2026-10-12";

describe("weekStartOf", () => {
  it("returns the local Monday", () => {
    expect(weekStartOf(new Date(2026, 9, 12, 0, 0))).toBe("2026-10-12");
    expect(weekStartOf(new Date(2026, 9, 18, 23, 59))).toBe("2026-10-12");
    expect(weekStartOf(new Date(2026, 9, 19, 0, 10))).toBe("2026-10-19");
  });
});

describe("muscleWeek", () => {
  it("spec reference week", () => {
    const w = muscleWeek([
      lift("BB Bench Press", at(12, 10), "w1"),
      lift("Incline DB Press", at(15, 10), "w2"),
      lift("DB Lateral Raise", at(15, 11), "w2", 4, 12),
    ], EXERCISES, WEEK);
    expect(w.mid_chest).toEqual({ hits: 1, sets: 3 });
    expect(w.upper_chest).toEqual({ hits: 1, sets: 3 });
    expect(w.front_delts).toEqual({ hits: 2, sets: 0 });
    expect(w.triceps).toEqual({ hits: 2, sets: 0 });
    expect(w.side_delts).toEqual({ hits: 1, sets: 4 });
    const behind = behindThisWeek(w);
    expect(behind).toEqual(expect.arrayContaining(["mid_chest", "upper_chest", "side_delts", "lats"]));
    expect(behind).not.toContain("front_delts");
    expect(behind).not.toContain("calves");
    expect(behind[0]).toBe("upper_chest"); // MUSCLES order
  });
  it("two lifts for the same muscle in one workout = one hit", () => {
    const w = muscleWeek([lift("BB Curl", at(13, 9), "w1"), lift("Hammer Curl", at(13, 9), "w1")], EXERCISES, WEEK);
    expect(w.biceps.hits).toBe(1);
    expect(w.biceps.sets).toBe(6);
  });
  it("week boundary is local Monday", () => {
    const w = muscleWeek([
      lift("Back Squat", new Date(2026, 9, 18, 23, 30).toISOString(), "a"),
      lift("Back Squat", new Date(2026, 9, 19, 0, 10).toISOString(), "b"),
    ], EXERCISES, WEEK);
    expect(w.quads.hits).toBe(1);
  });
  it("legacy null workout_id lifts on one date count as one hit", () => {
    const w = muscleWeek([lift("Leg Press", at(14, 9), null), lift("Hack Squat", at(14, 10), null)], EXERCISES, WEEK);
    expect(w.quads.hits).toBe(1);
  });
  it("unknown exercise names are ignored", () => {
    const w = muscleWeek([lift("Mystery Machine", at(14, 9), "w1")], EXERCISES, WEEK);
    expect(Object.values(w).every((v) => v.hits === 0 && v.sets === 0)).toBe(true);
  });
  it("empty input gives all zeros for all 18 muscles", () => {
    const w = muscleWeek([], EXERCISES, WEEK);
    expect(Object.keys(w).length).toBe(18);
    expect(w.abs).toEqual({ hits: 0, sets: 0 });
  });
});

describe("helpers", () => {
  it("recentWeeks returns n weeks, current first", () => {
    const r = recentWeeks([lift("Back Squat", at(5, 9), "old")], EXERCISES, 4, new Date(2026, 9, 15));
    expect(r.map((x) => x.weekStart)).toEqual(["2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21"]);
    expect(r[1].week.quads.hits).toBe(1);
  });
  it("musclesHit unions primary and secondary", () => {
    expect([...musclesHit([lift("BB Bench Press", at(12, 9), "w1")], EXERCISES)].sort())
      .toEqual(["front_delts", "mid_chest", "triceps"]);
  });
  it("hasCompletedWorkoutThisWeek ignores the current workout and other weeks", () => {
    const hist = [lift("BB Curl", at(12, 9), "cur"), lift("BB Curl", at(6, 9), "lastweek")];
    expect(hasCompletedWorkoutThisWeek(hist, WEEK, "cur")).toBe(false);
    expect(hasCompletedWorkoutThisWeek([...hist, lift("BB Curl", at(13, 9), "other")], WEEK, "cur")).toBe(true);
  });
  it("splitByRegion", () => {
    expect(splitByRegion(["lats", "side_delts", "quads"], ["back", "shoulders"]))
      .toEqual({ inRegion: ["lats", "side_delts"], other: ["quads"] });
  });
});
