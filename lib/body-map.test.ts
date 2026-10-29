import { describe, it, expect } from "vitest";
import { hitTier, partHits, partSets } from "./body-map";
import { PART_MUSCLES, PART_LABEL, SHAPES, type BodyPart } from "./body-shapes";
import { MUSCLES } from "./muscles";
import type { MuscleWeek } from "./muscle-week";

const emptyWeek = (): MuscleWeek =>
  Object.fromEntries(MUSCLES.map((m) => [m.id, { hits: 0, sets: 0 }])) as MuscleWeek;

describe("hitTier", () => {
  it("0 → none", () => expect(hitTier(0)).toBe("none"));
  it("1 → once", () => expect(hitTier(1)).toBe("once"));
  it("2 and 3 → good", () => { expect(hitTier(2)).toBe("good"); expect(hitTier(3)).toBe("good"); });
  it("4 and above → over", () => { expect(hitTier(4)).toBe("over"); expect(hitTier(7)).toBe("over"); });
  it("negative or fractional below 1 → none", () => { expect(hitTier(-1)).toBe("none"); expect(hitTier(0.5)).toBe("none"); });
});

describe("body shapes", () => {
  it("every fine muscle is drawn on at least one part", () => {
    const covered = new Set(Object.values(PART_MUSCLES).flat());
    for (const m of MUSCLES) expect(covered.has(m.id), m.id).toBe(true);
  });
  it("every drawn part has a mapping and a label, and every mapped part is drawn", () => {
    const drawn = new Set(SHAPES.map((s) => s.part));
    for (const p of drawn) { expect(PART_MUSCLES[p], p).toBeDefined(); expect(PART_LABEL[p], p).toBeDefined(); }
    for (const p of Object.keys(PART_MUSCLES) as BodyPart[]) expect(drawn.has(p), p).toBe(true);
  });
  it("neutral parts have no label; coloured parts do", () => {
    for (const p of Object.keys(PART_MUSCLES) as BodyPart[])
      expect(PART_LABEL[p].length > 0, p).toBe(PART_MUSCLES[p].length > 0);
  });
  it("polygon point lists are non-empty numeric pairs inside the 100×220 drawing area", () => {
    for (const s of SHAPES) {
      expect(s.points.length, s.part).toBeGreaterThan(0);
      for (const pts of s.points) {
        const nums = pts.trim().split(/\s+/).map(Number);
        expect(nums.length % 2, s.part).toBe(0);
        expect(nums.length, s.part).toBeGreaterThanOrEqual(6);
        nums.forEach((n, i) => { expect(Number.isFinite(n), s.part).toBe(true);
          expect(n >= 0 && n <= (i % 2 === 0 ? 100 : 220), `${s.part} ${n}`).toBe(true); });
      }
    }
  });
  it("both views are present", () => {
    expect(SHAPES.some((s) => s.view === "front")).toBe(true);
    expect(SHAPES.some((s) => s.view === "back")).toBe(true);
  });
});

describe("partHits / partSets", () => {
  it("part takes the max hits of its muscles and sums their sets", () => {
    const w = emptyWeek();
    w.upper_chest = { hits: 2, sets: 6 }; w.mid_chest = { hits: 1, sets: 4 }; w.lower_chest = { hits: 0, sets: 0 };
    expect(partHits("chest", w)).toBe(2);
    expect(partSets("chest", w)).toBe(10);
  });
  it("neutral parts return null hits and 0 sets", () => {
    const w = emptyWeek();
    expect(partHits("head", w)).toBeNull();
    expect(partSets("knees", w)).toBe(0);
  });
});
