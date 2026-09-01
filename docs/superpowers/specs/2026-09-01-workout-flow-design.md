# Workout Flow — Design

Sub-project 3 of the Gainz roadmap. Depends on nothing new; touches the `lifts` table and the offline queue from sub-project 0 (the original app).

## Purpose

Replace the free-text "Log lift" form with a gym-native flow: pick muscle groups → pick an exercise from a list (recently used on top) → spin wheels for sets / reps / weight → tap **Add** → repeat → **Complete workout** → summary. Every set is saved the moment it is added; nothing is lost to a dead battery or a basement with no signal.

Decisions taken in brainstorming (2026-09-01):
- Exercise list is a **generic library** grouped by muscle, with a **Recently used** section pinned on top and an add-your-own escape hatch.
- Set entry is **sets × reps × weight in one tap**, where *sets* is a multiplier. A drop set (95s → 90s) is a second tap with the weight wheel spun down. One row in `lifts` per tap.
- A workout is a **session row** that groups its sets; sets save as they are added; Complete stamps the end and shows a summary.
- **"Last time" is shown** for the exercise being logged (one line) and the wheels pre-set to the last top set. Full PR/progress tracking stays in sub-project 7.

## Data model

```sql
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  muscle_groups text[] not null default '{}'
);

alter table workouts enable row level security;

create policy "own workouts" on workouts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table lifts add column if not exists workout_id uuid references workouts(id);
create index if not exists lifts_workout_id_idx on lifts (workout_id);
```

- `workouts.id` is **generated on the phone** (`crypto.randomUUID()`) so sets can reference it before the row has reached Supabase (see Offline). The column default is only a fallback.
- `ended_at is null` means the workout is active. At most one active workout per user is expected; if several exist (crash mid-flow, two tabs), the most recently started one is "the" active workout and the others are ignored until they are completed from their own URL.
- `lifts` keeps its existing shape. A row is still `sets × reps @ weight`, exactly what one **Add** tap produced. `workout_id` is nullable so historic rows and rows logged via chat/vault stay valid. `synced_to_vault` and `vault_sync.py` are **untouched** — new rows sync into the Daily note's Lifts table exactly as before (`| DB Chest Press | 1x6 | 95 lbs | |`).
- No `set_number` column: order within a workout is `logged_at`.

## Exercise library — `lib/exercises.ts` (static, no I/O)

```ts
export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings_glutes" | "core";

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string }[]; // display order as above
export const PRESETS: Record<"upper" | "lower", MuscleGroup[]>;
// upper = chest, back, shoulders, biceps, triceps · lower = quads, hamstrings_glutes, core

export type Exercise = { name: string; muscles: MuscleGroup[] };
export const EXERCISES: Exercise[]; // ~120–150 entries
```

- Names are short gym names in George's existing style: `DB` = dumbbell, `BB` = barbell, machine/cable spelled out — e.g. `DB Chest Press`, `Incline DB Press`, `BB Bench Press`, `Seated Shoulder Press`, `Lat Pulldown`, `Cable Row`, `Leg Press`, `Romanian Deadlift`, `Single Arm Tricep Extension`. The indicator lifts from Cut Protocol must be present under exactly these names: `DB Chest Press`, `Seated Shoulder Press`, `Back Squat`, `Leg Press`, `Romanian Deadlift`.
- An exercise can carry several muscles (e.g. `Incline DB Press` → chest, shoulders). It appears under each ticked group it matches, once.
- **`exercisesFor(groups: MuscleGroup[]): Exercise[]`** — library entries whose `muscles` intersect `groups`, in library order (sorted by name within a group when rendered).
- **`searchExercises(query: string): Exercise[]`** — case-insensitive substring match on `name` across the whole library (search ignores the ticked groups, so a mis-ticked day is not a dead end).
- History matching is **case-insensitive, whitespace-trimmed** on `lifts.exercise`. One-time backfill: the existing Supabase row `DB Chest press` is renamed to `DB Chest Press` so the indicator series stays on one name (vault notes are not touched).

