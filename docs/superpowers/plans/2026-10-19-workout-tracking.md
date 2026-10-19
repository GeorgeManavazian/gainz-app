# Workout Tracking v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete a logged set, keep custom exercises forever with a muscle assignment, and show per-muscle weekly frequency against a 2× target, both on the Performance tab and as a nudge strip inside a workout.

**Architecture:** A new `lib/muscles.ts` owns the 8 regions (moved from `lib/exercises.ts`, re-exported for compatibility) and the 18 fine muscles with targets. `Exercise` gains `primary`/`secondary` fine muscles and its `muscles` (regions) become derived. Every lookup in `lib/exercises.ts` takes an optional `Library` so built-ins and the user's `custom_exercises` rows merge into one list at the page level. The offline queue gains a `delete` op and a `custom_exercises` table. A new pure `lib/muscle-week.ts` turns lift rows + a library into per-muscle `{hits, sets}` for a Monday-start week. UI: a ✕ in `SetSheet`, a `NewExerciseSheet`, a `MuscleStrip` on the workout page, a `WeeklyMuscles` section on Performance.

**Tech Stack:** TypeScript, Next.js App Router (client components), Supabase (RLS, anon client + session), `idb-keyval` offline queue, Vitest (`npm test` = `vitest run`, node environment, no DOM testing).

**Spec:** `docs/superpowers/specs/2026-10-19-workout-tracking-design.md`

## Global Constraints

