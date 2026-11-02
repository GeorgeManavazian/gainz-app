# Food logging — one-tap re-log, instant results, undo

Date: 2026-11-02 · Status: George: "i just genuinely hate everything about it… just guess" → builder's design, approved by that instruction.

## Intent

Logging a food today: open Log meal → type → wait ~300 ms + a USDA round-trip → pick a row → second screen → type grams → Save. For a lifter who eats the same 15 foods, that's five steps for something that should be one tap. Guessing at the hate: slow, repetitive, and the second screen makes you retype numbers you typed last week.

## Binding

1. **One-tap re-log.** "Your foods" rows (ranked by `rankRecentFoods`) show `name` and `350 g · 207 kcal` (the amount and kcal of your last log of it). A `+ Log` button on the row logs it again with that amount instantly, no second screen. A `›` on the row opens the amount screen **pre-filled with the last amount**.
2. **Undo.** After a one-tap log, a banner `Logged Greek yogurt · 350 g ✓ · Undo` sits above the list for 6 s. Undo deletes that row (`deleteMeal`, queue-ordered behind the insert, offline-safe). `logMeal` returns the new row's client id to make this possible.
3. **Instant results.** Typing ≥ 2 chars shows curated matches (`lib/foods.ts`, 262 foods, client-side) **immediately**; the USDA search fills in behind on the existing 300 ms debounce and replaces the list (server already puts curated first). "Searching…" shows only while the list is empty.
4. **Amount screen defaults.** From history: last amount in grams. From search: empty as today.
5. Everything else unchanged: raw/cooked switch, units, saved meals section, manual lines, the `/log/meal/new` builder (its `+ Add` quick button adds to the meal instead of logging).

## Non-goals
Barcode scan. Editing a logged amount. Changing USDA ranking. Favourites/pinning.

## Decisions
- `curatedItem`/`halfItem` move from the API route into `lib/foods.ts` as `curatedSearchItems(q)` so client and server build identical rows.
- `RecentFood` gains `lastGrams` and `lastCalories`.
- 12ui budget exhausted mid-session; built from existing component conventions.
