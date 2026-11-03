# Meal timing v1 — fuel model, next-meal window, timeline, protein hits, late-meal guard

Date: 2026-11-02 · Status: George: "next meal… completely useless… start implementing the idea of MEAL TIMING and tracking digestion"; ideas round (ultrathink) → v1 chosen; caffeine dropped, heavy meals before bed emphasised.

## Intent
Replace the HUB's "Next meal" card (remaining macros ÷ 4) with a timing model that knows when you ate, how much, when you train and when you sleep, and tells you the next eating window and what fits in it. First brick of "control the controllables": gym performance, sleep.

## Binding
- **Profile** gains `wake_time` and `bed_time` (HH:MM, defaults 07:00 / 23:00) — two `time` inputs on the profile page; schema `alter table profiles add column if not exists …`. Sub-project 10 SQL already applied 2026-11-02 (so `upsertProfile` spreading wake/bed is safe to deploy).
- **Feedings** (`feedings(meals)`): every food is its own `meals` row, so rows are grouped into feedings — a row within 60 min of a feeding's *first* row joins it (kcal, protein, fat summed; time = first row's). Fuel, protein hits, the late-meal guard and the timeline dots all work on feedings, never raw rows.
- **Fuel model** (`lib/meal-timing.ts`, pure, tested): a feeding digests for `digestHours(kcal, fat)`: <300 kcal → 2 h, 300–700 → 3 h, >700 → 4 h, +0.5 h when fat ≥ 25 g. `fuelledUntil(meals, now)` = the **latest** finish time across feedings (a snack after a big meal never shortens it); `left` = fraction of that feeding's span remaining; `lastMeal` = that feeding; `lastAt` = the most recent feeding's time ("N h since your last meal").
- **Training time**: today's actual workout (active or completed) wins; otherwise `usualTrainingStart(workouts, now)`: pool = same weekday over the last 8 weeks when ≥ 2 sessions. With ≥ 4 weeks of history (any session older than 28 days) a weekday with 0–1 sessions is a **rest day → null**; only with thinner history fall back to all recent sessions (≥ 3). Time = the most common 30-min bucket (ties → the bucket trained in most recently), median inside it — so 6am + 6pm never averages to noon.
- **Clock**: tonight's bed = `bedtimeFor`; bed at/before wake (e.g. 00:30) means after midnight, except between midnight and wake, when tonight's bed is today's date. `wakeFor` = the waking day's start (yesterday's wake for a late sleeper before wake).
- **Plan** (`planNextMeal`): cutoff = bed − 2.5 h (heavy meals), light cutoff = bed − 1 h. First match wins:
  1. `done` — remaining kcal ≤ 0.
  2. `training` — a workout is active: no meal; "Training now. Eat within 2 h after · ~X kcal · ≥N P" (protein ≥ 30 g).
  3. `post` — a workout ended ≤ 2 h ago and nothing logged since: window now → min(end + 2 h, bed − 1 h), protein ≥ 30 g.
  4. `closed` — before wake on a normal schedule (sleep; "window opens at <wake>"), or now ≥ cutoff: closed for sleep; a light snack (< 300 kcal) is offered until bed − 1 h only while kcal remain and now < bed − 1 h.
  5. `pre` — training later today (not started, not done), pre zone = training − 3 h … training − 1 h:
     - < 1 h before training with the tank (nearly) empty (fuel ends ≤ now + 30 min): **snack** (`snack: true`): "Training at 5pm. Small carb snack now (≤200 kcal), main meal after ~6:30pm" (training + 1.5 h).
     - otherwise, if the tank empties by training − 1 h, a pre-meal window [max(now, fuelled − 30 min), training − 1 h] — **only** if that start is ≥ training − 3 h (i.e. we're in the zone or the normal window would open in it). Earlier than that, fall through to the normal rule (7 am with nothing eaten → eat now, not a 2pm pre-meal). Note says carbs up. If that window would be shorter than 45 min (training − 1 h − start < 45 min), it becomes the snack variant instead ("Small carb snack now", or "~<time>" when the tank lasts a little longer).
  6. `fuelled-through` — training later today and the tank lasts past training − 1 h: next window opens training + 1.5 h → min(training + 3 h, cutoff). Only this kind says "Fuelled through training". Late training: if that start is ≥ bed − 1 h → `closed`; if it is ≥ cutoff but < bed − 1 h → keep the window (end ≤ bed − 1 h) as a **light** meal (`light: true`, kcal ≤ 300): "Light meal after training, ~9:30pm · ≤300 kcal · 36 P".
  7. `fuelled` — tank not empty yet (> 30 min left): window opens when it empties. `eat` — tank empty: window [now, min(fuelled + 1 h, cutoff)].
  Macros for the window: kcal = remaining ÷ mealsLeft (mealsLeft = ceil((cutoff − windowStart) / 3.5 h), ≥ 1), rounded to 10; protein = min(remaining protein, max(25, 0.18 g × bodyweight lb)) — the per-feeding dose the muscle-protein-synthesis literature supports (~0.4 g/kg), capped by what's left. The "· N P" part is omitted when N is 0.
- **Protein hits**: a hit = feeding with ≥ 25 g protein, ≥ 2.5 h after the previous hit. Target 4/day. Shown as `Protein hits 3 / 4`.
- **Late heavy meal guard**: a feeding ≥ 600 kcal within 2.5 h before bedtime (or after it) → context line `Heavy meal 1.4 h before bed — expect worse sleep.` Also drives the closed window.
- **Timeline strip** (`components/MealTimeline.tsx`): wake → bed, one dot per feeding sized by feeding kcal (3 sizes), workout as a block, now marker, the plan window shaded. Pure presentation.
- **HUB card** replaces the Next meal link: timeline, one context line from the plan, `Protein hits N / 4`, taps through to Log meal. The HUB keeps `now` in state with a 60 s tick so the line stays current while the app is open.
- Old `nextMeal` in `lib/hub.ts` stays (tested) but is no longer used by the HUB.

## Learned meal times (added 2026-11-03)
George: "i kind of want it to be SOMEWHAT realistic and predictable meal timings. maybe we start the meal timing after like 2 weeks of meal timing data… see the times that these people NORMALLY eat, and then give suggestions based off of that."
- `lib/meal-slots.ts` `usualMealSlots(meals, now)`: feedings over the last 14 days (today excluded), only days with ≥ 2 feedings count; greedy clustering (90-min buckets) of feeding minutes; a slot is kept when it recurs on ≥ 50 % of eating days; slot time = median. `ready` when ≥ 10 eating days.
- Not ready → the plan is `learning`: card shows the timeline, protein hits and the late-meal warning, and the line `Learning your meal times · N / 14 days.` No suggestions.
- **Per weekday** (George 2026-11-03: "people's schedules change daily"): once there are ≥ 3 eating days of today's weekday in the last six weeks, that weekday's own slots are used; otherwise the two-week overall pattern. Copy names the day: `Next meal usually ~2pm on Saturdays`.
- **Today adapts**: each feeding today claims its nearest slot (within 90 min) → that slot is "eaten" and drops out of the suggestions and the kcal split; a late previous meal pushes the next slot back until the tank is nearly empty (start ≥ fuelled − 30 min; a window pushed past its slot lasts 1 h).
- `learning` is checked **after** `training`/`post` (nutrition prompts, not timing guesses) and reads `Learning your usual meal times · 6 of 10 eating days logged (2+ meals a day).` The HUB passes no pattern until the six-week meal history has loaded, so a ready user never flashes the learning card.
- Ready → the window is the usual slot in progress (now within ±30 min) or the next open slot today; kcal = remaining ÷ open slots left before the cutoff. Past the last slot: `< 300 kcal left → "Past your usual meals · ~N kcal left, optional."`, else the fuel fallback prefixed `Past your usual meal times ·`.
- Clustering note: the 90-min bucket is a radius, so two meals 60–90 min apart on the same day merge into one slot. Copy: `Next meal usually ~4pm (3:30pm–4:30pm) · ~550 kcal · 36 P.` / `Usual meal time · eat by 4:30pm · …`. Training (`training`/`post`/`pre`/snack/`fuelled-through`) and sleep (`closed`, late-meal) rules keep precedence. Past the last slot with < 300 kcal left → `done`; with more left → the fuel model's fallback. Faint ticks on the timeline mark the usual slots.

## Non-goals (v2+)
Caffeine. Weekly "controllables" card. Morning check-in and correlations. Push notifications (needs service worker + scheduler; with the App Store push). Rest-day vs training-day macro plans (v1 only detects rest days to suppress pre-workout).

## Decisions
- Digest hours are coarse buckets, not a physiological model; the confirm-by-eye is the user. Linear drain.
- Training time learned from history rather than a profile field; override = just start a workout.
- Everything local-time; bed earlier than wake (e.g. 00:30) means "after midnight".
