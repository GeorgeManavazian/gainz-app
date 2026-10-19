import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks -------------------------------------------------------------
type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; payload: Record<string, unknown>; id?: string }[],
  failNext: [] as ("transient" | "permanent" | "duplicate" | undefined)[],
  store: new Map<string, unknown>(),
  gate: null as Promise<void> | null, // when set, insert() awaits it after recording the call
}));

function outcome() {
  const f = h.failNext.shift();
  if (f === "transient") return { error: { code: "", message: "TypeError: fetch failed" }, status: 0 };
  if (f === "permanent") return { error: { code: "42501", message: "rls" }, status: 401 };
  if (f === "duplicate") return { error: { code: "23505", message: "dup" }, status: 409 };
  return { error: null, status: 201 };
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
    from: (table: string) => ({
      insert: async (payload: Row) => {
        h.calls.push({ table, op: "insert", payload });
        if (h.gate) await h.gate;
        return outcome();
      },
      delete: () => ({
        eq: async (_col: string, id: string) => { h.calls.push({ table, op: "delete", payload: {}, id }); return outcome(); },
      }),
      update: (payload: Row) => ({
        eq: async (_col: string, id: string) => { h.calls.push({ table, op: "update", payload, id }); return outcome(); },
      }),
    }),
  },
}));

vi.mock("idb-keyval", () => ({
  get: async (k: string) => h.store.get(k),
  update: async (k: string, fn: (v: unknown) => unknown) => { h.store.set(k, fn(h.store.get(k))); },
}));

import { enqueueOrSend, flushQueue, normalizeQueued, type Queued } from "./queue";
const KEY = "gainz-offline-queue";
const queue = () => (h.store.get(KEY) as Queued[] | undefined) ?? [];

beforeEach(() => { h.calls.length = 0; h.failNext.length = 0; h.store.clear(); h.gate = null; });

// ---- tests -------------------------------------------------------------
describe("normalizeQueued", () => {
  it("upgrades the old { kind } shape", () => {
    const old = { id: "1", kind: "lift", entry: { exercise: "x" }, queued_at: "t" };
    expect(normalizeQueued(old)).toEqual({ id: "1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" });
    expect(normalizeQueued({ ...old, kind: "meal" }).table).toBe("meals");
  });
  it("passes the new shape through", () => {
    const n: Queued = { id: "1", table: "workouts", op: "update", entry: { ended_at: "t" }, queued_at: "t" };
    expect(normalizeQueued(n)).toEqual(n);
  });
});

describe("enqueueOrSend", () => {
  it("stamps id + logged_at for lifts inserts", async () => {
    await enqueueOrSend("lifts", { exercise: "x", sets: 1, reps: 6, weight: 95 });
    expect(h.calls[0].table).toBe("lifts");
    expect(h.calls[0].payload).toMatchObject({ exercise: "x" });
    expect(typeof h.calls[0].payload.id).toBe("string");
    expect(typeof h.calls[0].payload.logged_at).toBe("string");
  });
  it("does NOT stamp logged_at for workouts inserts and honours a caller id", async () => {
    await enqueueOrSend("workouts", { started_at: "t", muscle_groups: ["chest"] }, { id: "w1" });
    expect(h.calls[0].payload).toEqual({ started_at: "t", muscle_groups: ["chest"], id: "w1" });
  });
  it("delete op calls delete().eq('id') and sends immediately when the queue is empty", async () => {
    expect(await enqueueOrSend("lifts", {}, { id: "s1", op: "delete" })).toBe("sent");
    expect(h.calls[0]).toMatchObject({ table: "lifts", op: "delete", id: "s1" });
  });
  it("stamps logged_at for meals inserts", async () => {
    await enqueueOrSend("meals", { name: "x" }, { id: "m1" });
    expect(typeof h.calls[0].payload.logged_at).toBe("string");
  });
  it("does NOT stamp logged_at for custom_exercises inserts", async () => {
    await enqueueOrSend("custom_exercises", { name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] }, { id: "c1" });
    expect(h.calls[0].payload).toEqual({ name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [], id: "c1" });
  });
  it("update op calls update().eq('id')", async () => {
    await enqueueOrSend("workouts", { ended_at: "t" }, { id: "w1", op: "update" });
    expect(h.calls[0]).toMatchObject({ table: "workouts", op: "update", payload: { ended_at: "t" }, id: "w1" });
  });
  it("queues on transient failure", async () => {
    h.failNext.push("transient");
    expect(await enqueueOrSend("lifts", { exercise: "x" })).toBe("queued");
    expect(queue().length).toBe(1);
  });
  it("always queues when something is already queued (never overtakes)", async () => {
    h.failNext.push("transient");
    await enqueueOrSend("workouts", { started_at: "t" }, { id: "w1" });
    h.failNext.push("transient"); // the kicked flush will also fail
    const r = await enqueueOrSend("lifts", { exercise: "x", workout_id: "w1" });
    expect(r).toBe("queued");
    expect(queue().map((q) => q.table)).toEqual(["workouts", "lifts"]);
  });
  it("throws (and does not queue) on permanent rejection", async () => {
    h.failNext.push("permanent");
    await expect(enqueueOrSend("lifts", { exercise: "x" })).rejects.toThrow();
    expect(queue().length).toBe(0);
  });
});

