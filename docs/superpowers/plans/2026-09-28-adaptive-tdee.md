# Adaptive TDEE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back-solve TDEE from logged intake vs. measured weight change over a 21-day window, replacing the formula-only nudge on the Diet tab's stall-suggestion card when there's enough logged-intake data to trust it — falling back to today's weight-only nudge otherwise.

**Architecture:** One new pure module, `lib/adaptive-tdee.ts`, computes the back-solved number from a day-by-day kcal array and existing weigh-in rows (reusing `slopeLbPerWk` from `lib/trend.ts` with a wider window). `app/(tabs)/diet/page.tsx` widens its meal fetch from 7 to 21 days, feeds both into the new function, and picks between the adaptive number and the existing nudge when rendering `ProgressCard`. `ProgressCard` gets two new optional props to show the measured-TDEE copy instead of the nudge copy when adaptive data is available.

**Tech Stack:** TypeScript, Next.js (App Router), Supabase, Vitest (`npm test` = `vitest run`).

**Spec:** `docs/superpowers/specs/2026-09-28-adaptive-tdee-design.md`

## Global Constraints

- Window: 21 days (`ADAPTIVE_WINDOW_DAYS`), longer than the existing 14-day `SLOPE_WINDOW_DAYS`.
- Minimum 14 logged intake-days within that window (`ADAPTIVE_MIN_LOGGED_DAYS`) before the back-solved number is trusted.
- Missed days are skipped entirely, never treated as 0 kcal.
- Weight signal reuses `slopeLbPerWk(weighIns, today, ADAPTIVE_WINDOW_DAYS)` from `lib/trend.ts` unchanged — no new weight-trend math.
- Formula: `tdee = round(avgLoggedKcal − slope × KCAL_PER_LB_PER_WK)`, reusing the existing `KCAL_PER_LB_PER_WK = 500` constant from `lib/trend.ts`.
- Trigger for showing any suggestion at all is unchanged: `assessProgress` (14-day window, default) must return `stalled` or `too_fast`.
- The suggestion computes regardless of whether `tdee_override` is already set — never gated on it.
- Diet tab only. No changes to `lib/targets.ts`, `meals` schema, home hub, or profile page.

## Review Focus

- Widening the meal fetch from 7 to 21 days must not leak into the "Last 7 days intake" list on the Diet tab — that display must stay filtered to 7 days.
- A logged day with 0 total kcal (e.g. a single 0-calorie entry) must not break the average or produce `NaN`.
- `too_fast` assessment: the adaptive value may be computed but must never be shown (no Apply button, no measured-TDEE copy) — that branch has always been warning-text-only.
- `tdee_override` already set: the measured-TDEE suggestion must still appear next time a stall triggers — this is the fix for the documented "override freezes tracking" quirk, so a regression here silently reintroduces it.
- Fewer than 14 logged days but 8+ weigh-ins: must fall back to today's nudge card byte-identical to current behavior, not a broken/partial measured-TDEE card.

---

## Task 1: `lib/adaptive-tdee.ts` — back-solve algorithm

**Files:**
- Create: `lib/adaptive-tdee.ts`
- Test: `lib/adaptive-tdee.test.ts`

