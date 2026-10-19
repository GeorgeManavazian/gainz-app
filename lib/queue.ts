import { get, update } from "idb-keyval";
import { supabase } from "@/lib/supabase";

export type QueueTable = "meals" | "lifts" | "workouts" | "custom_exercises";
export type QueueOp = "insert" | "update" | "delete";
export type Queued = { id: string; table: QueueTable; op: QueueOp; entry: Record<string, unknown>; queued_at: string };

const KEY = "gainz-offline-queue";
const DEAD_KEY = "gainz-offline-deadletter";

/** Items written before sub-project 3 have `{ kind: "meal" | "lift" }`. */
export function normalizeQueued(raw: unknown): Queued {
  const r = raw as Partial<Queued> & { kind?: "meal" | "lift" };
  if (r.kind) {
    return { id: r.id!, table: r.kind === "meal" ? "meals" : "lifts", op: "insert",
      entry: r.entry ?? {}, queued_at: r.queued_at! };
  }
  return r as Queued;
}

export async function readQueue(): Promise<Queued[]> {
  return ((await get<unknown[]>(KEY)) ?? []).map(normalizeQueued);
}

// insert is idempotent: the queued item's UUID becomes the row's primary key,
// so a retried insert of an already-landed item fails with 23505 and is treated as done.
// update is idempotent by construction (the only update is ended_at).
// delete is idempotent: PostgREST returns no error when 0 rows match, so replaying a
// delete (or deleting a row that never landed) is a no-error "ok". A delete (or update) queued
// behind its own insert shares the item id, so flushQueue settles items by identity
// (id + op + queued_at), never by id alone: a settled insert must not take a pending
// delete/update with the same id out of the queue (e.g. one enqueued mid-flush).
// Insert payloads are per-table: only lifts and meals get logged_at stamped from queued_at.
//
// supabase-js postgrest calls do NOT throw on network failure — they resolve with
// { error: { code: "", message: "TypeError: fetch failed" }, status: 0 }. So "no error"
// and "genuine server rejection" are the only two non-throwing outcomes; everything else
// (status 0, empty/absent code, 5xx) is transient and must throw so callers queue/retry it.
async function send(item: Queued): Promise<"ok" | "duplicate" | "permanent"> {
  let result: { error: { code?: string; message: string } | null; status: number };
  if (item.op === "update") {
    result = await supabase.from(item.table).update(item.entry).eq("id", item.id);
  } else if (item.op === "delete") {
    result = await supabase.from(item.table).delete().eq("id", item.id);
  } else {
    const payload = item.table === "lifts" || item.table === "meals"
      ? { ...item.entry, id: item.id, logged_at: item.queued_at }
      : { ...item.entry, id: item.id };
    result = await supabase.from(item.table).insert(payload);
  }
  const { error, status } = result;
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  if (status >= 400 && status <= 499 && !!error.code) {
    console.error("gainz queue: permanent failure, dropping item", item, error);
    return "permanent";
  }
  throw new Error(`gainz queue: transient failure: ${error.message}`);
}

export async function enqueueOrSend(table: QueueTable, entry: Record<string, unknown>,
  opts: { id?: string; op?: QueueOp } = {}): Promise<"sent" | "queued"> {
  const item: Queued = { id: opts.id ?? crypto.randomUUID(), table, op: opts.op ?? "insert",
    entry, queued_at: new Date().toISOString() };

  // Never overtake: if anything is waiting, this goes behind it.
  if ((await readQueue()).length > 0) {
    await update<unknown[]>(KEY, (q) => [...(q ?? []), item]);
    flushQueue().catch((e) => console.warn("gainz queue: background flush failed", e));
    return "queued";
  }

  try {
    const result = await send(item);
    if (result === "permanent") throw new Error("gainz queue: server rejected item permanently");
    return "sent";
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("gainz queue: server rejected")) throw e; // do NOT queue permanents
    console.warn("gainz queue: offline, queueing item", item.id, e);
    await update<unknown[]>(KEY, (q) => [...(q ?? []), item]);
    return "queued";
  }
}

let isFlushing = false;

/** Identity of a queued item: same id can appear with several ops (insert → delete). */
const itemKey = (q: Queued) => `${q.id}:${q.op}:${q.queued_at}`;

export async function flushQueue(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;
  if (isFlushing) return 0;
  isFlushing = true;
  try {
    const q = await readQueue();
    if (q.length === 0) return 0;
    let flushed = 0;
    const done = new Set<string>();
    for (const item of q) {
      try {
        const result = await send(item); // "ok" | "duplicate" | "permanent" all mean: stop retrying
        if (result === "permanent") {
          console.error("gainz queue: dead-lettering permanently rejected item", item.id);
          await update<Queued[]>(DEAD_KEY, (dq) => [...(dq ?? []), item]);
        }
        done.add(itemKey(item));
        flushed++;
      } catch (e) {
        console.warn("gainz queue: flush stopped (still offline?), keeping the rest in order", item.id, e);
        break; // strict FIFO: nothing behind this item may land before it
      }
    }
    // Atomic: only remove items we know are settled; concurrent enqueues survive.
    await update<unknown[]>(KEY, (cur) => (cur ?? []).filter((i) => !done.has(itemKey(normalizeQueued(i)))));
    return flushed;
  } finally {
    isFlushing = false;
  }
}
