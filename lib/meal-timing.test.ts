import { describe, it, expect } from "vitest";
import { digestHours, bedtimeFor, fuelledUntil, usualTrainingStart, proteinHits, lateHeavyMeal, planNextMeal, planLine, type TimingMeal } from "./meal-timing";

const day = (h: number, m = 0, offsetDays = 0) => { const d = new Date(2026, 10, 2, h, m, 0, 0); d.setDate(d.getDate() + offsetDays); return d; }; // Mon 2 Nov 2026
const iso = (h: number, m = 0, off = 0) => day(h, m, off).toISOString();
const meal = (h: number, m: number, calories: number, protein_g = 30, fat_g = 10): TimingMeal => ({ logged_at: iso(h, m), calories, protein_g, fat_g });
const clock = { wake: "07:00", bed: "23:00" };
const targets = { kcal: 2200, protein_g: 180 };

describe("digestHours", () => {
  it("buckets by size and adds half an hour for fatty meals", () => {
    expect(digestHours(250, 5)).toBe(2); expect(digestHours(500, 10)).toBe(3); expect(digestHours(900, 10)).toBe(4); expect(digestHours(500, 30)).toBe(3.5);
  });
});

describe("bedtimeFor", () => {
  it("bed after wake is tonight; bed at/before wake is after midnight", () => {
    expect(bedtimeFor(day(14), clock).getDate()).toBe(2);
    expect(bedtimeFor(day(14), { wake: "07:00", bed: "00:30" }).getDate()).toBe(3);
  });
});

describe("fuelledUntil", () => {
  it("uses the most recent meal and a linear drain", () => {
    const f = fuelledUntil([meal(8, 0, 400), meal(12, 0, 600)], day(13, 30))!;
    expect(f.until.getHours()).toBe(15);
    expect(f.left).toBeCloseTo(0.5, 2);
  });
  it("null with no meals; 0 left once digested", () => {
    expect(fuelledUntil([], day(12))).toBeNull();
    expect(fuelledUntil([meal(8, 0, 400)], day(12))!.left).toBe(0);
  });
});

describe("usualTrainingStart", () => {
  it("median start on the same weekday when there are two", () => {
    const w = [{ started_at: iso(17, 0, -7), ended_at: null }, { started_at: iso(17, 30, -14), ended_at: null }, { started_at: iso(6, 0, -1), ended_at: null }];
    const t = usualTrainingStart(w, day(10))!;
    expect(t.getHours()).toBe(17); expect(t.getMinutes()).toBe(15);
  });
  it("falls back to the overall median with ≥3 sessions, null otherwise", () => {
    const w = [{ started_at: iso(6, 0, -1), ended_at: null }, { started_at: iso(18, 0, -2), ended_at: null }, { started_at: iso(17, 0, -3), ended_at: null }];
    expect(usualTrainingStart(w, day(10))!.getHours()).toBe(17);
    expect(usualTrainingStart(w.slice(0, 2), day(10))).toBeNull();
  });
});

describe("proteinHits", () => {
  it("counts ≥25 g feedings spaced ≥2.5 h; merges meals within an hour", () => {
    const meals = [meal(8, 0, 300, 15), meal(8, 30, 200, 15), meal(12, 0, 500, 40), meal(13, 0, 100, 30), meal(18, 0, 600, 45)];
    expect(proteinHits(meals)).toBe(3); // 8:00+8:30 merge → 30 ✓, 12:00 ✓, 13:00 too soon, 18:00 ✓
  });
  it("zero for nothing", () => expect(proteinHits([])).toBe(0));
});

describe("lateHeavyMeal", () => {
  it("flags ≥600 kcal within 2.5 h of bed, ignores earlier or small meals", () => {
    expect(lateHeavyMeal([meal(21, 15, 800)], day(21, 30), clock)!.hoursBeforeBed).toBeCloseTo(1.75, 2);
    expect(lateHeavyMeal([meal(19, 0, 800)], day(21, 30), clock)).toBeNull();
    expect(lateHeavyMeal([meal(22, 0, 250)], day(22, 10), clock)).toBeNull();
  });
});

describe("planNextMeal", () => {
  const base = { targets, weight_lb: 200, clock, usualTraining: null as Date | null, todayWorkout: null };
  it("done when the target is hit", () => {
    expect(planNextMeal({ ...base, meals: [], totals: { calories: 2300, protein_g: 190 }, now: day(14) }).kind).toBe("done");
  });
  it("post-workout window after a session with nothing eaten since", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(18, 15),
      todayWorkout: { started_at: iso(17), ended_at: iso(18) } });
    expect(p.kind).toBe("post"); expect(p.end.getHours()).toBe(20); expect(p.protein_g).toBeGreaterThanOrEqual(30);
  });
  it("pre-workout window when the tank empties before training − 1 h", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(14), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.end.getHours()).toBe(16);
    expect(p.start.getTime()).toBeGreaterThanOrEqual(day(14).getTime());
  });
  it("fuelled through training when a big meal lands close to the session", () => {
    const p = planNextMeal({ ...base, meals: [meal(15, 0, 900)], totals: { calories: 900, protein_g: 50 }, now: day(15, 30), usualTraining: day(17) });
    expect(p.kind).toBe("fuelled"); expect(p.start.getHours()).toBe(18);
  });
  it("closed after bed − 2.5 h, light snack till bed − 1 h", () => {
    const p = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 1500, protein_g: 120 }, now: day(20, 45) });
    expect(p.kind).toBe("closed"); expect(p.end.getHours()).toBe(22);
    expect(planLine(p, day(20, 45))).toMatch(/closed for sleep/);
  });
  it("eat when the tank is empty; macros split across meals left before the cutoff", () => {
    const p = planNextMeal({ ...base, meals: [meal(8, 0, 400)], totals: { calories: 400, protein_g: 30 }, now: day(12) });
    expect(p.kind).toBe("eat");
    expect(p.mealsLeft).toBe(3); // 12:00 → 20:30 cutoff = 8.5 h / 3.5 h → 3
    expect(p.kcal).toBe(600); expect(p.protein_g).toBe(36);
    expect(planLine(p, day(12))).toMatch(/4 h since your last meal/);
  });
  it("no meals yet → eat now", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0 }, now: day(9) });
    expect(p.kind).toBe("eat"); expect(p.start.getTime()).toBe(day(9).getTime());
  });
});
