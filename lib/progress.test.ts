import { describe, it, expect } from "vitest";
import type { LiftRow } from "./workouts";
import { INDICATORS, bestSet, indicatorStatus, sessionsFor } from "./progress";

const row = (o: Partial<LiftRow> & { logged_at: string }): LiftRow => ({
  id: o.logged_at, exercise: "DB Chest Press", sets: 1, reps: 6, weight: 95, workout_id: null, ...o });

const ROWS: LiftRow[] = [
  row({ logged_at: "2026-09-03T14:10:00.000Z", workout_id: "w2", reps: 7, weight: 90 }),  // e1RM 111
  row({ logged_at: "2026-09-03T14:05:00.000Z", workout_id: "w2", reps: 6, weight: 95 }),  // e1RM 114
  row({ logged_at: "2026-08-31T15:00:00.000Z", workout_id: null, reps: 5, weight: 95 }),   // e1RM ≈110.8
  row({ logged_at: "2026-08-28T15:00:00.000Z", workout_id: "w0", reps: 8, weight: 85 }),   // e1RM ≈107.7
];

describe("sessionsFor", () => {
  it("groups by workout_id with local-date fallback, ascending, with best e1RM", () => {
    const s = sessionsFor("db chest press", ROWS);
    expect(s.map((x) => x.key)).toEqual(["w0", expect.any(String), "w2"]);
    expect(s[2].best).toBeCloseTo(114, 0);
    expect(s[2].rows.length).toBe(2);
    expect(s[0].date < s[1].date && s[1].date < s[2].date).toBe(true);
  });
  it("empty for unknown exercise", () => expect(sessionsFor("Nope", ROWS)).toEqual([]));
});

describe("bestSet", () => {
  it("row with highest e1RM; null when empty", () => {
    expect(bestSet(ROWS)!.weight).toBe(95);
    expect(bestSet(ROWS)!.reps).toBe(6);
    expect(bestSet([])).toBeNull();
  });
});

describe("indicatorStatus", () => {
  it("uses the protocol baseline when set", () => {
    const s = indicatorStatus("DB Chest Press", ROWS);
    expect(s.baseline).toBe(111.0);
    expect(s.latest).toBeCloseTo(114, 0);
    expect(s.pct).toBeCloseTo(2.7, 1);
    expect(s.level).toBe("ok");
  });
  it("falls back to the first session's best as baseline", () => {
    const rows = ROWS.map((r) => ({ ...r, exercise: "Back Squat" }));
    const s = indicatorStatus("Back Squat", rows);
    expect(s.baseline).toBeCloseTo(107.7, 1);
  });
  it("levels at the protocol thresholds", () => {
    const mk = (latest: number) => [
      row({ logged_at: "2026-08-01T10:00:00.000Z", workout_id: "a", reps: 30, weight: latest / 2 }), // e1rm = latest
    ];
    // baseline 111: −4.9% → ok, −5% → warn, −8% → bad (thresholds inclusive)
    expect(indicatorStatus("DB Chest Press", mk(111 * 0.951)).level).toBe("ok");
    expect(indicatorStatus("DB Chest Press", mk(111 * 0.95)).level).toBe("warn");
    expect(indicatorStatus("DB Chest Press", mk(111 * 0.92)).level).toBe("bad");
  });
  it("none when no data", () => {
    expect(indicatorStatus("Romanian Deadlift", []).level).toBe("none");
  });
  it("INDICATORS carries the cut-protocol entries", () => {
    expect(INDICATORS.find((i) => i.name === "DB Chest Press")!.baseline).toBe(111.0);
    expect(INDICATORS.find((i) => i.name === "Seated Shoulder Press")!.baseline).toBe(141.8);
    for (const n of ["Back Squat", "Leg Press", "Romanian Deadlift"])
      expect(INDICATORS.find((i) => i.name === n)!.baseline).toBeNull();
  });
});
