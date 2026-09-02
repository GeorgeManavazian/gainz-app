import type { MealEntry } from "@/lib/log";

export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
export type PatternItem = { food_name: string; grams: number; per100g: Per100; fdc_id: string | null };
export type PatternRow = { id: string; name: string; items: PatternItem[]; created_at: string;
  last_used_at: string | null; use_count: number };
export type MealLike = { food_name: string; grams: number; calories: number; protein_g: number;
  carbs_g: number; fat_g: number; fdc_id?: string | null };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Per-100 g values from a logged row: value / grams × 100. Rows with grams ≤ 0 are skipped. */
export function itemsFromMeals(meals: MealLike[]): PatternItem[] {
  const out: PatternItem[] = [];
  for (const m of meals) {
    const g = Number(m.grams);
    if (!(g > 0)) continue;
    const s = 100 / g;
    out.push({
      food_name: m.food_name, grams: g, fdc_id: m.fdc_id ?? null,
      per100g: { kcal: Number(m.calories) * s, protein: Number(m.protein_g) * s,
        carbs: Number(m.carbs_g) * s, fat: Number(m.fat_g) * s },
    });
  }
  return out;
}

/** The meal row to log for this item at `grams`. Same 0.1 rounding as the meal page. */
export function scaleItem(item: PatternItem, grams: number): MealEntry {
  const k = grams / 100;
  const e: MealEntry = {
    food_name: item.food_name, grams,
    calories: r1(item.per100g.kcal * k), protein_g: r1(item.per100g.protein * k),
    carbs_g: r1(item.per100g.carbs * k), fat_g: r1(item.per100g.fat * k),
  };
  if (item.fdc_id) e.fdc_id = item.fdc_id;
  return e;
}

export function totals(entries: MealEntry[]) {
  const sum = (k: "calories" | "protein_g" | "carbs_g" | "fat_g") =>
    Math.round(entries.reduce((a, e) => a + e[k], 0));
  return { kcal: sum("calories"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g") };
}

/** Most recently used first; never-used after, newest created first. Pure — returns a new array. */
export function sortPatterns<T extends { last_used_at: string | null; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.last_used_at && b.last_used_at) return b.last_used_at.localeCompare(a.last_used_at);
    if (a.last_used_at) return -1;
    if (b.last_used_at) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}
