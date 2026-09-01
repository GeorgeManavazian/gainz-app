# Workout Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text lift form with a gym-native flow — pick muscle groups → pick an exercise (recently used on top) → spin sets/reps/weight wheels → Add (saves immediately) → Complete workout → summary.

**Architecture:** A static exercise library (`lib/exercises.ts`) and pure session logic (`lib/workouts.ts`) with vitest coverage; a `workouts` table (client-generated id, `ended_at` null while active) plus a nullable `lifts.workout_id`; the offline queue generalised to table + op with strict FIFO; three client pages (`/workout/new`, `/workout/[id]` active, `/workout/[id]` summary) whose layout comes from 12ui candidate C and its branch screens; the dashboard swaps "+ Lift" for Start/Resume workout.

**Tech Stack:** Next.js 16 App Router (client components), TypeScript strict, Tailwind v4, Supabase JS v2, idb-keyval, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-01-workout-flow-design.md`

## Global Constraints

- Next.js is **16.x** — pages are `"use client"`; only `next/link`, `next/navigation` (`useRouter`, `useParams`), React hooks. Consult `node_modules/next/dist/docs/01-app/` before using any Next API not already in the repo.
- Repo alias `@/*` → repo root. Test files import siblings relatively (`./exercises`). Task 3 adds `vitest.config.ts` so `@/` resolves in tests that need it.
- `lib/exercises.ts` and `lib/workouts.ts` have **no I/O** (`lib/workouts.ts` may import types/functions from `./exercises` only). Data access lives in `lib/workouts-db.ts`.
- Muscle groups (exact ids, display order): `chest, back, shoulders, biceps, triceps, quads, hamstrings_glutes, core`. Presets: `upper = chest, back, shoulders, biceps, triceps`; `lower = quads, hamstrings_glutes, core`.
- Indicator lifts must exist in the library under exactly: `DB Chest Press`, `Seated Shoulder Press`, `Back Squat`, `Leg Press`, `Romanian Deadlift`.
- Wheel ranges: sets `1–10`, reps `1–30`, weight `0–500` step `2.5`. Defaults with no history: `1 / 8 / 0`.
- History matching on `lifts.exercise` is case-insensitive and whitespace-trimmed.
- Every set is saved on **Add** through `lib/queue.ts`. Flush is strict FIFO: stop at the first transient failure. If anything is queued, new writes are queued too (never overtake).
- `vault_sync.py`, `supabase/schema.sql`'s existing blocks, and the `lifts` row shape (`sets × reps @ weight`) are untouched except for the new nullable `workout_id` column.
- UI uses the tokens in `app/globals.css` (`bg-background bg-surface bg-surface-2 border-border text-foreground text-muted bg-accent text-accent-foreground text-danger text-success`). Layout follows the design reference below.
- Thumbnail slot: `h-14 w-14 rounded-xl bg-surface-2` with the muscle-group short label (`CH`, `BK`, `SH`, `BI`, `TR`, `QD`, `HG`, `CO`) in `text-[11px] font-semibold text-muted`; custom exercises show `••`. Real illustrations are deferred — do not add image assets.
- Work on branch `feat/workout-flow` in place (no worktree — `.env.local` is untracked).
- Commit after every task, conventional prefix, imperative, with trailer lines:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KbLNh2DWWkPGKSGVbW2Fp4
  ```

## Design reference

Images (1024×1536 = **2× of a 512-px frame**; divide by 2, snap to the nearest Tailwind step; colors snap to tokens):
- Active screen + set sheet: `docs/superpowers/design/2026-09-01-workout-12ui-C.png` (chosen)
- Picker: `…/2026-09-01-workout-branch-a-new-workout.png` — drop the timer, the ⓘ icons, and the body images
- List (sheet closed): `…/2026-09-01-workout-branch-b-exercise-list.png` — drop the Exercises/Overview tabs and filter icon; Recently used stays as **rows** like C
- Summary: `…/2026-09-01-workout-branch-c-summary.png` — keep check + title + meta + trimmed stats strip + exercise cards + Done; drop per-set arrows, "Matched" pills, "Great work!" card
- Converted HTML for reference only (not to be copied): `docs/superpowers/design/2026-09-01-workout-html/`

| Element | Implement as |
|---|---|
| Page shell | `<main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">` (`pb-28` leaves room for the sticky button) |
| Header row | `flex items-center justify-between`; left: `<Link href="/" className="text-accent text-2xl leading-none">‹</Link>` + `<h1 className="text-xl font-bold tracking-tight">` ; right: timer pill |
| Timer pill | `rounded-full border border-accent/40 px-3 py-1.5 text-lg font-semibold tabular-nums text-accent` with `⏱` before the time |
| Search field | `w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-accent focus:outline-none` |
| Section eyebrow | `text-[11px] font-medium uppercase tracking-wider text-muted` |
| List card | `overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border` |
| Exercise row | `flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2`; thumb slot; name `flex-1 text-[17px] font-medium`; chevron `text-muted` |
| Row with sets | name `text-accent`; badge `rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent` (`2 sets`) |
| Bottom sheet | `fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl`; grabber `mx-auto mb-3 h-1 w-10 rounded-full bg-border`; backdrop `fixed inset-0 z-10 bg-black/60` |
| Sheet title | `text-[22px] font-bold`; "Last:" line `text-sm text-muted` |
| Wheel column | label `text-[11px] uppercase tracking-wider text-muted text-center mb-1`; wheel `h-40 w-[92px]`; selected row `rounded-xl border border-border bg-surface-2`; selected value `text-[22px] font-bold text-accent`; other values `text-lg text-muted` |
| Wheel separator | `text-xl text-muted` `×` between columns |
| Add set | `w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80` |
| Set rows | index `flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted`; text `text-base tabular-nums` (`95 × 6`, `130 × 8 ×3`); lime `✓` right |
| Sticky bottom button | wrapper `fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3`; button `w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80` |
| Picker preset cards | `grid grid-cols-2 gap-3`; card `rounded-2xl border border-border bg-surface p-4 text-left active:bg-surface-2`; title `text-lg font-bold`; subtitle `text-[13px] text-muted`; selected preset gets `border-accent` |
| Picker rows | each its own card `flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 active:bg-surface-2`; checkbox `h-5 w-5 rounded-md border` (`border-accent bg-accent/20` + lime `✓` when ticked, `border-border` otherwise); label `text-lg font-semibold`; ticked card `border-accent/60` |
| Picker count card | `rounded-2xl border border-border bg-surface px-4 py-3`; `3 targets selected` `text-base`; names `text-[13px] text-muted` |
| Summary hero | centered: check ring `mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent text-2xl text-accent`; title `text-3xl font-bold`; meta `text-[15px] text-muted` (`Upper · Sep 1 at 10:48 AM`), duration below `text-[15px] text-muted tabular-nums` |
| Stats strip | card `rounded-2xl border border-border bg-surface p-4`; heading `text-base font-semibold`; `grid grid-cols-3 divide-x divide-border` cells: number `text-[22px] font-bold tabular-nums`, label `text-xs text-muted` |
| Summary exercise card | `rounded-2xl border border-border bg-surface p-4`; top row: `h-20 w-20` thumb slot, name `text-lg font-semibold`, pill `rounded-full bg-accent/15 px-3 py-1 text-[13px] font-semibold text-accent` (`Beat last time`); set rows as above without the ✓ |

---

### Task 1: Schema block + backfill

**Files:**
- Modify: `supabase/schema.sql` (append)

**Interfaces:**
- Produces: table `workouts(id uuid pk, user_id, started_at, ended_at, muscle_groups text[])`; column `lifts.workout_id uuid null`.

- [ ] **Step 1: Append the block to `supabase/schema.sql`**

```sql

-- Sub-project 3: workouts (paste this block only — the blocks above already exist)
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

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: workouts table and lifts.workout_id (schema block)"
```

- [ ] **Step 3: Manual (George pastes, Claude backfills) — recorded here, not done by the subagent**

George pastes the block above into Supabase → SQL Editor → Run. Then Claude, using `~/.config/gainz/supabase_sync.json` (service role), renames the one historic row so the indicator series stays on one name:

```
PATCH /rest/v1/lifts?exercise=eq.DB%20Chest%20press   body {"exercise":"DB Chest Press"}
```

Deploy (push main) only after the SQL has run.

---

### Task 2: Exercise library — `lib/exercises.ts`

**Files:**
- Create: `lib/exercises.ts`
- Test: `lib/exercises.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MuscleGroup = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "quads" | "hamstrings_glutes" | "core";
  export const MUSCLE_GROUPS: { id: MuscleGroup; label: string; short: string }[];
  export const PRESETS: Record<"upper" | "lower", MuscleGroup[]>;
  export type Exercise = { name: string; muscles: MuscleGroup[] };
  export const EXERCISES: Exercise[];
  export function normalizeName(s: string): string;              // trim + lowercase
  export function findExercise(name: string): Exercise | undefined;
  export function exercisesFor(groups: MuscleGroup[]): Exercise[];
  export function searchExercises(query: string): Exercise[];
  export function muscleLabel(id: MuscleGroup): string;
  export function muscleShort(id: MuscleGroup | undefined): string; // "••" when undefined
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/exercises.test.ts
import { describe, it, expect } from "vitest";
import { EXERCISES, MUSCLE_GROUPS, PRESETS, exercisesFor, findExercise, muscleShort,
  normalizeName, searchExercises } from "./exercises";

describe("library shape", () => {
  it("has the 8 muscle groups in display order", () => {
    expect(MUSCLE_GROUPS.map((m) => m.id)).toEqual([
      "chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings_glutes", "core"]);
  });
  it("presets", () => {
    expect(PRESETS.upper).toEqual(["chest", "back", "shoulders", "biceps", "triceps"]);
    expect(PRESETS.lower).toEqual(["quads", "hamstrings_glutes", "core"]);
  });
  it("contains the indicator lifts under their exact names", () => {
    for (const n of ["DB Chest Press", "Seated Shoulder Press", "Back Squat", "Leg Press", "Romanian Deadlift"]) {
      expect(findExercise(n)?.name).toBe(n);
    }
  });
  it("has no duplicate names (case-insensitive) and every exercise has ≥1 muscle", () => {
    const seen = new Set<string>();
    for (const e of EXERCISES) {
      expect(seen.has(normalizeName(e.name))).toBe(false);
      seen.add(normalizeName(e.name));
      expect(e.muscles.length).toBeGreaterThan(0);
    }
    expect(EXERCISES.length).toBeGreaterThanOrEqual(100);
  });
});

describe("exercisesFor", () => {
  it("returns entries whose muscles intersect the groups", () => {
    const chest = exercisesFor(["chest"]);
    expect(chest.some((e) => e.name === "DB Chest Press")).toBe(true);
    expect(chest.some((e) => e.name === "Lat Pulldown")).toBe(false);
  });
  it("multi-muscle exercise appears for either group, once for both", () => {
    const incline = (g: Parameters<typeof exercisesFor>[0]) =>
      exercisesFor(g).filter((e) => e.name === "Incline DB Press").length;
    expect(incline(["chest"])).toBe(1);
    expect(incline(["shoulders"])).toBe(1);
    expect(incline(["chest", "shoulders"])).toBe(1);
  });
  it("empty groups → empty", () => expect(exercisesFor([])).toEqual([]));
});

describe("searchExercises / findExercise", () => {
  it("is case-insensitive substring and ignores groups", () => {
    expect(searchExercises("lat pull").map((e) => e.name)).toContain("Lat Pulldown");
    expect(searchExercises("LAT PULL").map((e) => e.name)).toContain("Lat Pulldown");
  });
  it("empty query → empty", () => expect(searchExercises("   ")).toEqual([]));
  it("findExercise trims and ignores case", () => {
    expect(findExercise("  db chest press ")?.name).toBe("DB Chest Press");
    expect(findExercise("Nope")).toBeUndefined();
  });
  it("muscleShort", () => {
    expect(muscleShort("chest")).toBe("CH");
    expect(muscleShort("hamstrings_glutes")).toBe("HG");
    expect(muscleShort(undefined)).toBe("••");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/exercises.test.ts`
Expected: FAIL — cannot resolve `./exercises`.

- [ ] **Step 3: Write the library**

```ts
// lib/exercises.ts
export type MuscleGroup =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps"
  | "quads" | "hamstrings_glutes" | "core";

export const MUSCLE_GROUPS: { id: MuscleGroup; label: string; short: string }[] = [
  { id: "chest", label: "Chest", short: "CH" },
  { id: "back", label: "Back", short: "BK" },
  { id: "shoulders", label: "Shoulders", short: "SH" },
  { id: "biceps", label: "Biceps", short: "BI" },
  { id: "triceps", label: "Triceps", short: "TR" },
  { id: "quads", label: "Quads", short: "QD" },
  { id: "hamstrings_glutes", label: "Hams & Glutes", short: "HG" },
  { id: "core", label: "Core", short: "CO" },
];

export const PRESETS: Record<"upper" | "lower", MuscleGroup[]> = {
  upper: ["chest", "back", "shoulders", "biceps", "triceps"],
  lower: ["quads", "hamstrings_glutes", "core"],
};

export type Exercise = { name: string; muscles: MuscleGroup[] };

const e = (name: string, ...muscles: MuscleGroup[]): Exercise => ({ name, muscles });

export const EXERCISES: Exercise[] = [
  // chest
  e("DB Chest Press", "chest", "triceps"),
  e("Incline DB Press", "chest", "shoulders"),
  e("Decline DB Press", "chest"),
  e("BB Bench Press", "chest", "triceps"),
  e("Incline BB Bench Press", "chest", "shoulders"),
  e("Decline BB Bench Press", "chest"),
  e("Machine Chest Press", "chest"),
  e("Incline Machine Press", "chest", "shoulders"),
  e("Smith Machine Bench Press", "chest"),
  e("Smith Machine Incline Press", "chest", "shoulders"),
  e("Pec Deck", "chest"),
  e("Cable Fly", "chest"),
  e("Low Cable Fly", "chest"),
  e("High Cable Fly", "chest"),
  e("DB Fly", "chest"),
  e("Incline DB Fly", "chest"),
  e("Push-Up", "chest", "triceps"),
  e("Weighted Push-Up", "chest", "triceps"),
  e("Dip", "chest", "triceps"),
  e("Weighted Dip", "chest", "triceps"),
  e("DB Pullover", "chest", "back"),
  // back
  e("Lat Pulldown", "back"),
  e("Close Grip Lat Pulldown", "back"),
  e("Single Arm Lat Pulldown", "back"),
  e("Straight Arm Pulldown", "back"),
  e("Pull-Up", "back", "biceps"),
  e("Weighted Pull-Up", "back", "biceps"),
  e("Chin-Up", "back", "biceps"),
  e("Assisted Pull-Up", "back", "biceps"),
  e("Cable Row", "back"),
  e("Seated Cable Row", "back"),
  e("Single Arm Cable Row", "back"),
  e("Chest Supported Row", "back"),
  e("Machine Row", "back"),
  e("T-Bar Row", "back"),
  e("BB Row", "back"),
  e("Pendlay Row", "back"),
  e("Single Arm DB Row", "back"),
  e("DB Row", "back"),
  e("Meadows Row", "back"),
  e("Inverted Row", "back"),
  e("Deadlift", "back", "hamstrings_glutes"),
  e("Trap Bar Deadlift", "back", "quads", "hamstrings_glutes"),
  e("Rack Pull", "back"),
  e("Face Pull", "back", "shoulders"),
  e("Reverse Pec Deck", "back", "shoulders"),
  e("BB Shrug", "back"),
  e("DB Shrug", "back"),
  e("Back Extension", "back", "hamstrings_glutes"),
  // shoulders
  e("Seated Shoulder Press", "shoulders", "triceps"),
  e("Standing Shoulder Press", "shoulders", "triceps"),
  e("Seated DB Shoulder Press", "shoulders", "triceps"),
  e("Arnold Press", "shoulders"),
  e("Machine Shoulder Press", "shoulders", "triceps"),
  e("Smith Machine Shoulder Press", "shoulders", "triceps"),
  e("Overhead Press", "shoulders", "triceps"),
  e("Push Press", "shoulders", "triceps"),
  e("Landmine Press", "shoulders", "chest"),
  e("DB Lateral Raise", "shoulders"),
  e("Cable Lateral Raise", "shoulders"),
  e("Machine Lateral Raise", "shoulders"),
  e("Leaning Lateral Raise", "shoulders"),
  e("DB Front Raise", "shoulders"),
  e("Plate Front Raise", "shoulders"),
  e("Rear Delt Fly", "shoulders", "back"),
  e("Cable Rear Delt Fly", "shoulders", "back"),
  e("Upright Row", "shoulders", "back"),
  // biceps
  e("BB Curl", "biceps"),
  e("EZ Bar Curl", "biceps"),
  e("DB Curl", "biceps"),
  e("Alternating DB Curl", "biceps"),
  e("Incline DB Curl", "biceps"),
  e("Hammer Curl", "biceps"),
  e("Cross Body Hammer Curl", "biceps"),
  e("Preacher Curl", "biceps"),
  e("Machine Preacher Curl", "biceps"),
  e("Cable Curl", "biceps"),
  e("Bayesian Cable Curl", "biceps"),
  e("Concentration Curl", "biceps"),
  e("Spider Curl", "biceps"),
  e("Reverse Curl", "biceps"),
  e("Drag Curl", "biceps"),
  // triceps
  e("Single Arm Tricep Extension", "triceps"),
  e("Cable Tricep Pushdown", "triceps"),
  e("Rope Pushdown", "triceps"),
  e("Straight Bar Pushdown", "triceps"),
  e("Overhead Cable Extension", "triceps"),
  e("Overhead DB Extension", "triceps"),
  e("Skull Crusher", "triceps"),
  e("DB Skull Crusher", "triceps"),
  e("Close Grip Bench Press", "triceps", "chest"),
  e("Tricep Kickback", "triceps"),
  e("Machine Tricep Extension", "triceps"),
  e("JM Press", "triceps"),
  e("Bench Dip", "triceps"),
  // quads
  e("Back Squat", "quads", "hamstrings_glutes"),
  e("Front Squat", "quads"),
  e("Goblet Squat", "quads"),
  e("Hack Squat", "quads"),
  e("Smith Machine Squat", "quads", "hamstrings_glutes"),
  e("Leg Press", "quads", "hamstrings_glutes"),
  e("Single Leg Press", "quads", "hamstrings_glutes"),
  e("Leg Extension", "quads"),
  e("Single Leg Extension", "quads"),
  e("Bulgarian Split Squat", "quads", "hamstrings_glutes"),
  e("Walking Lunge", "quads", "hamstrings_glutes"),
  e("Reverse Lunge", "quads", "hamstrings_glutes"),
  e("DB Step-Up", "quads", "hamstrings_glutes"),
  e("Sissy Squat", "quads"),
  e("Pendulum Squat", "quads"),
  e("Belt Squat", "quads", "hamstrings_glutes"),
  // hamstrings / glutes
  e("Romanian Deadlift", "hamstrings_glutes", "back"),
  e("DB Romanian Deadlift", "hamstrings_glutes", "back"),
  e("Stiff Leg Deadlift", "hamstrings_glutes", "back"),
  e("Sumo Deadlift", "hamstrings_glutes", "quads", "back"),
  e("Lying Leg Curl", "hamstrings_glutes"),
  e("Seated Leg Curl", "hamstrings_glutes"),
  e("Single Leg Curl", "hamstrings_glutes"),
  e("Nordic Curl", "hamstrings_glutes"),
  e("Hip Thrust", "hamstrings_glutes"),
  e("BB Hip Thrust", "hamstrings_glutes"),
  e("Machine Hip Thrust", "hamstrings_glutes"),
  e("Glute Bridge", "hamstrings_glutes"),
  e("Cable Kickback", "hamstrings_glutes"),
  e("Hip Abduction", "hamstrings_glutes"),
  e("Hip Adduction", "hamstrings_glutes"),
  e("Good Morning", "hamstrings_glutes", "back"),
  e("Kettlebell Swing", "hamstrings_glutes"),
  e("Standing Calf Raise", "hamstrings_glutes"),
  e("Seated Calf Raise", "hamstrings_glutes"),
  e("Leg Press Calf Raise", "hamstrings_glutes"),
  // core
  e("Cable Crunch", "core"),
  e("Machine Crunch", "core"),
  e("Hanging Leg Raise", "core"),
  e("Hanging Knee Raise", "core"),
  e("Captain's Chair Leg Raise", "core"),
  e("Decline Sit-Up", "core"),
  e("Weighted Sit-Up", "core"),
  e("Ab Wheel Rollout", "core"),
  e("Plank", "core"),
  e("Weighted Plank", "core"),
  e("Side Plank", "core"),
  e("Russian Twist", "core"),
  e("Cable Woodchop", "core"),
  e("Pallof Press", "core"),
  e("Dead Bug", "core"),
  e("Farmer's Carry", "core", "back"),
];

export function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

const BY_NAME = new Map(EXERCISES.map((x) => [normalizeName(x.name), x]));

export function findExercise(name: string): Exercise | undefined {
  return BY_NAME.get(normalizeName(name));
}

export function exercisesFor(groups: MuscleGroup[]): Exercise[] {
  if (groups.length === 0) return [];
  const set = new Set(groups);
  return EXERCISES.filter((x) => x.muscles.some((m) => set.has(m)));
}

export function searchExercises(query: string): Exercise[] {
  const q = normalizeName(query);
  if (!q) return [];
  return EXERCISES.filter((x) => normalizeName(x.name).includes(q));
}

export function muscleLabel(id: MuscleGroup): string {
  return MUSCLE_GROUPS.find((m) => m.id === id)?.label ?? id;
}

export function muscleShort(id: MuscleGroup | undefined): string {
  if (!id) return "••";
  return MUSCLE_GROUPS.find((m) => m.id === id)?.short ?? "••";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/exercises.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/exercises.ts lib/exercises.test.ts
git commit -m "feat: static exercise library grouped by muscle"
```

---

### Task 3: Session logic — `lib/workouts.ts`

**Files:**
- Create: `lib/workouts.ts`
- Test: `lib/workouts.test.ts`

**Interfaces:**
- Consumes: `findExercise`, `normalizeName`, `MuscleGroup` from `./exercises`.
- Produces:
  ```ts
  export type LiftRow = { id: string; exercise: string; sets: number; reps: number; weight: number;
    logged_at: string; workout_id: string | null };
  export type WorkoutRow = { id: string; started_at: string; ended_at: string | null; muscle_groups: MuscleGroup[] };
  export function localDateOf(iso: string): string;                       // YYYY-MM-DD in local tz
  export function recentExercises(rows: LiftRow[], groups: MuscleGroup[], limit?: number): string[];
  export function lastSession(exercise: string, rows: LiftRow[]): LiftRow[];
  export function formatSession(rows: LiftRow[]): string;
  export function e1rm(weight: number, reps: number): number;
  export function bestE1rm(rows: LiftRow[]): number | null;
  export function beatLastTime(current: LiftRow[], previous: LiftRow[]): boolean;
  export function groupByExercise(rows: LiftRow[]): { exercise: string; rows: LiftRow[] }[];
  export function formatElapsed(ms: number): string;                       // "34:12" / "1:02:05"
  export function totalSets(rows: LiftRow[]): number;                      // sum of sets
  export function totalVolume(rows: LiftRow[]): number;                    // sum of sets*reps*weight
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/workouts.test.ts
import { describe, it, expect } from "vitest";
import { beatLastTime, bestE1rm, e1rm, formatElapsed, formatSession, groupByExercise, lastSession,
  localDateOf, recentExercises, totalSets, totalVolume, type LiftRow } from "./workouts";

const row = (o: Partial<LiftRow> & { exercise: string; logged_at: string }): LiftRow => ({
  id: o.id ?? o.logged_at, sets: 1, reps: 6, weight: 95, workout_id: null, ...o });

// newest-first, as listRecentLifts returns them
const HISTORY: LiftRow[] = [
  row({ exercise: "DB Chest Press", logged_at: "2026-09-03T14:10:00Z", workout_id: "w2", reps: 7, weight: 90 }),
  row({ exercise: "DB Chest Press", logged_at: "2026-09-03T14:05:00Z", workout_id: "w2", reps: 6, weight: 95 }),
  row({ exercise: "Lat Pulldown", logged_at: "2026-09-03T14:00:00Z", workout_id: "w2", reps: 10, weight: 140 }),
  row({ exercise: "db chest press", logged_at: "2026-08-31T15:00:00Z", workout_id: null, reps: 5, weight: 95 }),
  row({ exercise: "Shoulder press", logged_at: "2026-08-31T14:50:00Z", workout_id: null, sets: 2, reps: 7, weight: 115 }),
  row({ exercise: "DB Chest Press", logged_at: "2026-08-28T15:00:00Z", workout_id: "w0", reps: 8, weight: 85 }),
];

describe("recentExercises", () => {
  it("dedupes case-insensitively keeping first casing, newest-first, filtered by group", () => {
    expect(recentExercises(HISTORY, ["chest"])).toEqual(["DB Chest Press", "Shoulder press"]);
  });
  it("custom (non-library) names are always included; library names need a group match", () => {
    expect(recentExercises(HISTORY, ["back"])).toEqual(["Lat Pulldown", "Shoulder press"]);
  });
  it("honours limit", () => {
    expect(recentExercises(HISTORY, ["chest", "back"], 1)).toEqual(["DB Chest Press"]);
  });
});

describe("lastSession", () => {
  it("returns the most recent workout's rows for the exercise, oldest-first", () => {
    expect(lastSession("DB Chest Press", HISTORY).map((r) => `${r.weight}x${r.reps}`))
      .toEqual(["95x6", "90x7"]);
  });
  it("falls back to same local date when workout_id is null", () => {
    const noW2 = HISTORY.filter((r) => r.workout_id !== "w2");
    expect(lastSession("DB Chest Press", noW2).map((r) => r.logged_at)).toEqual(["2026-08-31T15:00:00Z"]);
  });
  it("is case-insensitive and empty for unknown", () => {
    expect(lastSession("db CHEST press", HISTORY).length).toBe(2);
    expect(lastSession("Nope", HISTORY)).toEqual([]);
  });
});

describe("formatSession / e1rm", () => {
  it("formats per row, ×sets only when > 1", () => {
    const s = lastSession("DB Chest Press", HISTORY);
    expect(formatSession(s)).toBe("95×6, 90×7");
    expect(formatSession([row({ exercise: "x", logged_at: "t", sets: 3, reps: 8, weight: 130 })])).toBe("130×8 ×3");
    expect(formatSession([])).toBe("");
  });
  it("epley", () => {
    expect(e1rm(95, 6)).toBeCloseTo(114, 0);
    expect(bestE1rm([])).toBeNull();
    expect(bestE1rm(lastSession("DB Chest Press", HISTORY))).toBeCloseTo(114, 0);
  });
  it("beatLastTime is strict and false without history", () => {
    const cur = [row({ exercise: "DB Chest Press", logged_at: "now", reps: 6, weight: 100 })];
    const prev = lastSession("DB Chest Press", HISTORY);
    expect(beatLastTime(cur, prev)).toBe(true);
    expect(beatLastTime(prev, prev)).toBe(false);
    expect(beatLastTime(cur, [])).toBe(false);
    expect(beatLastTime([], prev)).toBe(false);
  });
});

describe("summary helpers", () => {
  const w2 = HISTORY.filter((r) => r.workout_id === "w2").reverse(); // oldest-first
  it("groupByExercise keeps first-appearance order", () => {
    expect(groupByExercise(w2).map((g) => g.exercise)).toEqual(["Lat Pulldown", "DB Chest Press"]);
    expect(groupByExercise(w2)[1].rows.length).toBe(2);
  });
  it("totals", () => {
    expect(totalSets(w2)).toBe(3);
    expect(totalVolume(w2)).toBe(1 * 10 * 140 + 1 * 6 * 95 + 1 * 7 * 90);
  });
  it("formatElapsed", () => {
    expect(formatElapsed(34 * 60_000 + 12_000)).toBe("34:12");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(5_000)).toBe("0:05");
  });
  it("localDateOf returns a YYYY-MM-DD string", () => {
    expect(localDateOf("2026-09-03T14:10:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/workouts.test.ts`
Expected: FAIL — cannot resolve `./workouts`.

- [ ] **Step 3: Implement**

```ts
// lib/workouts.ts
import { findExercise, normalizeName, type MuscleGroup } from "./exercises";

export type LiftRow = { id: string; exercise: string; sets: number; reps: number; weight: number;
  logged_at: string; workout_id: string | null };
export type WorkoutRow = { id: string; started_at: string; ended_at: string | null; muscle_groups: MuscleGroup[] };

export function localDateOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Distinct names, newest-first; custom names always, library names only when their muscles match. */
export function recentExercises(rows: LiftRow[], groups: MuscleGroup[], limit = 8): string[] {
  const set = new Set(groups);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const key = normalizeName(r.exercise);
    if (seen.has(key)) continue;
    seen.add(key);
    const lib = findExercise(r.exercise);
    if (lib && !lib.muscles.some((m) => set.has(m))) continue;
    out.push(r.exercise.trim());
    if (out.length >= limit) break;
  }
  return out;
}

