# HUB + Tabs (Diet / Performance) — Design

Sub-project "IA" of the Gainz roadmap, pulled forward from "after core" on 2026-09-01 after the first hands-on with sub-project 3. Depends on sub-projects 1 (targets), 2 (weigh-ins/trend) and 3 (workouts). Pulls roadmap #7 (lift progress / PRs) into this build; adds a simple placeholder for roadmap #5 (next-meal advice).

## Purpose

Turn the single dashboard into a three-tab app. **HUB** is "today": the biggest thing on screen is calories left, drawn as a ring that fills as you eat; smaller rings for protein / carbs / fat; log buttons; a next-meal hint; today's meals and workout; a small weigh-in row at the bottom. **DIET** and **PERFORMANCE** are the in-depth tabs: graphs and history.

Decisions taken in brainstorming (2026-09-01):
- Tabs: **HUB · DIET · PERFORMANCE**. Health/sleep (Oura) joins PERFORMANCE later; not in this build.
- HUB body below the rings = today only (compact) **plus** a next-meal advice card.
- Over target the big ring draws a **second lap in red** on top of the full lime ring; centre shows the overage.
- PERFORMANCE ships with workout history **and** per-exercise progress (e1RM chart, best set, recent sessions) — roadmap #7 folded in.

## Navigation

- Bottom tab bar (`components/TabBar.tsx`) rendered on `/`, `/diet`, `/performance`. Three items with icon + label; active item lime, others muted. Safe-area padding at the bottom (`pb-[env(safe-area-inset-bottom)]`). Page content gets `pb-24` so nothing hides behind the bar.
- Full-screen pushes without the bar, each with a `‹` back link: `/workout/new`, `/workout/[id]`, `/profile`.
- `/weight` is **removed**; its content moves into DIET. `/log/meal` stays as a push (unchanged).
- Implementation: a `app/(tabs)/layout.tsx` route group wraps the three tab pages with `<TabBar />`; the pushes live outside the group. Existing `AuthGuard` behaviour unchanged.

## HUB (`/`)

Top to bottom, in one scrolling column (`max-w-md`, `px-4`):

1. **Header** — "Gainz" wordmark left, small date ("Mon Sep 1") right. No profile link here (it lives in DIET).
2. **Calorie ring** — hero, `components/Ring.tsx`, 200 px. Centre: remaining kcal as the biggest number on the screen (`text-5xl font-bold tabular-nums`), the word `left` beneath in muted; when over: `−180` in red and `over`. Below the ring, one muted line: `1,360 / 2,600 eaten`.
3. **Macro rings** — three `Ring`s at 72 px in a row: **P**, **C**, **F**. Centre = grams left (or `−12` red when over), label + `/206g` under each. Same fill and overage rules as the big ring.
4. **Actions** — `Log meal` (lime, → `/log/meal`) and `Start workout` / `Resume · 34 min` (→ `/workout/new` or the active workout), same components as today.
5. **Next meal** card — `Next meal · ~620 kcal · 52 P · 70 C · 17 F`. Muted subtitle `2 of 4 meals logged`. Tap → `/log/meal`. Rules in **Next-meal math** below. This is the roadmap #5 slot; the time-aware version replaces the math later without moving the card.
6. **Today** — eyebrow `Today`. Meals as one-line rows `Greek yogurt, nonfat · 180 kcal` (newest last). Then the workout as one row: `Upper · 12 sets · 41:07 ›` (→ its summary) when a workout was completed today; `Resume workout · 34 min ›` when one is active; `No workout yet` muted otherwise. Empty meals → `Nothing logged yet`.
7. **Weigh-in row** — small, last: `170 lb · trend 203.9 · −1.2 lb/wk`; not logged today → `Log weigh-in ›` with the inline number input on tap (reuse `WeighInCard` logic in a compact variant, `WeighInCard` gains a `compact` prop). No stall/too-fast card here — moved to DIET.

Targets come from `computeTargets({ ...profile, weight_lb: trendWeight ?? profile.weight_lb })` exactly as today. No profile yet → the ring area shows the existing "Set up your targets" card instead of rings.

## Ring — `components/Ring.tsx` (pure SVG, no library)

Props: `{ size: number; stroke: number; value: number; target: number; children }`. Draws a muted full circle (`border` token), a lime arc for `min(value, target) / target`, and — when `value > target` — a red arc for `min(value − target, target) / target` drawn on top starting at 12 o'clock (a second lap that visually overlays the first). Arcs use `stroke-dasharray` / `stroke-dashoffset` on a circle rotated −90°, round line caps, and a 300 ms CSS transition on `stroke-dashoffset`. `children` render centred. `target <= 0` → empty muted ring, no arcs.

`lib/hub.ts` (pure, tested):
- `ringFractions(value, target): { fill: number; over: number }` — `fill = clamp(value / target, 0, 1)`, `over = clamp((value − target) / target, 0, 1)`, both `0` when `target <= 0`.
- `remaining(value, target): number` — `target − value` (negative when over).

