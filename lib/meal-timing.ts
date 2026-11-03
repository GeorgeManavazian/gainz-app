/** Meal timing: a coarse fuel model + next-meal window from meals, training and sleep. Pure, local time. */
export type TimingMeal = { logged_at: string; calories: number; protein_g: number; fat_g: number };
export type TimingWorkout = { started_at: string; ended_at: string | null };
export type DayClock = { wake: string; bed: string }; // "HH:MM"
/** One sitting: food rows logged within 60 min of the first row, summed. `at` = first row's time. */
export type Feeding = { at: string; calories: number; protein_g: number; fat_g: number; rows: number };

export const LATE_MEAL_KCAL = 600;
export const LATE_MEAL_HOURS = 3;        // last big meal: ≥ 3 h before bed (sleep onset, reflux, core temp)
export const LIGHT_CUTOFF_HOURS = 0.75;  // pre-bed protein snack must be done ≥ 45 min before bed
export const PREBED_WINDOW_HOURS = 1.25; // …and opens bed − 75 min
export const PREBED_KCAL = 300;
export const PREBED_PROTEIN_G = 35;      // casein / Greek yogurt / cottage cheese: overnight muscle, no sleep cost
export const PREBED_MIN_PROTEIN_G = 15;  // below this (protein or kcal room) the pre-bed snack isn't worth offering
export const PRE_CARBS_PER_LB = 0.45;    // ≈ 1 g/kg pre-workout carbs
export const PRE_FAT_MAX_G = 15;         // pre-workout meal: low fat so it clears the stomach
export const PRE_SNACK_CARBS = 40;       // < 1 h out: fast carbs, no fat
export const TRAINING_DAY_CARB_SHARE = 0.6; // training day: 60 % of the day's carbs around the session
export const PROTEIN_HIT_G = 25;
export const HIT_GAP_HOURS = 2.5;
export const FEEDING_MERGE_MIN = 60;
export const PROTEIN_HITS_TARGET = 4;
export const PROTEIN_PER_LB = 0.18;      // ≈ 0.4 g/kg per feeding
export const MEAL_SPACING_HOURS = 3.5;
export const PRE_WINDOW_HOURS = 3;       // pre-workout zone opens training − 3 h
export const PRE_SNACK_KCAL = 200;       // < 1 h before training: small carb snack only
export const POST_WINDOW_HOURS = 2;
export const POST_MEAL_DELAY_HOURS = 1.5; // main meal after training starts + 1.5 h
export const MIN_PRE_WINDOW_MIN = 45;    // a shorter pre-meal window becomes the snack
export const LIGHT_MEAL_KCAL = 300;      // after-training meal past the heavy-meal cutoff
export const SLOT_HALF_WIDTH = 30;       // a usual meal slot's window: usual time ± 30 min
export const SLOT_EATEN_MIN = 90;        // a feeding within ± 90 min of a slot counts as that slot eaten
export const PATTERN_MIN_DAYS_NEEDED = 10; // mirrors lib/meal-slots PATTERN_MIN_DAYS for the learning copy

const H = 3_600_000;
const DAY = 24 * H;
const r10 = (n: number) => Math.round(n / 10) * 10;

/** Hours a feeding keeps you fuelled: coarse buckets by size, a little longer when fatty. */
export function digestHours(kcal: number, fat_g: number): number {
  const base = kcal < 300 ? 2 : kcal <= 700 ? 3 : 4;
  return base + (fat_g >= 25 ? 0.5 : 0);
}

/** Local `day` at "HH:MM". */
export function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d;
}

/** Tonight's bedtime. Bed at/before wake (e.g. 00:30) means after midnight — unless it is already after
 *  midnight and before wake, then tonight's bed is today's date. */
export function bedtimeFor(now: Date, clock: DayClock): Date {
  const wake = atTime(now, clock.wake);
  const bed = atTime(now, clock.bed);
  if (bed.getTime() > wake.getTime()) return bed;
  return now.getTime() < wake.getTime() ? bed : new Date(bed.getTime() + DAY);
}

