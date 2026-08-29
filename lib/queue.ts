import { get, set } from "idb-keyval";
import { supabase } from "@/lib/supabase";

type Queued = { kind: "meal" | "lift"; entry: Record<string, unknown>; queued_at: string };
const KEY = "gainz-offline-queue";

async function readQueue(): Promise<Queued[]> {
  return (await get<Queued[]>(KEY)) ?? [];
}

async function insert(item: Queued): Promise<void> {
  const table = item.kind === "meal" ? "meals" : "lifts";
  // logged_at = when the user hit save, not when the flush happened
  const { error } = await supabase.from(table)
    .insert({ ...item.entry, logged_at: item.queued_at });
  if (error) throw error;
}

export async function enqueueOrSend(kind: "meal" | "lift",
  entry: Record<string, unknown>): Promise<"sent" | "queued"> {
  const item: Queued = { kind, entry, queued_at: new Date().toISOString() };
  try {
    await insert(item);
    return "sent";
  } catch {
    await set(KEY, [...(await readQueue()), item]);
    return "queued";
  }
}

export async function flushQueue(): Promise<number> {
  const q = await readQueue();
  if (q.length === 0) return 0;
  const remaining: Queued[] = [];
  let flushed = 0;
  for (const item of q) {
    try { await insert(item); flushed++; }
    catch { remaining.push(item); }
  }
  await set(KEY, remaining);
  return flushed;
}
