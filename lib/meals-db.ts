import { enqueueOrSend } from "@/lib/queue";

/** Remove a logged food. Offline-safe: queued behind anything pending, idempotent on replay. */
export async function deleteMeal(id: string): Promise<void> {
  await enqueueOrSend("meals", {}, { id, op: "delete" });
}
