import { describe, it, expect } from "vitest";
import { isAuthorized, parseHealthSyncBody } from "./health-sync";

describe("isAuthorized", () => {
  it("true when the header is exactly 'Bearer <token>'", () => {
    expect(isAuthorized("Bearer secret123", "secret123")).toBe(true);
  });
  it("false when the header is missing", () => {
    expect(isAuthorized(null, "secret123")).toBe(false);
  });
  it("false when the token doesn't match", () => {
    expect(isAuthorized("Bearer wrong", "secret123")).toBe(false);
  });
  it("false when the header is missing the 'Bearer ' prefix", () => {
    expect(isAuthorized("secret123", "secret123")).toBe(false);
  });
});

describe("parseHealthSyncBody", () => {
  it("parses a valid body", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: 450 }))
      .toEqual({ date: "2026-09-30", active_kcal: 450 });
  });
  it("null when active_kcal is negative", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: -1 })).toBeNull();
  });
  it("null when active_kcal is not a finite number", () => {
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: "450" })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-09-30", active_kcal: NaN })).toBeNull();
  });
  it("null when date isn't YYYY-MM-DD", () => {
    expect(parseHealthSyncBody({ date: "09-30-2026", active_kcal: 450 })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-9-30", active_kcal: 450 })).toBeNull();
  });
  it("null when date or active_kcal is missing", () => {
    expect(parseHealthSyncBody({ active_kcal: 450 })).toBeNull();
    expect(parseHealthSyncBody({ date: "2026-09-30" })).toBeNull();
  });
  it("null for non-object bodies", () => {
    expect(parseHealthSyncBody(null)).toBeNull();
    expect(parseHealthSyncBody("nope")).toBeNull();
    expect(parseHealthSyncBody(42)).toBeNull();
  });
});
