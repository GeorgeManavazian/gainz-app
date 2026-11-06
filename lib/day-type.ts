import type { DayType } from "./targets";

/** Training day = a session today (running or done), or your usual session for this weekday that hasn't been missed (within 3 h of its start). */
export function dayTypeFor(a: { active: boolean; doneToday: boolean; usualTraining: Date | null; now: Date }): DayType {
  if (a.active || a.doneToday) return "training";
  if (a.usualTraining && a.now.getTime() < a.usualTraining.getTime() + 3 * 3_600_000) return "training";
  return "rest";
}
