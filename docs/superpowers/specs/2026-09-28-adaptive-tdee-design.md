# Adaptive TDEE — Design

> **Reverted 2026-09-30.** Shipped, then pulled back to the original weight-only stall nudge — logged intake can't be trusted as a hard input (weighing errors, misremembered macros, missed logs), while a morning weigh-in is the one honest, consistent signal. See the [[2026-09-30 — Revert adaptive TDEE|dev log]] for the reasoning and exact revert. Left here as a historical record, not current behavior.

Sub-project 6 of the Gainz roadmap (per `docs/superpowers/specs/2026-08-30-weigh-ins-design.md:61-63,95`). Depends on sub-project 1 (macro targets: `profiles`, `computeTargets`) and sub-project 2 (weigh-ins/trend: `lib/trend.ts`, `slopeLbPerWk`).

## Purpose

Replace the formula-only `estimateTdee` (Mifflin-St Jeor × activity multiplier) with a number back-solved from what actually happened: logged intake vs. measured weight change over the same window. The formula guesses; this measures. Falls back to today's weight-trend-only stall nudge when there isn't enough logged-intake data to trust the back-solve — tracking is never assumed 100% consistent.

Decisions taken in brainstorming:
- **Hybrid, not a hard replace.** Weight trend alone can't be dropped — intake logging will have gaps, and weight is the only signal that's never missing (once weighed). The back-solve needs both signals; when intake data is too thin, fall back to the existing weight-only nudge unchanged.
- **21-day window**, longer than the existing 14-day `SLOPE_WINDOW_DAYS` — steadier signal, less whipsawed by one or two off days.
- **Minimum 14 logged days** within that 21-day window before the back-solved number is trusted. Missed days are skipped, never counted as 0 kcal.
- **Weight signal reuses `slopeLbPerWk`** with `windowDays = 21` — no new weight-trend code, just a different window than the stall-detect call already uses.
- **Suggestion keeps computing even when `tdee_override` is already set** — fixes the known quirk in the weigh-ins spec where a manual override silently freezes tracking. Apply still just overwrites `tdee_override` again.
- **Same trigger as today**: only surfaces when `assessProgress` (14-day window, unchanged) says `stalled` or `too_fast`. This design doesn't change when a suggestion appears, only what number it offers once one does.
- **Diet tab only** — no changes to `lib/targets.ts`, the `meals` schema, the home hub, or the profile page.

## Algorithm — `lib/adaptive-tdee.ts` (pure, no I/O)

```ts
export const ADAPTIVE_WINDOW_DAYS = 21;
export const ADAPTIVE_MIN_LOGGED_DAYS = 14;

export type DailyKcal = { date: string /* YYYY-MM-DD */; kcal: number };

export function computeAdaptiveTdee(
  dailyKcal: DailyKcal[],
  weighIns: WeighIn[],
  today: string
): { tdee: number; loggedDays: number } | null
```

- Filter `dailyKcal` to `[today − 20, today]`. Days with no row are gaps — not zero, just absent. `loggedDays` = count of rows in that range.
- If `loggedDays < ADAPTIVE_MIN_LOGGED_DAYS` → `null` (insufficient intake data).
- `avgLoggedKcal` = mean `kcal` over those `loggedDays` rows only (never divided by 21).
- `slope = slopeLbPerWk(weighIns, today, ADAPTIVE_WINDOW_DAYS)`. If `null` (fewer than the existing `SLOPE_MIN_POINTS = 8` weigh-ins in the 21-day window) → `null` (insufficient weight data).
- `tdee = round(avgLoggedKcal − slope × KCAL_PER_LB_PER_WK)` (reuses the existing `500` constant from `lib/trend.ts` — 3500 kcal/lb ÷ 7 days). Positive slope (gaining) lowers the measured TDEE below average intake; negative slope (losing) raises it above — matches the sign of a caloric deficit/surplus.
- Returns `{ tdee, loggedDays }`.

No new weight-trend math — `slopeLbPerWk` already takes `windowDays` as a parameter, this just calls it with 21 instead of its 14-day default.