/** This waking day's start: today's wake, or yesterday's when you sleep after midnight and haven't slept yet. */
export function wakeFor(now: Date, clock: DayClock): Date {
  const wake = atTime(now, clock.wake);
  const lateSleeper = atTime(now, clock.bed).getTime() <= wake.getTime();
  return lateSleeper && now.getTime() < wake.getTime() ? new Date(wake.getTime() - DAY) : wake;
}

/** Group food rows into feedings: rows within 60 min of a feeding's first row merge (sums). Sorted by time. */
export function feedings(meals: TimingMeal[]): Feeding[] {
  const sorted = [...meals].sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime());
  const out: Feeding[] = [];
  for (const m of sorted) {
    const t = new Date(m.logged_at).getTime();
    const last = out[out.length - 1];
    if (last && t - new Date(last.at).getTime() <= FEEDING_MERGE_MIN * 60_000) {
      last.calories += Number(m.calories); last.protein_g += Number(m.protein_g); last.fat_g += Number(m.fat_g); last.rows++;
    } else {
      out.push({ at: m.logged_at, calories: Number(m.calories), protein_g: Number(m.protein_g), fat_g: Number(m.fat_g), rows: 1 });
    }
  }
  return out;
}

export type Fuel = { until: Date; left: number; lastMeal: Feeding; lastAt: Date };
/** Fuel runs until the latest finish across feedings (a snack can't shorten a big meal). `left` = fraction of that
 *  feeding's span remaining; `lastMeal` = that feeding; `lastAt` = when you last ate. null when nothing logged. */
export function fuelledUntil(meals: TimingMeal[], now: Date): Fuel | null {
  const fs = feedings(meals);
  if (fs.length === 0) return null;
  let best: { f: Feeding; until: number; span: number } | null = null;
  for (const f of fs) {
    const span = digestHours(f.calories, f.fat_g) * H;
    const until = new Date(f.at).getTime() + span;
    if (!best || until >= best.until) best = { f, until, span };
  }
  const left = Math.max(0, Math.min(1, (best!.until - now.getTime()) / best!.span));
  return { until: new Date(best!.until), left, lastMeal: best!.f, lastAt: new Date(fs[fs.length - 1].at) };
}

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** When you usually train today, or null (rest day / not enough data).
 *  Pool: same weekday over the last 8 weeks (≥ 2). With ≥ 4 weeks of history (any session older than 28 days), a weekday
 *  with 0–1 sessions is a rest day → null; with thinner history, fall back to all sessions (≥ 3).
 *  Time: the most common 30-min bucket (ties → the bucket trained in most recently), median inside it. */
export function usualTrainingStart(workouts: TimingWorkout[], now: Date): Date | null {
  const all = workouts.map((w) => new Date(w.started_at));
  const since = now.getTime() - 56 * DAY;
  const recent = all.filter((d) => d.getTime() >= since && d.getTime() < now.getTime() + DAY);
  const sameDay = recent.filter((d) => d.getDay() === now.getDay());
  const longHistory = all.some((d) => d.getTime() < now.getTime() - 28 * DAY);
  const pool = sameDay.length >= 2 ? sameDay : !longHistory && recent.length >= 3 ? recent : [];
  if (pool.length === 0) return null;
  const buckets = new Map<number, Date[]>();
  for (const d of pool) { const b = Math.floor(minuteOfDay(d) / 30); buckets.set(b, [...(buckets.get(b) ?? []), d]); }
  const latest = (ds: Date[]) => Math.max(...ds.map((d) => d.getTime()));
  const win = [...buckets.values()].reduce((a, b) => (b.length > a.length || (b.length === a.length && latest(b) > latest(a)) ? b : a));
  const m = Math.round(median(win.map(minuteOfDay)));
  const d = new Date(now); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d;
}

