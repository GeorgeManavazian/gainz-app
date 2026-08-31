# Weigh-ins, Trend & Stall Detection — Design

Sub-project 2 of the Gainz roadmap. Depends on sub-project 1 (macro targets: `profiles`, `computeTargets`).

## Purpose

A daily morning weigh-in (after bathroom, before food — same conditions every day) recorded in the app, a trend line that filters day-to-day water noise, and a rule that notices when a cut has stalled for two weeks and offers a one-tap calorie adjustment. Trend weight also feeds `computeTargets` so fat/protein grams track bodyweight automatically ("recalculate as bodyweight moves" from Profile.md).

Decisions taken in brainstorming:
- Stall response is **suggest + one-tap apply**, never automatic.
- Weigh-ins live **only in Supabase** (dated rows per user). No vault sync. If the app ever goes public, weights stay per-user rows; the vault is George's own pipeline and is out of scope here.
- Adaptive TDEE (back-solving from intake vs loss) stays deferred — needs reliable in-app meal logging.

## Data model

```sql
create table if not exists weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  date date not null,
  weight_lb numeric not null check (weight_lb > 0),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table weigh_ins enable row level security;
create policy "own weigh_ins" on weigh_ins for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table profiles add column if not exists last_adjusted_at timestamptz;
```

- One row per user per calendar day (local date as `YYYY-MM-DD`, computed on the phone). Re-weighing the same morning **upserts** on `(user_id, date)` — the last value wins.
- Direct writes (like `profiles`), **not** through the offline queue: weigh-ins happen at home on wifi, and the queue's insert-only, client-UUID idempotency does not fit an upsert-by-date. The queue's invariants are untouched.
- No realtime publication; the dashboard refetches after its own writes.
- `profiles.last_adjusted_at` records when a stall suggestion was last applied, for the cooldown.

## Trend math — `lib/trend.ts` (pure, no I/O)

Input everywhere: `WeighIn[] = { date: string /* YYYY-MM-DD */, weight_lb: number }[]`, sorted ascending by date, at most one per date.

**`emaTrend(points, alpha = 0.25): { date, weight_lb, trend }[]`** — exponential moving average in weigh-in order (gaps in dates are ignored; each recorded point is one step). First point's trend = its weight. α was 0.1 in the first draft (Hacker's Diet / Happy Scale style); a render check on a −1.4 lb/wk series showed that lags the scale by ~1.8 lb, which reads as wrong and inflates targets. 0.25 gives a mean lag of (1−α)/α ≈ 3 days (≈ 0.6 lb at 1.5 lb/wk) while still cutting noise variance to α/(2−α) ≈ 14 %. Returns the input with a `trend` field. `trendWeight(points)` = last `trend` value, or `null` if no points.

**`slopeLbPerWk(points, today, windowDays = 14): number | null`** — ordinary least-squares slope of raw `weight_lb` against day-offset, over points whose date is within `[today − windowDays + 1, today]`. Returns `null` when fewer than **8** points fall in the window (a week of daily weigh-ins is the minimum for a two-week verdict; also guarantees nothing fires in the first week). Units: lb per week (slope per day × 7).

**`assessProgress(slope, phase, rate_lb_per_wk): Assessment`** where `Assessment = "insufficient_data" | "on_track" | "stalled" | "too_fast"`:
- `slope === null` → `insufficient_data`
- `maintain` → `on_track` always
- `cut`: `stalled` if `slope ≥ −0.25`; `too_fast` if `slope < −(rate + 0.75)`; else `on_track`
- `bulk`: mirrored — `stalled` if `slope ≤ 0.25`; `too_fast` if `slope > rate + 0.75`; else `on_track`

**`suggestAdjustment(slope, phase, rate_lb_per_wk): number`** — kcal to subtract (cut) or add (bulk): `shortfall = rate − |slope|` (lb/wk, clamped ≥ 0), `delta = shortfall × 500` (1 lb/wk ≈ 500 kcal/day), rounded to the nearest 50, clamped to **[100, 250]**. Cap exists so a single tap never craters intake; if the stall persists, the next cycle offers another step. Only called when assessment is `stalled`.

