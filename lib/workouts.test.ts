import { describe, it, expect } from "vitest";
import { beatLastTime, bestE1rm, e1rm, formatElapsed, formatSession, groupByExercise, lastSession,
  localDateOf, recentExercises, totalSets, totalVolume, type LiftRow } from "./workouts";

const row = (o: Partial<LiftRow> & { exercise: string; logged_at: string }): LiftRow => ({
  id: o.id ?? o.logged_at, sets: 1, reps: 6, weight: 95, workout_id: null, ...o });

// newest-first, as listRecentLifts returns them
const HISTORY: LiftRow[] = [
  row({ exercise: "DB Chest Press", logged_at: "2026-09-03T14:10:00Z", workout_id: "w2", reps: 7, weight: 90 }),
  row({ exercise: "DB Chest Press", logged_at: "2026-09-03T14:05:00Z", workout_id: "w2", reps: 6, weight: 95 }),
  row({ exercise: "Lat Pulldown", logged_at: "2026-09-03T14:00:00Z", workout_id: "w2", reps: 10, weight: 140 }),
  row({ exercise: "db chest press", logged_at: "2026-08-31T15:00:00Z", workout_id: null, reps: 5, weight: 95 }),
  row({ exercise: "Shoulder press", logged_at: "2026-08-31T14:50:00Z", workout_id: null, sets: 2, reps: 7, weight: 115 }),
  row({ exercise: "DB Chest Press", logged_at: "2026-08-28T15:00:00Z", workout_id: "w0", reps: 8, weight: 85 }),
];

describe("recentExercises", () => {
  it("dedupes case-insensitively keeping first casing, newest-first, filtered by group", () => {
    expect(recentExercises(HISTORY, ["chest"])).toEqual(["DB Chest Press", "Shoulder press"]);
  });
  it("custom (non-library) names are always included; library names need a group match", () => {
    expect(recentExercises(HISTORY, ["back"])).toEqual(["Lat Pulldown", "Shoulder press"]);
  });
  it("honours limit", () => {
    expect(recentExercises(HISTORY, ["chest", "back"], 1)).toEqual(["DB Chest Press"]);
  });
});

describe("lastSession", () => {
  it("returns the most recent workout's rows for the exercise, oldest-first", () => {
    expect(lastSession("DB Chest Press", HISTORY).map((r) => `${r.weight}x${r.reps}`))
      .toEqual(["95x6", "90x7"]);
  });
  it("falls back to same local date when workout_id is null", () => {
    const noW2 = HISTORY.filter((r) => r.workout_id !== "w2");
    expect(lastSession("DB Chest Press", noW2).map((r) => r.logged_at)).toEqual(["2026-08-31T15:00:00Z"]);
  });
  it("is case-insensitive and empty for unknown", () => {
    expect(lastSession("db CHEST press", HISTORY).length).toBe(2);
    expect(lastSession("Nope", HISTORY)).toEqual([]);
  });
});

describe("formatSession / e1rm", () => {
  it("formats per row, ×sets only when > 1", () => {
    const s = lastSession("DB Chest Press", HISTORY);
    expect(formatSession(s)).toBe("95×6, 90×7");
    expect(formatSession([row({ exercise: "x", logged_at: "t", sets: 3, reps: 8, weight: 130 })])).toBe("130×8 ×3");
    expect(formatSession([])).toBe("");
  });
  it("epley", () => {
    expect(e1rm(95, 6)).toBeCloseTo(114, 0);
    expect(bestE1rm([])).toBeNull();
    expect(bestE1rm(lastSession("DB Chest Press", HISTORY))).toBeCloseTo(114, 0);
  });
  it("beatLastTime is strict and false without history", () => {
    const cur = [row({ exercise: "DB Chest Press", logged_at: "now", reps: 6, weight: 100 })];
    const prev = lastSession("DB Chest Press", HISTORY);
    expect(beatLastTime(cur, prev)).toBe(true);
    expect(beatLastTime(prev, prev)).toBe(false);
    expect(beatLastTime(cur, [])).toBe(false);
    expect(beatLastTime([], prev)).toBe(false);
  });
});

describe("summary helpers", () => {
  const w2 = HISTORY.filter((r) => r.workout_id === "w2").reverse(); // oldest-first
  it("groupByExercise keeps first-appearance order", () => {
    expect(groupByExercise(w2).map((g) => g.exercise)).toEqual(["Lat Pulldown", "DB Chest Press"]);
    expect(groupByExercise(w2)[1].rows.length).toBe(2);
  });
  it("totals", () => {
    expect(totalSets(w2)).toBe(3);
    expect(totalVolume(w2)).toBe(1 * 10 * 140 + 1 * 6 * 95 + 1 * 7 * 90);
  });
  it("formatElapsed", () => {
    expect(formatElapsed(34 * 60_000 + 12_000)).toBe("34:12");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(5_000)).toBe("0:05");
  });
  it("localDateOf returns a YYYY-MM-DD string", () => {
    expect(localDateOf("2026-09-03T14:10:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
