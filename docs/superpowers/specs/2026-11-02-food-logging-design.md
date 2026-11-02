# Food logging — tighter Log meal layout, instant results, undo

Date: 2026-11-02 · Status: George: "i just genuinely hate everything about it… just guess" → builder's design, approved by that instruction.

## Intent

Logging a food today: open Log meal → type → wait ~300 ms + a USDA round-trip → pick a row → second screen → type grams → Save. For a lifter who eats the same 15 foods, that's five steps for something that should be one tap. Guessing at the hate: slow, repetitive, and the second screen makes you retype numbers you typed last week.

## Binding (revised after George saw a first cut and four layout mockups; picked "D · Today's layout, tightened")

George rejected one-tap re-log: "it assumes you have exactly 350g of greek yogurt whenever you tap log meal." His complaint is the **look and the layout**: "its all just one big list stretching far down."

1. **Saved meals as tiles.** The "Your meals" section on Log meal renders patterns as a 2-column grid of compact tiles (`name` / `4 foods · 612 kcal`), accent-tinted border, `New meal` link kept.
2. **Your foods capped.** Before typing, the ranked list (`rankRecentFoods`) shows **5** rows with an `All N ›` link that expands in place (`Less` collapses). Rows read `name` / `350 g · 207 kcal` (last amount and kcal). Tap → amount screen.
3. **Last amount as placeholder.** The amount field opens empty with the last amount as its placeholder, so typing starts clean. Nothing is assumed.
4. **Undo after every logged save.** Banner `Logged Greek yogurt · 350 g ✓ · Undo` for 6 s (`logMeal` returns the row id; Undo → `deleteMeal`). The new-meal builder's `onPick` returns void → no banner.
5. **Instant results.** Typing ≥ 2 chars shows curated matches immediately; USDA replaces them when it lands; a failed/offline USDA call keeps the curated rows; stale responses are ignored.
6. No one-tap `+ Log` button.

## Non-goals
Barcode scan. Editing a logged amount. Changing USDA ranking. Favourites/pinning.

## Decisions
- `curatedItem`/`halfItem` move from the API route into `lib/foods.ts` as `curatedSearchItems(q)` so client and server build identical rows.
- `RecentFood` gains `lastGrams` and `lastCalories`.
- 12ui budget exhausted mid-session; built from existing component conventions.