## Data flow — `app/(tabs)/diet/page.tsx`

Current meal fetch only pulls the last 7 days (`start.setDate(start.getDate() - 6)`, line 105). This must widen to `ADAPTIVE_WINDOW_DAYS` (21) days so there's enough history for the back-solve — the 7-day meal list UI is unaffected, it just filters the wider fetch down for display same as today.

Build `DailyKcal[]` from the same `meals` query already being grouped into `rowsByDay` (line 116-124) — reuse that grouping, just don't discard days older than 7 when computing the adaptive input (only the display list is windowed to 7).

Replace the suggestion branch (currently lines 141-158):

```
slope14 = slopeLbPerWk(weighIns, today)              // unchanged, 14-day default
assessment = assessProgress(slope14, phase, rate)    // unchanged trigger

if assessment is "stalled" or "too_fast":
  adaptive = computeAdaptiveTdee(dailyKcal, weighIns, today)
  if adaptive !== null:
    newTdeeOverride = adaptive.tdee              // direct replace, not a ± nudge
    cardCopy = "Measured TDEE: {adaptive.tdee} kcal (from {adaptive.loggedDays} days tracked)"
  else:
    delta = suggestAdjustment(slope14, phase, rate)   // unchanged fallback, byte-identical to today
    newTdeeOverride = (profile.tdee_override ?? targets.tdee_est) ± delta
    cardCopy = today's existing copy
```

`apply()` writes whichever `newTdeeOverride` was computed, via the existing `applyAdjustment(profile, newTdeeOverride)` — same cooldown (`inCooldown`, `COOLDOWN_DAYS = 14`) gates the Apply button either way, unchanged.

Suggestion computation is **not** gated on whether `tdee_override` is already set — it always runs off the trigger above, fixing the "override freezes tracking" quirk. Applying again simply overwrites `tdee_override` with the fresh number.

## Error handling

- No meals or weigh-ins at all → `computeAdaptiveTdee` returns `null` on the first check (loggedDays = 0 < 14) → falls straight to existing nudge path, which itself returns `insufficient_data`/no card if `slope14` is also null. No new error states beyond what `assessProgress` already handles.
- Malformed/negative `calories` rows: not this feature's concern — `meals.calories` is already constrained at insert (`lib/log.ts`); back-solve trusts stored rows same as the existing per-day sum in `page.tsx:120`.

## Testing

New `lib/adaptive-tdee.test.ts`, mirroring `lib/trend.test.ts` style:
- Empty `dailyKcal` and empty `weighIns` → `null`.
- Exactly 14 logged days, 8 weigh-ins, hand-computed avg kcal + slope → exact expected `tdee` (worked numeric example, e.g. avgKcal 2200, slope −1.0 lb/wk → `2200 − (−1.0 × 500) = 2700`).
- 13 logged days → `null` (boundary below `ADAPTIVE_MIN_LOGGED_DAYS`). 14 → a number (boundary at).
- 7 weigh-ins in window → `null` (boundary below `SLOPE_MIN_POINTS`, via `slopeLbPerWk`'s existing behavior). 8 → a number.
- A day with zero logged meals inside the window is excluded from `avgLoggedKcal`, not counted as 0 — assert average is unaffected by gap days.

`lib/trend.test.ts` unchanged, stays green — the fallback path this design uses is byte-identical to today's `suggestAdjustment` flow.

Manual: seed 21 days of meals + 8+ weigh-ins showing a stall in the SQL editor, confirm the diet tab shows "Measured TDEE: X" and Apply updates `tdee_override`; then seed a stall with fewer than 14 logged meal-days and confirm it falls back to today's nudge card unchanged; then set `tdee_override` manually and confirm the measured-TDEE card still appears next time a stall triggers (override no longer silences it).

## Out of scope

Home hub, profile page, `lib/targets.ts`, `meals` schema changes, a dedicated "daily kcal totals" shared helper beyond what's reused from the existing `rowsByDay` grouping, wearable/activity-based adjustment (sub-project 3).
