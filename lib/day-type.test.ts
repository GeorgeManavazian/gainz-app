import { describe, it, expect } from "vitest";
import { dayTypeFor } from "./day-type";

const at = (h: number) => new Date(2026, 10, 5, h);
describe("dayTypeFor", () => {
  it("session running or done today → training", () => {
    expect(dayTypeFor({ active: true, doneToday: false, usualTraining: null, now: at(10) })).toBe("training");
    expect(dayTypeFor({ active: false, doneToday: true, usualTraining: null, now: at(20) })).toBe("training");
  });
  it("usual session later today → training; missed by > 3 h → rest; none → rest", () => {
    expect(dayTypeFor({ active: false, doneToday: false, usualTraining: at(17), now: at(9) })).toBe("training");
    expect(dayTypeFor({ active: false, doneToday: false, usualTraining: at(17), now: at(21) })).toBe("rest");
    expect(dayTypeFor({ active: false, doneToday: false, usualTraining: null, now: at(9) })).toBe("rest");
    expect(dayTypeFor({ active: false, doneToday: false, usualTraining: at(17), now: at(20) })).toBe("rest"); // exactly +3 h
    expect(dayTypeFor({ active: false, doneToday: true, usualTraining: at(17), now: at(9) })).toBe("training");
  });
});
