import { describe, it, expect } from "vitest";
import { dateTicks, yScale } from "./chart-axes";

describe("yScale", () => {
  it("picks a 2-lb step for a ~5 lb span and rounds out to clean bounds", () => {
    expect(yScale(199.0, 204.9)).toEqual({ min: 198, max: 206, step: 2 });
  });
  it("uses 1-lb steps when the span is tight", () => {
    expect(yScale(200.6, 202.4)).toEqual({ min: 200, max: 203, step: 1 });
  });
  it("never produces more than five ticks", () => {
    for (const [lo, hi] of [[180, 230], [100.2, 101.1], [150, 420]] as [number, number][]) {
      const { min, max, step } = yScale(lo, hi);
      expect((max - min) / step + 1).toBeLessThanOrEqual(5);
      expect(min).toBeLessThanOrEqual(lo); expect(max).toBeGreaterThanOrEqual(hi);
    }
  });
  it("a flat series still gets a non-zero range", () => {
    const { min, max } = yScale(200, 200);
    expect(max).toBeGreaterThan(min);
  });
});

describe("dateTicks", () => {
  it("single day → one tick", () => expect(dateTicks("2026-10-29", "2026-10-29", 10)).toEqual(["2026-10-29"]));
  it("a month at phone width → four evenly spaced dates incl. both ends", () => {
    expect(dateTicks("2026-10-01", "2026-10-29", 310 / 28)).toEqual(["2026-10-01", "2026-10-10", "2026-10-20", "2026-10-29"]);
  });
  it("a narrow plot thins to two ticks so labels can't collide", () => {
    expect(dateTicks("2026-10-25", "2026-10-29", 20)).toEqual(["2026-10-25", "2026-10-29"]);
  });
  it("a short span on a wide plot still gets up to four ticks", () => {
    expect(dateTicks("2026-10-25", "2026-10-29", 310 / 4)).toHaveLength(4);
  });
  it("never repeats a date", () => {
    const t = dateTicks("2026-10-28", "2026-10-29", 310);
    expect(new Set(t).size).toBe(t.length);
  });
});
