import { describe, it, expect } from "vitest";
import { defaultProteinPerLb, defaultRate, ageOn, estimateTdee, computeTargets, type Profile } from "./targets";

describe("phase defaults", () => {
  it("protein: cut 1.1, maintain 1.0, bulk 1.0", () => {
    expect(defaultProteinPerLb("cut")).toBe(1.1);
    expect(defaultProteinPerLb("maintain")).toBe(1.0);
    expect(defaultProteinPerLb("bulk")).toBe(1.0);
  });

  it("rate: cut 1.0, maintain 0, bulk 0.5", () => {
    expect(defaultRate("cut")).toBe(1.0);
    expect(defaultRate("maintain")).toBe(0);
    expect(defaultRate("bulk")).toBe(0.5);
  });
});

describe("ageOn", () => {
  const today = new Date(2026, 7, 30); // 2026-08-30 local
  it("counts full years when birthday already passed this year", () => {
    expect(ageOn("2007-06-01", today)).toBe(19);
  });
  it("does not count the year when birthday has not passed yet", () => {
    expect(ageOn("2007-09-15", today)).toBe(18);
  });
  it("counts the birthday itself", () => {
    expect(ageOn("2007-08-30", today)).toBe(19);
  });
});

describe("estimateTdee (Mifflin-St Jeor × activity)", () => {
  const today = new Date(2026, 7, 30);
  it("male 170 lb, 70 in, age 19, moderate → 2778", () => {
    expect(estimateTdee({ sex: "male", birth_date: "2007-06-01", height_in: 70,
      weight_lb: 170, activity: "moderate" }, today)).toBe(2778);
  });
  it("female 150 lb, 65 in, age 30, light → 1927", () => {
    expect(estimateTdee({ sex: "female", birth_date: "1996-01-10", height_in: 65,
      weight_lb: 150, activity: "light" }, today)).toBe(1927);
  });
});

describe("computeTargets", () => {
  const today = new Date(2026, 7, 30);
  // Cut Protocol (Fall 2026) phase-1 inputs: 170 lb, ~1 lb/wk (500 kcal), k = 1.02, TDEE 3100.
  const athlete: Profile = {
    sex: "male", birth_date: "2007-06-01", height_in: 70, weight_lb: 170,
    activity: "moderate", phase: "cut", rate_lb_per_wk: 1.0,
    protein_g_per_lb: 1.02, tdee_override: 3100,
  };

  it("reference: Cut Protocol week 1 → 2600 / 173P / 351C / 56F", () => {
    const t = computeTargets(athlete, today);
    expect(t).toMatchObject({ kcal: 2600, protein_g: 173, carbs_g: 351, fat_g: 56, tdee: 3100 });
    expect(Math.abs(4 * t.protein_g + 4 * t.carbs_g + 9 * t.fat_g - t.kcal)).toBeLessThanOrEqual(2); // carbs are the plug (gram rounding)
    expect(t.warning).toBeUndefined();
  });

  it("uses the estimate when override is null", () => {
    const t = computeTargets({ ...athlete, tdee_override: null }, today);
    expect(t.tdee).toBe(t.tdee_est);
    expect(t.kcal).toBe(t.tdee_est - 500);
  });

  it("uses the phase default protein when protein_g_per_lb is null", () => {
    expect(computeTargets({ ...athlete, protein_g_per_lb: null }, today).protein_g).toBe(187); // 1.1 × 170
    expect(computeTargets({ ...athlete, protein_g_per_lb: null, phase: "maintain" }, today).protein_g).toBe(170); // 1.0 × 170
  });

  it("maintain ignores rate", () => {
    const t = computeTargets({ ...athlete, phase: "maintain", rate_lb_per_wk: 1.0 }, today);
    expect(t.kcal).toBe(3100);
  });

  it("bulk adds the surplus", () => {
    const t = computeTargets({ ...athlete, phase: "bulk", rate_lb_per_wk: 0.5, tdee_override: 3000 }, today);
    expect(t.kcal).toBe(3250);
  });

  it("floors carbs at 0 and warns when kcal cannot fit fat + protein", () => {
    const t = computeTargets({ ...athlete, tdee_override: 1400 }, today); // 900 kcal
    expect(t.kcal).toBe(900);
    expect(t.carbs_g).toBe(0);
    expect(t.warning).toBe("kcal too low for fat + protein floors");
  });

  it("defaults today to now (smoke)", () => {
    // override makes kcal age-independent, so this stays stable against the real clock
    expect(computeTargets(athlete).kcal).toBe(2600);
  });
});
