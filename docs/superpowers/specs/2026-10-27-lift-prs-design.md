# Lift PRs and progression — best set in the sheet, PR badge, suggested next load

Date: 2026-10-27 · Status: approved by George in chat (small change) · Roadmap item 5

## Intent

George picks a weight by opening the set sheet and matching or beating what he sees. Today the sheet shows only the **last session**. If last session was a down day he chases a lower number than his real best. He also progresses by a fixed rule he described: work in a 5–9 rep range; when the top set reaches 8–9 reps, go up in weight until he can only do 4–5; repeat. The app should show the best, flag a new best, and pre-fill the weight the rule implies.

Performance tab already has per-exercise best set, a top-set chart, recent sessions, indicator lifts and strength index. Nothing there changes except one consistency fix (below).

## Goals

- Set sheet header shows **Best** (all-time, this exercise) next to **Last**.
- A logged set that beats the all-time best gets a **PR** badge, in the sheet's "Sets logged this workout" list and in the workout summary. Header Best updates live.
- Set sheet pre-fills the weight wheel with a **suggested load** from George's rule and shows a one-line chip explaining it. Tap chip → wheel set to that weight.

## Non-goals

- No new screens, no schema, no HUB card, no confetti/animation.
- No automatic weight drop. ≤4 reps suggests staying, never lowering.
- No change to the Performance chart, indicators, strength index.
- Diet section complaints (unsorted food list, no undo) — next round, separate spec.

## Definitions (binding)

- **Row** = one `LiftRow` (`sets × reps × weight`). A row with `sets > 1` counts as one entry with that weight and reps.
- **Best (PR set)** of a row list = highest `weight`; ties broken by highest `reps`; further ties by earliest `logged_at`. Function `bestByWeight(rows)`. Not estimated 1RM.
- **Beats** = `weight` greater, or equal `weight` and greater `reps`.
- **isPr(row, before)** = `before` empty, or `row` beats `bestByWeight(before)`. `before` = every row for the same exercise logged earlier than `row` (previous workouts + earlier rows in this workout).
- **Top set of a session** = `bestByWeight(session.rows)`.
- **Session** = as `sessionsFor` in `lib/progress.ts` (grouped by `workout_id`, legacy rows by local date).
- **Lower body** = exercise's first muscle group ∈ `PRESETS.lower` (`quads`, `hamstrings_glutes`, `core`). Library-aware via `findExercise(name, lib)`. Unknown exercise → upper.

## Suggestion rule

Input: exercise name, all rows for that exercise from previous workouts (newest-first or any order), library. Output `Suggestion | null`.

```
type Suggestion = {
  weight: number;              // what to pre-fill, snapped to WEIGHT wheel (2.5 lb steps)
  kind: "up" | "stay" | "build";
  lastWeight: number; lastReps: number;   // top set of the last session
};
```

- No previous session → `null` (no chip, wheel seeds as today).
- Let `top` = top set of the most recent session.
- `top.reps >= 8` → `kind: "up"`, `weight = top.weight + jump`.
- `5 <= top.reps <= 7` → `kind: "stay"`, `weight = top.weight`.
- `top.reps <= 4` → `kind: "build"`, `weight = top.weight`.
- **jump** = `typicalJump(sessions, fallback)`: take top-set weight of each session in date order, collect consecutive positive deltas, if at least one exists return their median rounded to the nearest 2.5; else `fallback` = 10 for lower body, 5 for upper.

Chip copy (exact):
- up: `Try {weight} · hit {lastReps} last time`
- stay: `Stay {weight} · aim 8+`
- build: `Stay {weight} · build to 5`

Sheet pre-fill: when the sheet opens with no wheel state for that exercise, weight seeds to `suggestion.weight` (reps and sets still seed from last session's first row as today). When `suggestion` is null, unchanged behaviour.

Header copy: `Last: 185×8, 185×7 · Oct 20` line as today, then on a second line `Best: 195×6 · Sep 30` (date via existing `shortDate`). If the best is from this workout (a PR just logged) the date is today's. "First time" stays when no history at all.

PR badge: a small pill `PR` in accent colour on the row, same style family as the summary's "Beat last time" pill but smaller (`text-[11px]`). Shown on every row where `isPr` holds. Workout summary rows show the same pill; summary keeps "Beat last time".

## Consistency fix

Performance tab's "Best set" card (`app/(tabs)/performance/page.tsx`, the `best` constant) switches from `bestSet` (e1RM) to `bestByWeight`. Reason: one definition of "best" across the app; George reads best as heaviest weight. `bestSet` stays for anything else that uses it.

## Left to the builder

File placement of helpers (`lib/progression.ts` suggested), how SetSheet receives `best` and `suggestion` (props computed in the workout page), test fixtures.

## Decisions log

- Best = heaviest weight not e1RM — George's own words: "highest weight / reps I have done". Claude's call on tie rules.
- Jump from history median with 5/10 fallback — Claude's call; George only said "increase the weight until I can only do 4–5".
- Thresholds 8 / 5 / 4 — from George's rule ("around 8–9 reps … until I can only do 4–5").
