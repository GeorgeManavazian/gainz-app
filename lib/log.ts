import { enqueueOrSend } from "@/lib/queue";

export type MealEntry = { food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string; unit?: "serving" };
export type LiftEntry = { exercise: string; sets: number; reps: number;
  weight: number; notes?: string; workout_id?: string };

export async function logMeal(entry: MealEntry): Promise<void> {
  await enqueueOrSend("meals", entry as unknown as Record<string, unknown>);
}

export async function logLift(entry: LiftEntry): Promise<void> {
  await enqueueOrSend("lifts", entry as unknown as Record<string, unknown>);
}