## Recently used & last time — `lib/workouts.ts`

**`recentExercises(rows: LiftRow[], groups: MuscleGroup[], limit = 8): string[]`** — distinct `exercise` names from `rows` (already newest-first), deduped case-insensitively, keeping the first-seen casing. An exercise is included if it is **not in the library** (custom name — always shown) **or** its library `muscles` intersect `groups`. Returns at most `limit`.

**`lastSession(exercise: string, rows: LiftRow[]): LiftRow[]`** — `rows` filtered to `exercise` (case-insensitive), newest-first. Take the most recent row; the session is every row sharing its `workout_id` — or, when that is `null` (historic / chat-logged), every row with the same local calendar date. Returned **oldest-first** so the display reads in set order. Empty array when the exercise has never been logged.

**`formatSession(rows): string`** — one token per row, `"{weight}×{reps}"`, suffixed with `" ×{sets}"` only when `sets > 1`, joined with `", "`. Examples: `95×6, 90×7`; `130×8 ×3`.

**`e1rm(weight, reps) = weight × (1 + reps / 30)`** (Epley, as in Cut Protocol). **`bestE1rm(rows): number | null`** — max over rows, `null` for no rows.

**`beatLastTime(current: LiftRow[], previous: LiftRow[]): boolean`** — `bestE1rm(current) > bestE1rm(previous)`, false when either is `null`.

`LiftRow = { id, exercise, sets, reps, weight, logged_at, workout_id: string | null }`.

Data access (thin, in the same file): `startWorkout(groups)` (client id, queued insert), `endWorkout(id)` (queued update `ended_at = now`), `deleteWorkout(id)` (direct, only for the empty-workout case), `getActiveWorkout()`, `getWorkout(id)`, `listLiftsForWorkout(id)`, `listRecentLifts(limit = 400)` (newest-first, used for recents + last-time), `logSet({ workout_id, exercise, sets, reps, weight })` → `enqueueOrSend`.

## Flow & screens

**Dashboard (`/`)** — the `+ Lift` button becomes **Start workout** → `/workout/new`. When an active workout exists it becomes **Resume workout · 34 min** → `/workout/[id]`. The "Today's lifts" list stays as is (it already updates via the `lifts` realtime channel). `app/log/lift/page.tsx` is deleted.

**`/workout/new`** — grid of the 8 muscle groups as toggle tiles, plus two preset chips **Upper** / **Lower** above the grid that set the selection (tapping a chip replaces the current selection with the preset; tiles can then be adjusted). **Start workout** is disabled until at least one group is ticked. Tapping Start creates the workout and navigates to `/workout/[id]`. If an active workout already exists when this page loads, it redirects to that workout instead.

**`/workout/[id]` — active** (when `ended_at` is null):
- Header: elapsed time since `started_at` (`34:12`, ticking every second), the muscle-group labels, Back link to `/`.
- Search box (filters the whole library as you type; when non-empty it replaces both sections below with the matches).
- **Recently used** section (from `recentExercises`; hidden when empty).
- One section per ticked group in display order, listing `exercisesFor` entries for that group, names sorted A–Z. An exercise already logged in this workout shows a badge with its set count (`3 sets`).
- **Add exercise** row at the very bottom: free-text input + Add; the name becomes a custom exercise for this workout (it opens the set sheet immediately) and will later surface via Recently used.
- Tapping an exercise opens the **set sheet** (a bottom sheet / full-height panel, mobile-first):
  - Exercise name; under it one muted line `Last: 95×6, 90×7 · Aug 31` (or `First time` when `lastSession` is empty).
  - Three scroll wheels: **sets** 1–10, **reps** 1–30, **weight** 0–500 lb in 2.5 lb steps. Pre-set to the last session's first row (`sets`, `reps`, `weight`); default `1 / 8 / 0` when there is no history. Within a workout the wheels keep their last position for that exercise.
  - **Add** button. On tap: `logSet` is called immediately (queued if offline), a row is appended to the list below (`1 · 95 × 6`, `2 · 90 × 7 ×3`), and the wheels stay where they are.
  - Close/back returns to the exercise list.
