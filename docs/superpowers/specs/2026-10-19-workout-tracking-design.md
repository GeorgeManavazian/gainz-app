# Workout tracking v2 — delete sets, custom exercises, weekly 2× muscle frequency

Date: 2026-10-19 · Status: builder-checked, awaiting George's approval · Roadmap: precedes "Lift PRs and progression"

## Intent

Three things George hit while using the workout flow, found in the same conversation:

1. A set logged wrong can't be removed. Only workaround is to live with it.
2. Typing a new exercise into "Add exercise" opens the set sheet and nothing else. The name is never saved. Next workout it has to be typed again, and search never finds it.
3. Picking "Chest" or "Upper" when starting a workout felt like it did nothing. The real want behind that complaint is not list filtering. It is: **know, per week, whether every muscle got trained twice**, and get told during a workout when something is behind.

The muscle-tracking piece changes the exercise library's muscle model from 8 coarse groups to ~18 fine muscles, invisibly: the workout picker stays exactly as it is. The fine muscles only surface in tracking.

## Goals

- Remove a logged set from inside the set sheet, offline-safe.
- Custom exercises persist per user, with a muscle assignment, and behave like library exercises everywhere (sections, search, badge, recents, Performance).
- Weekly frequency view: per fine muscle, how many workouts hit it this week against a 2× target, plus primary set count.
- In-workout nudge: a strip listing muscles still behind this week, tappable to narrow the exercise list to that muscle.

## Non-goals

- Lift PRs / suggested loads (next roadmap item, separate spec).
- Any HUB card for weekly frequency. Performance tab + in-workout strip only.
- Per-user editable targets, or a settings screen. Targets are constants for now.
- Retroactively promoting old free-typed exercise names from `lifts` into custom exercises.
- Changing the "New workout" picker or the Upper/Lower presets. Zero new taps to start a workout.
- Undo after delete.
- Reconciling deletes with the Gainz vault. `~/.config/gainz/vault_sync.py` copies new `lifts` rows into the vault every 20 min and never re-reads; a set deleted after it was copied stays in the vault. George decided 2026-10-19: accept the drift, the app database is the source of truth for lifts.

## Anti-goals (would make this a failure even if it works)

- Starting a workout takes more taps than today.
- Strip nags about muscles the user never asked to track (forearms, calves, etc.).
- A delete that silently reappears after reconnecting (offline queue overtaking it).
- A custom exercise that still vanishes on the next workout.

## Constraints

- Next.js app router, client components, Supabase with RLS, `vitest` for pure logic. Follow existing module split: pure logic in `lib/*.ts` with tests, Supabase I/O in `lib/*-db.ts`, UI in `app/` and `components/`.
- Offline writes go through `lib/queue.ts` (`enqueueOrSend`, strict FIFO, idempotent by UUID primary key). New write kinds must fit that model.
- No hex colours outside the token sheet; reuse existing surface/border/accent classes.
- `workouts.muscle_groups` keeps storing the existing 8 group ids. No data migration.
- Existing tests keep passing except where this spec changes a contract (noted below).

---

## Part A — Muscle taxonomy

### Fine muscles (`Muscle`), display order, region, default 2× target

| id | label | region (`MuscleGroup`) | target |
|---|---|---|---|
| `upper_chest` | Upper chest | chest | 2 |
| `mid_chest` | Mid chest | chest | 2 |
| `lower_chest` | Lower chest | chest | — |
| `front_delts` | Front delts | shoulders | — |
| `side_delts` | Side delts | shoulders | 2 |
| `rear_delts` | Rear delts | shoulders | 2 |
| `lats` | Lats | back | 2 |
| `upper_back` | Upper back | back | 2 |
| `traps` | Traps | back | — |
| `lower_back` | Lower back | back | 2 |
| `biceps` | Biceps | biceps | 2 |
| `triceps` | Triceps | triceps | 2 |
| `forearms` | Forearms | biceps | — |
| `quads` | Quads | quads | 2 |
| `hamstrings` | Hamstrings | hamstrings_glutes | 2 |
| `glutes` | Glutes | hamstrings_glutes | 2 |
| `calves` | Calves | hamstrings_glutes | — |
| `abs` | Abs | core | — |

"—" = tracked and displayed, never counted as "behind". George named the targeted twelve; the six untargeted are my additions so the taxonomy is complete. Upper back = rhomboids + mid traps; `traps` = upper traps (shrugs).

