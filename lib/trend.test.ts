import { describe, it, expect } from "vitest";
import { emaTrend, trendWeight, type WeighIn } from "./trend";

const w = (date: string, weight_lb: number): WeighIn => ({ date, weight_lb });

describe("emaTrend", () => {
  it("returns [] for no points", () => {
    expect(emaTrend([])).toEqual([]);
  });

  it("first trend equals first weight; constant series stays constant", () => {
    const pts = [w("2026-09-01", 203), w("2026-09-02", 203), w("2026-09-03", 203)];
    expect(emaTrend(pts).map((p) => p.trend)).toEqual([203, 203, 203]);
  });

  it("moves alpha of the gap on a step (200→210 → 201.0)", () => {
    const pts = [w("2026-09-01", 200), w("2026-09-02", 200), w("2026-09-03", 200), w("2026-09-04", 210)];
    const t = emaTrend(pts);
    expect(t[3].trend).toBeCloseTo(201.0, 6);
    expect(t[3]).toMatchObject({ date: "2026-09-04", weight_lb: 210 });
  });

  it("honours a custom alpha", () => {
    const pts = [w("2026-09-01", 200), w("2026-09-02", 210)];
    expect(emaTrend(pts, 0.5)[1].trend).toBe(205);
  });
});

describe("trendWeight", () => {
  it("null for no points", () => {
    expect(trendWeight([])).toBeNull();
  });
  it("last EMA value", () => {
    const pts = [w("2026-09-01", 200), w("2026-09-02", 210)];
    expect(trendWeight(pts)).toBeCloseTo(201, 6);
  });
});
