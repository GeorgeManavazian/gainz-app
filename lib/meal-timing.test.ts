import { describe, it, expect } from "vitest";
import { digestHours, bedtimeFor, wakeFor, feedings, fuelledUntil, usualTrainingStart, proteinHits, lateHeavyMeal, planNextMeal, planLine, type TimingMeal } from "./meal-timing";
import { computeTargets } from "./targets";

const day = (h: number, m = 0, offsetDays = 0) => { const d = new Date(2026, 10, 2, h, m, 0, 0); d.setDate(d.getDate() + offsetDays); return d; }; // Mon 2 Nov 2026
const iso = (h: number, m = 0, off = 0) => day(h, m, off).toISOString();
const meal = (h: number, m: number, calories: number, protein_g = 30, fat_g = 10): TimingMeal => ({ logged_at: iso(h, m), calories, protein_g, fat_g });
const clock = { wake: "07:00", bed: "23:00" };
const targets = { kcal: 2200, protein_g: 180 };

describe("digestHours", () => {
  it("buckets by size and adds half an hour for fatty meals", () => {
    expect(digestHours(250, 5)).toBe(2); expect(digestHours(500, 10)).toBe(3); expect(digestHours(900, 10)).toBe(4); expect(digestHours(500, 30)).toBe(3.5);
  });
});

describe("bedtimeFor", () => {
  it("bed after wake is tonight; bed at/before wake is after midnight", () => {
    expect(bedtimeFor(day(14), clock).getDate()).toBe(2);
    expect(bedtimeFor(day(14), { wake: "07:00", bed: "00:30" }).getDate()).toBe(3);
  });
  it("after midnight but before wake, tonight's late bed is today's date", () => {
    const b = bedtimeFor(day(0, 15), { wake: "07:00", bed: "00:30" });
    expect(b.getDate()).toBe(2); expect(b.getHours()).toBe(0); expect(b.getMinutes()).toBe(30);
    expect(wakeFor(day(0, 15), { wake: "07:00", bed: "00:30" }).getDate()).toBe(1);
    expect(wakeFor(day(5), clock).getDate()).toBe(2);
  });
});

// One dinner logged as three food rows milliseconds apart: 450 + 350 + 120 = 920 kcal, 30 g fat.
const at = (h: number, m: number, ms: number) => new Date(day(h, m).getTime() + ms).toISOString();
const dinner: TimingMeal[] = [
  { logged_at: at(21, 0, 0), calories: 450, protein_g: 30, fat_g: 10 },
  { logged_at: at(21, 0, 3), calories: 350, protein_g: 10, fat_g: 15 },
  { logged_at: at(21, 0, 7), calories: 120, protein_g: 2, fat_g: 5 },
];

describe("feedings", () => {
  it("merges rows within 60 min of the feeding's first row, summing macros", () => {
    const f = feedings([...dinner, meal(8, 0, 300, 20), meal(8, 50, 100, 10), meal(9, 10, 100, 5)]);
    expect(f.map((x) => x.rows)).toEqual([2, 1, 3]); // 8:00+8:50 | 9:10 (70 min after 8:00) | dinner
    expect(f[0]).toMatchObject({ at: iso(8, 0), calories: 400, protein_g: 30 });
    expect(f[2]).toMatchObject({ at: dinner[0].logged_at, calories: 920, protein_g: 42, fat_g: 30 });
  });
  it("empty for nothing", () => expect(feedings([])).toEqual([]));
});

