/** Warn before a save that fights the plan: a heavy meal near bed, a fatty meal right before training. Pure. */
import { bedtimeFor, LATE_MEAL_KCAL, LATE_MEAL_HOURS, PRE_FAT_MAX_G, PRE_WINDOW_HOURS, type DayClock } from "./meal-timing";

export type WarnEntry = { calories: number; fat_g: number };
export type WarnContext = { now: Date; clock: DayClock; training: Date | null; trainingDone: boolean };
const H = 3_600_000;

export function preSaveWarning(e: WarnEntry, c: WarnContext): string | null {
  const t = c.now.getTime();
  const bed = bedtimeFor(c.now, c.clock).getTime();
  const hoursToBed = (bed - t) / H;
  if (e.calories >= LATE_MEAL_KCAL && hoursToBed <= LATE_MEAL_HOURS && hoursToBed > -6) {
    const h = Math.max(0, Math.round(hoursToBed * 2) / 2);
    return `${Math.round(e.calories)} kcal ${h <= 0 ? "after your bedtime" : `${h} h before bed`} — big meals this late tend to hurt sleep.`;
  }
  if (c.training && !c.trainingDone) {
    const hoursToTrain = (c.training.getTime() - t) / H;
    if (hoursToTrain > 0 && hoursToTrain <= PRE_WINDOW_HOURS && e.fat_g > PRE_FAT_MAX_G)
      return `${Math.round(e.fat_g)} g fat ${Math.round(hoursToTrain * 2) / 2} h before training — fat sits in the stomach; keep the pre-workout meal under ${PRE_FAT_MAX_G} g.`;
    if (hoursToTrain > 0 && hoursToTrain < 1 && e.calories > 350)
      return `${Math.round(e.calories)} kcal under an hour before training — you'll feel it. A 30–50 g carb snack is the move.`;
  }
  return null;
}
