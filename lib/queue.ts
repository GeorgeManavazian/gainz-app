import { get, update } from "idb-keyval";
import { supabase } from "@/lib/supabase";

type Queued = { id: string; kind: "meal" | "lift"; entry: Record<string, unknown>; queued_at: string };
const KEY = "gainz-offline-queue";

// insert is idempotent: the queued item's UUID becomes the row's primary key,
// so a retried insert of an already-landed item fails with 23505 and is treated as done.
async function insert(item: Queued): Promise<"ok" | "duplicate" | "permanent"> {
  const table = item.kind === "meal" ? "meals" : "lifts";
  const { error } = await supabase.from(table)
    .insert({ ...item.entry, id: item.id, logged_at: item.queued_at });
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  // Server answered with a structured rejection (RLS, constraint, bad column):
  // retrying will never succeed. Network failures throw instead of returning error.
  console.error("gainz queue: permanent insert failure, dropping item", item, error);
  return "permanent";
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
  if (isFlushing) return 0;
  isFlushing = true;
  try {
    const q = (await get<Queued[]>(KEY)) ?? [];
    if (q.length === 0) return 0;
    let flushed = 0;
    const done = new Set<string>();
    for (const item of q) {
      try {
        await insert(item); // "ok" | "duplicate" | "permanent" all mean: stop retrying
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