/** Feedings with ≥25 g protein, at least 2.5 h after the previous hit. */
export function proteinHits(meals: TimingMeal[]): number {
  let hits = 0, lastHit = -Infinity;
  for (const f of feedings(meals)) {
    const at = new Date(f.at).getTime();
    if (f.protein_g >= PROTEIN_HIT_G && at - lastHit >= HIT_GAP_HOURS * H) { hits++; lastHit = at; }
  }
  return hits;
}

/** A heavy feeding (≥600 kcal) within 3 h before tonight's bedtime, or after it. Most recent wins. */
export function lateHeavyMeal(meals: TimingMeal[], now: Date, clock: DayClock): { meal: Feeding; hoursBeforeBed: number } | null {
  const bed = bedtimeFor(now, clock).getTime();
  const cands = feedings(meals)
    .filter((f) => f.calories >= LATE_MEAL_KCAL)
    .map((f) => ({ meal: f, hoursBeforeBed: (bed - new Date(f.at).getTime()) / H }))
    .filter((x) => x.hoursBeforeBed <= LATE_MEAL_HOURS && x.hoursBeforeBed > -12)
    .sort((a, b) => a.hoursBeforeBed - b.hoursBeforeBed);
  return cands[0] ?? null;
}

export type PlanKind = "done" | "learning" | "training" | "post" | "pre" | "fuelled" | "fuelled-through" | "prebed" | "closed" | "eat";
/** Learned eating pattern (lib/meal-slots). Not ready → the planner only reports progress. */
export type PatternLike = { ready: boolean; daysWithMeals: number; windowDays: number; slots: { minute: number }[]; scope?: "weekday" | "all" };
export type Plan = {
  kind: PlanKind; start: Date; end: Date;
  kcal: number; protein_g: number; mealsLeft: number;
  /** What to put in this window. `carbs_g` is a target, `fat_max_g` a ceiling (null = no guidance). */
  carbs_g: number | null; fat_max_g: number | null;
  /** This is the day's last big meal. */
  isDinner: boolean;
  cutoff: Date; bed: Date; training: Date | null; fuel: Fuel | null;
  /** `pre`: too close to training for a meal, small carb snack only. */
  snack: boolean;
  /** `fuelled-through` / `post`: the after-training meal lands past the heavy-meal cutoff → light meal (≤300 kcal). */
  light: boolean;
  /** Window comes from a learned usual meal slot rather than the fuel model. */
  usual: boolean;
  /** The slot pattern is this weekday's own. */
  weekdayScoped: boolean;
  /** `learning`: eating days seen so far / needed. */
  progress: { days: number; of: number } | null;
  /** Past the day's last usual slot (copy says so). */
  pastUsual: boolean;
};

/** Priority: done → training (active workout) → post (light past the cutoff) → closed (before wake) → past the cutoff with
 *  no session ahead: prebed / done / closed → pre (training − 3 h … start; snack only past the cutoff) → fuelled-through
 *  → usual slot / fuelled / eat. */