The 8 existing `MuscleGroup` ids, `MUSCLE_GROUPS`, and `PRESETS` do not change. Each region has a **default muscle** used when a custom exercise is created with only a region chosen: chest→`mid_chest`, shoulders→`side_delts`, back→`lats`, biceps→`biceps`, triceps→`triceps`, quads→`quads`, hamstrings_glutes→`hamstrings`, core→`abs`.

### Exercise shape

```ts
type Exercise = {
  name: string;
  primary: Muscle[];     // ≥1
  secondary: Muscle[];   // may be empty
  muscles: MuscleGroup[]; // DERIVED: regions of PRIMARY muscles only, deduped, in primary order
};
```

`muscles` stays so `exercisesFor`, `muscleShort`, `recentExercises`, `WorkoutSummary` keep working unchanged. It is computed by the `e(...)` helper, never hand-written. First region = `muscles[0]` = badge shown in rows (today's behaviour).

**Secondary muscles never affect section membership.** If they did, every press would show under Chest, Shoulders and Triceps and the Shoulders section would more than double. Consequence: a few exercises move sections versus today (e.g. "Incline DB Press" is chest-only now, "Deadlift" lands under Hams & Glutes and Back only because `lower_back` is primary). Secondary muscles exist for weekly hit counting and tap-to-narrow only.

### Re-tagging the 160 library exercises

All entries get `primary`/`secondary`. Rules the builder applies, with examples:

- Flat pressing (bench, DB chest press, machine press, push-up, dips) → primary `mid_chest`; secondary `triceps`, `front_delts`. Dips also secondary `lower_chest`. Decline variants → primary `lower_chest`.
- Incline pressing/fly → primary `upper_chest`; pressing adds secondary `front_delts`, `triceps`.
- Flys/pec deck → primary chest region by angle (low cable fly → `upper_chest`, high cable fly → `lower_chest`, flat → `mid_chest`), no secondary.
- Vertical pulls (pulldowns, pull-ups, chin-ups, straight-arm pulldown, pullover) → primary `lats`; secondary `biceps` (not straight-arm/pullover), `upper_back`.
- Rows (cable, machine, T-bar, BB, DB, Meadows, chest-supported, inverted) → primary `upper_back`, `lats`; secondary `biceps`, `rear_delts`.
- Face pull, reverse pec deck, rear delt fly → primary `rear_delts`; secondary `upper_back`.
- Shrugs → primary `traps`. Upright row → primary `side_delts`, `traps`.
- Deadlift, trap bar, rack pull, RDL, stiff-leg, sumo, good morning, back extension → primary `hamstrings`, `glutes`, `lower_back` (rack pull / back extension / good morning: drop glutes to secondary). Secondary `traps`, `upper_back`, `lats` for the full deadlift family; sumo and trap bar add secondary `quads`.
- Overhead/shoulder presses, Arnold, push press, landmine press → primary `front_delts`; secondary `triceps`, `side_delts`; landmine adds `upper_chest`.
- Lateral raises (all) → primary `side_delts`. Front raises → primary `front_delts`.
- Curls → primary `biceps`; hammer/cross-body/reverse curls → primary `biceps` + `forearms`.
- Triceps isolation → primary `triceps`. Close-grip bench, JM press, bench dip → primary `triceps`; secondary `mid_chest`, `front_delts`.
- Squats (back, front, hack, smith, goblet, pendulum, belt, sissy), leg press, leg extension → primary `quads`; compound squats/leg press add secondary `glutes`; back squat adds secondary `lower_back`.
- Lunges, split squats, step-ups → primary `quads`, `glutes`; secondary `hamstrings`.
- Leg curls, Nordic → primary `hamstrings`. Hip thrust, glute bridge, cable kickback, hip abduction → primary `glutes`. Hip adduction → primary `glutes` (no adductor bucket; my call). Kettlebell swing → primary `glutes`, `hamstrings`; secondary `lower_back`.
- Calf raises → primary `calves`.
- Core → primary `abs`. Farmer's carry → primary `forearms`, `traps`; secondary `abs`.

Builder uses judgment for anything not listed; George spot-checks the table after. No exercise may end with zero primary.

### Tests (in `lib/exercises.test.ts`, replace/extend)

- Every `Muscle` id has a region and a label; every region has a default muscle that belongs to it.
- Every exercise: ≥1 primary, no muscle in both primary and secondary, `muscles` equals the derived regions, `muscles[0]` is the region of `primary[0]`.
- Existing name/duplicate/indicator tests unchanged.
- `exercisesFor(["chest"])` still contains "DB Chest Press" and not "Lat Pulldown"; "Incline DB Press" appears under chest only (secondary `front_delts` does not put it in shoulders); "Deadlift" appears under both hamstrings_glutes and back (both primary regions). The existing "multi-muscle exercise appears for either group" test is rewritten against Deadlift.

---

## Part B — Custom exercises

### Data

```sql
create table if not exists custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  primary_muscles text[] not null check (cardinality(primary_muscles) > 0),
  secondary_muscles text[] not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists custom_exercises_user_name_idx
  on custom_exercises (user_id, lower(name));
alter table custom_exercises enable row level security;
create policy "own custom_exercises" on custom_exercises for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Appended to `supabase/schema.sql` as "Sub-project 8" in the existing paste-once style. George pastes it in the Supabase SQL editor (agents can't).

### Library merge

A `Library` value = built-in `EXERCISES` + the user's custom rows, mapped to the same `Exercise` shape (regions derived). On a name collision (normalised) the built-in wins. All lookups that today read the global constant (`findExercise`, `exercisesFor`, `searchExercises`) get a library-aware form; pages load customs once on mount alongside lifts and pass the merged library down. `recentExercises` and `WorkoutSummary` take the library too. Builder decides whether that's a parameter or a small `createLibrary(customs)` object; the global constant stays for tests and as the fallback before customs load.

### Create flow (workout page)

"Add exercise" input stays. Typing a name and pressing Add:

- If it normalises to a library or existing custom name → open the set sheet for that (today's behaviour, no duplicate).
- Otherwise open a small **New exercise** sheet: name (editable, prefilled), one row of region chips (all 8, this workout's groups listed first, first of them preselected), below it one row of that region's fine muscles with the region default preselected. Multi-select allowed within the row; every selected chip is **primary**. No secondary for customs (my call, keeps it one or two taps). Save → row inserted, library updated in state, set sheet opens for it immediately.
- Cancel → nothing saved, input cleared.

Offline: insert goes through `enqueueOrSend("custom_exercises", …)`. `QueueTable` gains `"custom_exercises"`. **Note for the builder:** `send()` currently appends `logged_at: queued_at` to every non-workout insert; `custom_exercises` has no such column, so the payload shaping must become per-table (lifts get `logged_at`, others don't). The optimistic UI uses the client-generated UUID exactly as `logSet` does.

Duplicate name on the server (unique index, code `23505`) is treated as success by the queue already; UI should reload customs after a successful create so the canonical row wins.

### Tests

- `lib/custom-exercises.ts` (pure): `toExercise(row)` derives regions; `mergeLibrary(builtins, customs)` dedupes by normalised name with built-in winning; `lookupExercise(library, "Lat Pulldown ")` works case/space-insensitively.
- Queue: an insert for `custom_exercises` carries no `logged_at`; a `lifts` insert still does.

---

## Part C — Delete a set

### Behaviour

In the set sheet's "Sets logged this workout" list, the ✓ becomes a ✕ button. First tap turns that row into a red "Delete?" state; second tap deletes; tapping anywhere else or opening another row resets. Optimistic: row leaves the list immediately, exercise set-count badge updates, errors show the existing inline error text and restore the row.

### Semantics

`deleteSet(id)` in `lib/workouts-db.ts` → `enqueueOrSend("lifts", {}, { id, op: "delete" })`. `QueueOp` gains `"delete"`; `send()` runs `supabase.from(table).delete().eq("id", id)`. Deleting a row that doesn't exist is success (no error from PostgREST), so it's idempotent. Because the queue never lets a new item overtake a waiting one, a delete for a set whose insert is still queued simply lands after it. No pruning of the queued insert (avoids a race with an in-flight flush).

`listLiftsForWorkout` must exclude any id that has a pending `delete` in the queue, so a reload while offline doesn't resurrect the set.

### Tests (`lib/queue.test.ts`, `lib/workouts-db.test.ts`)

- `send` for `op: "delete"` calls delete by id and returns "ok" on no error.
- Queued delete behind a queued insert for the same id: flush order insert → delete; both removed.
- `listLiftsForWorkout` hides a server row whose id has a queued delete.

---

## Part D — Weekly muscle frequency

### Definitions

- **Week** = Monday 00:00 local → Sunday 23:59 local. `weekStartOf(date)` returns the Monday as `YYYY-MM-DD`. Workouts belong to the week of their `started_at`; legacy lifts with `workout_id = null` belong to the week of their `logged_at` and count as one pseudo-workout per local date (same grouping `sessionsFor` already uses).
- **Hit**: a muscle is hit by a workout when ≥1 lift in that workout is for an exercise whose `primary ∪ secondary` contains it. Hits per week = number of distinct workouts that hit it.
- **Sets**: sum of `sets` over lifts whose exercise has the muscle in **primary** only. Secondary never inflates set counts.
- **Behind**: muscle has a target and `hits < target`.
- Exercises not found in the library (legacy free-typed names) contribute nothing.

### Pure contract (`lib/muscle-week.ts`)

```ts
type MuscleWeek = Record<Muscle, { hits: number; sets: number }>;
weekStartOf(d: Date): string
muscleWeek(lifts: LiftRow[], library: Library, weekStart: string): MuscleWeek
behindThisWeek(week: MuscleWeek): Muscle[]   // targeted, hits < target, taxonomy order
recentWeeks(lifts, library, n: number, today: Date): { weekStart: string; week: MuscleWeek }[]  // current first
```

Reference cases:

- Mon bench 3×8, Thu incline 3×8, Thu lateral raise 4×12, both in different workouts → `mid_chest {hits 1, sets 3}`, `upper_chest {1, 3}`, `front_delts {2, 0}`, `triceps {2, 0}`, `side_delts {1, 4}`; `behindThisWeek` includes `mid_chest`, `upper_chest`, `side_delts`, `lats`, … and never `front_delts` or `calves`.
- Two lifts for the same muscle inside one workout → hits 1.
- A lift logged Sunday 23:30 local and one Monday 00:10 local fall in different weeks.
- Legacy null-`workout_id` lifts on one date count as one hit.

### Surfaces

**Performance tab, new top section "This week":** table of all 18 muscles in taxonomy order. Columns: muscle, hits as `1/2` (or plain count for untargeted, muted), sets. ✓ accent when target met; untargeted rows muted. Below it a compact "Last 3 weeks" view: per muscle, hits only, oldest→newest. Exact layout goes through the project's usual design step (image candidates, pick one, build from the render).

**Workout page, strip under the header:** shows only when the user has ≥1 *completed* workout in the current week (so the first session of the week doesn't list everything). Chips: `Side delts 0/2`, `Lats 1/2` … taxonomy order, only targeted muscles still behind, excluding muscles already hit by lifts logged in this workout so chips disappear as you train. **Only muscles whose region is in this workout's `muscle_groups` are shown as chips**; behind muscles from other regions collapse into one muted `+N more` chip that expands them on tap (so leg day doesn't nag about delts, but you can still bolt on lateral raises if you want). If nothing in this workout's regions is behind and N = 0, the strip is hidden. Tap a chip → the exercise list below collapses to one section named for that muscle listing every library+custom exercise whose primary or secondary includes it (primary ones first), set counts still shown. Tap again or tap "All" → back to the full sectioned list. Search still works on top of either view.

### Loads

Workout page already loads `listRecentLifts()` (400 rows newest-first); weekly math uses the same array, so no new query. Performance tab already loads 2000 rows. Both pages additionally load `listCustomExercises()` once. Completed-workouts-this-week check for the strip: derive from `history` rows (any `workout_id ≠ current` with `logged_at` in this week) rather than a new query.

---

## Left to the builder

- Module boundaries for the library-aware lookups; naming.
- Chip, table, and sheet visuals (through the design step), within existing tokens.
- Whether `Library` is cached in `sessionStorage` like workouts; not required.
- Order of tasks in the plan. Suggested: A (taxonomy + tests) → C (delete) → B (custom) → D (weekly), since D depends on A and B.

## Decisions made in brainstorming (George's unless marked)

- Picker unchanged, fine muscles behind the scenes. (George)
- Taxonomy list above; 2× target on the twelve George named; my six fills untargeted. (list George approved; untargeted = my call)
- Weekly tracking lives in Performance tab + in-workout strip; no HUB card. (my call, George said Performance was fine)
- Secondary muscles count for hits but not for sets. (my call)
- Strip hidden until one workout this week is completed; chips limited to this workout's regions with `+N more` for the rest. (my call, after builder check)
- Section membership from primary muscles only. (my call, after builder check)
- Delete = two-tap confirm, no undo; routed through the offline queue as a `delete` op; no pruning of queued inserts. (my call)
- Custom exercises: region chips then muscle chips, all selected = primary, no secondary; built-in wins on name collision. (my call)
- Hip adduction counted as glutes; no adductor bucket. (my call)
- Tap-to-narrow is the only list filtering added; George called it "nice to have". (George)
