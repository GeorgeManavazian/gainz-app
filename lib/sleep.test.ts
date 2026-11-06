import { describe, it, expect } from "vitest";
import { isQuality } from "./sleep-quality";

describe("isQuality", () => {
  it("accepts integers 1–5 only", () => {
    for (const ok of [1, 3, 5]) expect(isQuality(ok)).toBe(true);
    for (const bad of [0, 6, 2.5, "3", NaN, null]) expect(isQuality(bad)).toBe(false);
  });
});
