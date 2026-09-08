# Meal Builder — Design

Sub-project 4b of the Gainz roadmap. Extends 4a (meal patterns: `meal_patterns`, `lib/patterns.ts`, `/log/meal/pattern/[id]`). Requested 2026-09-08: "create a meal, fully customizable — pick already-verified foods from our list, or enter the macros yourself — and name it."

## Purpose

Today a saved meal can only be made from foods already logged today. The builder creates one from scratch: a name, any number of food lines picked through the existing search (curated table → USDA → history), and/or manual macro lines for things without a food entry (a restaurant bowl, a protein shake recipe). The result is an ordinary `meal_patterns` row and logs through the existing review page.

## Data model

No new table. `PatternItem` gains one optional field:

```ts
type PatternItem = {
  food_name: string;
  grams: number;                 // food lines: grams. manual lines: servings (1 = one serving)
  per100g: Per100;               // food lines: per 100 g. manual lines: per 100 servings (macros × 100) so scaleItem is unchanged
  fdc_id: string | null;
  manual?: true;                 // present on macro lines only
};
```

Rationale: `scaleItem(item, grams)` already computes `per100g × grams / 100`. Storing a manual line as `per100g = macros × 100`, `grams = servings` makes 1 serving scale exactly to the typed macros with no new math path. The logged `meals` row for a manual line has `grams = servings` (e.g. `1`), `food_name` = the label, `fdc_id = null`. Existing rows and 4a patterns are unaffected (field absent ⇒ food line).

## Pure logic — `lib/patterns.ts`

- `manualItem(label, macros: { kcal, protein, carbs, fat }): PatternItem` → `{ food_name: label.trim(), grams: 1, per100g: { kcal: kcal×100, … }, fdc_id: null, manual: true }`.
- `unitOf(item): "g" | "serving"` → `item.manual ? "serving" : "g"`.
- `scaleItem`, `totals`, `sortPatterns`, `itemsFromMeals` unchanged.
- Reference tests: `manualItem("Chipotle bowl", {kcal: 900, protein: 55, carbs: 90, fat: 35})` scaled at 1 → `900 / 55 / 90 / 35`; at 1.5 → `1350 / 82.5 / 135 / 52.5`; `unitOf` on a 4a item → `"g"`.

## Shared component — `components/FoodPicker.tsx`

The search + amount flow currently inline in `app/log/meal/page.tsx` moves into one client component:

```ts
<FoodPicker
  onPick={(entry: MealEntry, meta: { fdcId?: number }) => Promise<void> | void}
  confirmLabel="Save" | "Add to meal"
  header?: ReactNode          // optional slot rendered above the search box (used by the log page for "Your meals")
/>
```

Everything the log page does today stays inside it unchanged: history ("Recent foods" / "Your foods"), curated + USDA results, the amount screen with Raw/Cooked switch, units and USDA portions, the macro preview. The only behavioural difference is what happens on confirm: the log page passes `logMeal` and shows "Logged ✓"; the builder appends a line and returns to the builder list. `onPick` errors surface inside the picker as today ("Couldn't save. Please try again.").

The refactor is mechanical (move JSX + state, no logic change) and is verified by the existing production behaviour plus tsc/build; there are no unit tests on the page today and none are added for the move.

## Screens

### Log meal (`app/log/meal/page.tsx`)

- Renders `<FoodPicker confirmLabel="Save" onPick={logMeal…} header={<YourMeals/>} />`.
- **Your meals** section header gains a **New meal** text action (accent, right-aligned). When the user has no patterns, the section still renders with just the action row so the builder is discoverable.

### Meal builder (`app/log/meal/new/page.tsx`)

- Header: back arrow to Log meal; title "New meal".
- Name field (placeholder "Chipotle bowl"), required.
- Lines card: one row per line — name; right side `120 g` or `1 serving` and `kcal · P`; ✕ removes. Empty state row: "Nothing added yet."
- Two full-width secondary buttons under the card: **Add food** and **Add macros**.
- Totals strip (kcal · P · C · F) computed with `totals(items.map(it => scaleItem(it, it.grams)))`.
- Primary **Save meal**, disabled until name non-empty and ≥ 1 line. Save → `createPattern(name, items)` → navigate to `/log/meal` with the new row visible (list refetches on mount). Error → inline "Couldn't save. Try again."
- **Add food** swaps the screen body for `<FoodPicker confirmLabel="Add to meal" />` with a Cancel affordance (✕ in the header). On pick, the entry becomes a line: `{ food_name, grams, per100g: entry values ÷ grams × 100, fdc_id }` (same derivation as `itemsFromMeals`, reuse it: `itemsFromMeals([entry])[0]`). Back to the list.
- **Add macros** opens a bottom sheet (same shell as `SavePatternSheet`): label field (placeholder "Protein shake"), four numeric fields kcal / P / C / F (0 allowed, kcal required > 0), **Add** button. Adds `manualItem(label, macros)`. No auto-calculation of kcal from macros (he types what the label says).
- Builder state is local; leaving the page discards it (no draft persistence — YAGNI).

### Review page (`app/log/meal/pattern/[id]/page.tsx`)

- Manual lines show a **servings** input (step 0.5, pre-filled with saved servings) with suffix "serving" instead of "g"; everything else identical. `unitOf(item)` decides.
- Log all is unchanged (`scaleItem` handles both).

### Your meals row (`app/log/meal/page.tsx`)

- Subtitle unchanged (`N foods · kcal · P`); manual lines count as foods.

## Design process

12ui draft for the builder screen (list + two add buttons + totals + Save) with the lavender HUB as reference; he picks; convert to HTML; implement from it. The macro sheet reuses `SavePatternSheet`'s shell and the picker is the existing screen, so neither needs a separate draft.

## Error handling

- Add food while offline: search needs the network; the picker shows what it shows today (empty results). Manual lines work offline; Save needs the network (direct Supabase) — same message as the save sheet: "You're offline — saving a meal needs a connection."
- Save failure keeps the builder state intact.

## Testing

- vitest: `manualItem`, `unitOf`, scaling reference cases; `itemsFromMeals([entry])` round-trip for a picked food.
- tsc + build; manual phone test: New meal → Add food (chicken breast 200 g) → Add macros (Shake 300/30/20/8) → Save → Your meals shows "2 foods · …" → tap → change servings to 2 → Log all → HUB rows show "Chicken breast · 200g" and "Shake · 2".

## Out of scope

Editing a saved meal · reordering lines · draft persistence · deriving kcal from macros · photos · sharing.