describe("flushQueue", () => {
  it("flushes FIFO and stops at the first transient failure", async () => {
    h.store.set(KEY, [
      { id: "a", table: "workouts", op: "insert", entry: {}, queued_at: "t" },
      { id: "b", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
      { id: "c", table: "workouts", op: "update", entry: { ended_at: "t" }, queued_at: "t" },
    ] satisfies Queued[]);
    h.failNext.push(undefined, "transient"); // a ok, b transient → stop
    expect(await flushQueue()).toBe(1);
    expect(queue().map((q) => q.id)).toEqual(["b", "c"]);
    expect(h.calls.length).toBe(2);
  });
  it("a delete queued behind its own insert flushes insert then delete", async () => {
    h.store.set(KEY, [
      { id: "s1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" },
      { id: "s1", table: "lifts", op: "delete", entry: {}, queued_at: "t2" },
    ] satisfies Queued[]);
    expect(await flushQueue()).toBe(2);
    expect(h.calls.map((c) => c.op)).toEqual(["insert", "delete"]);
    expect(queue()).toEqual([]);
  });
  it("dead-letters permanent failures and continues; duplicates count as done", async () => {
    h.store.set(KEY, [
      { id: "a", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
      { id: "b", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
    ] satisfies Queued[]);
    h.failNext.push("permanent", "duplicate");
    expect(await flushQueue()).toBe(2);
    expect(queue()).toEqual([]);
    expect((h.store.get("gainz-offline-deadletter") as Queued[]).map((q) => q.id)).toEqual(["a"]);
  });
  it("insert ok, delete transient → delete remains queued", async () => {
    h.store.set(KEY, [
      { id: "s1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" },
      { id: "s1", table: "lifts", op: "delete", entry: {}, queued_at: "t2" },
    ] satisfies Queued[]);
    h.failNext.push(undefined, "transient");
    expect(await flushQueue()).toBe(1);
    expect(queue().map((q) => q.op)).toEqual(["delete"]);
  });
  it("delete enqueued during a running flush survives", async () => {
    h.store.set(KEY, [
      { id: "s1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" },
    ] satisfies Queued[]);
    let release!: () => void;
    h.gate = new Promise<void>((r) => { release = r; });
    const running = flushQueue();
    await vi.waitFor(() => expect(h.calls.length).toBe(1)); // flush is mid-insert
    expect(await enqueueOrSend("lifts", {}, { id: "s1", op: "delete" })).toBe("queued");
    release();
    expect(await running).toBe(1);
    expect(queue().map((q) => q.op)).toEqual(["delete"]);
    expect(h.calls.length).toBe(1);
  });
});
