import { describe, it, expect } from "vitest";
import { defaultProteinPerLb, defaultRate, ageOn, estimateTdee } from "./targets";

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
