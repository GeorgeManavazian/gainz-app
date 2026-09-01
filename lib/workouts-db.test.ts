import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks -------------------------------------------------------------
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload: Row; id?: string }[],
  failNext: [] as ("transient" | "permanent" | "duplicate" | undefined)[],
  store: new Map<string, unknown>(),            // idb-keyval (offline queue)
  workoutsData: null as Row | Row[] | null,
  workoutsError: null as { code?: string; message: string } | null,
  workoutsThrow: null as Error | null,
  liftsData: [] as Row[],
  liftsThrow: null as Error | null,
}));

function outcome() {
  const f = h.failNext.shift();
  if (f === "transient") return { error: { code: "", message: "TypeError: fetch failed" }, status: 0 };
  if (f === "permanent") return { error: { code: "42501", message: "rls" }, status: 401 };
  if (f === "duplicate") return { error: { code: "23505", message: "dup" }, status: 409 };
  return { error: null, status: 201 };
}

function resultFor(table: string) {
  if (table === "workouts") {
    if (h.workoutsThrow) throw h.workoutsThrow;
    return { data: h.workoutsData, error: h.workoutsError };
  }
  if (table === "lifts") {
    if (h.liftsThrow) throw h.liftsThrow;
    return { data: h.liftsData, error: null };
  }
  return { data: null, error: null };
}

// A minimal fake postgrest query builder: every chain method returns itself,
// and the builder is thenable (as the real supabase-js builder is), so both
// `await x.eq(...).order(...)` and `await x.eq(...).maybeSingle()` work.
function makeQuery(table: string) {
  const builder: Row & { then: (...a: unknown[]) => Promise<unknown> } = {
    select: () => builder, is: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
    maybeSingle: async () => resultFor(table),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(() => resultFor(table)).then(resolve, reject),
  } as unknown as Row & { then: (...a: unknown[]) => Promise<unknown> };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
    from: (table: string) => ({
      insert: async (payload: Row) => { h.calls.push({ table, op: "insert", payload }); return outcome(); },
      update: (payload: Row) => ({
        eq: async (_col: string, id: string) => { h.calls.push({ table, op: "update", payload, id }); return outcome(); },
      }),
      select: () => makeQuery(table),
      delete: () => makeQuery(table),
    }),
  },
}));

vi.mock("idb-keyval", () => ({
  get: async (k: string) => h.store.get(k),
  update: async (k: string, fn: (v: unknown) => unknown) => { h.store.set(k, fn(h.store.get(k))); },
}));

// Simple in-memory Storage-alikes — vitest's "node" environment has no real localStorage/sessionStorage.
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage() as unknown as Storage;

import {
  cacheWorkout, deleteWorkout, endWorkout, getActiveWorkout, listLiftsForWorkout, startWorkout,
} from "./workouts-db";
import type { WorkoutRow } from "./workouts";

const QKEY = "gainz-offline-queue";
const ACTIVE_KEY = "gainz-active-workout";

beforeEach(() => {
  h.calls.length = 0;
  h.failNext.length = 0;
  h.store.clear();
  h.workoutsData = null;
  h.workoutsError = null;
  h.workoutsThrow = null;
  h.liftsData = [];
  h.liftsThrow = null;
  localStorage.clear();
  sessionStorage.clear();
});