Reference cases (unit tests):
- 14 daily points at exactly −1.5 lb/wk → slope −1.5, `on_track`.
- 14 daily points flat at 203 ± noise (deterministic pattern) → slope ≈ 0, `stalled`, suggestion for rate 1.5 → `(1.5 − 0) × 500 = 750 → 250`.
- Actual −1.0 on rate 1.5 → `on_track` (−1.0 < −0.25). Actual −0.2 → `stalled`, suggestion `(1.5 − 0.2) × 500 = 650 → 250`. Actual −0.1 with rate 0.3 → `(0.3 − 0.1) × 500 = 100 → 100`.
- −2.5 on rate 1.5 → `too_fast` (−2.5 < −2.25).
- 7 points in window → `null` → `insufficient_data`. 8 points → a number.
- EMA: constant series → trend equals the constant; step from 200 to 210 → trend moves 10 × 0.25 = 2.5 on the first post-step point.

Known quirks (deliberate, revisit with sub-project 6/adaptive TDEE):
- `suggestAdjustment` uses `|slope|`, so a cut where weight is *rising* (+0.5 lb/wk) computes the same shortfall as losing 0.5 lb/wk. The [100, 250] clamp makes the output identical in every reachable case today; a signed formula would only matter once the cap is lifted.
- Once Apply writes `tdee_override`, TDEE stops tracking bodyweight (fat/protein grams still do, via trend weight). That is the intent — the user has taken manual control — but it means an override set at 170 lb is still in force at 190 lb unless another stall fires or they edit it.

## Targets link

Dashboard computes `computeTargets({ ...profile, weight_lb: trendWeight ?? profile.weight_lb })`. `profile.weight_lb` remains the seed/fallback. The `/profile` page keeps editing the seed and shows a note when trend weight is overriding it ("Targets currently use trend weight 170 lb").

## Stall suggestion & cooldown

Shown on the dashboard when assessment is `stalled` **and** (`last_adjusted_at` is null or older than 14 days). Card copy: "Trend {slope:+.1} lb/wk over 14 days (goal −{rate}). Drop {delta} kcal → {newKcal}?" with an **Apply** button. Apply: `tdee_override = (profile.tdee_override ?? targets.tdee_est) − delta` (cut) / `+ delta` (bulk), `last_adjusted_at = now()`, upsert profile, refetch. `too_fast` shows a warning card with no button ("Losing {|slope|} lb/wk — faster than {rate + 0.75}. Consider adding 100–200 kcal."). `on_track` and `insufficient_data` show nothing on the dashboard (trend info lives in the weigh-in card).

## UI

**Weigh-in card** (dashboard, above the macro grid):
- Not logged today → number input (`inputMode="decimal"`, placeholder = last weight) + **Save**. Saves as today's local date.
- Logged today → `170 lb` big, then `trend 203.9 · −1.2 lb/wk` (slope shown only when not null). Tap number to edit (re-save upserts).
- Whole card links to `/weight`.

**`/weight` page:**
- Chart: hand-rolled inline SVG (no chart library) — raw weigh-ins as dots, EMA trend as a line, y-axis auto-ranged with 1-lb padding, x-axis with 3–5 date ticks. Range toggle **30 / 90 / All** (default 30). Dark theme tokens from `globals.css`.
- Below: list of weigh-ins (newest first) with the raw value and a delete action (confirm-less; deleting today's re-opens the input on the dashboard).
- Header with Back link, matching `/profile`.

Visual design goes through a 12ui draft pass (reference: the existing app's look) before the implementation plan is written; the chosen candidate's layout is what the plan implements.

**`lib/weighins.ts`** — `listWeighIns(sinceDate?)`, `upsertWeighIn(date, weight_lb)`, `deleteWeighIn(id)`; `applyAdjustment(profile, delta)` lives in `lib/profile.ts`.

## Testing

`lib/trend.test.ts` with the reference cases above. Manual: log a weigh-in, see it on dashboard and chart; edit it; delete it; confirm dashboard targets change when trend weight differs from profile seed; force a stall by inserting 14 flat rows in the SQL editor and confirm the suggestion card and Apply.

## Out of scope

Vault sync of weights; adaptive TDEE; body-fat or measurements; weekly averages export; notifications/reminders to weigh in.
