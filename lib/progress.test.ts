import { describe, it, expect } from "vitest";
import type { LiftRow } from "./workouts";
import { INDICATORS, bestSet, indexAdvice, indicatorStatus, sessionsFor, strengthIndex } from "./progress";

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

  it("orders same-day sessions by their earliest row's logged_at", () => {
    const sameDay: LiftRow[] = [
      row({ logged_at: "2026-09-05T13:00:00.000Z", workout_id: "wa", reps: 5, weight: 90 }),  // e1RM 105
      row({ logged_at: "2026-09-05T19:00:00.000Z", workout_id: "wb", reps: 8, weight: 100 }), // e1RM ≈126.7
    ];
    const s = sessionsFor("DB Chest Press", sameDay);
    expect(s.map((x) => x.key)).toEqual(["wa", "wb"]);
    expect(s[s.length - 1].key).toBe("wb");
    expect(s[s.length - 1].best).toBeCloseTo(126.7, 1);
    expect(indicatorStatus("DB Chest Press", sameDay).latest).toBeCloseTo(126.7, 1);
  });
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

describe("strengthIndex", () => {
  const r = (ex: string, iso: string, w: number, reps: number, wid: string): LiftRow =>
    ({ id: iso + ex, exercise: ex, sets: 1, reps, weight: w, logged_at: iso, workout_id: wid });
  it("starts at 100 and averages normalized e1RMs with carry-forward", () => {
    const rows = [
      r("A", "2026-09-01T10:00:00.000Z", 100, 6, "w1"), // A base e1RM 120
      r("B", "2026-09-01T10:10:00.000Z", 50, 6, "w1"),  // B base 60
      r("A", "2026-09-08T10:00:00.000Z", 110, 6, "w2"), // A → 110% ; B carries 100
    ];
    const idx = strengthIndex(rows);
    expect(idx[0]).toEqual({ date: "2026-09-01", value: 100 });
    expect(idx[1].value).toBeCloseTo(105, 1); // (110 + 100) / 2
  });
  it("exercise joining later starts at its own 100 without distorting", () => {
    const rows = [
      r("A", "2026-09-01T10:00:00.000Z", 100, 6, "w1"),
      r("A", "2026-09-08T10:00:00.000Z", 120, 6, "w2"),
      r("C", "2026-09-08T10:20:00.000Z", 80, 6, "w2"),
    ];
    const idx = strengthIndex(rows);
    expect(idx[1].value).toBeCloseTo(110, 1); // (120% + 100%) / 2
  });
  it("empty → empty", () => expect(strengthIndex([])).toEqual([]));
});

describe("indexAdvice", () => {
  const pt = (date: string, value: number) => ({ date, value });
  it("null when under 2 points", () => expect(indexAdvice([pt("2026-09-01", 100)], "cut")).toBeNull());
  it("warn at ≥5% drop from peak", () => {
    const a = indexAdvice([pt("a", 100), pt("b", 106), pt("c", 100)], "cut")!;
    expect(a.level).toBe("warn");
    expect(a.text).toContain("carbs");
  });
  it("watch at 2.5–5% drop", () => {
    expect(indexAdvice([pt("a", 100), pt("b", 104), pt("c", 100.5)], "cut")!.level).toBe("watch");
  });
  it("ok when holding on a cut", () => {
    expect(indexAdvice([pt("a", 100), pt("b", 101)], "cut")!.level).toBe("ok");
  });
});