## Next-meal math — `lib/hub.ts`

`nextMeal(totals, targets, mealsLogged, mealsPerDay = 4): { kcal, protein_g, carbs_g, fat_g, mealsLeft } | null`
- `mealsLeft = max(mealsPerDay − mealsLogged, 1)`; each macro = `max(remaining, 0) / mealsLeft`, rounded to the nearest 10 kcal / 1 g.
- `mealsLogged` = number of meal rows today (each logged food counts as a meal for now — good enough for a placeholder; the real #5 groups by time).
- Returns `null` when remaining kcal ≤ 0 (card then reads `Target hit for today` in muted).

## DIET (`/diet`)

1. **Weight** — the current `/weight` page content: `WeightChart` with 30 / 90 / All toggle, then the stall / too-fast `ProgressCard` (with Apply, cooldown as today), then the weigh-in history list with delete.
2. **Meals, last 7 days** — one collapsible row per local day: `Sun Aug 31 · 2,383 kcal · 190 P` with a kcal-vs-target bar; expanded → that day's meal rows with grams and macros. Today first. Data: `meals` where `logged_at ≥ start of (today − 6 days)`, grouped by local date (reuse `localDateKey`).
3. **Targets** — one row `Targets · 2,600 kcal · 206 P · 293 C · 67 F ›` → `/profile`.

## PERFORMANCE (`/performance`)

1. **Indicator lifts** — pinned card, from Cut Protocol: `DB Chest Press` (baseline 111.0), `Seated Shoulder Press` (141.8), `Back Squat` / `Leg Press` and `Romanian Deadlift` (baseline = first logged session's best e1RM). Each row: name · latest e1RM · `+3.2 %` vs baseline (lime ≥ 0, red < 0, `−5 %` / `−8 %` thresholds from the protocol colour the badge amber/red). Baselines and thresholds are constants in `lib/progress.ts` (`INDICATORS`), editable in code — no UI for them.
2. **Workout history** — one row per workout with `ended_at`: `Mon Sep 1 · Upper · 12 sets · 41:07 ›` → `/workout/[id]` summary. Newest first, 30 most recent.
3. **Exercise progress** — a chip row of exercises (recently used first, then the rest of the logged names). Selecting one shows: a small inline-SVG line chart of best e1RM per session (last 12 sessions), `Best: 95×6 · e1RM 114 · Aug 31`, and a table of the last 5 sessions (`Sep 1 · 95×6, 90×7`). Default selection = the most recently logged exercise.

`lib/progress.ts` (pure, tested):
- `sessionsFor(exercise, rows): { key: string; date: string; rows: LiftRow[]; best: number }[]` — groups `rows` (any order) by `workout_id`, falling back to local date for `null`, sorted ascending by date; `best = bestE1rm(rows)`.
- `bestSet(rows): LiftRow | null` — the row with the highest e1RM.
- `indicatorStatus(name, rows): { latest: number | null; baseline: number | null; pct: number | null; level: "ok" | "warn" | "bad" | "none" }` — `warn` at `≤ −5 %`, `bad` at `≤ −8 %`.
- `INDICATORS: { name: string; baseline: number | null }[]`.

Charts: `components/LineChart.tsx` — generic inline-SVG polyline with dots and 3–5 x ticks, y auto-ranged with padding, extracted from the existing `WeightChart` approach (WeightChart itself is not refactored in this build).

## Data

No new tables. Reads: `meals` (today; last 7 days), `lifts` (all, newest-first, `listRecentLifts(2000)`), `workouts` (completed, 30), `weigh_ins`, `profiles`. Realtime: the HUB keeps today's `meals`/`lifts` channels as now.

## Visual design

12ui draft of the HUB (hero ring is the decision that matters) with the existing look as reference, then a branch of the chosen HUB into DIET and PERFORMANCE screens; the chosen layouts are what the plan implements. Diagram thumbnails remain deferred.

## Out of scope

Oura / sleep / readiness; meal patterns (#4); time-aware next-meal advice (#5 proper — only the placeholder math ships); editing past entries; rest timer; the HUB/DIET/PERFORMANCE split of settings.

## Testing

Vitest, pure functions: `ringFractions` (under, exact, over, double-over clamp, zero target), `remaining`, `nextMeal` (meals left floor of 1, rounding, null when target hit), `sessionsFor` (workout_id grouping, date fallback, ordering, best), `bestSet`, `indicatorStatus` (levels at −4.9 / −5 / −8 %, no data). Screens checked on the phone after deploy: ring at 1,360 / 2,600 shows 1,240 left and ~52 % lime; log 1,500 more → red second lap and `−260 over`; DIET shows the weight chart and yesterday's meals; PERFORMANCE lists today's workout and the DB Chest Press chart.
