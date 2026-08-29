import { enqueueOrSend } from "@/lib/queue";

export type MealEntry = { food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string };
export type LiftEntry = { exercise: string; sets: number; reps: number;
  weight: number; notes?: string };

export async function logMeal(entry: MealEntry): Promise<void> {
  await enqueueOrSend("meal", entry as unknown as Record<string, unknown>);
}

export async function logLift(entry: LiftEntry): Promise<void> {
  await enqueueOrSend("lift", entry as unknown as Record<string, unknown>);
}
