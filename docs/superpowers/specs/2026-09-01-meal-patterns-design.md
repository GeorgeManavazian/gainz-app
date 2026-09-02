# Meal Patterns — Design

Sub-project 4a of the Gainz roadmap. Depends on meal logging (`meals` table, `logMeal`, offline queue) and the curated food search (per-100 g values on every logged meal via `calories / grams`).

## Purpose

He eats the same few meals most days. Today each one is four searches and four saves. A meal pattern is a named list of foods with grams that was logged once and can be logged again in one tap, with grams adjusted on the way. Nothing else: no swaps, no "fits your macros", no seeding from Daily notes, no building a pattern from scratch (all deferred on 2026-09-01 — patterns are created only from meals already logged today).

## Data model

```sql
create table if not exists meal_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  name text not null,
  items jsonb not null,                 -- PatternItem[] (below)
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0
);
alter table meal_patterns enable row level security;
create policy "own meal_patterns" on meal_patterns for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

`items` is an ordered array of

```ts
type PatternItem = {
  food_name: string;
  grams: number;                 // the grams logged the day it was saved
  per100g: { kcal: number; protein: number; carbs: number; fat: number };  // derived from the meal row: value / grams × 100
  fdc_id: string | null;
};
```

- Direct Supabase writes (like `profiles`, `weigh_ins`), **not** through the offline queue: creating, renaming, deleting a pattern is rare and happens at home. The queue is untouched.
- Logging *from* a pattern produces N ordinary `meals` inserts through `logMeal` → `enqueueOrSend`, one per item, in item order (queue is FIFO, never-overtake). Offline-safe like any meal. `logged_at` = the moment of the tap for all N (the queue stamps `queued_at`).
- `last_used_at` and `use_count` are updated with a direct write after the items are enqueued; failure to update them is ignored (cosmetic ordering only).
- No realtime publication; screens refetch after their own writes.

## Pure logic — `lib/patterns.ts` (no I/O, vitest)

- `itemsFromMeals(meals: Meal[]): PatternItem[]` — per-100 g from `calories/grams×100` etc.; `grams` copied; meals with `grams ≤ 0` skipped.
- `scaleItem(item, grams): MealEntry` — `{ food_name, grams, calories: round1(per100g.kcal × grams/100), protein_g, carbs_g, fat_g, fdc_id }`. Rounds to 0.1 like the meal page.
- `totals(entries: MealEntry[]): { kcal, protein_g, carbs_g, fat_g }` — rounded to integers for display.
- `sortPatterns(patterns)` — `last_used_at` desc, nulls last, then `created_at` desc.
- Reference tests: 320 g nonfat Greek yogurt logged as 189 kcal / 33 P → per100g 59.1 / 10.3; scaled to 250 g → 148 kcal / 25.8 P. Totals of the four-item breakfast in today's Daily note = 810 kcal · 54 P · 92 C · 27 F (±1 from rounding).

## Data access — `lib/patterns-db.ts`

`listPatterns()`, `createPattern(name, items)`, `deletePattern(id)`, `markUsed(id)`. Thin Supabase wrappers; errors surface to the caller.

## Screens

### HUB — "Save as meal" (app/(tabs)/page.tsx)

- Appears in the **Today** card header as a small text action when ≥ 1 meal is logged today.
- Opens a bottom sheet (same component family as `SetSheet`): checklist of today's meals, all ticked; a name field (placeholder "Breakfast"); **Save** disabled until name is non-empty and ≥ 1 ticked. Save → `createPattern` → sheet closes, toast "Saved ✓". Error → inline "Couldn't save. Try again." and the sheet stays open.
- Nothing else on the HUB changes.

### Log meal — "Your meals" (app/log/meal/page.tsx)

- When the search box is empty and the user has ≥ 1 pattern: a **Your meals** section renders above **Recent foods**. Each row: name, second line `N foods · ~kcal · P` from `totals(scaleItem(items at saved grams))`. Rows sorted by `sortPatterns`. Hidden as soon as the query has ≥ 2 characters.
- Tap → `/log/meal/pattern/[id]`.

### Pattern review — `app/log/meal/pattern/[id]/page.tsx`

- Header: pattern name; back arrow to Log meal.
- One row per item: food name; grams input (numeric keypad, pre-filled with saved grams, selects-all on focus); live `kcal · P` for the current grams; ✕ removes the row **for this log only**.
- Footer: totals line (kcal · P · C · F) for the rows as edited; **Log all** primary button (disabled if 0 rows or any grams ≤ 0); small **Delete meal** text link (confirm dialog, `deletePattern`, back to Log meal).
- Log all → `logMeal` per row in order → `markUsed` → navigate to HUB with "Logged N foods ✓" toast. Any queue error (thrown transient after retries) → inline error, nothing navigates; rows already accepted by the queue are not duplicated because each carries its own client UUID via `enqueueOrSend`.
- Editing grams here never changes the saved pattern.

### Design process

Both new surfaces (save sheet, review screen) plus the Your-meals row go through a `12ui draft` with the current lavender app as `--reference`; he picks; the plan implements from the converted HTML per the fidelity lesson of 2026-09-01.

## Error handling

- Pattern list fetch fails → section simply doesn't render; search still works.
- Review page for an id that no longer exists → "This meal was deleted." with a back link.
- Offline: Log all works (queue); Save as meal shows "You're offline — saving a meal needs a connection." and stays disabled.

## Testing

- vitest for everything in `lib/patterns.ts` (reference cases above) and `sortPatterns`.
- Existing queue tests unchanged; add one test that N `logMeal` calls preserve order in the queue (already covered by never-overtake tests — extend if not).
- Manual on phone: log breakfast → Save as meal → next day tap → adjust yogurt to 250 → Log all → HUB shows 4 rows → Daily note gets 4 rows via vault sync.

## Out of scope (deferred, decided 2026-09-01)

Swaps / same-macro alternatives · "fits your remaining macros" ranking · seeding patterns from Daily notes · building a pattern from search without logging · editing a saved pattern's grams or name · sharing.