**Interfaces:**
- Consumes: `slopeLbPerWk(points: WeighIn[], today: string, windowDays?: number): number | null`, `KCAL_PER_LB_PER_WK: number`, `addDays(date: string, days: number): string`, `type WeighIn = { date: string; weight_lb: number }` — all from `./trend` (already exist, unchanged).
- Produces: `ADAPTIVE_WINDOW_DAYS: number`, `ADAPTIVE_MIN_LOGGED_DAYS: number`, `type DailyKcal = { date: string; kcal: number }`, `computeAdaptiveTdee(dailyKcal: DailyKcal[], weighIns: WeighIn[], today: string): { tdee: number; loggedDays: number } | null` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `lib/adaptive-tdee.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeAdaptiveTdee, type DailyKcal } from "./adaptive-tdee";
import { addDays, type WeighIn } from "./trend";

const today = "2026-09-30";

function kcalDays(dates: string[], kcal: number): DailyKcal[] {
  return dates.map((date) => ({ date, kcal }));
}

/** n daily weigh-ins ending on `end`, weight = start + perDay * i (mirrors lib/trend.test.ts's series helper). */
function weighSeries(end: string, n: number, start: number, perDay: number): WeighIn[] {
  const out: WeighIn[] = [];
  for (let i = 0; i < n; i++) out.push({ date: addDays(end, i - (n - 1)), weight_lb: start + perDay * i });
  return out;
}

describe("computeAdaptiveTdee", () => {
  it("null with no data at all", () => {
    expect(computeAdaptiveTdee([], [], today)).toBeNull();
  });

  it("null with 13 logged days even with plenty of weigh-ins", () => {
    const dates = Array.from({ length: 13 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).toBeNull();
  });

  it("a number at exactly 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).not.toBeNull();
  });

  it("null with fewer than 8 weigh-ins in the window, even with 14 logged days", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 7, 203, -1.0 / 7);
    expect(computeAdaptiveTdee(dailyKcal, weighIns, today)).toBeNull();
  });

  it("worked example: avg 2200 kcal, slope −1.0 lb/wk → tdee 2700", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const dailyKcal = kcalDays(dates, 2200);
    const weighIns = weighSeries(today, 21, 210, -1.0 / 7);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBe(2700);
    expect(result!.loggedDays).toBe(14);
  });

  it("a 0-kcal logged day is still a logged day, not a gap — no NaN, no crash", () => {
    const dates = Array.from({ length: 13 }, (_, i) => addDays(today, -i));
    const dailyKcal = [...kcalDays(dates, 2200), { date: addDays(today, -13), kcal: 0 }];
    const weighIns = weighSeries(today, 8, 203, 0);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.loggedDays).toBe(14);
    expect(Number.isNaN(result!.tdee)).toBe(false);
  });

  it("gap days are excluded from the average, not counted as 0", () => {
    // 14 logged days scattered across the 21-day window, 7 gap days with no row at all.
    const dates = [0, 1, 2, 4, 5, 7, 8, 10, 12, 13, 15, 17, 18, 20].map((offset) => addDays(today, -offset));
    const dailyKcal = kcalDays(dates, 2000);
    const weighIns = weighSeries(today, 8, 203, 0); // flat, slope 0
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result).not.toBeNull();
    expect(result!.tdee).toBe(2000);
    expect(result!.loggedDays).toBe(14);
  });

  it("ignores dailyKcal rows outside the 21-day window", () => {
    const dates = Array.from({ length: 14 }, (_, i) => addDays(today, -i));
    const dailyKcal = [...kcalDays(dates, 2200), { date: addDays(today, -30), kcal: 9000 }];
    const weighIns = weighSeries(today, 8, 203, 0);
    const result = computeAdaptiveTdee(dailyKcal, weighIns, today);
    expect(result!.tdee).toBe(2200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/adaptive-tdee.test.ts`
Expected: FAIL — `lib/adaptive-tdee.ts` does not exist yet ("Cannot find module './adaptive-tdee'").

- [ ] **Step 3: Write the implementation**

Create `lib/adaptive-tdee.ts`:

