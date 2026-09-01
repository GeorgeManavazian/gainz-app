# Curated food table research brief

You are building one category of a curated food table for a personal macro-tracking app (one user, cutting weight, logs plain whole foods by weight in grams). Correctness matters more than coverage: a wrong raw/cooked pairing (e.g. "Beef, chuck, steak" raw vs "Beef country fried steak" cooked) is the bug we are killing.

## Tool: the app's USDA search endpoint (uses the real USDA key)

    GET https://gainz-app-phi.vercel.app/api/food-search?q=<url-encoded query>

Returns `{ items: [{ fdcId, name, description, badge: "raw"|"cooked"|null, strict, pairable, per100g: {kcal, protein, carbs, fat} }] }` — up to 12 ranked USDA items. `description` is the full USDA name. `badge` is a heuristic, don't trust it; read the description.

Tips:
- Use 2+ word queries ("chicken breast raw", "chicken breast grilled"). Single common words (chicken, beef, rice, eggs…) fan out into 6–7 USDA calls each — avoid them, we share a 1000 req/hour USDA quota across 6 agents. Budget: ≤ 90 requests for your whole category.
- Cooked/as-eaten foods with human names come from FNDDS ("Chicken breast, grilled without sauce, skin not eaten"). Raw ingredients come from Foundation / SR Legacy ("Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw"). Append "raw" to find raw versions.
- Sanity-check per100g: raw chicken breast ≈120 kcal/22 P, cooked ≈165/31. Raw white rice ≈360 kcal, cooked ≈130. If numbers are implausible, the entry is wrong.
- Retry once on an empty result (upstream is flaky).

## What a good entry is

- `name`: short human label shown as the search row. Title case first letter, no USDA jargon: "Chicken breast", "Ground beef, 90/10", "Greek yogurt, nonfat", "Rice, white".
- `aliases`: lowercase search phrases a normal person types that should surface this row (include the name itself, singular/plural, common synonyms). E.g. chicken breast → ["chicken breast", "chicken breasts", "grilled chicken", "chicken"].
- `cooked`: the USDA item for the food AS EATEN, plain (grilled/roasted/boiled, no sauce, skin not eaten, no added fat) — `{ fdcId, description, kcal, protein, carbs, fat }` per 100 g. Copy these from the API response exactly.
- `raw`: the USDA raw/dry version of the SAME food (same cut, same type, same fat %). Same shape. `null` if the food has no meaningful raw state (yogurt, bread, cheese, nuts, deli meat, fruit eaten raw…).
- `rawLabel`: "Raw" for meat/fish/eggs/veg, "Dry" for rice/pasta/oats/legumes/grains. Omit when raw is null.
- `default`: "cooked" or "raw" — which the row lands on when tapped. Meat/grains → "cooked". Fruit/veg eaten raw, dairy, nuts etc → "raw" only if raw is set, else omit.
- `notes`: only if something was ambiguous or you had to compromise.

Foods with no raw/cooked distinction: set `cooked` to the single best USDA item and `raw: null` (the app hides the switch).

## Rules
- Both halves of a pair MUST be the same food. Compare descriptions word by word. Skin-on vs skinless, 70/30 vs 90/10, chuck vs sirloin, duck egg vs chicken egg are DIFFERENT foods — never pair them.
- Prefer generic over branded/organic/grass-fed/specific-breed unless the food IS a brand (Skippy, Cheerios, Fairlife).
- Never invent fdcIds. Only use ids returned by the endpoint. If you can't find a clean pair after 3 attempts, set the missing half to null and explain in notes.
- Don't edit any repo files. Your only output is the JSON file.

## Output

Write a JSON array to the path given in your task, then reply with a 5-line summary: count of entries, entries with both raw+cooked, entries you're unsure about (names), requests used (approx).

```json
[
  {
    "name": "Chicken breast",
    "aliases": ["chicken breast", "chicken breasts", "grilled chicken", "chicken"],
    "default": "cooked",
    "rawLabel": "Raw",
    "cooked": { "fdcId": 2341550, "description": "Chicken breast, grilled without sauce, skin not eaten", "kcal": 176, "protein": 30, "carbs": 0, "fat": 5.5 },
    "raw":    { "fdcId": 171077,  "description": "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw", "kcal": 120, "protein": 22.5, "carbs": 0, "fat": 2.6 }
  }
]
```
(ids above are illustrative — look everything up.)