/** Rows of the most recent session for `exercise`, oldest-first. */
export function lastSession(exercise: string, rows: LiftRow[]): LiftRow[] {
  const key = normalizeName(exercise);
  const mine = rows.filter((r) => normalizeName(r.exercise) === key)
    .sort((a, b) => (a.logged_at < b.logged_at ? 1 : a.logged_at > b.logged_at ? -1 : 0));
  const latest = mine[0];
  if (!latest) return [];
  const session = latest.workout_id
    ? mine.filter((r) => r.workout_id === latest.workout_id)
    : mine.filter((r) => r.workout_id === null && localDateOf(r.logged_at) === localDateOf(latest.logged_at));
  return session.reverse();
}

export function formatSession(rows: LiftRow[]): string {
  return rows.map((r) => `${r.weight}×${r.reps}${r.sets > 1 ? ` ×${r.sets}` : ""}`).join(", ");
}

export function e1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

export function bestE1rm(rows: LiftRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => e1rm(r.weight, r.reps)));
}

export function beatLastTime(current: LiftRow[], previous: LiftRow[]): boolean {
  const c = bestE1rm(current), p = bestE1rm(previous);
  if (c === null || p === null) return false;
  return c > p;
}

export function groupByExercise(rows: LiftRow[]): { exercise: string; rows: LiftRow[] }[] {
  const groups: { exercise: string; rows: LiftRow[] }[] = [];
  const index = new Map<string, number>();
  for (const r of rows) {
    const key = normalizeName(r.exercise);
    const i = index.get(key);
    if (i === undefined) { index.set(key, groups.length); groups.push({ exercise: r.exercise.trim(), rows: [r] }); }
    else groups[i].rows.push(r);
  }
  return groups;
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function totalSets(rows: LiftRow[]): number {
  return rows.reduce((a, r) => a + r.sets, 0);
}

export function totalVolume(rows: LiftRow[]): number {
  return rows.reduce((a, r) => a + r.sets * r.reps * r.weight, 0);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/workouts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workouts.ts lib/workouts.test.ts
git commit -m "feat: workout session logic (recents, last session, e1RM, summary helpers)"
```

---

### Task 4: Generalise the offline queue

**Files:**
- Modify: `lib/queue.ts` (rewrite)
- Modify: `lib/log.ts:8-14`
- Create: `vitest.config.ts`
- Test: `lib/queue.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QueueTable = "meals" | "lifts" | "workouts";
  export type QueueOp = "insert" | "update";
  export type Queued = { id: string; table: QueueTable; op: QueueOp; entry: Record<string, unknown>; queued_at: string };
  export function enqueueOrSend(table: QueueTable, entry: Record<string, unknown>,
    opts?: { id?: string; op?: QueueOp }): Promise<"sent" | "queued">;
  export function flushQueue(): Promise<number>;
  export function normalizeQueued(raw: unknown): Queued;   // exported for tests
  ```
- Behaviour: `insert` on `meals`/`lifts` stamps `{ ...entry, id, logged_at: queued_at }`; `insert` on `workouts` stamps `{ ...entry, id }` only. `update` runs `.update(entry).eq("id", id)`. If the queue is non-empty, `enqueueOrSend` **always queues** (and kicks a flush) so writes never overtake. Flush stops at the first transient failure.

- [ ] **Step 1: Add `vitest.config.ts` so `@/` resolves in tests**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node" },
});
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/queue.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- mocks -------------------------------------------------------------
type Row = Record<string, unknown>;
const calls: { table: string; op: string; payload: Row; id?: string }[] = [];
let failNext: ("transient" | "permanent" | "duplicate")[] = [];

function outcome() {
  const f = failNext.shift();
  if (f === "transient") return { error: { code: "", message: "TypeError: fetch failed" }, status: 0 };
  if (f === "permanent") return { error: { code: "42501", message: "rls" }, status: 401 };
  if (f === "duplicate") return { error: { code: "23505", message: "dup" }, status: 409 };
  return { error: null, status: 201 };
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u" } } } }) },
    from: (table: string) => ({
      insert: async (payload: Row) => { calls.push({ table, op: "insert", payload }); return outcome(); },
      update: (payload: Row) => ({
        eq: async (_col: string, id: string) => { calls.push({ table, op: "update", payload, id }); return outcome(); },
      }),
    }),
  },
}));

const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => store.get(k),
  update: async (k: string, fn: (v: unknown) => unknown) => { store.set(k, fn(store.get(k))); },
}));

import { enqueueOrSend, flushQueue, normalizeQueued, type Queued } from "./queue";
const KEY = "gainz-offline-queue";
const queue = () => (store.get(KEY) as Queued[] | undefined) ?? [];

beforeEach(() => { calls.length = 0; failNext = []; store.clear(); });

// ---- tests -------------------------------------------------------------
describe("normalizeQueued", () => {
  it("upgrades the old { kind } shape", () => {
    const old = { id: "1", kind: "lift", entry: { exercise: "x" }, queued_at: "t" };
    expect(normalizeQueued(old)).toEqual({ id: "1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" });
    expect(normalizeQueued({ ...old, kind: "meal" }).table).toBe("meals");
  });
  it("passes the new shape through", () => {
    const n: Queued = { id: "1", table: "workouts", op: "update", entry: { ended_at: "t" }, queued_at: "t" };
    expect(normalizeQueued(n)).toEqual(n);
  });
});

describe("enqueueOrSend", () => {
  it("stamps id + logged_at for lifts inserts", async () => {
    await enqueueOrSend("lifts", { exercise: "x", sets: 1, reps: 6, weight: 95 });
    expect(calls[0].table).toBe("lifts");
    expect(calls[0].payload).toMatchObject({ exercise: "x" });
    expect(typeof calls[0].payload.id).toBe("string");
    expect(typeof calls[0].payload.logged_at).toBe("string");
  });
  it("does NOT stamp logged_at for workouts inserts and honours a caller id", async () => {
    await enqueueOrSend("workouts", { started_at: "t", muscle_groups: ["chest"] }, { id: "w1" });
    expect(calls[0].payload).toEqual({ started_at: "t", muscle_groups: ["chest"], id: "w1" });
  });
  it("update op calls update().eq('id')", async () => {
    await enqueueOrSend("workouts", { ended_at: "t" }, { id: "w1", op: "update" });
    expect(calls[0]).toMatchObject({ table: "workouts", op: "update", payload: { ended_at: "t" }, id: "w1" });
  });
  it("queues on transient failure", async () => {
    failNext = ["transient"];
    expect(await enqueueOrSend("lifts", { exercise: "x" })).toBe("queued");
    expect(queue().length).toBe(1);
  });
  it("always queues when something is already queued (never overtakes)", async () => {
    failNext = ["transient"];
    await enqueueOrSend("workouts", { started_at: "t" }, { id: "w1" });
    failNext = ["transient"]; // the kicked flush will also fail
    const r = await enqueueOrSend("lifts", { exercise: "x", workout_id: "w1" });
    expect(r).toBe("queued");
    expect(queue().map((q) => q.table)).toEqual(["workouts", "lifts"]);
  });
  it("throws (and does not queue) on permanent rejection", async () => {
    failNext = ["permanent"];
    await expect(enqueueOrSend("lifts", { exercise: "x" })).rejects.toThrow();
    expect(queue().length).toBe(0);
  });
});

describe("flushQueue", () => {
  it("flushes FIFO and stops at the first transient failure", async () => {
    store.set(KEY, [
      { id: "a", table: "workouts", op: "insert", entry: {}, queued_at: "t" },
      { id: "b", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
      { id: "c", table: "workouts", op: "update", entry: { ended_at: "t" }, queued_at: "t" },
    ] satisfies Queued[]);
    failNext = [undefined as never, "transient"]; // a ok, b transient → stop
    expect(await flushQueue()).toBe(1);
    expect(queue().map((q) => q.id)).toEqual(["b", "c"]);
    expect(calls.length).toBe(2);
  });
  it("dead-letters permanent failures and continues; duplicates count as done", async () => {
    store.set(KEY, [
      { id: "a", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
      { id: "b", table: "lifts", op: "insert", entry: {}, queued_at: "t" },
    ] satisfies Queued[]);
    failNext = ["permanent", "duplicate"];
    expect(await flushQueue()).toBe(2);
    expect(queue()).toEqual([]);
    expect((store.get("gainz-offline-deadletter") as Queued[]).map((q) => q.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run lib/queue.test.ts`
Expected: FAIL — `normalizeQueued` not exported / signature mismatch.

- [ ] **Step 4: Rewrite `lib/queue.ts`**

```ts
// lib/queue.ts
import { get, update } from "idb-keyval";
import { supabase } from "@/lib/supabase";

export type QueueTable = "meals" | "lifts" | "workouts";
export type QueueOp = "insert" | "update";
export type Queued = { id: string; table: QueueTable; op: QueueOp; entry: Record<string, unknown>; queued_at: string };

const KEY = "gainz-offline-queue";
const DEAD_KEY = "gainz-offline-deadletter";

/** Items written before sub-project 3 have `{ kind: "meal" | "lift" }`. */
export function normalizeQueued(raw: unknown): Queued {
  const r = raw as Partial<Queued> & { kind?: "meal" | "lift" };
  if (r.kind) {
    return { id: r.id!, table: r.kind === "meal" ? "meals" : "lifts", op: "insert",
      entry: r.entry ?? {}, queued_at: r.queued_at! };
  }
  return r as Queued;
}

async function readQueue(): Promise<Queued[]> {
  return ((await get<unknown[]>(KEY)) ?? []).map(normalizeQueued);
}

// insert is idempotent: the queued item's UUID becomes the row's primary key,
// so a retried insert of an already-landed item fails with 23505 and is treated as done.
// update is idempotent by construction (the only update is ended_at).
//
// supabase-js postgrest calls do NOT throw on network failure — they resolve with
// { error: { code: "", message: "TypeError: fetch failed" }, status: 0 }. So "no error"
// and "genuine server rejection" are the only two non-throwing outcomes; everything else
// (status 0, empty/absent code, 5xx) is transient and must throw so callers queue/retry it.
async function send(item: Queued): Promise<"ok" | "duplicate" | "permanent"> {
  let result: { error: { code?: string; message: string } | null; status: number };
  if (item.op === "update") {
    result = await supabase.from(item.table).update(item.entry).eq("id", item.id);
  } else {
    const payload = item.table === "workouts"
      ? { ...item.entry, id: item.id }
      : { ...item.entry, id: item.id, logged_at: item.queued_at };
    result = await supabase.from(item.table).insert(payload);
  }
  const { error, status } = result;
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  if (status >= 400 && status <= 499 && !!error.code) {
    console.error("gainz queue: permanent failure, dropping item", item, error);
    return "permanent";
  }
  throw new Error(`gainz queue: transient failure: ${error.message}`);
}

export async function enqueueOrSend(table: QueueTable, entry: Record<string, unknown>,
  opts: { id?: string; op?: QueueOp } = {}): Promise<"sent" | "queued"> {
  const item: Queued = { id: opts.id ?? crypto.randomUUID(), table, op: opts.op ?? "insert",
    entry, queued_at: new Date().toISOString() };

  // Never overtake: if anything is waiting, this goes behind it.
  if ((await readQueue()).length > 0) {
    await update<unknown[]>(KEY, (q) => [...(q ?? []), item]);
    void flushQueue();
    return "queued";
  }

  try {
    const result = await send(item);
    if (result === "permanent") throw new Error("gainz queue: server rejected item permanently");
    return "sent";
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("gainz queue: server rejected")) throw e; // do NOT queue permanents
    console.warn("gainz queue: offline, queueing item", item.id, e);
    await update<unknown[]>(KEY, (q) => [...(q ?? []), item]);
    return "queued";
  }
}

let isFlushing = false;

export async function flushQueue(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return 0;
  if (isFlushing) return 0;
  isFlushing = true;
  try {
    const q = await readQueue();
    if (q.length === 0) return 0;
    let flushed = 0;
    const done = new Set<string>();
    for (const item of q) {
      try {
        const result = await send(item); // "ok" | "duplicate" | "permanent" all mean: stop retrying
        if (result === "permanent") {
          console.error("gainz queue: dead-lettering permanently rejected item", item.id);
          await update<Queued[]>(DEAD_KEY, (dq) => [...(dq ?? []), item]);
        }
        done.add(item.id);
        flushed++;
      } catch (e) {
        console.warn("gainz queue: flush stopped (still offline?), keeping the rest in order", item.id, e);
        break; // strict FIFO: nothing behind this item may land before it
      }
    }
    // Atomic: only remove items we know are settled; concurrent enqueues survive.
    await update<unknown[]>(KEY, (cur) => (cur ?? []).filter((i) => !done.has(normalizeQueued(i).id)));
    return flushed;
  } finally {
    isFlushing = false;
  }
}
```

- [ ] **Step 5: Update `lib/log.ts` callers**

```ts
// lib/log.ts
import { enqueueOrSend } from "@/lib/queue";

export type MealEntry = { food_name: string; grams: number; calories: number;
  protein_g: number; carbs_g: number; fat_g: number; fdc_id?: string };
export type LiftEntry = { exercise: string; sets: number; reps: number;
  weight: number; notes?: string; workout_id?: string };

export async function logMeal(entry: MealEntry): Promise<void> {
  await enqueueOrSend("meals", entry as unknown as Record<string, unknown>);
}

export async function logLift(entry: LiftEntry): Promise<void> {
  await enqueueOrSend("lifts", entry as unknown as Record<string, unknown>);
}
```

- [ ] **Step 6: Run all tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, tsc clean. (`app/log/lift/page.tsx` still compiles — it is deleted in Task 9.)

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts lib/queue.ts lib/queue.test.ts lib/log.ts
git commit -m "feat: generalise offline queue to table+op with strict FIFO"
```

---

### Task 5: Data access — `lib/workouts-db.ts`

**Files:**
- Create: `lib/workouts-db.ts`

**Interfaces:**
- Consumes: `enqueueOrSend` (Task 4), `LiftRow`, `WorkoutRow` (Task 3), `MuscleGroup` (Task 2).
- Produces:
  ```ts
  export async function startWorkout(groups: MuscleGroup[]): Promise<WorkoutRow>;   // client id, queued insert, also cached in sessionStorage
  export async function endWorkout(id: string): Promise<string>;                    // returns ended_at ISO; queued update
  export async function deleteWorkout(id: string): Promise<void>;                   // direct
  export async function getActiveWorkout(): Promise<WorkoutRow | null>;
  export async function getWorkout(id: string): Promise<WorkoutRow | null>;         // sessionStorage first, then Supabase
  export async function listLiftsForWorkout(id: string): Promise<LiftRow[]>;        // oldest-first
  export async function listRecentLifts(limit?: number): Promise<LiftRow[]>;        // newest-first, default 400
  export async function logSet(e: { workout_id: string; exercise: string; sets: number; reps: number; weight: number }): Promise<LiftRow>;
  export function cacheWorkout(w: WorkoutRow): void;                                // sessionStorage `gainz-workout-<id>`
  ```
- Local-echo: `logSet` returns a `LiftRow` with a client id and `logged_at = now` so the UI appends it without waiting for a read.

- [ ] **Step 1: Implement**

```ts
// lib/workouts-db.ts
import { supabase } from "@/lib/supabase";
import { enqueueOrSend } from "@/lib/queue";
import type { MuscleGroup } from "@/lib/exercises";
import type { LiftRow, WorkoutRow } from "@/lib/workouts";

const cacheKey = (id: string) => `gainz-workout-${id}`;

export function cacheWorkout(w: WorkoutRow): void {
  try { sessionStorage.setItem(cacheKey(w.id), JSON.stringify(w)); } catch { /* private mode etc. */ }
}

function readCache(id: string): WorkoutRow | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as WorkoutRow) : null;
  } catch { return null; }
}