export function planNextMeal(a: {
  meals: TimingMeal[]; todayWorkout: TimingWorkout | null; usualTraining: Date | null;
  totals: { calories: number; protein_g: number; carbs_g?: number; fat_g?: number };
  targets: { kcal: number; protein_g: number; carbs_g?: number; fat_g?: number };
  weight_lb: number; now: Date; clock: DayClock;
  /** When given, windows follow the person's usual slots; when not ready yet, the plan is `learning`. */
  pattern?: PatternLike;
}): Plan {
  const { now } = a;
  const t = now.getTime();
  const bed = bedtimeFor(now, a.clock);
  const cutoff = new Date(bed.getTime() - LATE_MEAL_HOURS * H);
  const lightEnd = new Date(bed.getTime() - LIGHT_CUTOFF_HOURS * H);
  const fuel = fuelledUntil(a.meals, now);
  const fuelAt = fuel && fuel.until.getTime() > t ? fuel.until.getTime() : t;
  const remainingKcal = a.targets.kcal - a.totals.calories;
  const remainingP = a.targets.protein_g - a.totals.protein_g;
  const remainingC = a.targets.carbs_g !== undefined ? a.targets.carbs_g - (a.totals.carbs_g ?? 0) : null;
  const remainingF = a.targets.fat_g !== undefined ? a.targets.fat_g - (a.totals.fat_g ?? 0) : null;
  const prebedStart = new Date(bed.getTime() - PREBED_WINDOW_HOURS * H);
  const training = a.todayWorkout ? new Date(a.todayWorkout.started_at) : a.usualTraining;
  const perMealP = Math.max(PROTEIN_HIT_G, Math.round(PROTEIN_PER_LB * a.weight_lb));
  const trainingAhead = !!training && !a.todayWorkout && training.getTime() > t;
  // Carbs per session window (pre / post): ≈ 1 g/kg, or half of the day's 60 % training share, whichever is more.
  const sessionCarbs = Math.max(Math.round(PRE_CARBS_PER_LB * a.weight_lb),
    training ? Math.round(TRAINING_DAY_CARB_SHARE * (a.targets.carbs_g ?? 0) / 2) : 0);
  // Session windows still ahead today: the pre window (unless a feeding already landed in it) + the after-training meal.
  const preEaten = trainingAhead && feedings(a.meals).some((f) => {
    const ft = new Date(f.at).getTime(); return ft >= training!.getTime() - PRE_WINDOW_HOURS * H && ft <= training!.getTime();
  });
  const sessionWindows = trainingAhead ? (preEaten ? 0 : 1) + 1 : 0;

  const slotAt = (m: number) => { const d = new Date(now); d.setHours(0, m, 0, 0); return d.getTime(); };
  // Each feeding today claims its nearest slot (within 90 min); claimed slots are "eaten".
  const eaten = new Set<number>();
  if (a.pattern?.ready) for (const f of feedings(a.meals)) {
    const ft = new Date(f.at).getTime();
    let best: { m: number; d: number } | null = null;
    for (const sl of a.pattern.slots) { const d = Math.abs(ft - slotAt(sl.minute)); if (!best || d < best.d) best = { m: sl.minute, d }; }
    if (best && best.d <= SLOT_EATEN_MIN * 60_000) eaten.add(best.m);
  }
  const openSlots = a.pattern?.ready ? a.pattern.slots.filter((sl) => !eaten.has(sl.minute)) : [];
  const slotsLeft = (from: number) =>
    openSlots.filter((sl) => slotAt(sl.minute + SLOT_HALF_WIDTH) >= from && slotAt(sl.minute - SLOT_HALF_WIDTH) < cutoff.getTime()).length;
  let pastUsual = false;
  const build = (kind: PlanKind, start: Date | number, end: Date | number, minP = 0, snack = false, light = false, usual = false): Plan => {
    const s = new Date(start), e = new Date(end);
    const mealsLeft = Math.max(1, usual ? slotsLeft(s.getTime()) : Math.ceil((cutoff.getTime() - s.getTime()) / (MEAL_SPACING_HOURS * H)));
    let kcal = Math.max(0, r10(remainingKcal / mealsLeft));
    let protein_g = Math.max(0, Math.min(Math.round(remainingP), Math.max(perMealP, minP)));
    if (snack) { kcal = Math.min(PRE_SNACK_KCAL, kcal); protein_g = 0; }
    if (light) kcal = Math.min(LIGHT_MEAL_KCAL, kcal);
    // Composition: carbs land around the session, fat stays out of it; the rest spreads flat.
    let carbs_g: number | null = null, fat_max_g: number | null = null;
    // The after-training meal (`fuelled-through`) is the post window of a session that hasn't started yet.
    const aroundSession = kind === "pre" || kind === "post" || kind === "training" || kind === "fuelled-through";
    if (snack) { carbs_g = PRE_SNACK_CARBS; fat_max_g = 0; }
    else if (kind === "prebed") { carbs_g = null; fat_max_g = null; }
    else if (remainingC !== null && kind !== "done" && kind !== "learning" && kind !== "closed") {
      const left = Math.max(0, remainingC);
      if (aroundSession) {
        carbs_g = Math.min(left, sessionCarbs);
        fat_max_g = kind === "pre" ? (remainingF !== null ? Math.max(0, Math.min(PRE_FAT_MAX_G, Math.round(remainingF))) : PRE_FAT_MAX_G) : null;
      } else {
        // Training ahead: the session windows' carbs are set aside first; the rest spreads over the other windows.
        const pool = Math.max(0, left - sessionCarbs * sessionWindows);
        carbs_g = Math.round(pool / Math.max(1, mealsLeft - sessionWindows) / 5) * 5;
      }
    }
    // Light meal: protein first, carbs only as far as the kcal cap allows.
    if (light && carbs_g !== null) carbs_g = Math.min(carbs_g, Math.max(0, Math.floor((kcal - 4 * protein_g) / 4 / 5) * 5));
    // Pre-workout meal: kcal can't exceed what its composition holds (protein + carbs + the fat ceiling).
    if (kind === "pre" && !snack && carbs_g !== null) kcal = Math.min(kcal, r10(4 * (protein_g + carbs_g) + 9 * (fat_max_g ?? PRE_FAT_MAX_G)));
    // The last big meal of the day: the window that ends at the cutoff (or is the only one left). Never a pre-workout
    // meal, a snack or a light meal.
    const isDinner = kind !== "done" && kind !== "learning" && kind !== "closed" && kind !== "prebed" && kind !== "pre" && !snack && !light
      && (mealsLeft === 1 || e.getTime() >= cutoff.getTime() - 15 * 60_000);
    return { kind, start: s, end: e, kcal, protein_g, mealsLeft, carbs_g, fat_max_g, isDinner, cutoff, bed, training, fuel, snack, light, usual,
      weekdayScoped: usual && a.pattern?.scope === "weekday", pastUsual,
      progress: a.pattern && !a.pattern.ready ? { days: a.pattern.daysWithMeals, of: PATTERN_MIN_DAYS_NEEDED } : null };
  };

  if (remainingKcal <= 0) return build("done", now, now);

  // Training right now: no meal, just the post-workout dose.
  if (a.todayWorkout && !a.todayWorkout.ended_at) return build("training", now, now, 30);

  // Post-workout: finished ≤ 2 h ago, nothing logged since; window capped at bed − 1 h.
  if (a.todayWorkout?.ended_at) {
    const end = new Date(a.todayWorkout.ended_at).getTime();
    const ateAfter = a.meals.some((m) => new Date(m.logged_at).getTime() > end);
    const postEnd = Math.min(end + POST_WINDOW_HOURS * H, lightEnd.getTime());
    // Recovery beats the sleep rule, but past the heavy-meal cutoff the post meal is a light one.
    if (t >= end && t - end <= POST_WINDOW_HOURS * H && !ateAfter && postEnd > t) return build("post", now, postEnd, 30, false, t >= cutoff.getTime());
  }

  // Predictable beats clever: until the pattern is learned, only the training prompts above show; no next-meal guesses.
  if (a.pattern && !a.pattern.ready) return build("learning", now, now);

  // Asleep (before wake on a normal schedule) or past the heavy-meal cutoff.
  const wake = atTime(now, a.clock.wake);
  const normalSchedule = atTime(now, a.clock.bed).getTime() > wake.getTime();
  if (normalSchedule && t < wake.getTime()) return build("closed", wake, wake);
  // Past the heavy-meal cutoff: between it and bed − 45 min a small protein snack (casein/yogurt), only if it fits —
  // ≥ 15 g protein still wanted and the kcal left can hold it. Else done (kcal all but gone) or closed.
  const late = (): Plan => {
    const kcal = Math.min(PREBED_KCAL, Math.max(0, r10(remainingKcal)));
    const protein = Math.min(PREBED_PROTEIN_G, Math.round(remainingP), Math.floor(kcal / 4));
    if (t < lightEnd.getTime() && protein >= PREBED_MIN_PROTEIN_G) {
      return { ...build("prebed", Math.max(t, prebedStart.getTime()), lightEnd), kcal, protein_g: protein };
    }
    return kcal < 4 * PREBED_MIN_PROTEIN_G ? build("done", now, now) : build("closed", now, lightEnd);
  };
  // A session still ahead tonight keeps the training rules (fast carbs / after-training meal) past the cutoff,
  // up to bed − 45 min; after that nothing is offered.
  if (t >= cutoff.getTime() && (!trainingAhead || t >= lightEnd.getTime())) return late();

  // Training later today (not started, not done).
  if (trainingAhead) {
    const tr = training!.getTime();
    const pastCutoff = t >= cutoff.getTime();
    const preStart = tr - PRE_WINDOW_HOURS * H, preEnd = tr - H;
    const after = tr + POST_MEAL_DELAY_HOURS * H;
    // After-training meal: past bed − 1 h → closed; past the heavy cutoff → light meal; else a normal window.
    const through = () => after >= lightEnd.getTime() ? build("closed", now, lightEnd)
      : after >= cutoff.getTime() ? build("fuelled-through", after, Math.max(after, Math.min(tr + 3 * H, lightEnd.getTime())), 0, false, true)
      : build("fuelled-through", after, Math.max(after, Math.min(tr + 3 * H, cutoff.getTime())));
    if (t >= preEnd) {
      // < 1 h out: small carb snack if the tank is (nearly) empty, else you're fuelled through.
      return fuelAt <= t + 0.5 * H ? build("pre", now, tr, 0, true) : through();
    }
    if (fuelAt > preEnd) return through();
    // Pre-meal only when the normal window would open inside the pre zone (or we're already in it).
    const start = Math.max(t, fuelAt - 0.5 * H);
    if (start >= preStart) {
      // A window under 45 min can't hold a real meal: snack instead.
      // Past the heavy-meal cutoff only the snack is offered.
      return pastCutoff || preEnd - start < MIN_PRE_WINDOW_MIN * 60_000 ? build("pre", start, tr, 0, true) : build("pre", start, preEnd);
    }
    if (pastCutoff) return late();
  }

  // Usual slot in progress or next up today → that's the window; the fuel model is only the fallback.
  if (a.pattern?.ready) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const slot = openSlots.find((sl) => sl.minute + SLOT_HALF_WIDTH >= nowMin);
    if (slot) {
      // Today adapts: a late previous meal pushes the slot back until the tank is nearly empty.
      const slotStart = slotAt(slot.minute - SLOT_HALF_WIDTH), slotEnd = slotAt(slot.minute + SLOT_HALF_WIDTH);
      const start = Math.max(t, slotStart, fuelAt - 0.5 * H);
      const end = Math.min(start < slotEnd ? slotEnd : start + H, cutoff.getTime());
      if (start >= cutoff.getTime()) return build("closed", now, lightEnd);
      return build(start > t ? "fuelled" : "eat", start, Math.max(start, end), 0, false, false, true);
    }
    // Past the day's usual slots: a little left is optional; a lot left falls back to the fuel model, labelled.
    pastUsual = true;
    if (remainingKcal < LIGHT_MEAL_KCAL) return build("done", now, now);
  }

  const start = Math.max(t, fuelAt - 0.5 * H);
  const end = Math.min(fuelAt + H, cutoff.getTime());
  if (start >= cutoff.getTime()) return build("closed", now, lightEnd);
  return build(fuel && fuel.until.getTime() > t + 0.5 * H ? "fuelled" : "eat", start, end);
}