describe("fuelledUntil", () => {
  it("judges a multi-row dinner as one 920 kcal fatty feeding (4.5 h)", () => {
    const f = fuelledUntil(dinner, day(21, 30))!;
    expect((f.until.getTime() - day(21).getTime()) / 3_600_000).toBe(4.5);
    expect(f.lastMeal.calories).toBe(920);
  });
  it("a snack after a big meal never shortens the fuel", () => {
    const base = fuelledUntil(dinner, day(22, 45))!.until.getTime();
    expect(fuelledUntil([...dinner, meal(21, 30, 150, 5, 2)], day(22, 45))!.until.getTime()).toBeGreaterThanOrEqual(base); // merges
    const f = fuelledUntil([...dinner, meal(22, 30, 150, 5, 2)], day(22, 45))!; // its own feeding, ends 00:30 < 01:30
    expect(f.until.getTime()).toBe(base);
    expect(f.lastMeal.calories).toBe(920);
    expect(f.lastAt.getTime()).toBe(day(22, 30).getTime());
  });
  it("uses the most recent meal and a linear drain", () => {
    const f = fuelledUntil([meal(8, 0, 400), meal(12, 0, 600)], day(13, 30))!;
    expect(f.until.getHours()).toBe(15);
    expect(f.left).toBeCloseTo(0.5, 2);
  });
  it("null with no meals; 0 left once digested", () => {
    expect(fuelledUntil([], day(12))).toBeNull();
    expect(fuelledUntil([meal(8, 0, 400)], day(12))!.left).toBe(0);
  });
});

describe("usualTrainingStart", () => {
  const ws = (...xs: [number, number, number][]) => xs.map(([h, m, off]) => ({ started_at: iso(h, m, off), ended_at: null }));
  it("same weekday: most common 30-min bucket, median inside it", () => {
    const t = usualTrainingStart(ws([17, 0, -7], [17, 20, -14], [17, 40, -21], [6, 0, -1]), day(10))!;
    expect(t.getHours()).toBe(17); expect(t.getMinutes()).toBe(10);
  });
  it("6am and 6pm sessions don't average to noon: the mode wins", () => {
    const t = usualTrainingStart(ws([6, 0, -7], [6, 10, -14], [18, 0, -21]), day(10))!;
    expect(t.getHours()).toBe(6); expect(t.getMinutes()).toBe(5);
  });
  it("thin history (< 4 weeks): falls back to all sessions with ≥3, null otherwise", () => {
    const w = ws([17, 0, -1], [17, 10, -2], [6, 0, -3]);
    const t = usualTrainingStart(w, day(10))!;
    expect(t.getHours()).toBe(17); expect(t.getMinutes()).toBe(5);
    expect(usualTrainingStart(w.slice(0, 2), day(10))).toBeNull();
  });
  it("rest day: ≥ 4 weeks of Mon/Wed/Fri history → null on Tuesday, a time on Monday", () => {
    const w = ws(...[0, 1, 2, 3, 4, 5].flatMap((wk) => [[17, 0, -7 * wk - 7], [17, 0, -7 * wk - 5], [17, 0, -7 * wk - 3]] as [number, number, number][]));
    expect(usualTrainingStart(w, day(10, 0, 1))).toBeNull(); // Tue 3 Nov
    expect(usualTrainingStart(w, day(10))!.getHours()).toBe(17); // Mon
  });
});

describe("proteinHits", () => {
  it("counts ≥25 g feedings spaced ≥2.5 h; merges meals within an hour", () => {
    const meals = [meal(8, 0, 300, 15), meal(8, 30, 200, 15), meal(12, 0, 500, 40), meal(13, 0, 100, 30), meal(18, 0, 600, 45)];
    expect(proteinHits(meals)).toBe(3); // 8:00+8:30 merge → 30 ✓, 12:00 ✓, 13:00 too soon, 18:00 ✓
  });
  it("zero for nothing", () => expect(proteinHits([])).toBe(0));
});

describe("lateHeavyMeal", () => {
  it("flags ≥600 kcal within 2.5 h of bed, ignores earlier or small meals", () => {
    expect(lateHeavyMeal([meal(21, 15, 800)], day(21, 30), clock)!.hoursBeforeBed).toBeCloseTo(1.75, 2);
    expect(lateHeavyMeal([meal(19, 0, 800)], day(21, 30), clock)).toBeNull();
    expect(lateHeavyMeal([meal(22, 0, 250)], day(22, 10), clock)).toBeNull();
  });
  it("sums a multi-row dinner before judging it", () => {
    const l = lateHeavyMeal(dinner, day(21, 10), clock)!;
    expect(l.meal.calories).toBe(920); expect(l.hoursBeforeBed).toBeCloseTo(2, 2);
  });
});

