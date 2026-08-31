export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very";
export type Phase = "cut" | "maintain" | "bulk";

export function defaultProteinPerLb(phase: Phase): number {
  return phase === "cut" ? 1.1 : 1.0;
}

export function defaultRate(phase: Phase): number {
  if (phase === "cut") return 1.5;
  if (phase === "bulk") return 0.5;
  return 0;
}

export const ACTIVITY_MULTIPLIER: Record<Activity, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9,
};

const LB_TO_KG = 0.45359237;
const IN_TO_CM = 2.54;

/** Whole years between a YYYY-MM-DD birth date and `today` (local calendar). */
export function ageOn(birth_date: string, today: Date): number {
  const [y, m, d] = birth_date.split("-").map(Number);
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  const beforeBirthday = month < m || (month === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Mifflin-St Jeor BMR × activity multiplier, rounded to whole kcal. */
export function estimateTdee(
  p: { sex: Sex; birth_date: string; height_in: number; weight_lb: number; activity: Activity },
  today: Date
): number {
  const kg = p.weight_lb * LB_TO_KG;
  const cm = p.height_in * IN_TO_CM;
  const age = ageOn(p.birth_date, today);
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === "male" ? 5 : -161);
  return Math.round(bmr * ACTIVITY_MULTIPLIER[p.activity]);
}
