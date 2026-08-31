import { describe, it, expect } from "vitest";
import { defaultProteinPerLb, defaultRate } from "./targets";

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
