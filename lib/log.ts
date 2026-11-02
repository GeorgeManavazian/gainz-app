import { enqueueOrSend } from "@/lib/queue";

export type MealEntry = { food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string; unit?: "serving" };
export type LiftEntry = { exercise: string; sets: number; reps: number;
  weight: number; notes?: string; workout_id?: string };

/** Logs a food and returns the row's client id (also its server primary key), so it can be undone. */
export async function logMeal(entry: MealEntry): Promise<string> {
  const id = crypto.randomUUID();
  await enqueueOrSend("meals", entry as unknown as Record<string, unknown>, { id });
  return id;
}

export async function logLift(entry: LiftEntry): Promise<void> {
  await enqueueOrSend("lifts", entry as unknown as Record<string, unknown>);
}