describe("planNextMeal", () => {
  const base = { targets, weight_lb: 200, clock, usualTraining: null as Date | null, todayWorkout: null };
  it("done when the target is hit", () => {
    expect(planNextMeal({ ...base, meals: [], totals: { calories: 2300, protein_g: 190 }, now: day(14) }).kind).toBe("done");
  });
  it("post-workout window after a session with nothing eaten since", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(18, 15),
      todayWorkout: { started_at: iso(17), ended_at: iso(18) } });
    expect(p.kind).toBe("post"); expect(p.end.getHours()).toBe(20); expect(p.protein_g).toBeGreaterThanOrEqual(30);
  });
  it("pre-workout window when the tank empties before training − 1 h", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(14), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.end.getHours()).toBe(16);
    expect(p.start.getTime()).toBeGreaterThanOrEqual(day(14).getTime());
  });
  it("fuelled through training when a big meal lands close to the session", () => {
    const p = planNextMeal({ ...base, meals: [meal(15, 0, 900)], totals: { calories: 900, protein_g: 50 }, now: day(15, 30), usualTraining: day(17) });
    expect(p.kind).toBe("fuelled-through"); expect(p.start.getHours()).toBe(18);
    expect(planLine(p, day(15, 30))).toMatch(/^Fuelled through training/);
  });
  it("7 am, nothing eaten, training at 5pm → eat now, not a pre-workout meal", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0 }, now: day(7), usualTraining: day(17) });
    expect(p.kind).toBe("eat"); expect(p.start.getTime()).toBe(day(7).getTime());
  });
  it("pre-meal when the normal window would open inside training − 3 h", () => {
    const p = planNextMeal({ ...base, meals: [meal(10, 30, 900)], totals: { calories: 900, protein_g: 30 }, now: day(11), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.snack).toBe(false);
    expect(p.start.getHours()).toBe(14); expect(p.end.getHours()).toBe(16);
    expect(planLine(p, day(11))).toMatch(/^Pre-workout meal 2pm–4pm/);
  });
  it("< 1 h before training with an empty tank → small carb snack, not a window across the session", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(16, 30), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.snack).toBe(true);
    expect(p.kcal).toBeLessThanOrEqual(200); expect(p.end.getTime()).toBeLessThanOrEqual(day(17).getTime());
    expect(planLine(p, day(16, 30))).toBe("Training at 5pm. Fast carbs now (~40 g, no fat), main meal after ~6:30pm.");
  });
  it("pre window shorter than 45 min → snack, not a full meal (15:59 and 15:30, training 5pm)", () => {
    for (const now of [day(15, 59), day(15, 30)]) {
      const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now, usualTraining: day(17) });
      expect(p.kind).toBe("pre"); expect(p.snack).toBe(true); expect(p.kcal).toBeLessThanOrEqual(200);
      expect(planLine(p, now)).toBe("Training at 5pm. Fast carbs now (~40 g, no fat), main meal after ~6:30pm.");
    }
    // 45 min exactly is still a meal
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(15, 15), usualTraining: day(17) });
    expect(p.snack).toBe(false); expect(planLine(p, day(15, 15))).toMatch(/^Pre-workout meal 3:15pm–4pm/);
  });
  it("late training: after-training meal past the heavy cutoff → light meal ≤300 kcal", () => {
    const p = planNextMeal({ ...base, meals: [meal(18, 0, 900)], totals: { calories: 900, protein_g: 50 }, now: day(19, 30), usualTraining: day(20) });
    expect(p.kind).toBe("fuelled-through"); expect(p.light).toBe(true); expect(p.kcal).toBe(300);
    expect(p.end.getTime()).toBeLessThanOrEqual(day(22, 15).getTime());
    expect(planLine(p, day(19, 30))).toBe("Light meal after training, ~9:30pm · ≤300 kcal · 36 P.");
  });
  it("very late training: after-training meal past bed − 1 h → closed", () => {
    const p = planNextMeal({ ...base, meals: [meal(18, 0, 900)], totals: { calories: 900, protein_g: 50 }, now: day(22, 20), usualTraining: day(22, 40) });
    expect(p.kind).toBe("closed");
  });
  it("active workout → training, no meal window", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(17, 30),
      todayWorkout: { started_at: iso(17), ended_at: null } });
    expect(p.kind).toBe("training"); expect(p.end.getTime()).toBe(p.start.getTime());
    expect(planLine(p, day(17, 30))).toMatch(/^Training now\. Eat within 2 h after · ~\d+ kcal · ≥\d+ P\.$/);
  });
  it("usual training time already passed (skipped) → plain fuelled, not 'through training'", () => {
    const p = planNextMeal({ ...base, meals: [meal(15, 30, 600)], totals: { calories: 600, protein_g: 50 }, now: day(17), usualTraining: day(16) });
    expect(p.kind).toBe("fuelled"); expect(p.start.getHours()).toBe(18);
    expect(planLine(p, day(17))).toMatch(/^Fuelled till/);
  });
  it("post-workout window is capped at bed − 1 h", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40 }, now: day(21, 35),
      todayWorkout: { started_at: iso(20, 30), ended_at: iso(21, 30) } });
    expect(p.kind).toBe("post"); expect(p.end.getHours()).toBe(22); expect(p.end.getMinutes()).toBe(15);
  });
  it("before wake → closed for sleep, window opens at wake", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0 }, now: day(5) });
    expect(p.kind).toBe("closed"); expect(p.start.getHours()).toBe(7);
    expect(planLine(p, day(5))).toBe("Sleep time. Eating window opens at 7am.");
  });
  it("past bed − 1 h the light snack offer is dropped", () => {
    const p = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 1500, protein_g: 120 }, now: day(22, 15) });
    expect(p.kind).toBe("closed");
    expect(planLine(p, day(22, 15))).toBe("Eating window closed for sleep (bed 11pm).");
  });
  it("omits '· 0 P' once protein is hit", () => {
    const p = planNextMeal({ ...base, meals: [meal(8, 0, 400)], totals: { calories: 400, protein_g: 190 }, now: day(12) });
    expect(p.protein_g).toBe(0);
    expect(planLine(p, day(12))).toMatch(/· ~\d+ kcal\.$/);
  });
  it("after bed − 3 h: pre-bed protein snack until bed − 45 min, then closed", () => {
    const p = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 1500, protein_g: 120 }, now: day(20, 45) });
    expect(p.kind).toBe("prebed"); expect(p.end.getHours()).toBe(22); expect(p.end.getMinutes()).toBe(15);
    expect(p.protein_g).toBe(35); expect(p.kcal).toBeLessThanOrEqual(300);
    expect(planLine(p, day(20, 45))).toMatch(/^Pre-bed snack 9:45pm–10:15pm: 35 g protein/); // window not open yet
    const inside = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 1500, protein_g: 120 }, now: day(21, 50) });
    expect(planLine(inside, day(21, 50))).toMatch(/^Pre-bed snack by 10:15pm: 35 g protein/);
    const c = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 1500, protein_g: 120 }, now: day(22, 30) });
    expect(c.kind).toBe("closed"); expect(planLine(c, day(22, 30))).toMatch(/closed for sleep/);
  });
  it("pre-workout window prescribes carbs around 0.45 g/lb and a fat ceiling", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40, carbs_g: 60, fat_g: 20 },
      targets: { ...targets, carbs_g: 250, fat_g: 70 }, now: day(14), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.carbs_g).toBe(90); expect(p.fat_max_g).toBe(15);
    expect(planLine(p, day(14))).toMatch(/~90 C · fat under 15 g/);
  });
  it("the window that ends at the cutoff is marked as dinner", () => {
    const p = planNextMeal({ ...base, meals: [meal(16, 0, 500)], totals: { calories: 1600, protein_g: 130, carbs_g: 150 },
      targets: { ...targets, carbs_g: 250 }, now: day(19, 15) });
    expect(p.isDinner).toBe(true);
    expect(planLine(p, day(19, 15))).toMatch(/last big meal/);
  });
  it("eat when the tank is empty; macros split across meals left before the cutoff", () => {
    const p = planNextMeal({ ...base, meals: [meal(8, 0, 400)], totals: { calories: 400, protein_g: 30 }, now: day(12) });
    expect(p.kind).toBe("eat");
    expect(p.mealsLeft).toBe(3); // 12:00 → 20:00 cutoff = 8 h / 3.5 h → 3
    expect(p.kcal).toBe(600); expect(p.protein_g).toBe(36);
    expect(planLine(p, day(12))).toMatch(/4 h since your last meal/);
  });
  it("no meals yet → eat now", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0 }, now: day(9) });
    expect(p.kind).toBe("eat"); expect(p.start.getTime()).toBe(day(9).getTime());
  });
});

