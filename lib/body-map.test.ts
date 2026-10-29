import { describe, it, expect } from "vitest";
import { hitTier } from "./body-map";

describe("hitTier", () => {
  it("0 → none", () => expect(hitTier(0)).toBe("none"));
  it("1 → once", () => expect(hitTier(1)).toBe("once"));
  it("2 and 3 → good", () => { expect(hitTier(2)).toBe("good"); expect(hitTier(3)).toBe("good"); });
  it("4 and above → over", () => { expect(hitTier(4)).toBe("over"); expect(hitTier(7)).toBe("over"); });
  it("negative or fractional below 1 → none", () => { expect(hitTier(-1)).toBe("none"); expect(hitTier(0.5)).toBe("none"); });
});