- **Complete workout** button fixed at the bottom. If the workout has **no sets**, Complete deletes the workout row and returns to `/` (no summary). Otherwise it calls `endWorkout` and the page re-renders as the summary.

**`/workout/[id]` — summary** (when `ended_at` is set):
- Duration (`ended_at − started_at`), muscle groups, date.
- Per exercise: name, its sets formatted with `formatSession`, and **▲** when `beatLastTime(thisWorkout, lastSessionBeforeThisWorkout)` — "previous" is computed from rows with `logged_at < started_at`.
- **Done** → `/`. Revisiting the URL later shows the same summary (no editing).

**Scroll wheel — `components/Wheel.tsx`** — hand-rolled, no library: a vertical list with `scroll-snap-type: y mandatory`, fixed item height, ~5 items visible, the centre item highlighted, `onChange` fired when scrolling settles (`scrollend` with a `scroll`-debounce fallback). Programmatic `scrollTo` on mount/preset. Props: `values: number[]`, `value`, `onChange`, optional `format`.

Visual design goes through a **12ui draft pass** (reference: the existing app's look — `docs/superpowers/design/2026-08-30-weight-page-12ui-A.png` and a dashboard screenshot) before the implementation plan is written; the chosen candidate's layout is what the plan implements. The screens to draft: muscle-group picker, exercise list, set sheet, summary.

## Offline

All workout writes go through the existing queue (`lib/queue.ts`), generalised from `kind: "meal" | "lift"` to `{ table: "meals" | "lifts" | "workouts"; op: "insert" | "update" }`:
- `insert` keeps today's semantics (client UUID as primary key; `23505` = already landed).
- `update` is `supabase.from(table).update(entry).eq("id", id)` and is idempotent by construction (the only update is `ended_at`).
- Items already sitting in IndexedDB in the old `{ kind }` shape are read as `{ table: kind === "meal" ? "meals" : "lifts", op: "insert" }`.
- **Flush stops at the first transient failure** (`break`, not `continue`) so FIFO order is preserved: a set can never reach Supabase before the workout row it references. Permanent rejections still dead-letter and continue, as today.
- Because the workout id is generated on the phone, the active-workout page works entirely from local state while offline: it does not need `getWorkout` to succeed to render — it carries `started_at` and `muscle_groups` in navigation state / `sessionStorage` and falls back to fetching when that is missing (e.g. Resume from the dashboard).
- The dashboard's Resume card relies on `getActiveWorkout()` (a read), so it appears once the workout row has landed; that is acceptable.

## Out of scope

Rest timer; editing or deleting a set after Add; supersets; workout templates / routines; PR history and progress graphs (sub-project 7); syncing a workout header or duration into the vault; any change to `vault_sync.py`.

## Testing

Vitest, pure functions only:
- `exercisesFor`: intersects correctly; multi-muscle exercise appears for either group; empty groups → empty. `searchExercises`: case-insensitive, substring, ignores groups.
- `recentExercises`: dedupes case-insensitively keeping first casing; custom names always included; library names filtered by group; honours `limit`; preserves newest-first order.
- `lastSession`: picks the most recent workout's rows (by `workout_id`), falls back to same-local-date grouping for `workout_id = null`, returns oldest-first, empty for unknown exercise.
- `formatSession`: `95×6, 90×7`; `130×8 ×3`; empty → `""`.
- `e1rm(95, 6) ≈ 114`; `beatLastTime`: strict greater, false on missing history, false when equal.
- Queue: an `update` item calls `.update().eq("id")`; an old `{ kind: "lift" }` item is normalised; flush breaks on the first transient failure and keeps later items; permanent failure dead-letters and continues.

Screens are checked on the phone after deploy: start Upper → log DB Chest Press 95×6 then 90×7 → badge shows `2 sets` → Complete → summary shows both rows → Daily note gets two Lifts rows within 20 min.