```ts
import { addDays, slopeLbPerWk, KCAL_PER_LB_PER_WK, type WeighIn } from "./trend";

export const ADAPTIVE_WINDOW_DAYS = 21;
export const ADAPTIVE_MIN_LOGGED_DAYS = 14;

export type DailyKcal = { date: string /* YYYY-MM-DD */; kcal: number };

/**
 * Back-solves TDEE from logged intake vs. measured weight change over
 * ADAPTIVE_WINDOW_DAYS. Days with no dailyKcal row are gaps, never counted
 * as 0. Returns null if fewer than ADAPTIVE_MIN_LOGGED_DAYS are logged in
 * the window, or if slopeLbPerWk can't produce a slope (not enough weigh-ins).
 */
export function computeAdaptiveTdee(
  dailyKcal: DailyKcal[],
  weighIns: WeighIn[],
  today: string
): { tdee: number; loggedDays: number } | null {
  const start = addDays(today, -(ADAPTIVE_WINDOW_DAYS - 1));
  const inWindow = dailyKcal.filter((d) => d.date >= start && d.date <= today);
  if (inWindow.length < ADAPTIVE_MIN_LOGGED_DAYS) return null;

  const slope = slopeLbPerWk(weighIns, today, ADAPTIVE_WINDOW_DAYS);
  if (slope === null) return null;

  const avgLoggedKcal = inWindow.reduce((sum, d) => sum + d.kcal, 0) / inWindow.length;
  const tdee = Math.round(avgLoggedKcal - slope * KCAL_PER_LB_PER_WK);
  return { tdee, loggedDays: inWindow.length };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/adaptive-tdee.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: PASS — all existing suites (including `lib/trend.test.ts`, `lib/targets.test.ts`) unchanged and green.

- [ ] **Step 6: Commit**

```bash
git add lib/adaptive-tdee.ts lib/adaptive-tdee.test.ts
git commit -m "feat(diet): add adaptive TDEE back-solve algorithm"
```

---

## Task 2: Wire into the Diet tab

**Files:**
- Modify: `app/(tabs)/diet/page.tsx:11,94-160,235-236` (imports, data loading, derived values, `ProgressCard` call)
- Modify: `components/ProgressCard.tsx` (new optional props, conditional copy)

**Interfaces:**
- Consumes: `computeAdaptiveTdee`, `ADAPTIVE_WINDOW_DAYS`, `ADAPTIVE_MIN_LOGGED_DAYS`, `type DailyKcal` from `@/lib/adaptive-tdee` (Task 1). Existing `computeTargets`, `assessProgress`, `suggestAdjustment`, `slopeLbPerWk`, `addDays`, `applyAdjustment` unchanged.
- Produces: `ProgressCard` gains two new optional props, `measuredTdee: number | null` and `loggedDays: number | null` — no other component consumes `ProgressCard`, so this is the end of the chain.

- [ ] **Step 1: Widen the meal fetch and split the 21-day totals from the 7-day display list**

In `app/(tabs)/diet/page.tsx`, change the import at line 11 to add the new module:

```ts
import { addDays, assessProgress, emaTrend, inCooldown, slopeLbPerWk, suggestAdjustment, trendWeight, type Assessment } from "@/lib/trend";
import { computeAdaptiveTdee, ADAPTIVE_WINDOW_DAYS, type DailyKcal } from "@/lib/adaptive-tdee";
```

Add a new state field near line 99 (alongside `days`):

```ts
const [days, setDays] = useState<DayMeals[]>([]);
const [dailyKcal, setDailyKcal] = useState<DailyKcal[]>([]);
```

In the `load` callback (currently lines 102-127), widen the fetch window and split the 21-day grouped result into the 7-day display list plus the full 21-day totals:

```ts
const load = useCallback(async () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (ADAPTIVE_WINDOW_DAYS - 1));
  const [w, p, m] = await Promise.allSettled([
    listWeighIns(),
    getProfile(),
    supabase.from("meals").select("*").gte("logged_at", start.toISOString()).order("logged_at"),
  ]);
  if (w.status === "fulfilled") { setRows(w.value); setErr(""); }
  else { setErr("Couldn't load weigh-ins."); }
  setProfile(p.status === "fulfilled" ? p.value : null);

  if (m.status === "fulfilled" && !m.value.error) {
    const rowsByDay = new Map<string, DayMeals>();
    for (const raw of (m.value.data ?? []) as (MealRow & { logged_at: string })[]) {
      const key = localDateKey(new Date(raw.logged_at));
      const entry = rowsByDay.get(key) ?? { date: key, kcal: 0, protein: 0, meals: [] };
      entry.kcal += Number(raw.calories);
      entry.protein += Number(raw.protein_g);
      entry.meals.push({ id: raw.id, food_name: raw.food_name, grams: raw.grams, calories: raw.calories, protein_g: raw.protein_g, unit: raw.unit });
      rowsByDay.set(key, entry);
    }
    const allDays = [...rowsByDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
    const sevenDaysAgo = addDays(localDateKey(), -6);
    setDays(allDays.filter((d) => d.date >= sevenDaysAgo));
    setDailyKcal(allDays.map((d) => ({ date: d.date, kcal: d.kcal })));
  }
}, []);
```

- [ ] **Step 2: Run the app and confirm the "Last 7 days intake" list is unaffected**

Run: `npm run dev`, open the Diet tab.
Expected: the "Last 7 days intake" list still shows at most 7 entries, exactly as before the fetch was widened — confirms the Review Focus item about the 7-day list not leaking the wider 21-day fetch.

- [ ] **Step 3: Compute the adaptive suggestion and branch the applied target**

Replace the derived-values block (currently lines 140-148):

```ts
const todayRow = rows.find((r) => r.date === today) ?? null;
const last = rows.length ? rows[rows.length - 1] : null;
const trend = trendWeight(rows);
const slope = slopeLbPerWk(rows, today);
const phase = profile?.phase ?? "cut";
const rate = profile?.rate_lb_per_wk ?? 0;
const assessment: Assessment = profile ? assessProgress(slope, phase, rate) : "insufficient_data";
const delta = suggestAdjustment(slope, phase, rate);
const targets = profile ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb }) : null;
const adaptive = computeAdaptiveTdee(dailyKcal, rows, today);
const adaptiveTargets = profile && adaptive
  ? computeTargets({ ...profile, weight_lb: trend ?? profile.weight_lb, tdee_override: adaptive.tdee })
  : null;