describe("planNextMeal with a learned pattern", () => {
  const base = { targets, weight_lb: 200, clock, usualTraining: null as Date | null, todayWorkout: null };
  const slots = [{ minute: 8 * 60 }, { minute: 12 * 60 + 30 }, { minute: 16 * 60 }, { minute: 19 * 60 + 30 }];
  it("only learns until the pattern is ready", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0 }, now: day(9),
      pattern: { ready: false, daysWithMeals: 6, windowDays: 14, slots: [] } });
    expect(p.kind).toBe("learning");
    expect(planLine(p, day(9))).toBe("Learning your usual meal times · 6 of 10 eating days logged (2+ meals a day).");
  });
  it("next usual slot becomes the window; macros split across the slots left before the cutoff", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 30, 600)], totals: { calories: 1100, protein_g: 70 }, now: day(14),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots } });
    expect(p.kind).toBe("fuelled"); expect(p.usual).toBe(true);
    expect(p.start.getHours()).toBe(15); expect(p.start.getMinutes()).toBe(30); expect(p.end.getHours()).toBe(16); expect(p.end.getMinutes()).toBe(30);
    expect(p.mealsLeft).toBe(2); // 16:00 and 19:30
    expect(p.kcal).toBe(550);
    expect(planLine(p, day(14))).toBe("Next meal usually ~4pm (3:30pm–4:30pm) · ~550 kcal · 36 P.");
  });
  it("inside a slot → eat now", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 30, 600)], totals: { calories: 1100, protein_g: 70 }, now: day(16, 10),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots } });
    expect(p.kind).toBe("eat"); expect(p.usual).toBe(true);
    expect(planLine(p, day(16, 10))).toMatch(/^Usual meal time · eat by 4:30pm/);
  });
  it("training rules still win over a slot", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 30, 600)], totals: { calories: 1100, protein_g: 70 }, now: day(16, 30), usualTraining: day(17),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots } });
    expect(p.kind).toBe("pre"); expect(p.snack).toBe(true);
  });
  it("a meal logged inside a slot marks it eaten: no 'eat now', and it drops out of the split", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 20, 600)], totals: { calories: 600, protein_g: 40 }, now: day(12, 40),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots } });
    expect(p.kind).toBe("fuelled"); expect(p.start.getHours()).toBe(15); // next open slot is 16:00 (3:30–4:30)
    expect(p.mealsLeft).toBe(2);
  });
  it("a slot straddling the cutoff is clamped to it", () => {
    const p = planNextMeal({ ...base, meals: [meal(16, 0, 500)], totals: { calories: 1500, protein_g: 120 }, now: day(19, 20),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots: [{ minute: 19 * 60 + 45 }] } });
    expect(p.kind).toBe("eat"); expect(p.end.getHours()).toBe(20); expect(p.end.getMinutes()).toBe(0);
  });
  it("learning still lets the post-workout prompt through", () => {
    const p = planNextMeal({ ...base, meals: [], totals: { calories: 600, protein_g: 40 }, now: day(18, 15),
      todayWorkout: { started_at: iso(17), ended_at: iso(18) }, pattern: { ready: false, daysWithMeals: 3, windowDays: 14, slots: [] } });
    expect(p.kind).toBe("post");
  });
  it("after the last slot with little left → done; a slot inside the sleep cutoff → closed", () => {
    const late = planNextMeal({ ...base, meals: [meal(19, 30, 700)], totals: { calories: 2050, protein_g: 140 }, now: day(20, 15),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots } });
    expect(late.kind).toBe("prebed"); // past the cutoff now (bed − 3 h) → the protein snack window
    const lateSlot = planNextMeal({ ...base, meals: [], totals: { calories: 1000, protein_g: 80 }, now: day(20, 15),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots: [{ minute: 21 * 60 }] } });
    expect(lateSlot.kind).toBe("prebed"); // a usual slot inside the cutoff only ever gets the protein snack
  });
});