// ---- Item 1: queued lifts are visible in listLiftsForWorkout -----------
describe("listLiftsForWorkout", () => {
  it("includes a queued (not-yet-landed) lift for this workout, with logged_at = queued_at", async () => {
    h.store.set(QKEY, [
      { id: "q1", table: "lifts", op: "insert", queued_at: "2026-09-01T10:00:00.000Z",
        entry: { exercise: "DB Chest Press", sets: 3, reps: 8, weight: 95, workout_id: "w1" } },
    ]);
    const rows = await listLiftsForWorkout("w1");
    expect(rows).toEqual([
      { id: "q1", exercise: "DB Chest Press", sets: 3, reps: 8, weight: 95,
        logged_at: "2026-09-01T10:00:00.000Z", workout_id: "w1" },
    ]);
  });

  it("does not duplicate a queued item once the server row for the same id lands (server wins)", async () => {
    h.store.set(QKEY, [
      { id: "q1", table: "lifts", op: "insert", queued_at: "2026-09-01T10:00:00.000Z",
        entry: { exercise: "DB Chest Press", sets: 3, reps: 8, weight: 95, workout_id: "w1" } },
    ]);
    h.liftsData = [
      { id: "q1", exercise: "DB Chest Press", sets: 3, reps: 8, weight: 95,
        logged_at: "2026-09-01T10:00:05.000Z", workout_id: "w1" },
    ];
    const rows = await listLiftsForWorkout("w1");
    expect(rows.length).toBe(1);
    expect(rows[0].logged_at).toBe("2026-09-01T10:00:05.000Z"); // server's logged_at, not the queued_at
  });

  it("falls back to queued rows only when the server read throws", async () => {
    h.store.set(QKEY, [
      { id: "q1", table: "lifts", op: "insert", queued_at: "2026-09-01T10:00:00.000Z",
        entry: { exercise: "DB Chest Press", sets: 3, reps: 8, weight: 95, workout_id: "w1" } },
    ]);
    h.liftsThrow = new Error("TypeError: fetch failed");
    const rows = await listLiftsForWorkout("w1");
    expect(rows.map((r) => r.id)).toEqual(["q1"]);
  });

  it("returns rows ascending by logged_at, mixing queued and server rows", async () => {
    h.store.set(QKEY, [
      { id: "q1", table: "lifts", op: "insert", queued_at: "2026-09-01T10:00:00.000Z",
        entry: { exercise: "A", sets: 1, reps: 1, weight: 1, workout_id: "w1" } },
      { id: "q2", table: "lifts", op: "insert", queued_at: "2026-09-01T09:00:00.000Z",
        entry: { exercise: "B", sets: 1, reps: 1, weight: 1, workout_id: "w1" } },
    ]);
    h.liftsData = [
      { id: "s1", exercise: "C", sets: 1, reps: 1, weight: 1, logged_at: "2026-09-01T08:00:00.000Z", workout_id: "w1" },
      { id: "s2", exercise: "D", sets: 1, reps: 1, weight: 1, logged_at: "2026-09-01T11:00:00.000Z", workout_id: "w1" },
    ];
    const rows = await listLiftsForWorkout("w1");
    expect(rows.map((r) => r.id)).toEqual(["s1", "q2", "q1", "s2"]);
  });
});

// ---- Item 3: gainz-active-workout localStorage pointer ------------------
describe("active workout pointer", () => {
  it("startWorkout sets the pointer to the new workout's id", async () => {
    const w = await startWorkout(["chest"]);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(w.id);
  });

  it("endWorkout clears the pointer only when it matches the ended workout", async () => {
    localStorage.setItem(ACTIVE_KEY, "w1");
    await endWorkout("w1");
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();

    localStorage.setItem(ACTIVE_KEY, "w1");
    await endWorkout("w2"); // some other (already-ended) workout — must not clear w1's pointer
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("w1");
  });

  it("deleteWorkout clears the pointer when it matches", async () => {
    localStorage.setItem(ACTIVE_KEY, "w1");
    await deleteWorkout("w1");
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("getActiveWorkout falls back to the cached row when the server read throws", async () => {
    const cached: WorkoutRow = { id: "w1", started_at: "2026-09-01T09:00:00.000Z", ended_at: null, muscle_groups: ["chest"] };
    cacheWorkout(cached);
    localStorage.setItem(ACTIVE_KEY, "w1");
    h.workoutsThrow = new Error("TypeError: fetch failed");

    const active = await getActiveWorkout(); // must not throw
    expect(active).toEqual(cached);
  });

  it("getActiveWorkout returns null (never throws) when the server fails and there is no pointer", async () => {
    h.workoutsThrow = new Error("TypeError: fetch failed");
    await expect(getActiveWorkout()).resolves.toBeNull();
  });

  it("getActiveWorkout clears the pointer when the server confirms no active workout", async () => {
    localStorage.setItem(ACTIVE_KEY, "w1");
    h.workoutsData = null; // .maybeSingle() found nothing
    const active = await getActiveWorkout();
    expect(active).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
  });
});
