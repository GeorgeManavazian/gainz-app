import { supabase } from "@/lib/supabase";
import { enqueueOrSend, readQueue } from "@/lib/queue";
import { isMuscle, type Muscle } from "@/lib/muscles";
import type { CustomExerciseRow } from "@/lib/custom-exercises";

function muscles(v: unknown): Muscle[] {
  return Array.isArray(v) ? v.filter(isMuscle) : [];
}

function row(r: Record<string, unknown>): CustomExerciseRow {
  return { id: String(r.id), name: String(r.name),
    primary_muscles: muscles(r.primary_muscles), secondary_muscles: muscles(r.secondary_muscles) };
}

/** Server rows plus customs still waiting in the offline queue; offline, the queued ones only. */
export async function listCustomExercises(): Promise<CustomExerciseRow[]> {
  const queued = (await readQueue())
    .filter((q) => q.table === "custom_exercises" && q.op === "insert")
    .map((q) => row({ id: q.id, ...q.entry }));

  let server: CustomExerciseRow[] = [];
  try {
    const { data, error } = await supabase.from("custom_exercises")
      .select("id,name,primary_muscles,secondary_muscles").order("name");
    if (error) throw error;
    server = (data ?? []).map(row);
  } catch (e) {
    console.warn("gainz custom exercises: server read failed, showing queued ones only", e);
  }

  const byId = new Map<string, CustomExerciseRow>();
  for (const r of queued) byId.set(r.id, r);
  for (const r of server) byId.set(r.id, r); // server row wins on id collision
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** user_id is filled by the column default auth.uid(); the queue stamps id, not logged_at. */
export async function createCustomExercise(name: string, primary: Muscle[]): Promise<CustomExerciseRow> {
  const id = crypto.randomUUID();
  const clean = name.trim();
  await enqueueOrSend("custom_exercises",
    { name: clean, primary_muscles: primary, secondary_muscles: [] }, { id });
  return { id, name: clean, primary_muscles: primary, secondary_muscles: [] };
}
