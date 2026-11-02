# Meal timing v1 — fuel model, next-meal window, timeline, protein hits, late-meal guard

Date: 2026-11-02 · Status: George: "next meal… completely useless… start implementing the idea of MEAL TIMING and tracking digestion"; ideas round (ultrathink) → v1 chosen; caffeine dropped, heavy meals before bed emphasised.

## Intent
Replace the HUB's "Next meal" card (remaining macros ÷ 4) with a timing model that knows when you ate, how much, when you train and when you sleep, and tells you the next eating window and what fits in it. First brick of "control the controllables": gym performance, sleep.

## Binding
- **Profile** gains `wake_time` and `bed_time` (HH:MM, defaults 07:00 / 23:00) — two `time` inputs on the profile page; schema `alter table profiles add column if not exists …`.
- **Fuel model** (`lib/meal-timing.ts`, pure, tested): a meal digests for `digestHours(kcal, fat)`: <300 kcal → 2 h, 300–700 → 3 h, >700 → 4 h, +0.5 h when fat ≥ 25 g. `fuelledUntil(meals, now)` = last meal's time + its digest hours; `left` = fraction of that span remaining.
- **Training time**: today's actual workout (active or completed) wins; otherwise `usualTrainingStart(workouts, now)` = median start minute on the same weekday over the last 8 weeks (≥ 2 sessions), else median over all (≥ 3), else null.
- **Plan** (`planNextMeal`): cutoff = bed − 2.5 h (heavy meals), light cutoff = bed − 1 h.
  1. `done` — remaining kcal ≤ 0.
  2. `post` — a workout ended ≤ 2 h ago and nothing logged since: window now → end + 2 h, protein ≥ 30 g.
  3. `pre` — training later today and the tank runs out before training − 1 h: window [max(now, fuelled − 30 min, training − 3 h), training − 1 h]; note says carbs up.
  4. `fuelled` — tank not empty yet (incl. "fuelled through training"): window opens when it empties.
  5. `closed` — now ≥ cutoff: eating window closed for sleep; a light snack (< 300 kcal) is fine until bed − 1 h if kcal remain.
  6. `eat` — tank empty: window [now, min(fuelled + 1 h, cutoff)].
  Macros for the window: kcal = remaining ÷ mealsLeft (mealsLeft = ceil((cutoff − windowStart) / 3.5 h), ≥ 1), rounded to 10; protein = min(remaining protein, max(25, 0.18 g × bodyweight lb)) — the per-feeding dose the muscle-protein-synthesis literature supports (~0.4 g/kg), capped by what's left.
- **Protein hits**: feedings = meals grouped within 60 min; a hit = feeding with ≥ 25 g protein, ≥ 2.5 h after the previous hit. Target 4/day. Shown as `Protein hits 3 / 4`.
- **Late heavy meal guard**: a meal ≥ 600 kcal logged within 2.5 h before bedtime (or after it) → context line `Heavy meal 1.4 h before bed — expect worse sleep.` Also drives the closed window.
- **Timeline strip** (`components/MealTimeline.tsx`): wake → bed, meals as dots sized by kcal (3 sizes), workout as a block, now marker, the plan window shaded. Pure presentation.
- **HUB card** replaces the Next meal link: timeline, one context line from the plan, `Protein hits N / 4`, taps through to Log meal.
- Old `nextMeal` in `lib/hub.ts` stays (tested) but is no longer used by the HUB.

## Non-goals (v2+)
Caffeine. Weekly "controllables" card. Morning check-in and correlations. Push notifications (needs service worker + scheduler; with the App Store push). Rest-day vs training-day plans.

## Decisions
- Digest hours are coarse buckets, not a physiological model; the confirm-by-eye is the user. Linear drain.
- Training time learned from history rather than a profile field; override = just start a workout.
- Everything local-time; bed earlier than wake (e.g. 00:30) means "after midnight".
