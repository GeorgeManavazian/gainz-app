export type MacroTargets = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };
export type MacroTotals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function ringFractions(value: number, target: number): { fill: number; over: number } {
  if (target <= 0) return { fill: 0, over: 0 };
  return { fill: clamp01(value / target), over: clamp01((value - target) / target) };
}

export function remaining(value: number, target: number): number {
  return target - value;
}

export type NextMeal = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; mealsLeft: number };

/** Placeholder for roadmap #5: remaining budget split evenly across meals left. */
export function nextMeal(totals: MacroTotals, targets: MacroTargets, mealsLogged: number,
  mealsPerDay = 4): NextMeal | null {
  const kcalLeft = remaining(totals.calories, targets.kcal);
  if (kcalLeft <= 0) return null;
  const mealsLeft = Math.max(mealsPerDay - mealsLogged, 1);
  const per = (left: number) => Math.max(left, 0) / mealsLeft;
  return {
    kcal: Math.round(per(kcalLeft) / 10) * 10,
    protein_g: Math.round(per(remaining(totals.protein_g, targets.protein_g))),
    carbs_g: Math.round(per(remaining(totals.carbs_g, targets.carbs_g))),
    fat_g: Math.round(per(remaining(totals.fat_g, targets.fat_g))),
    mealsLeft,
  };
}
