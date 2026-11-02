/** Meal timing: a coarse fuel model + next-meal window from meals, training and sleep. Pure, local time. */
export type TimingMeal = { logged_at: string; calories: number; protein_g: number; fat_g: number };
export type TimingWorkout = { started_at: string; ended_at: string | null };
export type DayClock = { wake: string; bed: string }; // "HH:MM"

export const LATE_MEAL_KCAL = 600;
export const LATE_MEAL_HOURS = 2.5;      // heavy-meal cutoff before bed
export const LIGHT_CUTOFF_HOURS = 1;     // light snack cutoff before bed
export const PROTEIN_HIT_G = 25;
export const HIT_GAP_HOURS = 2.5;
export const FEEDING_MERGE_MIN = 60;
export const PROTEIN_HITS_TARGET = 4;
export const PROTEIN_PER_LB = 0.18;      // ≈ 0.4 g/kg per feeding
export const MEAL_SPACING_HOURS = 3.5;

const H = 3_600_000;
const r10 = (n: number) => Math.round(n / 10) * 10;

/** Hours a meal keeps you fuelled: coarse buckets by size, a little longer when fatty. */
export function digestHours(kcal: number, fat_g: number): number {
  const base = kcal < 300 ? 2 : kcal <= 700 ? 3 : 4;
  return base + (fat_g >= 25 ? 0.5 : 0);
}

/** Local `day` at "HH:MM". */
export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d;
}

/** Tonight's bedtime: bed at/before wake (e.g. 00:30) means after midnight. */
export function bedtimeFor(now: Date, clock: DayClock): Date {
  const wake = atTime(now, clock.wake);
  let bed = atTime(now, clock.bed);
  if (bed.getTime() <= wake.getTime()) bed = new Date(bed.getTime() + 24 * H);
  return bed;
}

