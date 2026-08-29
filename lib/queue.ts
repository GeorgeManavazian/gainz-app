import { get, update } from "idb-keyval";
import { supabase } from "@/lib/supabase";

type Queued = { id: string; kind: "meal" | "lift"; entry: Record<string, unknown>; queued_at: string };
const KEY = "gainz-offline-queue";
const DEAD_KEY = "gainz-offline-deadletter";

// insert is idempotent: the queued item's UUID becomes the row's primary key,
// so a retried insert of an already-landed item fails with 23505 and is treated as done.
//
// supabase-js postgrest calls do NOT throw on network failure — they resolve with
// { error: { code: "", message: "TypeError: fetch failed" }, status: 0 }. So "no error"
// and "genuine server rejection" are the only two non-throwing outcomes; everything else
// (status 0, empty/absent code, 5xx) is transient and must throw so callers queue/retry it.
async function insert(item: Queued): Promise<"ok" | "duplicate" | "permanent"> {
  const table = item.kind === "meal" ? "meals" : "lifts";
  const { error, status } = await supabase.from(table)
    .insert({ ...item.entry, id: item.id, logged_at: item.queued_at });
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  if (status >= 400 && status <= 499 && !!error.code) {
    // Server answered with a structured rejection (RLS, constraint, bad column):
    // retrying will never succeed.
    console.error("gainz queue: permanent insert failure, dropping item", item, error);
    return "permanent";
  }
  // Transient (network failure, status 0, 5xx, etc.) — throw so callers queue/retry it.
  throw new Error(`gainz queue: transient insert failure: ${error.message}`);
}

export async function enqueueOrSend(kind: "meal" | "lift",
  entry: Record<string, unknown>): Promise<"sent" | "queued"> {
  const item: Queued = { id: crypto.randomUUID(), kind, entry, queued_at: new Date().toISOString() };
  try {
    const result = await insert(item);
    if (result === "permanent") {
      throw new Error("gainz queue: server rejected item permanently");
    }
    return "sent";
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("gainz queue: server rejected")) throw e; // do NOT queue permanents
    console.warn("gainz queue: offline, queueing item", item.id, e);
    await update<Queued[]>(KEY, (q) => [...(q ?? []), item]);
    return "queued";
  }
}

let isFlushing = false;

export async function flushQueue(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;
  if (isFlushing) return 0;
  isFlushing = true;
  try {
    const q = (await get<Queued[]>(KEY)) ?? [];
    if (q.length === 0) return 0;
    let flushed = 0;
    const done = new Set<string>();
    for (const item of q) {
      try {
        const result = await insert(item); // "ok" | "duplicate" | "permanent" all mean: stop retrying
        if (result === "permanent") {
          // Genuine server rejection: don't silently drop it, dead-letter it for inspection.
          console.error("gainz queue: dead-lettering permanently rejected item", item.id);
          await update<Queued[]>(DEAD_KEY, (dq) => [...(dq ?? []), item]);
        }
        done.add(item.id);
        flushed++;
      } catch (e) {
        console.warn("gainz queue: flush failed (still offline?), keeping item", item.id, e);
      }
    }
    // Atomic: only remove items we know are settled; concurrent enqueues survive.
    await update<Queued[]>(KEY, (cur) => (cur ?? []).filter((i) => !done.has(i.id)));
    return flushed;
  } finally {
    isFlushing = false;
  }
}