function toWorkout(r: Record<string, unknown>): WorkoutRow {
  return { id: String(r.id), started_at: String(r.started_at),
    ended_at: r.ended_at == null ? null : String(r.ended_at),
    muscle_groups: (r.muscle_groups as MuscleGroup[]) ?? [] };
}

function toLift(r: Record<string, unknown>): LiftRow {
  return { id: String(r.id), exercise: String(r.exercise), sets: Number(r.sets), reps: Number(r.reps),
    weight: Number(r.weight), logged_at: String(r.logged_at),
    workout_id: r.workout_id == null ? null : String(r.workout_id) };
}

export async function startWorkout(groups: MuscleGroup[]): Promise<WorkoutRow> {
  const w: WorkoutRow = { id: crypto.randomUUID(), started_at: new Date().toISOString(),
    ended_at: null, muscle_groups: groups };
  cacheWorkout(w);
  await enqueueOrSend("workouts", { started_at: w.started_at, muscle_groups: groups }, { id: w.id });
  return w;
}

export async function endWorkout(id: string): Promise<string> {
  const ended_at = new Date().toISOString();
  const cached = readCache(id);
  if (cached) cacheWorkout({ ...cached, ended_at });
  await enqueueOrSend("workouts", { ended_at }, { id, op: "update" });
  return ended_at;
}

