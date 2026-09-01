# Verification brief — curated food table

You are an independent verifier. A different agent built this category; assume it made mistakes. The user's words: "this is one of the most important and yet simple parts of this app and it NEEDS to be done correctly." The app is a personal macro tracker: one person weighs plain whole foods in grams and needs the right kcal/P/C/F. A row is tapped, lands on its `default` half, and a "Raw | Cooked" (or "Dry | Cooked") switch swaps to the other half.

## Tools (local dev server with the real USDA key — shared 1000 req/hour across 6 verifiers; budget ≤ 100 requests)

    GET http://localhost:3099/api/food-search?fdc=<id>      → the USDA record itself: { fdcId, description, dataType, per100g }
    GET http://localhost:3099/api/food-search?q=<query>     → 12 ranked items { fdcId, name, description, badge, per100g, curated? } (curated rows come first — ignore those, look at the USDA rows behind them)

Use `?fdc=` to confirm ANY id you propose. Retry once on an empty/failed response. Queries containing `/`, `"` or `%` come back empty — write "80% lean" as "80 percent lean" or "ground beef 80" instead.

## Input

Your category file (path in your task) is a JSON array of entries. Each half already carries `usda_verified: true` when its description and macros were re-fetched from USDA and matched byte-for-byte (297 of 303 did). `usda_verified: false` means the id could not be fetched — treat as suspect and check it.

## Judge EVERY entry on five points

A. **Name → item.** Would a normal person who typed this name expect this exact USDA item? Plain preparation (no sauce, no added fat, skin not eaten unless the name says skin-on), generic (no brand / grass-fed / organic / specific breed unless the name is a brand). Cooked halves should be FNDDS/SR "as eaten"; raw halves Foundation/SR raw.
B. **Pair sameness.** raw and cooked must be the SAME food: same species, same cut, same lean %, same skin state, same trim class. "Farmed Atlantic" ≠ "wild sockeye". "Top sirloin" ≠ "chuck". "Chicken egg" ≠ "duck egg". Trim 0" vs 1/8" on the same cut is acceptable; different grade (choice vs select) is acceptable if noted.
C. **Numbers.** Sanity-check per 100 g against what you know: raw meat/fish is less or about equally dense as cooked; dry grains ≈ 350–380 kcal vs cooked ≈ 100–130; nonfat Greek yogurt ≈ 59; whole egg raw ≈ 143. Flag anything off by >20% from expectation, or a pair whose relationship makes no sense (e.g. cooked lower than raw for lean meat).
D. **Aliases.** Would any alias route a user to the wrong food? Are obvious search terms missing (the plural, the brand-less generic, what a college student would type)?
E. **Default half.** Does the tap land where the user expects (cooked for meat/grains, raw for fruit/veg eaten raw)? Is `rawLabel` right (Dry for grains/pasta/legumes/oats, Raw otherwise)?

Also list **missing common foods** in your category that a normal person would search for (max 8), with a fully verified entry for each in the table format (see below).

## Output — write JSON to the path in your task

```json
{
  "verdicts": [
    { "name": "Sirloin steak", "verdict": "PASS" },
    { "name": "Ground beef, 85/15", "verdict": "FIX", "issues": ["raw null: USDA 17xxxx 'Beef, ground, 85% lean meat / 15% fat, raw' exists"],
      "fix": { "raw": { "fdcId": 174036, "description": "…", "kcal": 215, "protein": 18.6, "carbs": 0, "fat": 15 } } },
    { "name": "Chicken liver", "verdict": "REMOVE", "issues": ["nobody logs this; alias 'liver' hijacks searches"] }
  ],
  "add": [ { "name": "...", "aliases": ["..."], "default": "cooked", "rawLabel": "Raw", "cooked": {…}, "raw": {…} } ],
  "summary": "3–6 lines: what you checked, what was wrong, what you're still unsure about, requests used"
}
```
`fix` may contain any of: `cooked`, `raw` (full half objects with ids you verified via `?fdc=`, or `null` to drop a half), `aliases` (the complete replacement list), `default`, `rawLabel`, `name`. Only include fields that change. Never invent ids or numbers — copy from `?fdc=` responses. If you can't find a correct replacement after 3 tries, say so in `issues` and leave the field out.

Do not edit any repo files. Reply with the summary only.
