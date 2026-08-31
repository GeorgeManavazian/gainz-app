import { describe, it, expect } from "vitest";
import { defaultProteinPerLb, defaultRate, ageOn, estimateTdee, computeTargets, type Profile } from "./targets";

describe("phase defaults", () => {
  it("protein: cut 1.1, maintain 1.0, bulk 1.0", () => {
    expect(defaultProteinPerLb("cut")).toBe(1.1);
    expect(defaultProteinPerLb("maintain")).toBe(1.0);
    expect(defaultProteinPerLb("bulk")).toBe(1.0);
  });

  it("rate: cut 1.5, maintain 0, bulk 0.5", () => {
    expect(defaultRate("cut")).toBe(1.5);
    expect(defaultRate("maintain")).toBe(0);
    expect(defaultRate("bulk")).toBe(0.5);
  });
});

describe("ageOn", () => {
  const today = new Date(2026, 7, 30); // 2026-08-30 local
  it("counts full years when birthday already passed this year", () => {
    expect(ageOn("1990-01-01", today)).toBe(19);
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
  it("male 170 lb, 70 in, age 19, moderate → 3109", () => {
    expect(estimateTdee({ sex: "male", birth_date: "1990-01-01", height_in: 70,
      weight_lb: 170, activity: "moderate" }, today)).toBe(3109);
  });
  it("female 150 lb, 65 in, age 30, light → 1927", () => {
    expect(estimateTdee({ sex: "female", birth_date: "1996-01-10", height_in: 65,
      weight_lb: 150, activity: "light" }, today)).toBe(1927);
  });
});

describe("computeTargets", () => {
  const today = new Date(2026, 7, 30);
  const george: Profile = {
    sex: "male", birth_date: "1990-01-01", height_in: 70, weight_lb: 170,
    activity: "moderate", phase: "cut", rate_lb_per_wk: 1.5,
    protein_g_per_lb: 1.1, tdee_override: 3100,
  };

  it("reference: George cutting → 2350 / 223P / 214C / 67F", () => {
    const t = computeTargets(george, today);
    expect(t).toMatchObject({ kcal: 2350, protein_g: 223, carbs_g: 214, fat_g: 67,
      tdee: 3100, tdee_est: 3109 });
    expect(t.warning).toBeUndefined();
  });

  it("uses the estimate when override is null", () => {
    const t = computeTargets({ ...george, tdee_override: null }, today);
    expect(t.tdee).toBe(3109);
    expect(t.kcal).toBe(2359);
  });

  it("uses the phase default protein when protein_g_per_lb is null", () => {
    expect(computeTargets({ ...george, protein_g_per_lb: null }, today).protein_g).toBe(223); // 1.1 × 203
    expect(computeTargets({ ...george, protein_g_per_lb: null, phase: "maintain" }, today).protein_g).toBe(203); // 1.0 × 203
  });

  it("maintain ignores rate", () => {
    const t = computeTargets({ ...george, phase: "maintain", rate_lb_per_wk: 1.5 }, today);
    expect(t.kcal).toBe(3100);
  });

  it("bulk adds the surplus", () => {
    const t = computeTargets({ ...george, phase: "bulk", rate_lb_per_wk: 0.5, tdee_override: 3000 }, today);
    expect(t.kcal).toBe(3250);
  });

  it("floors carbs at 0 and warns when kcal cannot fit fat + protein", () => {
    const t = computeTargets({ ...george, tdee_override: 1400 }, today); // 650 kcal
    expect(t.kcal).toBe(650);
    expect(t.carbs_g).toBe(0);
    expect(t.warning).toBe("kcal too low for fat + protein floors");
  });

  it("defaults today to now (smoke)", () => {
    // override makes kcal age-independent, so this stays stable against the real clock
    expect(computeTargets(george).kcal).toBe(2350);
  });
});