export async function deleteWorkout(id: string): Promise<void> {
  try { sessionStorage.removeItem(cacheKey(id)); } catch { /* ignore */ }
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

export async function getActiveWorkout(): Promise<WorkoutRow | null> {
  const { data, error } = await supabase.from("workouts").select("*").is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toWorkout(data) : null;
}

export async function getWorkout(id: string): Promise<WorkoutRow | null> {
  const cached = readCache(id);
  if (cached) return cached;
  const { data, error } = await supabase.from("workouts").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const w = toWorkout(data);
  cacheWorkout(w);
  return w;
}

export async function listLiftsForWorkout(id: string): Promise<LiftRow[]> {
  const { data, error } = await supabase.from("lifts").select("*").eq("workout_id", id).order("logged_at");
  if (error) throw error;
  return (data ?? []).map(toLift);
}

export async function listRecentLifts(limit = 400): Promise<LiftRow[]> {
  const { data, error } = await supabase.from("lifts").select("*")
    .order("logged_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map(toLift);
}

export async function logSet(e: { workout_id: string; exercise: string; sets: number; reps: number; weight: number }): Promise<LiftRow> {
  const id = crypto.randomUUID();
  const logged_at = new Date().toISOString();
  await enqueueOrSend("lifts", { ...e }, { id });
  return { id, ...e, logged_at };
}
```

Note: `enqueueOrSend` stamps `logged_at: queued_at` on the server row; the local echo's `logged_at` is within milliseconds of it, which is fine for ordering.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/workouts-db.ts
git commit -m "feat: workouts data access with client ids and session cache"
```

---

### Task 6: Scroll wheel — `components/Wheel.tsx`

**Files:**
- Create: `components/Wheel.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export default function Wheel(props: { label: string; values: number[]; value: number;
    onChange: (v: number) => void; format?: (v: number) => string }): JSX.Element;
  export function range(from: number, to: number, step?: number): number[];  // inclusive
  ```
- Behaviour: vertical scroll-snap list, item height 40px, viewport 160px (4 rows + centred selection band via 60px padding), selection band styled per design table; fires `onChange` when scrolling settles; scrolls programmatically when `value` changes from outside.

- [ ] **Step 1: Implement**

```tsx
// components/Wheel.tsx
"use client";
import { useEffect, useRef } from "react";

const ITEM = 40;      // px per row
const VIEW = 160;     // px viewport height (h-40)
const PAD = (VIEW - ITEM) / 2; // 60px top/bottom so first/last can sit in the band

export function range(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export default function Wheel({ label, values, value, onChange, format = String }: {
  label: string; values: number[]; value: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<number | null>(null);
  const lastEmitted = useRef<number>(value);

  // Scroll to the external value when it changes (preset / reopen).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, values.indexOf(value));
    if (Math.round(el.scrollTop / ITEM) !== idx) el.scrollTo({ top: idx * ITEM });
    lastEmitted.current = value;
  }, [value, values]);

  function settle() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
    const v = values[idx];
    if (v !== lastEmitted.current) { lastEmitted.current = v; onChange(v); }
  }

  function onScroll() {
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 120); // fallback for browsers without scrollend
  }

  return (
    <div className="flex flex-col items-center">
      <span className="mb-1 text-center text-[11px] uppercase tracking-wider text-muted">{label}</span>
      <div className="relative h-40 w-[92px]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[60px] h-10 rounded-xl border border-border bg-surface-2" />
        <div ref={ref} onScroll={onScroll} onScrollEnd={settle}
          className="relative h-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ paddingTop: PAD, paddingBottom: PAD }}>
          {values.map((v) => (
            <div key={v} className={`flex h-10 snap-center items-center justify-center tabular-nums ${
              v === value ? "text-[22px] font-bold text-accent" : "text-lg text-muted"}`}>
              {format(v)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

If `onScrollEnd` is not in React's JSX types for this React version, replace it with a `useEffect` that does `el.addEventListener("scrollend", settle)` and removes it on cleanup.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/Wheel.tsx
git commit -m "feat: scroll-snap number wheel"
```

---

### Task 7: Muscle picker — `/workout/new`

**Files:**
- Create: `app/workout/new/page.tsx`

**Interfaces:**
- Consumes: `MUSCLE_GROUPS`, `PRESETS`, `MuscleGroup` (Task 2); `startWorkout`, `getActiveWorkout` (Task 5).

- [ ] **Step 1: Implement the page**

```tsx
// app/workout/new/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import { MUSCLE_GROUPS, PRESETS, muscleLabel, muscleShort, type MuscleGroup } from "@/lib/exercises";
import { getActiveWorkout, startWorkout } from "@/lib/workouts-db";

const sameSet = (a: MuscleGroup[], b: MuscleGroup[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export default function NewWorkout() {
  const router = useRouter();
  const [selected, setSelected] = useState<MuscleGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getActiveWorkout().then((w) => { if (w) router.replace(`/workout/${w.id}`); }).catch(() => {});
  }, [router]);

  function toggle(id: MuscleGroup) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function start() {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const ordered = MUSCLE_GROUPS.map((m) => m.id).filter((id) => selected.includes(id));
      const w = await startWorkout(ordered);
      router.replace(`/workout/${w.id}`);
    } catch {
      setErr("Couldn't start. Please try again.");
      setBusy(false);
    }
  }

  const presetActive = (p: "upper" | "lower") => sameSet(selected, PRESETS[p]);

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
          <h1 className="text-xl font-bold tracking-tight">New workout</h1>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Quick presets</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["upper", "lower"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setSelected(PRESETS[p])}
                className={`rounded-2xl border bg-surface p-4 text-left active:bg-surface-2 ${
                  presetActive(p) ? "border-accent" : "border-border"}`}>
                <p className="text-lg font-bold">{p === "upper" ? "Upper" : "Lower"}</p>
                <p className="text-[13px] text-muted">{PRESETS[p].map(muscleLabel).join(", ")}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Choose targets</h2>
          <p className="-mt-1 text-[13px] text-muted">Select one or more muscle groups.</p>
          {MUSCLE_GROUPS.map((m) => {
            const on = selected.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)}
                className={`flex items-center gap-3 rounded-2xl border bg-surface px-4 py-3.5 text-left active:bg-surface-2 ${
                  on ? "border-accent/60" : "border-border"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs ${
                  on ? "border-accent bg-accent/20 text-accent" : "border-border"}`}>{on ? "✓" : ""}</span>
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
                  {muscleShort(m.id)}
                </span>
                <span className="text-lg font-semibold">{m.label}</span>
              </button>
            );
          })}
        </section>

        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-base">{selected.length} target{selected.length === 1 ? "" : "s"} selected</p>
          <p className="text-[13px] text-muted">
            {selected.length ? MUSCLE_GROUPS.filter((m) => selected.includes(m.id)).map((m) => m.label).join(", ") : "Nothing yet"}
          </p>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
          <button type="button" onClick={start} disabled={selected.length === 0 || busy}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80 disabled:opacity-40">
            ▶ Start workout
          </button>
        </div>
      </main>
    </AuthGuard>
  );
}
```

- [ ] **Step 2: Typecheck + run dev to eyeball**

Run: `npx tsc --noEmit` then `npm run dev` and open `http://localhost:3000/workout/new` (sign in if prompted). Tap Upper → five rows tick; Start is enabled. Do **not** press Start unless the SQL from Task 1 has been run in Supabase (otherwise the insert is rejected as permanent and shows the error line — that is the expected behaviour pre-SQL).

- [ ] **Step 3: Commit**

```bash
git add app/workout/new/page.tsx
git commit -m "feat: muscle-group picker page"
```

---

### Task 8: Active workout page — list + set sheet

**Files:**
- Create: `components/ExerciseRow.tsx`
- Create: `components/SetSheet.tsx`
- Create: `app/workout/[id]/page.tsx` (active state; the summary state is added in Task 9 — for now render `<p>Summary coming</p>` when `ended_at` is set)

**Interfaces:**
- Consumes: Task 2 library functions; Task 3 `recentExercises`, `lastSession`, `formatSession`, `formatElapsed`, `groupByExercise`, `LiftRow`, `WorkoutRow`; Task 5 data access; Task 6 `Wheel`, `range`.
- Produces:
  ```tsx
  // components/ExerciseRow.tsx
  export default function ExerciseRow(p: { name: string; muscle?: MuscleGroup; setCount: number; onClick: () => void }): JSX.Element;
  // components/SetSheet.tsx
  export type SheetState = { sets: number; reps: number; weight: number };
  export default function SetSheet(p: { exercise: string; muscle?: MuscleGroup; previous: LiftRow[]; logged: LiftRow[];
    state: SheetState; onState: (s: SheetState) => void; onAdd: () => Promise<void>; onClose: () => void }): JSX.Element;
  ```

- [ ] **Step 1: `components/ExerciseRow.tsx`**

```tsx
// components/ExerciseRow.tsx
"use client";
import { muscleShort, type MuscleGroup } from "@/lib/exercises";

export default function ExerciseRow({ name, muscle, setCount, onClick }: {
  name: string; muscle?: MuscleGroup; setCount: number; onClick: () => void;
}) {
  const active = setCount > 0;
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
        {muscleShort(muscle)}
      </span>
      <span className={`flex-1 text-[17px] font-medium ${active ? "text-accent" : ""}`}>{name}</span>
      {active && (
        <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
          {setCount} {setCount === 1 ? "set" : "sets"}
        </span>
      )}
      <span className="text-muted">›</span>
    </button>
  );
}
```

- [ ] **Step 2: `components/SetSheet.tsx`**

```tsx
// components/SetSheet.tsx
"use client";
import { useState } from "react";
import Wheel, { range } from "@/components/Wheel";
import { muscleShort, type MuscleGroup } from "@/lib/exercises";
import { formatSession, localDateOf, type LiftRow } from "@/lib/workouts";

export type SheetState = { sets: number; reps: number; weight: number };

const SETS = range(1, 10);
const REPS = range(1, 30);
const WEIGHT = range(0, 500, 2.5);

function shortDate(iso: string): string {
  const [y, m, d] = localDateOf(iso).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SetSheet({ exercise, muscle, previous, logged, state, onState, onAdd, onClose }: {
  exercise: string; muscle?: MuscleGroup; previous: LiftRow[]; logged: LiftRow[];
  state: SheetState; onState: (s: SheetState) => void; onAdd: () => Promise<void>; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (busy) return;
    setBusy(true); setErr("");
    try { await onAdd(); } catch { setErr("Couldn't save. Please try again."); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-10 bg-black/60" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t border-border bg-surface px-4 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
            {muscleShort(muscle)}
          </span>
          <div className="flex-1">
            <h2 className="text-[22px] font-bold leading-tight">{exercise}</h2>
            <p className="text-sm text-muted">
              {previous.length ? `Last: ${formatSession(previous)} · ${shortDate(previous[0].logged_at)}` : "First time"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-3 py-1.5 text-sm text-muted">Close</button>
        </div>

        <div className="mt-4 flex items-end justify-center gap-1">
          <Wheel label="Sets" values={SETS} value={state.sets} onChange={(v) => onState({ ...state, sets: v })} />
          <span className="pb-16 text-xl text-muted">×</span>
          <Wheel label="Reps" values={REPS} value={state.reps} onChange={(v) => onState({ ...state, reps: v })} />
          <span className="pb-16 text-xl text-muted">×</span>
          <Wheel label="Lbs" values={WEIGHT} value={state.weight} onChange={(v) => onState({ ...state, weight: v })} />
        </div>

        <button type="button" onClick={add} disabled={busy}
          className="mt-4 w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80 disabled:opacity-60">
          Add set
        </button>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}

        {logged.length > 0 && (
          <section className="mt-4 flex flex-col gap-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted">Sets logged this workout</h3>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
              {logged.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>
                  <span className="flex-1 text-base tabular-nums">{r.weight} × {r.reps}{r.sets > 1 ? ` ×${r.sets}` : ""}</span>
                  <span className="text-accent">✓</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: `app/workout/[id]/page.tsx` (active state)**

```tsx
// app/workout/[id]/page.tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AuthGuard from "@/components/AuthGuard";
import ExerciseRow from "@/components/ExerciseRow";
import SetSheet, { type SheetState } from "@/components/SetSheet";
import { MUSCLE_GROUPS, exercisesFor, findExercise, muscleLabel, normalizeName, searchExercises,
  type MuscleGroup } from "@/lib/exercises";
import { formatElapsed, lastSession, recentExercises, type LiftRow, type WorkoutRow } from "@/lib/workouts";
import { deleteWorkout, endWorkout, getWorkout, listLiftsForWorkout, listRecentLifts, logSet } from "@/lib/workouts-db";

const DEFAULT_STATE: SheetState = { sets: 1, reps: 8, weight: 0 };

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<WorkoutRow | null | undefined>(undefined);
  const [history, setHistory] = useState<LiftRow[]>([]);   // newest-first, all exercises
  const [logged, setLogged] = useState<LiftRow[]>([]);     // this workout, oldest-first
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState<string | null>(null);   // exercise name in the sheet
  const [wheel, setWheel] = useState<Record<string, SheetState>>({});
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState("");

  useEffect(() => {
    getWorkout(id).then(setWorkout).catch(() => setWorkout(null));
    listRecentLifts().then(setHistory).catch(() => {});
    listLiftsForWorkout(id).then(setLogged).catch(() => {});
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const groups = workout?.muscle_groups ?? [];
  const previousRows = useMemo(() => history.filter((r) => r.workout_id !== id), [history, id]);
  const recents = useMemo(() => recentExercises(previousRows, groups), [previousRows, groups]);
  const setCount = useCallback((name: string) =>
    logged.filter((r) => normalizeName(r.exercise) === normalizeName(name)).reduce((a, r) => a + r.sets, 0), [logged]);

  function openSheet(name: string) {
    if (!wheel[name]) {
      const prev = lastSession(name, previousRows);
      const seed = prev[0] ? { sets: prev[0].sets, reps: prev[0].reps, weight: prev[0].weight } : DEFAULT_STATE;
      setWheel((w) => ({ ...w, [name]: seed }));
    }
    setOpen(name);
  }

  async function addSet() {
    if (!open) return;
    const s = wheel[open] ?? DEFAULT_STATE;
    const row = await logSet({ workout_id: id, exercise: open, sets: s.sets, reps: s.reps, weight: s.weight });
    setLogged((l) => [...l, row]);
  }

  async function complete() {
    try {
      if (logged.length === 0) { await deleteWorkout(id); router.replace("/"); return; }
      const ended_at = await endWorkout(id);
      setWorkout((w) => (w ? { ...w, ended_at } : w));
    } catch { setErr("Couldn't complete. Please try again."); }
  }

  function addCustom() {
    const name = custom.trim();
    if (!name) return;
    setCustom("");
    openSheet(findExercise(name)?.name ?? name);
  }

  if (workout === undefined) return <AuthGuard><main className="min-h-dvh bg-background" /></AuthGuard>;
  if (workout === null) return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pt-6 text-foreground">
        <p className="text-muted">Workout not found.</p>
        <Link href="/" className="text-accent">Back home</Link>
      </main>
    </AuthGuard>
  );

  if (workout.ended_at) return <AuthGuard><main className="p-4 text-foreground">Summary coming</main></AuthGuard>;

  const q = query.trim();
  const searchHits = q ? searchExercises(q) : [];
  const title = groups.length === 5 && groups.every((g) => ["chest", "back", "shoulders", "biceps", "triceps"].includes(g))
    ? "Upper" : groups.length === 3 && groups.every((g) => ["quads", "hamstrings_glutes", "core"].includes(g))
    ? "Lower" : groups.map(muscleLabel).join(" · ");
  const openMuscle = open ? findExercise(open)?.muscles[0] : undefined;

  return (
    <AuthGuard>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
            <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          </div>
          <span className="rounded-full border border-accent/40 px-3 py-1.5 text-lg font-semibold tabular-nums text-accent">
            ⏱ {formatElapsed(now - new Date(workout.started_at).getTime())}
          </span>
        </div>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search exercises"
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base placeholder:text-muted focus:border-accent focus:outline-none" />

        {q ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Search</h2>
            <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {searchHits.map((x) => (
                <ExerciseRow key={x.name} name={x.name} muscle={x.muscles[0]} setCount={setCount(x.name)} onClick={() => openSheet(x.name)} />
              ))}
              {searchHits.length === 0 && <p className="px-3 py-3 text-sm text-muted">No matches — add it below.</p>}
            </div>
          </section>
        ) : (
          <>
            {recents.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">Recently used</h2>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {recents.map((name) => (
                    <ExerciseRow key={name} name={name} muscle={findExercise(name)?.muscles[0]} setCount={setCount(name)} onClick={() => openSheet(name)} />
                  ))}
                </div>
              </section>
            )}
            {MUSCLE_GROUPS.filter((m) => groups.includes(m.id)).map((m) => (
              <section key={m.id} className="flex flex-col gap-2">
                <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted">{m.label}</h2>
                <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {exercisesFor([m.id]).slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => (
                    <ExerciseRow key={x.name} name={x.name} muscle={m.id} setCount={setCount(x.name)} onClick={() => openSheet(x.name)} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        <div className="flex items-center gap-2 rounded-2xl border border-accent/40 bg-surface px-4 py-3">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Add exercise — type a name"
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
            className="flex-1 bg-transparent text-base placeholder:text-muted focus:outline-none" />
          <button type="button" onClick={addCustom} className="text-accent">Add ›</button>
        </div>
        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
          <button type="button" onClick={complete}
            className="w-full rounded-xl bg-accent py-4 text-lg font-bold text-accent-foreground active:opacity-80">
            ✓ Complete workout
          </button>
        </div>

        {open && (
          <SetSheet exercise={open} muscle={openMuscle}
            previous={lastSession(open, previousRows)}
            logged={logged.filter((r) => normalizeName(r.exercise) === normalizeName(open))}
            state={wheel[open] ?? DEFAULT_STATE}
            onState={(s) => setWheel((w) => ({ ...w, [open]: s }))}
            onAdd={addSet} onClose={() => setOpen(null)} />
        )}
      </main>
    </AuthGuard>
  );
}
```

- [ ] **Step 4: Typecheck + dev check**

Run: `npx tsc --noEmit`. Then, with the SQL applied, `npm run dev` → `/workout/new` → Upper → Start → tap `DB Chest Press` → sheet opens with wheels at `1 / 8 / 0` (or last session) → spin → Add set → row appears, badge on the list row reads `1 set`. Timer ticks.

- [ ] **Step 5: Commit**

```bash
git add components/ExerciseRow.tsx components/SetSheet.tsx "app/workout/[id]/page.tsx"
git commit -m "feat: active workout page with exercise list and set sheet"
```

---

### Task 9: Summary state

**Files:**
- Create: `components/WorkoutSummary.tsx`
- Modify: `app/workout/[id]/page.tsx` — replace the `Summary coming` line

**Interfaces:**
- Consumes: Task 3 `groupByExercise`, `beatLastTime`, `lastSession`, `formatElapsed`, `totalSets`, `totalVolume`, `localDateOf`; Task 2 `findExercise`, `muscleLabel`, `muscleShort`.
- Produces: `export default function WorkoutSummary(p: { workout: WorkoutRow; logged: LiftRow[]; history: LiftRow[] }): JSX.Element` (`history` newest-first, all rows; the component filters to `logged_at < workout.started_at` for "previous").

- [ ] **Step 1: Implement**

```tsx
// components/WorkoutSummary.tsx
"use client";
import Link from "next/link";
import { findExercise, muscleLabel, muscleShort } from "@/lib/exercises";
import { beatLastTime, formatElapsed, groupByExercise, lastSession, totalSets, totalVolume,
  type LiftRow, type WorkoutRow } from "@/lib/workouts";

export default function WorkoutSummary({ workout, logged, history }: {
  workout: WorkoutRow; logged: LiftRow[]; history: LiftRow[];
}) {
  const started = new Date(workout.started_at);
  const ended = new Date(workout.ended_at ?? workout.started_at);
  const previousRows = history.filter((r) => r.logged_at < workout.started_at);
  const groups = groupByExercise(logged);
  const beats = groups.filter((g) => beatLastTime(g.rows, lastSession(g.exercise, previousRows))).length;
  const title = workout.muscle_groups.map(muscleLabel).join(" · ");
  const when = started.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-background px-4 pb-28 pt-6 text-foreground">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-2xl leading-none text-accent">‹</Link>
        <span className="rounded-full border border-accent/40 px-3 py-1.5 text-lg font-semibold tabular-nums text-accent">
          ⏱ {formatElapsed(ended.getTime() - started.getTime())}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-accent text-2xl text-accent">✓</span>
        <h1 className="text-3xl font-bold">Workout complete</h1>
        <p className="text-[15px] text-muted">{title} · {when}</p>
        <p className="text-[15px] tabular-nums text-muted">{formatElapsed(ended.getTime() - started.getTime())}</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-base font-semibold">Performance summary</h2>
        <div className="grid grid-cols-3 divide-x divide-border text-center">
          {([["Sets", totalSets(logged)], ["Volume (lbs)", totalVolume(logged).toLocaleString()], ["Beat last time", beats]] as const).map(([label, v]) => (
            <div key={label} className="px-2">
              <p className="text-[22px] font-bold tabular-nums">{v}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {groups.map((g) => {
        const beat = beatLastTime(g.rows, lastSession(g.exercise, previousRows));
        return (
          <section key={g.exercise} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-semibold text-muted">
                {muscleShort(findExercise(g.exercise)?.muscles[0])}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold">{g.exercise}</h3>
                  {beat && <span className="rounded-full bg-accent/15 px-3 py-1 text-[13px] font-semibold text-accent">Beat last time</span>}
                </div>
                <ul className="flex flex-col gap-1">
                  {g.rows.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">{i + 1}</span>
                      <span className="text-base tabular-nums">{r.weight} × {r.reps}{r.sets > 1 ? ` ×${r.sets}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-background via-background px-4 pb-6 pt-3">
        <Link href="/" className="block w-full rounded-xl bg-accent py-4 text-center text-lg font-bold text-accent-foreground active:opacity-80">
          Done
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `app/workout/[id]/page.tsx` add `import WorkoutSummary from "@/components/WorkoutSummary";` and replace

```tsx
  if (workout.ended_at) return <AuthGuard><main className="p-4 text-foreground">Summary coming</main></AuthGuard>;
```

with

```tsx
  if (workout.ended_at) return <AuthGuard><WorkoutSummary workout={workout} logged={logged} history={history} /></AuthGuard>;
```

Also, when `history` was fetched before this workout's sets landed, the summary's `history` still contains them under this `workout_id`; `previousRows` filters by `logged_at < started_at`, so that is safe.

- [ ] **Step 3: Typecheck + dev check**

Run: `npx tsc --noEmit`. Dev: complete a workout with two sets → summary shows the hero, stats strip (`2 / volume / 0 or 1`), one card with two rows, Done returns home. Reload the URL → same summary.

- [ ] **Step 4: Commit**

```bash
git add components/WorkoutSummary.tsx "app/workout/[id]/page.tsx"
git commit -m "feat: workout summary with beat-last-time markers"
```

---

### Task 10: Dashboard entry points + remove the old form

**Files:**
- Modify: `app/page.tsx` (imports; the `+ Lift` link block at ~lines 162-167; a Resume card)
- Delete: `app/log/lift/page.tsx`

- [ ] **Step 1: Dashboard changes**

Add imports:

```tsx
import { getActiveWorkout } from "@/lib/workouts-db";
import { formatElapsed, type WorkoutRow } from "@/lib/workouts";
```

Add state + load (next to the other `useState`s and inside the existing `load` callback's `Promise.all` is fine, but simplest is a separate effect):

```tsx
  const [active, setActive] = useState<WorkoutRow | null>(null);
  useEffect(() => {
    getActiveWorkout().then(setActive).catch(() => setActive(null));
  }, []);
```

Replace the `+ Lift` `<Link …href="/log/lift">…</Link>` with:

```tsx
          {active ? (
            <Link
              className="flex-1 rounded-xl border border-accent/60 bg-surface px-4 py-4 text-center text-base font-semibold text-accent active:bg-surface-2"
              href={`/workout/${active.id}`}
            >
              Resume · {formatElapsed(Date.now() - new Date(active.started_at).getTime()).replace(/:\d\d$/, "")} min
            </Link>
          ) : (
            <Link
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-4 text-center text-base font-semibold text-foreground active:bg-surface-2"
              href="/workout/new"
            >
              Start workout
            </Link>
          )}
```

(`formatElapsed(...)` gives `34:12`; stripping the trailing `:ss` yields `34` → "Resume · 34 min". For ≥1 h it yields `1:02` → "Resume · 1:02 min" — acceptable.)

- [ ] **Step 2: Delete the old form**

```bash
git rm app/log/lift/page.tsx
```

Search for other references: `grep -rn "log/lift" app components lib` → expect none.

- [ ] **Step 3: Typecheck, tests, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: clean, all tests pass, build succeeds (the build also validates the `[id]` route).

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: dashboard start/resume workout; remove legacy lift form"
```

---

### Task 11: Spec/plan bookkeeping + merge readiness

**Files:**
- Modify: `docs/superpowers/specs/2026-09-01-workout-flow-design.md` — under "Recently used & last time" change "Data access (thin, in the same file)" to "Data access (thin, in `lib/workouts-db.ts`)" and note the queue's never-overtake rule under Offline.

- [ ] **Step 1: Edit the spec lines above, commit**

```bash
git add docs/superpowers/specs/2026-09-01-workout-flow-design.md
git commit -m "docs: spec follows implementation (workouts-db split, never-overtake queue rule)"
```

- [ ] **Step 2: Final verification before hand-off**

Run: `npx vitest run && npx tsc --noEmit && npm run build` — paste the summary lines into the hand-off message. Then use `superpowers:finishing-a-development-branch` (merge `feat/workout-flow` into `main`; do not push until the SQL from Task 1 has been applied in Supabase).

**Phone checks after deploy (George):** Start Upper → `DB Chest Press` 95×6 then 90×7 → badge `2 sets` → Complete → summary shows both rows → dashboard "Today's lifts" shows both → Daily note gets two Lifts rows within 20 min → airplane mode: Add a set, back online, it appears.