- The "New workout" picker, `MUSCLE_GROUPS` (8 ids in order `chest, back, shoulders, biceps, triceps, quads, hamstrings_glutes, core`) and `PRESETS` do not change. `workouts.muscle_groups` keeps storing those ids. No data migration.
- 18 fine muscles in this display order with targets: `upper_chest 2, mid_chest 2, lower_chest —, front_delts —, side_delts 2, rear_delts 2, lats 2, upper_back 2, traps —, lower_back 2, biceps 2, triceps 2, forearms —, quads 2, hamstrings 2, glutes 2, calves —, abs —`. Regions: chest ×3, shoulders ×3, back ×4 (`lats, upper_back, traps, lower_back`), biceps (`biceps, forearms`), triceps, quads, hamstrings_glutes (`hamstrings, glutes, calves`), core (`abs`).
- Region defaults for custom exercises: chest→`mid_chest`, shoulders→`side_delts`, back→`lats`, biceps→`biceps`, triceps→`triceps`, quads→`quads`, hamstrings_glutes→`hamstrings`, core→`abs`.
- `Exercise.muscles` = regions of **primary** muscles only, deduped, in primary order. Secondary never affects section membership or set counts; it only counts toward weekly hits and tap-to-narrow.
- Week = Monday 00:00 local → Sunday 23:59 local. Hit = distinct workout (or distinct local date for `workout_id = null`) with ≥1 lift whose exercise has the muscle in primary ∪ secondary. Sets = Σ `sets` over lifts with the muscle in primary. Behind = target set and `hits < target`.
- Strip: hidden until ≥1 completed workout this week (any history row with `workout_id ≠ current` in this week); chips only for muscles whose region ∈ this workout's `muscle_groups`; other behind muscles under one `+N more` chip; muscles already hit by lifts logged in this workout excluded.
- Delete = hard delete through the queue as `op: "delete"`; no pruning of a queued insert for the same id; two-tap confirm; no undo. Vault drift accepted.
- Custom exercise: all picked muscles are primary, `secondary_muscles = '{}'`; built-in wins on a normalised-name collision; unique index on `(user_id, lower(name))`.
- Offline queue invariants hold: strict FIFO, never overtake, UUID-keyed idempotent inserts, `23505` = done.
- No hex colours outside `app/globals.css` tokens; reuse `bg-surface`, `border-border`, `text-accent`, `text-danger`, `text-muted`, `bg-accent/15` etc.
- Commit messages: conventional (`feat(workout): …`, `fix(queue): …`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

- A lift whose exercise name isn't in the library (old free-typed names) must contribute nothing to weekly math and never throw. → Task 9 test "unknown exercise names are ignored".
- Sunday 23:30 local and Monday 00:10 local must land in different weeks; `toISOString()` UTC dates must not leak into week keys. → Task 9 test "week boundary is local Monday".
- Deleting a set while its insert is still queued must end with no row on the server and no resurrected row on reload. → Task 4 test "delete queued behind its own insert", Task 5 test "hides a server row with a queued delete".
- Typing a built-in name with different case or trailing spaces into "Add exercise" must open the built-in, never create a duplicate custom row. → Task 3 test "mergeLibrary: built-in wins", Task 8 wiring uses `findExercise(name, library)` first.
- Performance tab with zero lifts must render 18 rows of `0/2` / `0`, no `NaN`, no crash. → Task 9 test "empty input gives all zeros".

---

### Task 0: Design renders (main session only)

Needs the `12ui-design` skill, so the main session runs this task itself rather than a subagent. George picks one candidate per screen.

**Files:**
- Create: `docs/superpowers/design/2026-10-19-weekly-muscles-12ui-<X>.png` (Performance "This week" table + "Last 3 weeks")
- Create: `docs/superpowers/design/2026-10-19-muscle-strip-12ui-<X>.png` (workout page with the strip, one chip active and the list narrowed)
- Create: `docs/superpowers/design/2026-10-19-new-exercise-sheet-12ui-<X>.png`
- Create: `docs/superpowers/design/2026-10-19-set-delete-12ui-<X>.png` (set sheet with one row in "Delete?" state)

- [ ] **Step 1: Generate candidates** with `12ui-design` for each of the four screens, using the existing app's palette (`app/globals.css`: lavender accent `#b4a2f5` on `#1e1e2e` background, cards `#2a2b3d`) and the phone frame of existing renders in `docs/superpowers/design/`.
- [ ] **Step 2: George picks one per screen.** Save the chosen PNGs under the paths above (replace `<X>` with the candidate letter). Delete the losers.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/design/2026-10-19-*.png docs/superpowers/specs/2026-10-19-workout-tracking-design.md docs/superpowers/plans/2026-10-19-workout-tracking.md
git commit -m "docs(workout): spec, plan and design renders for workout tracking v2"
```

---

### Task 1: Muscle taxonomy module

**Files:**
- Create: `lib/muscles.ts`
- Create: `lib/muscles.test.ts`
- Modify: `lib/exercises.ts:1-20` (move `MuscleGroup`, `MUSCLE_GROUPS`, `PRESETS` out; re-export them)

**Interfaces:**
- Produces:
  ```ts
  export type MuscleGroup = "chest" | "back" | "shoulders" | "biceps" | "triceps" | "quads" | "hamstrings_glutes" | "core";
  export const MUSCLE_GROUPS: { id: MuscleGroup; label: string; short: string }[];   // moved verbatim
  export const PRESETS: Record<"upper" | "lower", MuscleGroup[]>;                     // moved verbatim
  export type Muscle = "upper_chest" | "mid_chest" | "lower_chest" | "front_delts" | "side_delts" | "rear_delts"
    | "lats" | "upper_back" | "traps" | "lower_back" | "biceps" | "triceps" | "forearms"
    | "quads" | "hamstrings" | "glutes" | "calves" | "abs";
  export const MUSCLES: { id: Muscle; label: string; region: MuscleGroup; target: number | null }[]; // display order
  export const REGION_DEFAULT: Record<MuscleGroup, Muscle>;
  export function regionOf(m: Muscle): MuscleGroup;
  export function muscleName(m: Muscle): string;        // "Side delts"
  export function targetOf(m: Muscle): number | null;
  export function musclesIn(region: MuscleGroup): Muscle[]; // display order
  export function isMuscle(s: unknown): s is Muscle;
  ```
- `lib/exercises.ts` keeps exporting `MuscleGroup`, `MUSCLE_GROUPS`, `PRESETS`, `muscleLabel`, `muscleShort` (re-exports / unchanged), so no other file changes in this task.

- [ ] **Step 1: Write the failing tests** in `lib/muscles.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { MUSCLES, MUSCLE_GROUPS, PRESETS, REGION_DEFAULT, isMuscle, muscleName, musclesIn, regionOf, targetOf } from "./muscles";

describe("taxonomy", () => {
  it("has 18 muscles in display order", () => {
    expect(MUSCLES.map((m) => m.id)).toEqual(["upper_chest", "mid_chest", "lower_chest", "front_delts", "side_delts", "rear_delts",
      "lats", "upper_back", "traps", "lower_back", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "abs"]);
  });
  it("targets: 2 on the twelve named, null on the rest", () => {
    const targeted = MUSCLES.filter((m) => m.target === 2).map((m) => m.id);
    expect(targeted).toEqual(["upper_chest", "mid_chest", "side_delts", "rear_delts", "lats", "upper_back", "lower_back",
      "biceps", "triceps", "quads", "hamstrings", "glutes"]);
    expect(targetOf("forearms")).toBeNull();
  });
  it("every muscle maps to one of the 8 regions; every region has a default inside it", () => {
    const regions = new Set(MUSCLE_GROUPS.map((g) => g.id));
    for (const m of MUSCLES) expect(regions.has(m.region)).toBe(true);
    for (const g of MUSCLE_GROUPS) expect(regionOf(REGION_DEFAULT[g.id])).toBe(g.id);
    expect(REGION_DEFAULT.shoulders).toBe("side_delts");
  });
  it("musclesIn / muscleName / isMuscle", () => {
    expect(musclesIn("back")).toEqual(["lats", "upper_back", "traps", "lower_back"]);
    expect(muscleName("side_delts")).toBe("Side delts");
    expect(isMuscle("lats")).toBe(true);
    expect(isMuscle("quadz")).toBe(false);
  });
  it("regions and presets moved intact", () => {
    expect(MUSCLE_GROUPS.map((m) => m.id)).toEqual(["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings_glutes", "core"]);
    expect(PRESETS.upper).toEqual(["chest", "back", "shoulders", "biceps", "triceps"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run lib/muscles.test.ts` → FAIL (module not found).
- [ ] **Step 3: Create `lib/muscles.ts`** with the interfaces above; `MUSCLES` is the table from Global Constraints with labels `Upper chest, Mid chest, Lower chest, Front delts, Side delts, Rear delts, Lats, Upper back, Traps, Lower back, Biceps, Triceps, Forearms, Quads, Hamstrings, Glutes, Calves, Abs`. Move `MuscleGroup`, `MUSCLE_GROUPS`, `PRESETS` here from `lib/exercises.ts`; in `lib/exercises.ts` replace them with `export { MUSCLE_GROUPS, PRESETS } from "./muscles"; export type { MuscleGroup } from "./muscles";` plus an import for internal use.
- [ ] **Step 4: Run** — `npm test` → all pass (existing `exercises.test.ts` still green via re-exports).
- [ ] **Step 5: Commit** — `feat(muscles): fine-muscle taxonomy with 2x targets, regions moved from exercises`

---

### Task 2: Exercise shape + re-tag the library

**Files:**
- Modify: `lib/exercises.ts` (type, `e` helper, all ~160 entries)
- Modify: `lib/exercises.test.ts`

**Interfaces:**
- Consumes: `Muscle`, `regionOf` (Task 1).
- Produces:
  ```ts
  export type Exercise = { name: string; primary: Muscle[]; secondary: Muscle[]; muscles: MuscleGroup[] };
  export function makeExercise(name: string, primary: Muscle[], secondary?: Muscle[]): Exercise; // derives muscles; throws if primary is empty
  export const EXERCISES: Exercise[];
  ```
  `findExercise`, `exercisesFor`, `searchExercises`, `normalizeName`, `muscleLabel`, `muscleShort` unchanged in this task.

- [ ] **Step 1: Write the failing tests** — in `lib/exercises.test.ts` replace the "multi-muscle exercise appears for either group" test and add:

```ts
it("every exercise has ≥1 primary, no overlap, and derived regions from primary only", () => {
  for (const x of EXERCISES) {
    expect(x.primary.length).toBeGreaterThan(0);
    for (const m of x.secondary) expect(x.primary).not.toContain(m);
    const derived = [...new Set(x.primary.map(regionOf))];
    expect(x.muscles).toEqual(derived);
    expect(x.muscles[0]).toBe(regionOf(x.primary[0]));
  }
});
it("spec-pinned tags", () => {
  expect(findExercise("BB Bench Press")).toMatchObject({ primary: ["mid_chest"], secondary: ["triceps", "front_delts"] });
  expect(findExercise("Incline DB Press")).toMatchObject({ primary: ["upper_chest"], secondary: ["front_delts", "triceps"] });
  expect(findExercise("DB Lateral Raise")).toMatchObject({ primary: ["side_delts"], secondary: [] });
  expect(findExercise("Lat Pulldown")!.primary).toEqual(["lats"]);
  expect(findExercise("Deadlift")!.primary).toEqual(["hamstrings", "glutes", "lower_back"]);
  expect(findExercise("Standing Calf Raise")!.primary).toEqual(["calves"]);
  expect(findExercise("Hip Adduction")!.primary).toEqual(["glutes"]);
});
it("secondary muscles do not put an exercise in another section", () => {
  const incline = (g: MuscleGroup[]) => exercisesFor(g).filter((x) => x.name === "Incline DB Press").length;
  expect(incline(["chest"])).toBe(1);
  expect(incline(["shoulders"])).toBe(0);
  const dl = (g: MuscleGroup[]) => exercisesFor(g).filter((x) => x.name === "Deadlift").length;
  expect(dl(["back"])).toBe(1);
  expect(dl(["hamstrings_glutes"])).toBe(1);
});
it("makeExercise rejects an empty primary", () => {
  expect(() => makeExercise("x", [])).toThrow();
});
```

- [ ] **Step 2: Run** — `npx vitest run lib/exercises.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `makeExercise` derives `muscles` per Global Constraints. Rewrite `e` as `e(name, primary, secondary = [])`. Re-tag every entry following the spec's "Re-tagging the 160 library exercises" rules exactly; the eight pinned tags above are mandatory, everything else by the rules (list order unchanged, names unchanged, no entries added or removed).
- [ ] **Step 4: Run** — `npm test` → all green (incl. `workouts.test.ts`, `progress.test.ts`).
- [ ] **Step 5: Commit** — `feat(exercises): primary/secondary fine muscles on every exercise, regions derived`

---

### Task 3: Library-aware lookups + custom-exercise merge (pure)

**Files:**
- Modify: `lib/exercises.ts` (signatures below)
- Modify: `lib/workouts.ts:22` (`recentExercises` gains `lib`)
- Create: `lib/custom-exercises.ts`, `lib/custom-exercises.test.ts`
- Modify: `lib/exercises.test.ts`, `lib/workouts.test.ts`

**Interfaces:**
- Produces (in `lib/exercises.ts`):
  ```ts
  export type Library = readonly Exercise[];
  export function findExercise(name: string, lib?: Library): Exercise | undefined;      // default EXERCISES
  export function exercisesFor(groups: MuscleGroup[], lib?: Library): Exercise[];
  export function searchExercises(query: string, lib?: Library): Exercise[];
  export function exercisesForMuscle(m: Muscle, lib?: Library): Exercise[];              // primary matches (A–Z) then secondary matches (A–Z)
  ```
  `findExercise` keeps O(1) lookup via a `WeakMap<Library, Map<string, Exercise>>` cache.
- Produces (in `lib/custom-exercises.ts`):
  ```ts
  export type CustomExerciseRow = { id: string; name: string; primary_muscles: Muscle[]; secondary_muscles: Muscle[] };
  export function toExercise(row: CustomExerciseRow): Exercise | null;   // null when no valid primary remains after isMuscle filtering
  export function mergeLibrary(builtins: Library, customs: CustomExerciseRow[]): Library; // builtins, then customs not colliding on normalizeName; drops nulls
  ```
- Produces (in `lib/workouts.ts`): `recentExercises(rows: LiftRow[], groups: MuscleGroup[], limit = 8, lib: Library = EXERCISES)`.

- [ ] **Step 1: Write failing tests**

`lib/custom-exercises.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { EXERCISES, findExercise, exercisesFor, searchExercises, exercisesForMuscle } from "./exercises";
import { mergeLibrary, toExercise } from "./custom-exercises";

const row = (name: string, primary: string[]) => ({ id: name, name, primary_muscles: primary as never, secondary_muscles: [] });

describe("custom exercises", () => {
  it("toExercise derives regions and drops unknown muscle ids", () => {
    expect(toExercise(row("Cable Y Raise", ["rear_delts", "bogus"]))).toMatchObject({ primary: ["rear_delts"], muscles: ["shoulders"] });
    expect(toExercise(row("Nothing", ["bogus"]))).toBeNull();
  });
  it("mergeLibrary: built-in wins on a normalised-name collision", () => {
    const lib = mergeLibrary(EXERCISES, [row(" lat pulldown ", ["biceps"]), row("Cable Y Raise", ["rear_delts"])]);
    expect(lib.length).toBe(EXERCISES.length + 1);
    expect(findExercise("Lat Pulldown", lib)!.primary).toEqual(["lats"]);
    expect(findExercise("cable y raise", lib)!.name).toBe("Cable Y Raise");
  });
  it("custom rows show up in sections, search and muscle lookup", () => {
    const lib = mergeLibrary(EXERCISES, [row("Cable Y Raise", ["rear_delts"])]);
    expect(exercisesFor(["shoulders"], lib).some((x) => x.name === "Cable Y Raise")).toBe(true);
    expect(searchExercises("y raise", lib).map((x) => x.name)).toEqual(["Cable Y Raise"]);
    expect(exercisesForMuscle("rear_delts", lib).some((x) => x.name === "Cable Y Raise")).toBe(true);
  });
});
```

`lib/exercises.test.ts`, add:
```ts
it("exercisesForMuscle lists primary matches first, each group alphabetical", () => {
  const names = exercisesForMuscle("triceps").map((x) => x.name);
  const firstSecondary = names.findIndex((n) => findExercise(n)!.secondary.includes("triceps"));
  const lastPrimary = names.map((n) => findExercise(n)!.primary.includes("triceps")).lastIndexOf(true);
  expect(lastPrimary).toBeLessThan(firstSecondary);
  expect(names).toContain("BB Bench Press");
});
```

`lib/workouts.test.ts`, add to `recentExercises`:
```ts
it("uses the passed library to recognise custom names", () => {
  const lib = mergeLibrary(EXERCISES, [{ id: "c", name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] }]);
  const rows = [lift("cable y raise", "2026-10-12T10:00:00Z")]; // use the file's existing row helper
  expect(recentExercises(rows, ["quads"], 8, lib)).toEqual([]);           // library match, wrong group → filtered
  expect(recentExercises(rows, ["shoulders"], 8, lib)).toEqual(["Cable Y Raise"]);
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the signatures above. Default `lib` to `EXERCISES` everywhere so existing callers compile unchanged.
- [ ] **Step 4: Run** — `npm test` → green; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Commit** — `feat(exercises): library-aware lookups and custom exercise merge`

---

### Task 4: Queue — `delete` op and per-table insert payloads

**Files:**
- Modify: `lib/queue.ts:4-5, 36-50`
- Modify: `lib/queue.test.ts` (mock gains `delete`)

**Interfaces:**
- Produces: `type QueueTable = "meals" | "lifts" | "workouts" | "custom_exercises"`; `type QueueOp = "insert" | "update" | "delete"`. `send()` for `delete` runs `supabase.from(table).delete().eq("id", item.id)`; a no-error result is `"ok"`. Insert payload: `lifts` and `meals` get `logged_at: queued_at`; `workouts` and `custom_exercises` do not.

- [ ] **Step 1: Write failing tests** in `lib/queue.test.ts`. Extend the mock's `from()` with `delete: () => ({ eq: async (_c, id) => { h.calls.push({ table, op: "delete", payload: {}, id }); return outcome(); } })`. Add:

```ts
it("delete op calls delete().eq('id') and sends immediately when the queue is empty", async () => {
  expect(await enqueueOrSend("lifts", {}, { id: "s1", op: "delete" })).toBe("sent");
  expect(h.calls[0]).toMatchObject({ table: "lifts", op: "delete", id: "s1" });
});
it("does NOT stamp logged_at for custom_exercises inserts", async () => {
  await enqueueOrSend("custom_exercises", { name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] }, { id: "c1" });
  expect(h.calls[0].payload).toEqual({ name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [], id: "c1" });
});
it("a delete queued behind its own insert flushes insert then delete", async () => {
  h.store.set(KEY, [
    { id: "s1", table: "lifts", op: "insert", entry: { exercise: "x" }, queued_at: "t" },
    { id: "s1", table: "lifts", op: "delete", entry: {}, queued_at: "t2" },
  ] satisfies Queued[]);
  expect(await flushQueue()).toBe(2);
  expect(h.calls.map((c) => c.op)).toEqual(["insert", "delete"]);
  expect(queue()).toEqual([]);
});
```

- [ ] **Step 2: Run** → FAIL (type error on `"delete"` / payload mismatch).
- [ ] **Step 3: Implement** in `lib/queue.ts`. Note `flushQueue` removes settled items by `id`; two queued items share `s1` here, and both are settled in the same pass, so the existing `done` set logic already clears both — keep it, do not key by `id+op`. Update the comment block above `send` to mention delete idempotency (PostgREST returns no error for 0 rows).
- [ ] **Step 4: Run** — `npm test` → green.
- [ ] **Step 5: Commit** — `feat(queue): delete op and per-table insert payloads`

---

### Task 5: `deleteSet` + hide queued deletes on reload

**Files:**
- Modify: `lib/workouts-db.ts` (`listLiftsForWorkout`, new `deleteSet`)
- Modify: `lib/workouts-db.test.ts`

**Interfaces:**
- Consumes: queue `delete` op (Task 4).
- Produces: `export async function deleteSet(id: string): Promise<void>` → `enqueueOrSend("lifts", {}, { id, op: "delete" })`. `listLiftsForWorkout` excludes any id with a queued `{ table: "lifts", op: "delete" }`.

- [ ] **Step 1: Write failing tests** in `describe("listLiftsForWorkout")` and a new `describe("deleteSet")`:

```ts
it("hides a server row whose id has a queued delete", async () => {
  h.liftsData = [{ id: "s1", exercise: "x", sets: 1, reps: 5, weight: 100, logged_at: "2026-10-12T10:00:00Z", workout_id: "w1" }];
  h.store.set("gainz-offline-queue", [{ id: "s1", table: "lifts", op: "delete", entry: {}, queued_at: "t" }]);
  expect(await listLiftsForWorkout("w1")).toEqual([]);
});
it("hides a queued insert that also has a queued delete", async () => {
  h.store.set("gainz-offline-queue", [
    { id: "s1", table: "lifts", op: "insert", entry: { workout_id: "w1", exercise: "x", sets: 1, reps: 5, weight: 100 }, queued_at: "t" },
    { id: "s1", table: "lifts", op: "delete", entry: {}, queued_at: "t2" },
  ]);
  expect(await listLiftsForWorkout("w1")).toEqual([]);
});
describe("deleteSet", () => {
  it("sends a delete for the id", async () => {
    await deleteSet("s1");
    expect(h.calls.at(-1)).toMatchObject({ table: "lifts", op: "delete", id: "s1" });
  });
});
```
(Extend this file's mock `from()` with the same `delete` shape as Task 4 if `makeQuery` doesn't record calls.)

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `npm test` → green.
- [ ] **Step 5: Commit** — `feat(workouts): deleteSet through the offline queue`

---

### Task 6: Delete UI in the set sheet

**Files:**
- Modify: `components/SetSheet.tsx` (props + list rows)
- Modify: `app/workout/[id]/page.tsx` (pass `onDelete`, optimistic update)
- Design: `docs/superpowers/design/2026-10-19-set-delete-12ui-<X>.png` (implement FROM this)

**Interfaces:**
- Consumes: `deleteSet` (Task 5).
- Produces: `SetSheet` prop `onDelete: (id: string) => Promise<void>`.

- [ ] **Step 1: `SetSheet`.** Add `onDelete` prop and `const [confirmId, setConfirmId] = useState<string | null>(null)`. In each logged row replace the `✓` with: when `confirmId !== r.id` a `✕` button (`aria-label="Remove set"`, `text-muted`) that sets `confirmId`; when `confirmId === r.id` a button labelled `Delete?` (`rounded-md bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger`) that calls `onDelete(r.id)`, catching errors into the existing `err` state ("Couldn't delete. Please try again."). Reset `confirmId` to `null` whenever `logged` changes or the sheet closes.
- [ ] **Step 2: Page wiring.** In `app/workout/[id]/page.tsx` add
  ```ts
  async function removeSet(sid: string) {
    const prev = logged;
    setLogged((l) => l.filter((r) => r.id !== sid));
    try { await deleteSet(sid); } catch (e) { setLogged(prev); throw e; }
  }
  ```
  and pass `onDelete={removeSet}` to `SetSheet`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run dev`, log two sets, tap ✕ then Delete? on the first: row disappears, badge count drops, reload keeps it gone.
- [ ] **Step 4: Commit** — `feat(workout): remove a logged set with two-tap confirm`

---

### Task 7: `custom_exercises` schema + db module

**Files:**
- Modify: `supabase/schema.sql` (append)
- Create: `lib/custom-exercises-db.ts`
- Modify: `lib/workouts-db.test.ts` or new `lib/custom-exercises-db.test.ts` (reuse the same mock pattern)

**Interfaces:**
- Consumes: `CustomExerciseRow` (Task 3), queue table `custom_exercises` (Task 4).
- Produces:
  ```ts
  export async function listCustomExercises(): Promise<CustomExerciseRow[]>;              // select id,name,primary_muscles,secondary_muscles order by name
  export async function createCustomExercise(name: string, primary: Muscle[]): Promise<CustomExerciseRow>;
  // id = crypto.randomUUID(); enqueueOrSend("custom_exercises", { name: name.trim(), primary_muscles: primary, secondary_muscles: [] }, { id }); returns the row
  ```

- [ ] **Step 1: Schema.** Append to `supabase/schema.sql`:

```sql
-- Sub-project 8: custom exercises (2026-10-19). Paste this block once.
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

- [ ] **Step 2: Failing tests** (mock pattern from `lib/workouts-db.test.ts`):
```ts
it("createCustomExercise inserts with a client id and no logged_at, and returns the row", async () => {
  const row = await createCustomExercise("  Cable Y Raise ", ["rear_delts"]);
  expect(h.calls[0]).toMatchObject({ table: "custom_exercises", op: "insert",
    payload: { name: "Cable Y Raise", primary_muscles: ["rear_delts"], secondary_muscles: [] } });
  expect(h.calls[0].payload).not.toHaveProperty("logged_at");
  expect(row).toMatchObject({ id: h.calls[0].payload.id, name: "Cable Y Raise", primary_muscles: ["rear_delts"] });
});
```
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → green.
- [ ] **Step 6: George pastes the SQL block** into the Supabase SQL editor (agents cannot). Record in the dev log if not yet done at task end.
- [ ] **Step 7: Commit** — `feat(exercises): custom_exercises table and client write path`

---

### Task 8: New-exercise sheet + library wiring on the workout page

**Files:**
- Create: `components/NewExerciseSheet.tsx`
- Modify: `app/workout/[id]/page.tsx` (customs state, merged library, `addCustom`)
- Modify: `components/WorkoutSummary.tsx` (`library` prop)
- Design: `docs/superpowers/design/2026-10-19-new-exercise-sheet-12ui-<X>.png` (implement FROM this)

**Interfaces:**
- Consumes: `mergeLibrary`, `toExercise`, `Library`, library-aware lookups (Task 3); `listCustomExercises`, `createCustomExercise` (Task 7); `MUSCLE_GROUPS`, `REGION_DEFAULT`, `musclesIn`, `muscleName` (Task 1).
- Produces:
  ```ts
  // components/NewExerciseSheet.tsx
  export default function NewExerciseSheet(props: {
    initialName: string; groups: MuscleGroup[];
    onSave: (name: string, primary: Muscle[]) => Promise<void>; onClose: () => void;
  }): JSX.Element;
  ```
  `WorkoutSummary` gains `library: Library` and uses it for `findExercise`.

- [ ] **Step 1: `NewExerciseSheet`.** Same shell as `SetSheet` (backdrop, `role="dialog"`, drag handle, Close). Contents: name input (prefilled, autofocus); row of region chips in order `[...groups, ...MUSCLE_GROUPS ids not in groups]`, selected = `groups[0] ?? "chest"`; row of `musclesIn(region)` chips, multi-select, initial `[REGION_DEFAULT[region]]`, reset to that default whenever the region changes; full-width accent "Save exercise" disabled when the trimmed name is empty or no muscle is selected; busy/err handling like `SetSheet`.
- [ ] **Step 2: Page wiring** in `app/workout/[id]/page.tsx`:
  - `const [customs, setCustoms] = useState<CustomExerciseRow[]>([])`, loaded in the mount effect via `listCustomExercises().then(setCustoms).catch(warn)`.
  - `const library = useMemo(() => mergeLibrary(EXERCISES, customs), [customs])`.
  - Pass `library` to every `findExercise`, `exercisesFor`, `searchExercises`, `recentExercises(previousRows, groups, 8, library)` call and to `<WorkoutSummary library={library} …/>`.
  - `const [newName, setNewName] = useState<string | null>(null)`; `addCustom` becomes: `const hit = findExercise(name, library); if (hit) openSheet(hit.name); else setNewName(name);` then clear the input.
  - `onSave`: `const row = await createCustomExercise(n, primary); setCustoms((c) => [...c, row]); setNewName(null); openSheet(row.name);`
  - After a successful save also call `listCustomExercises().then(setCustoms).catch(() => {})` so a `23505` duplicate resolves to the canonical row.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; dev: type "cable y raise", Add → sheet, Save → set sheet opens with SH badge; finish workout, start another, the exercise appears under Shoulders and in search.
- [ ] **Step 4: Commit** — `feat(workout): persistent custom exercises with muscle assignment`

---

### Task 9: Weekly muscle math (pure)

**Files:**
- Create: `lib/muscle-week.ts`, `lib/muscle-week.test.ts`

**Interfaces:**
- Consumes: `LiftRow`, `localDateOf` (`lib/workouts.ts`); `Library`, `findExercise` (Task 3); `MUSCLES`, `targetOf`, `regionOf` (Task 1).
- Produces:
  ```ts
  export type MuscleWeek = Record<Muscle, { hits: number; sets: number }>;
  export function weekStartOf(d: Date): string;                                   // local Monday, YYYY-MM-DD
  export function muscleWeek(lifts: LiftRow[], lib: Library, weekStart: string): MuscleWeek;
  export function behindThisWeek(week: MuscleWeek): Muscle[];                      // targeted && hits < target, MUSCLES order
  export function recentWeeks(lifts: LiftRow[], lib: Library, n: number, today: Date): { weekStart: string; week: MuscleWeek }[]; // current first
  export function musclesHit(lifts: LiftRow[], lib: Library): Set<Muscle>;        // primary ∪ secondary over all lifts
  export function hasCompletedWorkoutThisWeek(history: LiftRow[], weekStart: string, currentWorkoutId: string): boolean;
  export function splitByRegion(muscles: Muscle[], groups: MuscleGroup[]): { inRegion: Muscle[]; other: Muscle[] };
  ```
  Workout key for hits: `r.workout_id ?? "d:" + localDateOf(r.logged_at)`. A lift is in a week when `weekStartOf(new Date(r.logged_at)) === weekStart`.

- [ ] **Step 1: Write failing tests** (build timestamps with `new Date(y, m, d, h).toISOString()` so they are local-time-correct):

```ts
import { describe, it, expect } from "vitest";
import { EXERCISES } from "./exercises";
import { behindThisWeek, hasCompletedWorkoutThisWeek, muscleWeek, musclesHit, recentWeeks, splitByRegion, weekStartOf } from "./muscle-week";
import type { LiftRow } from "./workouts";

const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString(); // October 2026; Mon = 12
const lift = (exercise: string, logged_at: string, workout_id: string | null, sets = 3, reps = 8): LiftRow =>
  ({ id: `${exercise}-${logged_at}`, exercise, sets, reps, weight: 100, logged_at, workout_id });
const WEEK = "2026-10-12";

describe("weekStartOf", () => {
  it("returns the local Monday", () => {
    expect(weekStartOf(new Date(2026, 9, 12, 0, 0))).toBe("2026-10-12");
    expect(weekStartOf(new Date(2026, 9, 18, 23, 59))).toBe("2026-10-12");
    expect(weekStartOf(new Date(2026, 9, 19, 0, 10))).toBe("2026-10-19");
  });
});

describe("muscleWeek", () => {
  it("spec reference week", () => {
    const w = muscleWeek([
      lift("BB Bench Press", at(12, 10), "w1"),
      lift("Incline DB Press", at(15, 10), "w2"),
      lift("DB Lateral Raise", at(15, 11), "w2", 4, 12),
    ], EXERCISES, WEEK);
    expect(w.mid_chest).toEqual({ hits: 1, sets: 3 });
    expect(w.upper_chest).toEqual({ hits: 1, sets: 3 });
    expect(w.front_delts).toEqual({ hits: 2, sets: 0 });
    expect(w.triceps).toEqual({ hits: 2, sets: 0 });
    expect(w.side_delts).toEqual({ hits: 1, sets: 4 });
    const behind = behindThisWeek(w);
    expect(behind).toEqual(expect.arrayContaining(["mid_chest", "upper_chest", "side_delts", "lats"]));
    expect(behind).not.toContain("front_delts");
    expect(behind).not.toContain("calves");
    expect(behind[0]).toBe("upper_chest"); // MUSCLES order
  });
  it("two lifts for the same muscle in one workout = one hit", () => {
    const w = muscleWeek([lift("BB Curl", at(13, 9), "w1"), lift("Hammer Curl", at(13, 9), "w1")], EXERCISES, WEEK);
    expect(w.biceps.hits).toBe(1);
    expect(w.biceps.sets).toBe(6);
  });
  it("week boundary is local Monday", () => {
    const w = muscleWeek([
      lift("Back Squat", new Date(2026, 9, 18, 23, 30).toISOString(), "a"),
      lift("Back Squat", new Date(2026, 9, 19, 0, 10).toISOString(), "b"),
    ], EXERCISES, WEEK);
    expect(w.quads.hits).toBe(1);
  });
  it("legacy null workout_id lifts on one date count as one hit", () => {
    const w = muscleWeek([lift("Leg Press", at(14, 9), null), lift("Hack Squat", at(14, 10), null)], EXERCISES, WEEK);
    expect(w.quads.hits).toBe(1);
  });
  it("unknown exercise names are ignored", () => {
    const w = muscleWeek([lift("Mystery Machine", at(14, 9), "w1")], EXERCISES, WEEK);
    expect(Object.values(w).every((v) => v.hits === 0 && v.sets === 0)).toBe(true);
  });
  it("empty input gives all zeros for all 18 muscles", () => {
    const w = muscleWeek([], EXERCISES, WEEK);
    expect(Object.keys(w).length).toBe(18);
    expect(w.abs).toEqual({ hits: 0, sets: 0 });
  });
});

describe("helpers", () => {
  it("recentWeeks returns n weeks, current first", () => {
    const r = recentWeeks([lift("Back Squat", at(5, 9), "old")], EXERCISES, 4, new Date(2026, 9, 15));
    expect(r.map((x) => x.weekStart)).toEqual(["2026-10-12", "2026-10-05", "2026-09-28", "2026-09-21"]);
    expect(r[1].week.quads.hits).toBe(1);
  });
  it("musclesHit unions primary and secondary", () => {
    expect([...musclesHit([lift("BB Bench Press", at(12, 9), "w1")], EXERCISES)].sort())
      .toEqual(["front_delts", "mid_chest", "triceps"]);
  });
  it("hasCompletedWorkoutThisWeek ignores the current workout and other weeks", () => {
    const hist = [lift("BB Curl", at(12, 9), "cur"), lift("BB Curl", at(6, 9), "lastweek")];
    expect(hasCompletedWorkoutThisWeek(hist, WEEK, "cur")).toBe(false);
    expect(hasCompletedWorkoutThisWeek([...hist, lift("BB Curl", at(13, 9), "other")], WEEK, "cur")).toBe(true);
  });
  it("splitByRegion", () => {
    expect(splitByRegion(["lats", "side_delts", "quads"], ["back", "shoulders"]))
      .toEqual({ inRegion: ["lats", "side_delts"], other: ["quads"] });
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** — `npm test` → green.
- [ ] **Step 5: Commit** — `feat(muscles): weekly per-muscle hits and sets`

---

### Task 10: Performance tab — "This week" section

**Files:**
- Create: `components/WeeklyMuscles.tsx`
- Modify: `app/(tabs)/performance/page.tsx` (load customs, render section after the title block, before "Indicator lifts")
- Design: `docs/superpowers/design/2026-10-19-weekly-muscles-12ui-<X>.png` (implement FROM this)

**Interfaces:**
- Consumes: `recentWeeks`, `MuscleWeek` (Task 9); `MUSCLES`, `muscleName`, `targetOf` (Task 1); `mergeLibrary`, `listCustomExercises` (Tasks 3, 7).
- Produces: `export default function WeeklyMuscles({ weeks }: { weeks: { weekStart: string; week: MuscleWeek }[] })` — `weeks[0]` is the current week.

- [ ] **Step 1: Component.** Card (`card-grad rounded-3xl border border-border p-5` like the Strength Index card). Header "This week" + muted "2× per muscle". Rows for all 18 muscles in `MUSCLES` order: name; hits as `1/2` (targeted) or plain `1` (untargeted, `text-muted`); sets `tabular-nums`. Targeted and met → `text-success` with `✓`; targeted and behind → default colour; untargeted rows `text-muted`. Below: "Last 3 weeks" — per muscle three small cells (oldest→newest) showing hits, filled accent when ≥ target, outlined when untargeted or below. Layout from the render.
- [ ] **Step 2: Page.** Add `customs` state + load, `library = useMemo(mergeLibrary(EXERCISES, customs))`, `weeks = useMemo(() => recentWeeks(rows, library, 4, new Date()), [rows, library])`; render `<WeeklyMuscles weeks={weeks} />` right after the `<h1>Performance</h1>` block. Pass `library` to `recentExercises(rows, MUSCLE_GROUPS.map(m => m.id), 20, library)`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; dev: tab shows 18 rows, numbers match a hand count of this week's workouts.
- [ ] **Step 4: Commit** — `feat(performance): weekly per-muscle frequency table`

---

### Task 11: Workout page — muscle strip + tap-to-narrow

**Files:**
- Create: `components/MuscleStrip.tsx`
- Modify: `app/workout/[id]/page.tsx`
- Design: `docs/superpowers/design/2026-10-19-muscle-strip-12ui-<X>.png` (implement FROM this)

**Interfaces:**
- Consumes: `weekStartOf`, `muscleWeek`, `behindThisWeek`, `musclesHit`, `hasCompletedWorkoutThisWeek`, `splitByRegion` (Task 9); `exercisesForMuscle` (Task 3); `muscleName`, `targetOf` (Task 1).
- Produces:
  ```ts
  export type StripChip = { muscle: Muscle; hits: number; target: number };
  export default function MuscleStrip(props: { inRegion: StripChip[]; other: StripChip[]; active: Muscle | null; onPick: (m: Muscle | null) => void }): JSX.Element | null;
  ```

- [ ] **Step 1: Component.** Horizontal scroll row (same scrollbar-hiding classes as the Performance "others" chips). Leading `All` chip only when `active !== null`. One chip per `inRegion` entry: `${muscleName(m)} ${hits}/${target}`; active chip `bg-accent/20 text-accent`, others `border border-border text-muted`. If `other.length > 0`, a trailing muted `+N more` chip toggles a local `expanded` flag that appends the `other` chips. Returns `null` when both arrays are empty.
- [ ] **Step 2: Page wiring.**
  ```ts
  const weekStart = weekStartOf(new Date());
  const week = useMemo(() => muscleWeek(previousRows, library, weekStart), [previousRows, library, weekStart]);
  const hitNow = useMemo(() => musclesHit(logged, library), [logged, library]);
  const behind = useMemo(() => behindThisWeek(week).filter((m) => !hitNow.has(m)), [week, hitNow]);
  const showStrip = hasCompletedWorkoutThisWeek(history, weekStart, id);
  const { inRegion, other } = splitByRegion(behind, groups);
  const [focus, setFocus] = useState<Muscle | null>(null);
  ```
  Render `<MuscleStrip …/>` under the header when `showStrip`, mapping muscles to `StripChip` with `week[m].hits` and `targetOf(m)!`. When `focus !== null && !q`, replace the sectioned list (This workout / Recently used / per-region) with one section titled `muscleName(focus)` listing `exercisesForMuscle(focus, library)` via `ExerciseRow` (badge = `x.muscles[0]`). `All` or re-tapping the active chip sets `focus` to `null`. Search (`q`) always wins over focus.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; dev: with one completed workout this week, start another in the same regions → strip lists behind muscles; log a lateral raise → "Side delts" chip disappears; tap "Lats" → list narrows; "All" restores.
- [ ] **Step 4: Commit** — `feat(workout): behind-this-week muscle strip with tap-to-narrow`

---

### Task 12: Docs + handoff

**Files:**
- Modify: `README.md:107-116` (roadmap)
- Modify: `Gainz-App-Vault/_STATUS.md`, new `Gainz-App-Vault/Dev Logs/2026-10-19 — Workout tracking v2.md` (from `Templates/Dev Log.md`)

- [ ] **Step 1: README roadmap.** Under "Shipped" append `→ custom exercises + set delete + weekly 2× muscle frequency`; add a line under Next: "Lift PRs and progression" stays first.
- [ ] **Step 2: Build** — `npm run build` clean; `npm test` green; note the test count.
- [ ] **Step 3: Vault.** Dev log (what/decisions/problems/files/next), `_STATUS.md`: move this to Shipped, roadmap #4 Lift PRs ← NEXT, note whether George has pasted the Sub-project 8 SQL.
- [ ] **Step 4: Commit** — `docs: roadmap and status for workout tracking v2`; push when George says.
