/** A food the user created (e.g. from a scanned label). Macros are per 100 g. */
export type CustomFoodRow = {
  id: string; name: string; serving_g: number | null;
  kcal: number; protein_g: number; carbs_g: number; fat_g: number;
};

export function rowFromRecord(r: Record<string, unknown>): CustomFoodRow {
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  return { id: String(r.id), name: String(r.name ?? "").trim(),
    serving_g: r.serving_g == null ? null : n(r.serving_g),
    kcal: n(r.kcal), protein_g: n(r.protein_g), carbs_g: n(r.carbs_g), fat_g: n(r.fat_g) };
}

export const normName = (s: string) => s.trim().toLowerCase();
