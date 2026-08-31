import { describe, it, expect } from "vitest";
import { emaTrend, trendWeight, addDays, dayDiff, slopeLbPerWk, assessProgress, suggestAdjustment, inCooldown, type WeighIn } from "./trend";

const w = (date: string, weight_lb: number): WeighIn => ({ date, weight_lb });

describe("emaTrend", () => {
  it("returns [] for no points", () => {
    expect(emaTrend([])).toEqual([]);
  });

  it("first trend equals first weight; constant series stays constant", () => {
    const pts = [w("2026-09-01", 203), w("2026-09-02", 203), w("2026-09-03", 203)];
    expect(emaTrend(pts).map((p) => p.trend)).toEqual([203, 203, 203]);
  });

  it("moves alpha of the gap on a step (200→210 → 202.5)", () => {
    const pts = [w("2026-09-01", 200), w("2026-09-02", 200), w("2026-09-03", 200), w("2026-09-04", 210)];
    const t = emaTrend(pts);
    expect(t[3].trend).toBeCloseTo(202.5, 6);
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
    expect(trendWeight(pts)).toBeCloseTo(202.5, 6);
  });
});

/** n daily points ending on `end`, weight = start + perDay × i */
function series(end: string, n: number, start: number, perDay: number): WeighIn[] {
  const out: WeighIn[] = [];
  for (let i = 0; i < n; i++) out.push(w(addDays(end, i - (n - 1)), start + perDay * i));
  return out;
}

describe("date helpers", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-08-30", 2)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("dayDiff is whole days, signed", () => {
    expect(dayDiff("2026-09-01", "2026-09-15")).toBe(14);
    expect(dayDiff("2026-09-15", "2026-09-01")).toBe(-14);
  });
});

describe("slopeLbPerWk", () => {
  const today = "2026-09-14";

  it("null with fewer than 8 points in the window", () => {
    expect(slopeLbPerWk(series(today, 7, 203, -1.5 / 7), today)).toBeNull();
  });

  it("a number with exactly 8 points", () => {
    expect(slopeLbPerWk(series(today, 8, 203, -1.5 / 7), today)).not.toBeNull();
  });

  it("exact −1.5 lb/wk on a straight daily line", () => {
    expect(slopeLbPerWk(series(today, 14, 203, -1.5 / 7), today)).toBeCloseTo(-1.5, 6);
  });

  it("ignores points older than the window", () => {
    const old = series(addDays(today, -14), 20, 250, -5); // wildly different, all outside window
    const recent = series(today, 14, 203, -0.2 / 7);
    expect(slopeLbPerWk([...old, ...recent], today)).toBeCloseTo(-0.2, 6);
  });

  it("uses date offsets, not array index, when days are missing", () => {
    const full = series(today, 14, 203, -1.5 / 7);
    const gappy = full.filter((_, i) => i !== 3 && i !== 9); // 12 points, two gaps
    expect(slopeLbPerWk(gappy, today)).toBeCloseTo(-1.5, 6);
  });

  it("flat noisy series is ≈ 0", () => {
    const ws = [203, 203.4, 202.8, 203.2, 202.9, 203.3, 203.1, 202.7, 203.2, 203.0, 202.8, 203.4, 203.1, 202.9];
    const pts = ws.map((v, i) => w(addDays(today, i - 13), v));
    expect(slopeLbPerWk(pts, today)).toBeCloseTo(-0.0338, 3);
  });

  it("null when all in-window points share one date (degenerate OLS)", () => {
    const pts = Array.from({ length: 8 }, (_, i) => w(today, 203 + i * 0.1));
    expect(slopeLbPerWk(pts, today)).toBeNull();
  });
});

describe("assessProgress", () => {
  it("insufficient_data when slope is null", () => {
    expect(assessProgress(null, "cut", 1.5)).toBe("insufficient_data");
  });
  it("maintain is always on_track", () => {
    expect(assessProgress(0, "maintain", 0)).toBe("on_track");
    expect(assessProgress(-3, "maintain", 0)).toBe("on_track");
  });
  it("cut: stalled at or above −0.25", () => {
    expect(assessProgress(-0.25, "cut", 1.5)).toBe("stalled");
    expect(assessProgress(0.1, "cut", 1.5)).toBe("stalled");
    expect(assessProgress(-0.2, "cut", 1.5)).toBe("stalled");
  });
  it("cut: on_track between", () => {
    expect(assessProgress(-1.0, "cut", 1.5)).toBe("on_track");
    expect(assessProgress(-1.5, "cut", 1.5)).toBe("on_track");
    expect(assessProgress(-2.25, "cut", 1.5)).toBe("on_track"); // boundary is exclusive
  });
  it("cut: too_fast below −(rate + 0.75)", () => {
    expect(assessProgress(-2.5, "cut", 1.5)).toBe("too_fast");
  });
  it("bulk mirrors cut", () => {
    expect(assessProgress(0.2, "bulk", 0.5)).toBe("stalled");
    expect(assessProgress(0.5, "bulk", 0.5)).toBe("on_track");
    expect(assessProgress(1.5, "bulk", 0.5)).toBe("too_fast");
  });
});

describe("suggestAdjustment", () => {
  it("flat cut at 1.5 → 750 capped to 250", () => {
    expect(suggestAdjustment(0, "cut", 1.5)).toBe(250);
  });
  it("−0.2 on 1.5 → 650 capped to 250", () => {
    expect(suggestAdjustment(-0.2, "cut", 1.5)).toBe(250);
  });
  it("−0.1 on 0.3 → 100", () => {
    expect(suggestAdjustment(-0.1, "cut", 0.3)).toBe(100);
  });
  it("floors at 100 even when shortfall is tiny", () => {
    expect(suggestAdjustment(-1.4, "cut", 1.5)).toBe(100);
  });
  it("rounds to 50", () => {
    expect(suggestAdjustment(-0.13, "cut", 0.5)).toBe(200); // 0.37 × 500 = 185 → 200
  });
  it("bulk uses |slope| the same way", () => {
    expect(suggestAdjustment(0.1, "bulk", 0.5)).toBe(200);
  });
  it("null slope → 0", () => {
    expect(suggestAdjustment(null, "cut", 1.5)).toBe(0);
  });
});

describe("inCooldown", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  it("false when never adjusted", () => {
    expect(inCooldown(null, now)).toBe(false);
  });
  it("true within 14 days", () => {
    expect(inCooldown("2026-09-01T08:00:00Z", now)).toBe(true);
  });
  it("false once 14 full days have passed", () => {
    expect(inCooldown("2026-08-31T08:00:00Z", now)).toBe(false);
  });
  it("false at exactly 14 days (boundary is exclusive)", () => {
    expect(inCooldown("2026-08-31T12:00:00Z", new Date("2026-09-14T12:00:00Z"))).toBe(false);
  });
});
