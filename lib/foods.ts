/**
 * Curated core foods: the ~200 things a person actually logs, each with a verified USDA item for
 * how it's eaten (cooked) and, where it matters for weighing, the same food raw/dry.
 * Built by category from the USDA API on 2026-09-01; data lives in foods.data.json.
 * Search hits this list first; the live USDA search only fills in behind it.
 */
import data from "./foods.data.json";

export type FoodHalf = { fdcId: number; description: string; kcal: number; protein: number; carbs: number; fat: number };
export type CuratedFood = {
  name: string;
  aliases: string[];
  default?: "raw" | "cooked";
  rawLabel?: "Raw" | "Dry";
  cooked: FoodHalf | null;
  raw: FoodHalf | null;
  notes?: string;
};

export const FOODS: CuratedFood[] = data as CuratedFood[];

export const normFood = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

/** Match quality of a food for a query; 0 = no match. Higher is better. */
export function matchScore(food: CuratedFood, q: string): number {
  const nq = normFood(q);
  if (!nq) return 0;
  const aliases = [normFood(food.name), ...food.aliases.map(normFood)];
  if (aliases.includes(nq)) return 100;
  const toks = nq.split(" ").map(stem);
  const sq = toks.join(" ");
  const stemmed = aliases.map((a) => a.split(" ").map(stem).join(" "));
  if (stemmed.includes(sq)) return 95;
  if (stemmed.some((a) => a.startsWith(sq + " "))) return 80;          // "chicken" → "chicken thigh"
  const words = new Set(stemmed.flatMap((a) => a.split(" ")));
  if (toks.every((t) => words.has(t))) return 60;                        // every typed word is a whole word somewhere
  if (stemmed.some((a) => a.split(" ").some((w) => w.startsWith(sq)))) return 50;   // still typing: "chic" → chicken
  return 0;
}

/** Curated foods for a query, best match first; ties keep table order (agents listed common cuts first). */
export function searchFoods(q: string, limit = 12): CuratedFood[] {
  const hits = FOODS.map((f, i) => ({ f, s: matchScore(f, q), i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  // With a confident match on the board, prefix-only hits are noise ("eggs" must not list Eggplant).
  const best = hits[0]?.s ?? 0;
  return hits.filter((x) => best < 80 || x.s >= 60).slice(0, limit).map((x) => x.f);
}

/** The curated food (and which half) an fdcId belongs to, if any. */
export function foodByFdcId(fdcId: number): { food: CuratedFood; half: "raw" | "cooked" } | null {
  for (const f of FOODS) {
    if (f.cooked?.fdcId === fdcId) return { food: f, half: "cooked" };
    if (f.raw?.fdcId === fdcId) return { food: f, half: "raw" };
  }
  return null;
}

/** Which half a tap lands on. */
export function defaultHalf(f: CuratedFood): "raw" | "cooked" {
  if (f.default) return f.default;
  return f.cooked ? "cooked" : "raw";
}

/** A search row the picker understands (same shape the API returns). */
export type SearchItem = {
  fdcId: number; name: string; description: string; group: string;
  badge: "raw" | "cooked" | null; strict: boolean; pairable: boolean;
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  curated?: true; rawLabel?: "Raw" | "Dry";
  pair?: { raw: SearchItem | null; cooked: SearchItem | null };
};

export function halfItem(food: CuratedFood, half: "raw" | "cooked", h: FoodHalf): SearchItem {
  return {
    fdcId: h.fdcId, name: food.name, description: h.description, group: food.name,
    badge: food.raw && food.cooked ? half : null, strict: true, pairable: !!(food.raw && food.cooked),
    per100g: { kcal: h.kcal, protein: h.protein, carbs: h.carbs, fat: h.fat },
    curated: true, rawLabel: food.rawLabel,
  };
}

/** A curated food as a search row: lands on its default half, carries both halves for the switch. */
export function curatedItem(food: CuratedFood): SearchItem {
  const half = defaultHalf(food);
  const h = (half === "raw" ? food.raw : food.cooked) ?? food.cooked ?? food.raw!;
  const item = halfItem(food, half, h);
  item.pair = {
    raw: food.raw ? halfItem(food, "raw", food.raw) : null,
    cooked: food.cooked ? halfItem(food, "cooked", food.cooked) : null,
  };
  return item;
}

/** Instant, offline-capable results from the curated table for a query. */
export function curatedSearchItems(q: string, limit = 12): SearchItem[] {
  return searchFoods(q, limit).map(curatedItem);
}