export type Fuel = { until: Date; left: number; lastMeal: TimingMeal };
/** The most recent meal's remaining fuel. null when nothing logged. */
export function fuelledUntil(meals: TimingMeal[], now: Date): Fuel | null {
  if (meals.length === 0) return null;
  const last = meals.reduce((a, b) => (b.logged_at > a.logged_at ? b : a));
  const start = new Date(last.logged_at).getTime();
  const span = digestHours(Number(last.calories), Number(last.fat_g)) * H;
  const until = new Date(start + span);
  const left = Math.max(0, Math.min(1, (until.getTime() - now.getTime()) / span));
  return { until, left, lastMeal: last };
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** When you usually train: median start on this weekday (≥2 in 8 weeks), else overall (≥3). Today's date at that time. */
export function usualTrainingStart(workouts: TimingWorkout[], now: Date): Date | null {
  const since = now.getTime() - 56 * 24 * H;
  const recent = workouts.map((w) => new Date(w.started_at)).filter((d) => d.getTime() >= since && d.getTime() < now.getTime() + 24 * H);
  const sameDay = recent.filter((d) => d.getDay() === now.getDay()).map(minuteOfDay);
  const pool = sameDay.length >= 2 ? sameDay : recent.length >= 3 ? recent.map(minuteOfDay) : [];
  if (pool.length === 0) return null;
  const m = Math.round(median(pool));
  const d = new Date(now); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d;
}

/** Feedings (meals within 60 min merge) with ≥25 g protein, at least 2.5 h after the previous hit. */
export function proteinHits(meals: TimingMeal[]): number {
  const sorted = [...meals].sort((a, b) => (a.logged_at < b.logged_at ? -1 : 1));
  const feedings: { at: number; protein: number }[] = [];
  for (const m of sorted) {
    const t = new Date(m.logged_at).getTime(), p = Number(m.protein_g);
    const last = feedings[feedings.length - 1];
    if (last && t - last.at <= FEEDING_MERGE_MIN * 60_000) last.protein += p;
    else feedings.push({ at: t, protein: p });
  }
  let hits = 0, lastHit = -Infinity;
  for (const f of feedings) {
    if (f.protein >= PROTEIN_HIT_G && f.at - lastHit >= HIT_GAP_HOURS * H) { hits++; lastHit = f.at; }
  }
  return hits;
}

/** A heavy meal (≥600 kcal) logged within 2.5 h before tonight's bedtime, or after it. Most recent wins. */
export function lateHeavyMeal(meals: TimingMeal[], now: Date, clock: DayClock): { meal: TimingMeal; hoursBeforeBed: number } | null {
  const bed = bedtimeFor(now, clock).getTime();
  const cands = meals
    .filter((m) => Number(m.calories) >= LATE_MEAL_KCAL)
    .map((m) => ({ meal: m, hoursBeforeBed: (bed - new Date(m.logged_at).getTime()) / H }))
    .filter((x) => x.hoursBeforeBed <= LATE_MEAL_HOURS && x.hoursBeforeBed > -12)
    .sort((a, b) => a.hoursBeforeBed - b.hoursBeforeBed);
  return cands[0] ?? null;
}

export type PlanKind = "done" | "post" | "pre" | "fuelled" | "closed" | "eat";
export type Plan = {
  kind: PlanKind; start: Date; end: Date;
  kcal: number; protein_g: number; mealsLeft: number;
  cutoff: Date; bed: Date; training: Date | null; fuel: Fuel | null;
};

export function planNextMeal(a: {
  meals: TimingMeal[]; todayWorkout: TimingWorkout | null; usualTraining: Date | null;
  totals: { calories: number; protein_g: number }; targets: { kcal: number; protein_g: number };
  weight_lb: number; now: Date; clock: DayClock;
}): Plan {
  const { now } = a;
  const bed = bedtimeFor(now, a.clock);
  const cutoff = new Date(bed.getTime() - LATE_MEAL_HOURS * H);
  const fuel = fuelledUntil(a.meals, now);
  const fuelAt = fuel && fuel.until.getTime() > now.getTime() ? fuel.until : now;
  const remainingKcal = a.targets.kcal - a.totals.calories;
  const remainingP = a.targets.protein_g - a.totals.protein_g;
  const training = a.todayWorkout ? new Date(a.todayWorkout.started_at) : a.usualTraining;
  const perMealP = Math.max(PROTEIN_HIT_G, Math.round(PROTEIN_PER_LB * a.weight_lb));

  const build = (kind: PlanKind, start: Date, end: Date, minP = 0): Plan => {
    const mealsLeft = Math.max(1, Math.ceil((cutoff.getTime() - start.getTime()) / (MEAL_SPACING_HOURS * H)));
    const kcal = Math.max(0, r10(remainingKcal / mealsLeft));
    const protein_g = Math.max(0, Math.min(Math.round(remainingP), Math.max(perMealP, minP)));
    return { kind, start, end, kcal, protein_g, mealsLeft, cutoff, bed, training, fuel };
  };

  if (remainingKcal <= 0) return build("done", now, now);

  // Post-workout: finished ≤ 2 h ago and nothing logged since.
  if (a.todayWorkout?.ended_at) {
    const end = new Date(a.todayWorkout.ended_at).getTime();
    const since = now.getTime() - end;
    const ateAfter = a.meals.some((m) => new Date(m.logged_at).getTime() > end);
    if (since >= 0 && since <= 2 * H && !ateAfter) return build("post", now, new Date(end + 2 * H), 30);
  }

  if (now.getTime() >= cutoff.getTime()) return build("closed", now, new Date(bed.getTime() - LIGHT_CUTOFF_HOURS * H));

  // Pre-workout: training later today, and the tank empties before training − 1 h.
  const trainingLater = training && !a.todayWorkout?.ended_at && !(a.todayWorkout && !a.todayWorkout.ended_at)
    && training.getTime() > now.getTime() + H;
  if (trainingLater) {
    const preEnd = new Date(training!.getTime() - H), preStart = new Date(training!.getTime() - 3 * H);
    if (fuelAt.getTime() <= preEnd.getTime()) {
      const start = new Date(Math.max(now.getTime(), preStart.getTime(), fuelAt.getTime() - 0.5 * H));
      return build("pre", start, preEnd);
    }
    // Fuelled through training: next window opens after the session.
    return build("fuelled", new Date(training!.getTime() + 1.5 * H), new Date(Math.min(training!.getTime() + 3 * H, cutoff.getTime())));
  }

  const start = new Date(Math.max(now.getTime(), fuelAt.getTime() - 0.5 * H));
  const end = new Date(Math.min(fuelAt.getTime() + H, cutoff.getTime()));
  if (start.getTime() >= cutoff.getTime()) return build("closed", now, new Date(bed.getTime() - LIGHT_CUTOFF_HOURS * H));
  return build(fuel && fuel.until.getTime() > now.getTime() + 0.5 * H ? "fuelled" : "eat", start, end);
}

const fmtT = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").toLowerCase().replace(" ", "");
const hrs = (ms: number) => { const h = ms / H; return h >= 1 ? `${Math.round(h * 2) / 2} h` : `${Math.round(h * 60)} min`; };

/** One context line for the HUB. */
export function planLine(p: Plan, now: Date): string {
  const macros = `~${p.kcal} kcal · ${p.protein_g} P`;
  switch (p.kind) {
    case "done": return "Target hit for today.";
    case "post": return `Post-workout: eat by ${fmtT(p.end)} · ${p.protein_g} P.`;
    case "pre": return `Pre-workout meal ${fmtT(p.start)}–${fmtT(p.end)} · ${macros} · carbs up.`;
    case "fuelled": return p.training && p.start.getTime() > p.training.getTime()
      ? `Fuelled through training. Next meal after, ~${fmtT(p.start)} · ${macros}.`
      : `Fuelled till ~${fmtT(p.fuel?.until ?? p.start)}. Next meal ${fmtT(p.start)}–${fmtT(p.end)} · ${macros}.`;
    case "closed": return `Eating window closed for sleep (bed ${fmtT(p.bed)}).${p.kcal > 0 ? ` Light snack fine till ${fmtT(p.end)}.` : ""}`;
    case "eat": {
      const gap = p.fuel ? now.getTime() - new Date(p.fuel.lastMeal.logged_at).getTime() : 0;
      const since = p.fuel ? `${hrs(gap)} since your last meal. ` : "";
      return `${since}Eat by ${fmtT(p.end)} · ${macros}.`;
    }
  }
}
