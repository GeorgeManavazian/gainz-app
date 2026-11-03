/** Daily "controllables": five yes/no checks scored from what was logged. Pure, local time. */
import { feedings, proteinHits, bedtimeFor, PROTEIN_HITS_TARGET, LATE_MEAL_KCAL, LATE_MEAL_HOURS, POST_WINDOW_HOURS,
  type TimingMeal, type TimingWorkout, type DayClock } from "./meal-timing";

export const FUEL_CARBS_MIN_G = 60;
export const FUEL_FAT_MAX_G = 20;
export const FUEL_BEFORE_MIN_H = 1, FUEL_BEFORE_MAX_H = 3;
export const POST_PROTEIN_MIN_G = 30;
export const ON_TIME_TOLERANCE_MIN = 45;
export const ON_TIME_MIN_SHARE = 0.75;

export type CheckKey = "fuelled" | "postProtein" | "proteinHits" | "dinnerEarly" | "onTime";
/** ok: true/false; null = not applicable today (e.g. no workout, no pattern yet, day not over). */
export type Check = { key: CheckKey; label: string; ok: boolean | null; detail: string };

export type CheckMeal = TimingMeal & { carbs_g?: number };
const H = 3_600_000;

/** Score one day. `meals` are that day's rows; `workout` that day's (completed) session; `slots` the usual minutes (if learned);
 *  `dayOver` = the day has ended (bedtime passed) so "dinner early" and "on time" can be judged. */
export function dailyChecks(a: {
  meals: CheckMeal[]; workout: TimingWorkout | null; clock: DayClock; slots: number[] | null; now: Date; dayOver: boolean;
}): Check[] {
  const fs = feedings(a.meals);
  const rowsByFeeding = (f: { at: string }) => {
    const t0 = new Date(f.at).getTime();
    return a.meals.filter((m) => { const t = new Date(m.logged_at).getTime(); return t >= t0 && t - t0 <= 60 * 60_000; });
  };
  const carbsOf = (f: { at: string }) => rowsByFeeding(f).reduce((s, m) => s + Number(m.carbs_g ?? 0), 0);

  // 1. Fuelled the session: a feeding 1–3 h before the start with ≥ 60 g carbs and ≤ 20 g fat.
  let fuelled: Check;
  if (!a.workout) fuelled = { key: "fuelled", label: "Fuelled the session", ok: null, detail: "No workout" };
  else {
    const start = new Date(a.workout.started_at).getTime();
    const pre = fs.filter((f) => { const h = (start - new Date(f.at).getTime()) / H; return h >= FUEL_BEFORE_MIN_H && h <= FUEL_BEFORE_MAX_H; });
    const good = pre.find((f) => carbsOf(f) >= FUEL_CARBS_MIN_G && Number(f.fat_g) <= FUEL_FAT_MAX_G);
    fuelled = { key: "fuelled", label: "Fuelled the session",
      ok: !!good, detail: good ? `${Math.round(carbsOf(good))} C · ${Math.round(Number(good.fat_g))} F, ${((start - new Date(good.at).getTime()) / H).toFixed(1)} h before`
        : pre.length ? `Pre-meal had ${Math.round(carbsOf(pre[0]))} C · ${Math.round(Number(pre[0].fat_g))} F` : "Nothing 1–3 h before" };
  }

  // 2. Protein after: ≥ 30 g within 2 h of the end.
  let post: Check;
  if (!a.workout?.ended_at) post = { key: "postProtein", label: "Protein after", ok: null, detail: a.workout ? "Session not finished" : "No workout" };
  else {
    const end = new Date(a.workout.ended_at).getTime();
    const windowOpen = a.now.getTime() - end < POST_WINDOW_HOURS * H;
    const after = fs.filter((f) => { const t = new Date(f.at).getTime(); return t >= end && t - end <= POST_WINDOW_HOURS * H; });
    const got = after.reduce((s, f) => s + Number(f.protein_g), 0);
    post = { key: "postProtein", label: "Protein after", ok: got >= POST_PROTEIN_MIN_G ? true : windowOpen ? null : false,
      detail: got >= POST_PROTEIN_MIN_G ? `${Math.round(got)} g within 2 h` : windowOpen ? `${Math.round(got)} g so far` : `${Math.round(got)} g within 2 h` };
  }

  // 3. Protein hits.
  const hits = proteinHits(a.meals);
  const hitsCheck: Check = { key: "proteinHits", label: `${PROTEIN_HITS_TARGET} protein hits`,
    ok: hits >= PROTEIN_HITS_TARGET ? true : a.dayOver ? false : null, detail: `${hits} / ${PROTEIN_HITS_TARGET}` };

  // 4. Last big meal ≥ 3 h before bed (judged once the cutoff has passed).
  const bed = bedtimeFor(a.now, a.clock).getTime();
  const cutoff = bed - LATE_MEAL_HOURS * H;
  const lateBig = fs.filter((f) => Number(f.calories) >= LATE_MEAL_KCAL && new Date(f.at).getTime() > cutoff);
  const dinner: Check = { key: "dinnerEarly", label: "Dinner ≥ 3 h before bed",
    ok: lateBig.length ? false : (a.dayOver || a.now.getTime() >= cutoff) ? true : null,
    detail: lateBig.length ? `${Math.round(Number(lateBig[0].calories))} kcal at ${fmt(new Date(lateBig[0].at))}` : "" };

  // 5. On usual times: ≥ 75 % of feedings within ±45 min of a usual slot.
  let onTime: Check;
  if (!a.slots || a.slots.length === 0) onTime = { key: "onTime", label: "On your usual times", ok: null, detail: "Still learning" };
  else if (fs.length === 0) onTime = { key: "onTime", label: "On your usual times", ok: null, detail: "Nothing logged" };
  else {
    const minute = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const near = fs.filter((f) => a.slots!.some((m) => Math.abs(minute(new Date(f.at)) - m) <= ON_TIME_TOLERANCE_MIN)).length;
    const share = near / fs.length;
    onTime = { key: "onTime", label: "On your usual times", ok: share >= ON_TIME_MIN_SHARE ? true : a.dayOver ? false : null, detail: `${near} of ${fs.length} meals` };
  }
  return [fuelled, post, hitsCheck, dinner, onTime];
}

const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").toLowerCase().replace(" ", "");
