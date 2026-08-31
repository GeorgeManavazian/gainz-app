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

export type Profile = {
  sex: Sex;
  birth_date: string; // YYYY-MM-DD
  height_in: number;
  weight_lb: number;
  activity: Activity;
  phase: Phase;
  rate_lb_per_wk: number;
  protein_g_per_lb: number | null;
  tdee_override: number | null;
};

export type Targets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  tdee: number;
  tdee_est: number;
  warning?: string;
};

export const FAT_G_PER_LB = 0.33;
const KCAL_PER_LB_FAT = 3500;

export function computeTargets(p: Profile, today: Date = new Date()): Targets {
  const tdee_est = estimateTdee(p, today);
  const tdee = p.tdee_override ?? tdee_est;
  const delta = (p.rate_lb_per_wk * KCAL_PER_LB_FAT) / 7;
  const rawKcal = p.phase === "cut" ? tdee - delta : p.phase === "bulk" ? tdee + delta : tdee;

  const kcal = Math.round(rawKcal);
  const fat_g = Math.round(FAT_G_PER_LB * p.weight_lb);
  const protein_g = Math.round((p.protein_g_per_lb ?? defaultProteinPerLb(p.phase)) * p.weight_lb);
  const remaining = kcal - 9 * fat_g - 4 * protein_g;
  const carbs_g = Math.max(0, Math.round(remaining / 4));

  const t: Targets = { kcal, protein_g, carbs_g, fat_g, tdee, tdee_est };
  if (remaining < 0) t.warning = "kcal too low for fat + protein floors";
  return t;
}