describe("today adapts the usual slot", () => {
  const base = { targets, weight_lb: 200, clock, usualTraining: null as Date | null, todayWorkout: null };
  const slots = [{ minute: 8 * 60 }, { minute: 12 * 60 + 30 }, { minute: 16 * 60 }, { minute: 19 * 60 + 30 }];
  it("a late lunch pushes the 4pm slot back until the tank is nearly empty", () => {
    // 700 kcal lunch at 14:00 (claims the 12:30 slot) → fuelled till 17:00; at 15:45 the 16:00 slot waits till ~16:30.
    const p = planNextMeal({ ...base, meals: [meal(14, 0, 700)], totals: { calories: 1200, protein_g: 80 }, now: day(15, 45),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots, scope: "all" } });
    expect(p.kind).toBe("fuelled"); expect(p.usual).toBe(true);
    expect(p.start.getHours()).toBe(16); expect(p.start.getMinutes()).toBe(30);
    expect(p.end.getHours()).toBe(17); expect(p.end.getMinutes()).toBe(30);
  });
  it("names the weekday when the pattern is weekday-scoped", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 30, 600)], totals: { calories: 1100, protein_g: 70 }, now: day(14),
      pattern: { ready: true, daysWithMeals: 14, windowDays: 14, slots, scope: "weekday" } });
    expect(planLine(p, day(14))).toMatch(/^Next meal usually ~4pm on Mondays/);
  });
});

