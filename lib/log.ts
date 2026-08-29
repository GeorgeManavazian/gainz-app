import { supabase } from "@/lib/supabase";

export type MealEntry = { food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string };
export type LiftEntry = { exercise: string; sets: number; reps: number;
  weight: number; notes?: string };

export async function logMeal(entry: MealEntry): Promise<void> {
  const { error } = await supabase.from("meals").insert(entry);
  if (error) throw error;
}

export async function logLift(entry: LiftEntry): Promise<void> {
  const { error } = await supabase.from("lifts").insert(entry);
  if (error) throw error;
}
