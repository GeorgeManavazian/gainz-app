# Diet fixes — food picker ordering, delete a logged food

Date: 2026-10-29 · Status: approved in chat ("okay lets go") · Diet round items 2 + 3

## Intent

George on the Diet section: "choosing the food you ate — 1. it is not sorted at all. 2. if i accidentally log something incorrectly there is nothing i can do about it." Asked what he wants to see before typing, he said "okay lets go" — builder's call.

## Binding

### Food picker ordering (`components/FoodPicker.tsx`)
- Before typing, the list is **Your foods**: foods you've logged, ranked by how likely you are to log them now. Score per distinct food name (case-insensitive) over the last 30 days of `meals`:
  - `+3` per time it was logged within ±90 min of the current time of day (local; wraps across midnight),
  - `+1` per time it was logged at all in the window,
  - `+2` if logged within the last 48 h.
  Ties: most recently logged first. Up to 10 rows. Rows carry the per-100 g values of the **most recent** log of that food (as today). Lines logged as `unit = "serving"` or with `grams <= 0` are excluded (as today).
- While typing (≥ 2 chars), **Your foods** filters that ranked list by substring match on the name, keeps the rank order, shows up to 4; **Foods** (search results) is unchanged.
- Pure function `rankRecentFoods(meals, now, { windowDays = 30, bandMinutes = 90, limit = 10 })` in `lib/food-recents.ts`, tested: same-time weighting beats plain frequency; recency bonus; dedupe keeps latest per-100 g; serving/zero-gram rows excluded; midnight wrap.

### Delete a logged food
- Every meal row in the Diet tab's **Last 7 days intake** (expanded day) and the HUB's today list gets a ✕ at the right. Tap → the ✕ becomes a `Delete?` pill; tap again within 4 s → row disappears, day kcal/protein totals and bars update immediately; the ✕ resets after 4 s or when the list changes. Same affordance as sets (SetSheet).
- `deleteMeal(id)` in `lib/meals-db.ts` → `enqueueOrSend("meals", {}, { id, op: "delete" })`: offline-safe, idempotent (queue already handles `delete` for any table).
- On failure: row comes back, inline error `Couldn't delete. Please try again.`
- Shared `components/ConfirmDelete.tsx` (`{ label, onConfirm, resetKey? }`) renders the ✕/`Delete?` pair; `aria-label="Remove <label>"`. Tap target ≥ 32 px.
- Vault sync drift accepted (George 2026-10-19: app DB is truth).

### Not in scope
- Editing a logged amount. Undo-after-delete toast. Deleting from Performance. Changing search ranking of USDA/curated results.

## Decisions
- "Not sorted" read as: the pre-typing list should be *useful*, not alphabetical — time-of-day + frequency ranking, Claude's call.
- Delete on HUB too (it's where today's list is read most), Claude's call.
