import { supabase } from "@/lib/supabase";
import { enqueueOrSend } from "@/lib/queue";
import { isMuscle, type Muscle } from "@/lib/muscles";
import type { CustomExerciseRow } from "@/lib/custom-exercises";

function muscles(v: unknown): Muscle[] {
  return Array.isArray(v) ? v.filter(isMuscle) : [];
}

function row(r: Record<string, unknown>): CustomExerciseRow {
  return { id: String(r.id), name: String(r.name),
    primary_muscles: muscles(r.primary_muscles), secondary_muscles: muscles(r.secondary_muscles) };
}

export async function listCustomExercises(): Promise<CustomExerciseRow[]> {
  const { data, error } = await supabase.from("custom_exercises")
    .select("id,name,primary_muscles,secondary_muscles").order("name");
  if (error) throw error;
  return (data ?? []).map(row);
}

/** user_id is filled by the column default auth.uid(); the queue stamps id, not logged_at. */
export async function createCustomExercise(name: string, primary: Muscle[]): Promise<CustomExerciseRow> {
  const id = crypto.randomUUID();
  const clean = name.trim();
  await enqueueOrSend("custom_exercises",
    { name: clean, primary_muscles: primary, secondary_muscles: [] }, { id });
  return { id, name: clean, primary_muscles: primary, secondary_muscles: [] };
}
