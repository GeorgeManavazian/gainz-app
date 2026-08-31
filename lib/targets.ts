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
