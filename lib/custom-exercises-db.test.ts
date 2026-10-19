import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload: Row }[],
  store: new Map<string, unknown>(),
  listData: [] as Row[],
  listThrow: null as Error | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
    from: (table: string) => ({
      insert: async (payload: Row) => {
        h.calls.push({ table, op: "insert", payload });
        return { error: null, status: 201 };
      },
      select: () => ({
        order: async () => {
          if (h.listThrow) throw h.listThrow;
          return { data: h.listData, error: null };
        },
      }),
    }),
  },
}));

vi.mock("idb-keyval", () => ({
  get: async (k: string) => h.store.get(k),
  update: async (k: string, fn: (v: unknown) => unknown) => { h.store.set(k, fn(h.store.get(k))); },
}));

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = new MemoryStorage() as unknown as Storage;

import { createCustomExercise, listCustomExercises } from "./custom-exercises-db";

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
  h.listData = [];
  h.listThrow = null;
});

const KEY = "gainz-offline-queue";
const queuedCustom = (id: string, name: string) => ({ id, table: "custom_exercises", op: "insert",
  entry: { name, primary_muscles: ["rear_delts", "bogus"], secondary_muscles: [] }, queued_at: "t" });

describe("custom-exercises-db", () => {
  it("createCustomExercise inserts with a client id and no logged_at, and returns the row", async () => {
    const row = await createCustomExercise("  Cable Y Raise ", ["rear_delts"]);
    expect(h.calls[0]).toMatchObject({ table: "custom_exercises", op: "insert",
      payload: { name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] } });
    expect(h.calls[0].payload).not.toHaveProperty("logged_at");
    expect(h.calls[0].payload).not.toHaveProperty("user_id");
    expect(row).toMatchObject({ id: h.calls[0].payload.id, name: "Cable Y Raise", primary_muscles: ["rear_delts"] });
  });

  it("listCustomExercises maps server rows and drops unknown muscle ids", async () => {
    h.listData = [{ id: "a", name: "Cable Y Raise", primary_muscles: ["rear_delts", "not_a_muscle"], secondary_muscles: null }];
    expect(await listCustomExercises()).toEqual([
      { id: "a", name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] },
    ]);
  });

  it("includes a queued custom exercise (server row wins on id collision), sorted by name", async () => {
    h.store.set(KEY, [queuedCustom("q1", "Zercher Hold"), queuedCustom("a", "stale name"),
      { id: "x", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" }]);
    h.listData = [{ id: "a", name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] }];
    expect(await listCustomExercises()).toEqual([
      { id: "a", name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] },
      { id: "q1", name: "Zercher Hold", primary_muscles: ["rear_delts"], secondary_muscles: [] },
    ]);
  });

  it("falls back to queued rows when the server read throws", async () => {
    h.store.set(KEY, [queuedCustom("q1", "Zercher Hold")]);
    h.listThrow = new Error("TypeError: fetch failed");
    expect(await listCustomExercises()).toEqual([
      { id: "q1", name: "Zercher Hold", primary_muscles: ["rear_delts"], secondary_muscles: [] },
    ]);
  });
});