const fmtT = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").toLowerCase().replace(" ", "");
const hrs = (ms: number) => { const h = ms / H; return h >= 1 ? `${Math.round(h * 2) / 2} h` : `${Math.round(h * 60)} min`; };

/** One context line for the HUB. */
export function planLine(p: Plan, now: Date): string {
  const P = p.protein_g > 0 ? ` · ${p.protein_g} P` : "";
  const macros = `~${p.kcal} kcal${P}`;
  const C = p.carbs_g ? ` · ~${p.carbs_g} C` : "";
  switch (p.kind) {
    case "done": return p.pastUsual && p.kcal > 0 ? `Past your usual meals · ~${p.kcal} kcal left, optional.` : "Target hit for today.";
    case "learning": return `Learning your usual meal times · ${p.progress?.days ?? 0} of ${p.progress?.of ?? 10} eating days logged (2+ meals a day).`;
    case "training": return `Training now. Eat within 2 h after · ~${p.kcal} kcal${p.protein_g > 0 ? ` · ≥${p.protein_g} P` : ""}.`;
    case "post": return `Post-workout: eat by ${fmtT(p.end)}${p.light ? ` · light: protein + some carbs · ≤${p.kcal} kcal` : ""}${P}${C}${p.isDinner ? " · this is dinner" : ""}.`;
    case "prebed": {
      const when = p.start.getTime() > now.getTime() ? `${fmtT(p.start)}–${fmtT(p.end)}` : `by ${fmtT(p.end)}`;
      return `Pre-bed snack ${when}: ${p.protein_g} g protein, ≤${p.kcal} kcal (yogurt, cottage cheese, casein).`;
    }
    case "pre": {
      if (p.snack) {
        const t = p.training ?? p.end;
        return `Training at ${fmtT(t)}. Fast carbs ${p.start.getTime() > now.getTime() ? `~${fmtT(p.start)}` : "now"} (~${PRE_SNACK_CARBS} g, no fat), main meal after ~${fmtT(new Date(t.getTime() + POST_MEAL_DELAY_HOURS * H))}.`;
      }
      const fat = p.fat_max_g === 0 ? "no fat" : `fat under ${p.fat_max_g ?? PRE_FAT_MAX_G} g`;
      return `Pre-workout meal ${fmtT(p.start)}–${fmtT(p.end)} · ${macros}${C} · ${fat}.`;
    }
    case "fuelled-through": if (p.light) return `Light meal after training, ~${fmtT(p.start)} · ≤${p.kcal} kcal${P}${C}.`;
      return `Fuelled through training. Next meal after, ~${fmtT(p.start)} · ${macros}${C}.`;
    case "fuelled": {
      if (p.usual) {
        const on = p.weekdayScoped ? ` on ${now.toLocaleDateString("en-US", { weekday: "long" })}s` : "";
        return `Next meal usually ~${fmtT(new Date((p.start.getTime() + p.end.getTime()) / 2))}${on} (${fmtT(p.start)}–${fmtT(p.end)}) · ${macros}${C}.`;
      }
      return `Fuelled till ~${fmtT(p.fuel?.until ?? p.start)}. Next meal ${fmtT(p.start)}–${fmtT(p.end)} · ${macros}${C}.`;
    }
    case "closed":
      if (p.start.getTime() > now.getTime()) return `Sleep time. Eating window opens at ${fmtT(p.start)}.`;
      return `Eating window closed for sleep (bed ${fmtT(p.bed)}).${p.kcal > 0 && now.getTime() < p.end.getTime() ? ` Light snack fine till ${fmtT(p.end)}.` : ""}`;
    case "eat": {
      if (p.usual) return `Usual meal time · eat by ${fmtT(p.end)} · ${macros}${C}${p.isDinner ? " · last big meal" : ""}.`;
      const gap = p.fuel ? now.getTime() - p.fuel.lastAt.getTime() : 0;
      const since = p.pastUsual ? "Past your usual meal times · " : p.fuel ? `${hrs(gap)} since your last meal. ` : "";
      return `${since}Eat by ${fmtT(p.end)} · ${macros}${C}${p.isDinner ? " · last big meal" : ""}.`;
    }
  }
}