const newKcal = adaptiveTargets
  ? adaptiveTargets.kcal
  : targets ? (phase === "cut" ? targets.kcal - delta : targets.kcal + delta) : null;
const suppressed = inCooldown(profile?.last_adjusted_at ?? null, new Date());
```

Replace `apply()` (currently lines 155-160):

```ts
async function apply() {
  if (!profile || !targets) return;
  if (adaptive) {
    await applyAdjustment(profile, adaptive.tdee);
  } else {
    const base = profile.tdee_override ?? targets.tdee_est;
    await applyAdjustment(profile, phase === "cut" ? base - delta : base + delta);
  }
  await load();
}
```

- [ ] **Step 4: Pass the new values to `ProgressCard`**

Replace the `ProgressCard` call (currently lines 235-236):

```tsx
<ProgressCard assessment={assessment} slope={slope} rate={rate} phase={phase} delta={delta}
  newKcal={newKcal} measuredTdee={adaptive?.tdee ?? null} loggedDays={adaptive?.loggedDays ?? null}
  suppressed={suppressed} onApply={apply} />
```

- [ ] **Step 5: Update `ProgressCard` to show measured-TDEE copy when available**

In `components/ProgressCard.tsx`, update the props type and destructuring:

```tsx
export default function ProgressCard({ assessment, slope, rate, phase, delta, newKcal, measuredTdee, loggedDays, suppressed, onApply }: {
  assessment: Assessment; slope: number | null; rate: number; phase: Phase; delta: number;
  newKcal: number | null; measuredTdee: number | null; loggedDays: number | null;
  suppressed: boolean; onApply: () => Promise<void>;
}) {
```

Replace the `title`/`line1`/`line2` derivation (currently lines 25-30):

```tsx
const stalled = assessment === "stalled";
const title = stalled
  ? measuredTdee !== null ? `Measured TDEE: ${measuredTdee} kcal` : "Trend flat 14 days"
  : `${phase === "cut" ? "Losing" : "Gaining"} ${Math.abs(slope).toFixed(1)} lb/wk`;
const line1 = stalled
  ? measuredTdee !== null ? `From ${loggedDays} days tracked.` : `(${fmt(slope)} lb/wk, goal ${goal}).`
  : `Faster than ${(rate + 0.75).toFixed(2)} lb/wk.`;
const line2 = stalled
  ? `${measuredTdee !== null ? "Update" : phase === "cut" ? "Drop" : "Add"} ${measuredTdee !== null ? "" : `${delta} kcal `}→ ${newKcal ?? "—"}?`
  : `Consider ${phase === "cut" ? "adding" : "cutting"} 100–200 kcal.`;
```

Note the `too_fast` branch (`stalled === false`) never reads `measuredTdee` or `loggedDays` — it's untouched, matching the Review Focus item that `too_fast` stays warning-text-only.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open the Diet tab with a test account.

Scenario A — insufficient intake data (today's exact behavior, unchanged): seed 14 flat weigh-in rows (any two-week stall) via the SQL editor with **no** meals logged. Confirm the stall card shows the existing "Trend flat 14 days ... Drop N kcal → X?" copy, and Apply writes `tdee_override` the same as before this change.

Scenario B — sufficient data: seed the same 14 flat weigh-ins **and** at least 14 days of meals (varying calories, doesn't need to be daily) plus at least 8 weigh-ins within the last 21 days (already satisfied by the 14 flat rows). Confirm the card now shows "Measured TDEE: X kcal" / "From N days tracked." / "Update → Y?" and Apply writes `tdee_override = X` (the measured TDEE, not a ± delta).

Scenario C — override already set: with Scenario B's data still in place, manually set `profiles.tdee_override` to some other value via the SQL editor, reload. Confirm the measured-TDEE card still appears (not silenced by the override being set) — this is the fix for the documented quirk.

Scenario D — too_fast: seed weigh-ins showing a much faster loss than the profile's `rate_lb_per_wk`. Confirm the card shows the existing too_fast warning text only, no Apply button, regardless of whether enough intake data exists for an adaptive number.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — no test touches `app/` or `components/` (no existing coverage there, consistent with the rest of the codebase), so this step confirms `lib/adaptive-tdee.test.ts` and every other suite are still green after the wiring changes.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)/diet/page.tsx" components/ProgressCard.tsx
git commit -m "feat(diet): surface adaptive TDEE on the stall-suggestion card"
```
