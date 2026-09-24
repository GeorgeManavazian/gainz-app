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

const WINDOW_END_HOUR = 22;

/** Remaining budget split across meals left, where meals-left tracks the clock:
 *  the eating window runs from today's first logged meal (or now, if none yet)
 *  to a fixed end hour, divided into mealsPerDay-sized slices. */
export function nextMeal(totals: MacroTotals, targets: MacroTargets, meals: { logged_at: string }[],
  now: Date = new Date(), mealsPerDay = 4): NextMeal | null {
  const kcalLeft = remaining(totals.calories, targets.kcal);
  if (kcalLeft <= 0) return null;

  const windowEnd = new Date(now);
  windowEnd.setHours(WINDOW_END_HOUR, 0, 0, 0);
  const windowStart = meals.length
    ? new Date(Math.min(...meals.map((m) => new Date(m.logged_at).getTime())))
    : now;

  const hoursPerMeal = Math.max((windowEnd.getTime() - windowStart.getTime()) / 3_600_000, 1) / mealsPerDay;
  const hoursRemaining = Math.max((windowEnd.getTime() - now.getTime()) / 3_600_000, 0);
  const mealsLeft = Math.max(Math.ceil(hoursRemaining / hoursPerMeal), 1);
  const per = (left: number) => Math.max(left, 0) / mealsLeft;
  return {
    kcal: Math.round(per(kcalLeft) / 10) * 10,
    protein_g: Math.round(per(remaining(totals.protein_g, targets.protein_g))),
    carbs_g: Math.round(per(remaining(totals.carbs_g, targets.carbs_g))),
    fat_g: Math.round(per(remaining(totals.fat_g, targets.fat_g))),
    mealsLeft,
  };
}