describe("performance + sleep fixes", () => {
  // Probe: wake 7, bed 23, 2800 kcal / 200 P / 300 C / 80 F, 200 lb.
  const full = { kcal: 2800, protein_g: 200, carbs_g: 300, fat_g: 80 };
  const base = { targets: full, weight_lb: 200, clock, usualTraining: null as Date | null, todayWorkout: null };

  it("HUB-shaped targets (computeTargets output) carry carbs into the plan", () => {
    const tt = computeTargets({ sex: "male", birth_date: "2005-01-01", height_in: 70, weight_lb: 200, activity: "moderate", phase: "maintain",
      rate_lb_per_wk: 0, protein_g_per_lb: 1, tdee_override: null, wake_time: "07:00", bed_time: "23:00" }, day(14));
    const p = planNextMeal({ ...base, targets: tt, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40, carbs_g: 60, fat_g: 20 },
      now: day(14), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.carbs_g).not.toBeNull();
    expect(planLine(p, day(14))).toMatch(/· ~\d+ C ·/);
  });

  it("training day: the session carbs are set aside, so breakfast gets fewer carbs than on a rest day", () => {
    const rest = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, now: day(7) });
    const train = planNextMeal({ ...base, meals: [], totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, now: day(7), usualTraining: day(17) });
    expect(rest.kind).toBe("eat"); expect(train.kind).toBe("eat");
    expect(rest.carbs_g).toBe(75);  // 300 / 4 windows
    expect(train.carbs_g).toBe(60); // (300 − 2 × 90 for pre + post) / 2 other windows
  });

  it("pre-workout meal kcal fits its composition (protein + carbs + fat ceiling); not dinner", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 600)], totals: { calories: 600, protein_g: 40, carbs_g: 60, fat_g: 20 },
      now: day(14), usualTraining: day(17) });
    expect(p.kind).toBe("pre"); expect(p.snack).toBe(false);
    expect(p.protein_g).toBe(36); expect(p.carbs_g).toBe(90); expect(p.fat_max_g).toBe(15);
    expect(p.kcal).toBe(640); // 4 × (36 + 90) + 9 × 15 = 639 → 640, not ~1100
    expect(p.isDinner).toBe(false);
  });

  it("past the cutoff with a session still ahead → fast carbs, not the pre-bed snack (20:10, training 20:30)", () => {
    const args = { ...base, meals: [meal(16, 0, 600)], totals: { calories: 1800, protein_g: 150, carbs_g: 200, fat_g: 50 }, now: day(20, 10) };
    const p = planNextMeal({ ...args, usualTraining: day(20, 30) });
    expect(p.kind).toBe("pre"); expect(p.snack).toBe(true);
    expect(planLine(p, day(20, 10))).toMatch(/^Training at 8:30pm\. Fast carbs now/);
    expect(planNextMeal(args).kind).toBe("prebed"); // no session ahead → the protein snack
  });

  it("post-workout window past the cutoff → light (≤300 kcal), not dinner", () => {
    const p = planNextMeal({ ...base, meals: [meal(16, 0, 600)], totals: { calories: 1500, protein_g: 120, carbs_g: 150, fat_g: 50 },
      now: day(20, 35), todayWorkout: { started_at: iso(19, 30), ended_at: iso(20, 30) } });
    expect(p.kind).toBe("post"); expect(p.light).toBe(true); expect(p.isDinner).toBe(false);
    expect(p.kcal).toBeLessThanOrEqual(300);
    expect(4 * (p.protein_g + (p.carbs_g ?? 0))).toBeLessThanOrEqual(p.kcal);
    const line = planLine(p, day(20, 35));
    expect(line).toMatch(/light: protein \+ some carbs/); expect(line).not.toMatch(/dinner/);
  });

  it("pre-bed snack only when it fits: 80 kcal left → 20 g; 3 g protein left → closed; ~40 kcal left → done", () => {
    const tight = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 2720, protein_g: 150 }, now: day(21, 0) });
    expect(tight.kind).toBe("prebed"); expect(tight.kcal).toBe(80); expect(tight.protein_g).toBe(20);
    expect(4 * tight.protein_g).toBeLessThanOrEqual(tight.kcal);
    const noP = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 2000, protein_g: 197 }, now: day(21, 0) });
    expect(noP.kind).toBe("closed");
    const noKcal = planNextMeal({ ...base, meals: [meal(18, 0, 700)], totals: { calories: 2760, protein_g: 150 }, now: day(21, 0) });
    expect(noKcal.kind).toBe("done");
  });

  it("fuelled copy shows carbs like the other windows", () => {
    const p = planNextMeal({ ...base, meals: [meal(12, 0, 900)], totals: { calories: 900, protein_g: 60, carbs_g: 100, fat_g: 30 }, now: day(13) });
    expect(p.kind).toBe("fuelled");
    expect(planLine(p, day(13))).toMatch(/· ~\d+ C\.$/);
  });
});
