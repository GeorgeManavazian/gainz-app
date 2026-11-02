# Scan a nutrition label → new custom food

Date: 2026-11-02 · Status: approved in chat (George: on-device only, "we're not using AI for the scan?" → correct, no AI service)

## Intent

George wants to photograph a food's nutrition label and get a new food with those macros, reusable later. Constraint from him: no LLM/API per scan — "eventually MANY people will be using this app", so recognition must be free at the margin and run on the device. Barcode lookup declined ("idrc about the barcode").

## Binding

- **OCR on device.** `tesseract.js` (Apache-2.0) loaded lazily in the browser on first scan (`eng` traineddata from its default CDN, cached by the browser). Nothing is uploaded; no server route; no API key.
- **Entry points** (George, after seeing the first cut: "i would use it to just add a food that's not on the list i searched up, or just to be more accurate rather than using usda"): (1) a dashed row under the search results — `Can't find it? Scan the label` (or `Scan the label instead` when nothing matched); (2) on the amount screen of a USDA/curated pick — `Scan the label for exact numbers`, which pre-fills the name and, after save, swaps the picked food for the new custom one keeping any amount typed. No button in the search header. Camera via `<input type="file" accept="image/*" capture="environment">`; library photos also work.
- **Pipeline.** Photo → downscale to ≤1800 px, grayscale, mild contrast → Tesseract (page-seg mode 4, single column) → text → `parseNutritionLabel(text)` (pure, `lib/label-parse.ts`) → `NewFoodSheet` pre-filled.
- **Parser contract** (`ParsedLabel`): `servingG` (from "Serving size … (55g)" or "per 100 g" → 100), `servingText`, `kcal` ("Calories 230" or "250 kcal"), `fat` ("Total Fat 8g" — never Saturated/Trans), `carbs` ("Total Carbohydrate 37g"), `protein` ("Protein 3g"), `found` = how many of kcal/fat/carbs/protein were read. Tolerates common OCR noise (`Og` → 0 g, `Calorles`, `l` for `1` is NOT guessed). Each value is per serving as printed.
- **Confirm before save.** `NewFoodSheet` shows name (empty, focused), serving size in g, and kcal / P / C / F **per serving**, all editable; a live line shows the per-100 g conversion. Save needs a name, serving g > 0, kcal > 0. Progress text while OCR runs ("Reading label… 40%"). If the parser found < 2 values: sheet still opens with what it has and a hint "Couldn't read much — check the numbers".
- **Storage.** New table `custom_foods` (Sub-project 9 in `supabase/schema.sql`): `id, user_id default auth.uid(), name, serving_g, kcal, protein_g, carbs_g, fat_g` (all per 100 g), `source text` (`label`), `created_at`; RLS; unique `(user_id, lower(name))`. Offline-safe via the queue (`QueueTable` + `custom_foods`), same merge pattern as custom exercises.
- **After save.** The picker goes straight to the amount screen for the new food, with the serving size as the placeholder. Custom foods also appear under **Your foods** (after the ranked recents, alphabetical) and in the typed filter.
- **Delete a custom food:** not in scope. Barcode: not in scope. Non-English labels: not in scope.

## Decisions
- Tesseract over a cloud OCR or Claude vision: zero marginal cost and private, at the price of worse accuracy on blurry photos; the confirm sheet is the safety net.
- **Dependency on tesseract's CDN** (jsdelivr) for its worker, core wasm and `eng` data on first use: the photo and text never leave the phone, but the fetch reveals the user's IP to jsdelivr and the first scan needs a connection. Follow-up if offline-first or stricter privacy matters: self-host under `public/tesseract/` and pass `workerPath`/`corePath`/`langPath`.
- Duplicate names are checked client-side (the queue treats Postgres 23505 as "already landed", so a server-side duplicate is silently dropped).
- Values stored per 100 g (matches every other food) with `serving_g` kept so the amount placeholder can suggest one serving.
