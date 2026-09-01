import { NextRequest, NextResponse } from "next/server";
import { aliasSuggestions } from "@/lib/foodAliases";
import { searchFoods, foodByFdcId, defaultHalf, normFood, FOODS, type CuratedFood, type FoodHalf } from "@/lib/foods";

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 } as const;

// FNDDS first: its names are the human ones ("Chicken breast, grilled") and it carries household portions.
const TYPE_RANK: Record<string, number> = { "Survey (FNDDS)": 0, Foundation: 1, "SR Legacy": 2, Branded: 3 };

const COOKED_RE = /\b(cooked|roasted|grilled|braised|boiled|baked|fried|broiled|stewed|steamed|saut[ée]ed|rotisserie)\b/i;
const RAW_RE = /\braw\b/i;
// Things nobody means when they type a plain food word.
const ODD_RE = /meatless|imitation|substitute|powder|\broll\b|loaf|spread|baby food|soup|sandwich|casserole|frozen meal|\bdish\b|\bwith\b|\bin\b|stuffed|fast food|restaurant|school lunch|\bpuree|\bfeet\b|\bskin\b(?!\s*(not|eaten))|giblets|gizzard|liver|heart|\bneck\b|\bback\b|\btail\b|cornbread|curry|kiev|gravy|dumpling|pot pie|salad|cacciatore|parmigiana|marsala|tikka|teriyaki|a la king|fricassee|\band\b|\bor\b|orange chicken|general tso|kung pao|\bpaper\b|croquette|dressing|pilaf|milk\b(?!.*(cow|whole|2%|1%|skim|nonfat|lowfat))/i;
// Segments that describe HOW it was cooked/served, not WHAT it is. Stripped from the row name so
// "Chicken breast, grilled without sauce, skin not eaten" and "…, rotisserie, skin eaten" collapse to one row.
const PREP_SEG_RE = /\b(cooked|raw|roasted|grilled|braised|boiled|baked|broiled|stewed|steamed|saut[ée]ed|rotisserie|poached|microwaved|toasted|skin|sauce|fat|NS as to|NFS|not further specified|as ingredient|from (fast food|restaurant|precooked|other sources|frozen|fresh)|Puerto Rican style|plain|regular|no added|made with|meat only|meat and skin|skinless|boneless|bone-in|with|without|prepared|enriched|unenriched|dry|dried|canned|frozen|home recipe|homemade|large|medium|small|extra large|jumbo|grade a|broiler|fryer|broilers or fryers)\b/i;
// Foods whose weight changes when cooked — only these get the Raw / Cooked switch.
const PAIRABLE_RE = /chicken|beef|pork|turkey|lamb|veal|steak|ground|salmon|tuna|cod|tilapia|shrimp|fish|halibut|egg|rice|pasta|spaghetti|penne|macaroni|noodle|oat|potato|quinoa|lentil|bean|broccoli|spinach|vegetable|asparagus|carrot|cauliflower|zucchini|mushroom|sausage|bacon/i;

export type Item = {
  fdcId: number;
  name: string;         // clean display name: "Chicken breast, grilled"
  description: string;  // full USDA description
  group: string;        // first segment, used for raw↔cooked pairing
  badge: "raw" | "cooked" | null;
  strict: boolean;      // every word of the query appears in the USDA name
  pairable: boolean;    // meat/eggs/grains/veg: offer Raw / Cooked weighing switch
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  curated?: true;       // from lib/foods — verified pair, no guessing
  rawLabel?: "Raw" | "Dry";
  pair?: { raw: Item | null; cooked: Item | null };   // both halves, ready for the switch
};

const CURATED_IDS = new Set<number>();
for (const f of FOODS) for (const h of [f.cooked, f.raw]) if (h) CURATED_IDS.add(h.fdcId);

function halfItem(food: CuratedFood, half: "raw" | "cooked", h: FoodHalf): Item {
  return {
    fdcId: h.fdcId, name: food.name, description: h.description, group: food.name,
    badge: food.raw && food.cooked ? half : null, strict: true, pairable: !!(food.raw && food.cooked),
    per100g: { kcal: h.kcal, protein: h.protein, carbs: h.carbs, fat: h.fat },
    curated: true, rawLabel: food.rawLabel,
  };
}

/** A curated food as a search row: lands on its default half, carries both halves for the switch. */
function curatedItem(food: CuratedFood): Item {
  const half = defaultHalf(food);
  const h = (half === "raw" ? food.raw : food.cooked) ?? food.cooked ?? food.raw!;
  const item = halfItem(food, half, h);
  item.pair = {
    raw: food.raw ? halfItem(food, "raw", food.raw) : null,
    cooked: food.cooked ? halfItem(food, "cooked", food.cooked) : null,
  };
  return item;
}

function badgeFor(description: string): "raw" | "cooked" | null {
  if (COOKED_RE.test(description)) return "cooked";   // "fried, coated, from raw" is cooked
  if (RAW_RE.test(description)) return "raw";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "Chicken breast, grilled without sauce, NS as to skin eaten" → "Chicken breast". "Rice, white, cooked" → "Rice, white". */
function prettyName(description: string): string {
  const parts = description.split(",").map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p, i) => i === 0 || !PREP_SEG_RE.test(p)).slice(0, 2);
  let s = kept.join(", ");
  if (s === s.toUpperCase()) s = s.toLowerCase();   // branded names arrive ALL CAPS
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Raw = { fdcId: number; description: string; dataType?: string; foodNutrients?: { nutrientId: number; value: number }[] };

type Source = "plain" | "branded" | "raw";
const SOURCES: Record<Source, string[]> = {
  plain: ["Survey (FNDDS)", "Foundation", "SR Legacy"],
  branded: ["Branded"],
  raw: ["Foundation", "SR Legacy"],   // FNDDS is as-eaten; raw ingredients only exist here
};

async function usdaSearch(q: string, pageSize: number, source: Source = "plain"): Promise<Raw[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(process.env.USDA_API_KEY!)}`;
  // POST: USDA's nginx edge rejects ~2/3 of GET searches with a bare 400 (verified 2026-09-01); POST is reliable.
  // Generic foods first; branded (ALL-CAPS package names) only as a fallback when the plain search is thin.
  const body = JSON.stringify({
    query: q, pageSize,
    dataType: SOURCES[source],
  });
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, next: { revalidate: 3600 } });
    if (res.ok) break;
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }
  if (!res || !res.ok) throw new Error(`usda ${res?.status}`);
  const data = await res.json();
  return (data.foods ?? []) as Raw[];
}

/** Plain search, topped up with branded hits only when thin. */
async function searchRanked(q: string, pageSize: number): Promise<Item[]> {
  const { items: plain, strictCount } = rank(await usdaSearch(q, pageSize), q);
  // "skippy peanut butter": no generic food carries "skippy" → only then look at branded.
  if (strictCount >= 3) return plain;
  const branded = await usdaSearch(q, 15, "branded").then((f) => rank(f, q).items).catch(() => [] as Item[]);
  const seen = new Set(plain.map((i) => normalize(i.name)));
  return [...plain, ...branded.filter((i) => !seen.has(normalize(i.name)))]
    .sort((a, b) => Number(b.strict) - Number(a.strict));
}

/** Score + convert one search's hits. Lower score = better. strictCount is pre-collapse, so a food
 *  with ten cooking variants still counts as a confident match after they fold into one row. */
function rank(foods: Raw[], q: string): { items: Item[]; strictCount: number } {
  const nq = normalize(q);
  const scored = foods.map((f) => {
    const desc = f.description ?? "";
    const nd = normalize(desc);
    const group = desc.split(",")[0].trim();
    const badge = badgeFor(desc);
    let score = (TYPE_RANK[f.dataType ?? ""] ?? 4) * 10;
    const toks = nq.split(" ").filter(Boolean);
    const head = normalize(desc.split(",").slice(0, 2).join(" "));
    if (nd.startsWith(nq)) score -= 6;              // "chicken breast, grilled" beats "soup, chicken breast"
    if (normalize(group) === nq) score -= 3;
    const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
    const strict = toks.every((t) => nd.includes(stem(t)));
    if (strict) score -= 20;                        // every word you typed is in the name — "Beef, ground" never under "ground chicken"
    if (toks.every((t) => head.includes(stem(t)))) score -= 3;  // …and up front, not buried in a qualifier
    if (badge === "cooked") score -= 2;             // people log what they ate, not what they bought
    if (badge === null) score -= 1;
    if (ODD_RE.test(desc)) score += 8;
    if (/skin not eaten|skinless|meat only|without sauce|no added fat|\bplain\b/i.test(desc)) score -= 2;  // the lean default
    if (/skin eaten|with sauce|breaded|battered|coated/i.test(desc)) score += 2;
    score += Math.min(desc.split(",").length, 6);   // shorter, plainer names first
    const get = (nid: number) => f.foodNutrients?.find((n) => n.nutrientId === nid)?.value ?? 0;
    const item: Item = {
      fdcId: f.fdcId, name: prettyName(desc), description: desc, group, badge, strict, pairable: PAIRABLE_RE.test(desc),
      per100g: { kcal: get(NUTRIENTS.kcal), protein: get(NUTRIENTS.protein), carbs: get(NUTRIENTS.carbs), fat: get(NUTRIENTS.fat) },
    };
    return { item, score, nd };
  }).filter((x) => x.item.per100g.kcal > 0).sort((a, b) => a.score - b.score);
  const strictCount = scored.filter((x) => x.item.strict).length;
  // One row per display name: FNDDS and SR Legacy both carry "Rice, white, cooked" — keep the better-ranked one.
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const { item } of scored) {
    const k = normalize(item.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return { items: out, strictCount };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) return portions(id);

  const pair = req.nextUrl.searchParams.get("pair")?.trim();
  const want = req.nextUrl.searchParams.get("want");
  if (pair && (want === "raw" || want === "cooked")) return counterpart(pair, want);

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });

  // Curated table first: verified foods with matching raw/cooked halves.
  const curated = searchFoods(q).map(curatedItem);
  const items: Item[] = [];
  const seen = new Set<string>();
  const push = (it: Item) => {
    const k = normalize(it.name);
    if (!seen.has(k) && items.length < 12) { seen.add(k); items.push(it); }
  };
  for (const it of curated) push(it);
  if (items.length >= 12) return NextResponse.json({ items });

  try {
    // Live USDA fills in behind. Bare-word alias fan-out only when the table had little to say.
    const aliases = curated.length < 3 ? aliasSuggestions(q) : [];
    const [aliasHits, generic] = await Promise.all([
      Promise.all(aliases.map((a) => searchRanked(a, 15).then((r) => r.filter((i) => i.strict).slice(0, 2)).catch(() => [] as Item[]))),
      searchRanked(q, 40),
    ]);
    const isCurated = (it: Item) => CURATED_IDS.has(it.fdcId);
    // First pick per alias, then second picks, then generic — so "chicken" reads breast, thigh, wing… not breast×2.
    for (const round of [0, 1]) for (const hits of aliasHits) if (hits[round] && !isCurated(hits[round])) push(hits[round]);
    for (const it of generic) if (!isCurated(it)) push(it);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("food-search failed", q, e instanceof Error ? e.message : e);
    // The curated rows are still worth showing when USDA is down.
    return NextResponse.json({ items }, { status: items.length ? 200 : 502 });
  }
}

/** The same food weighed the other way: "Chicken breast" + raw → USDA raw chicken breast. */
async function counterpart(name: string, want: "raw" | "cooked") {
  // Curated food? Its verified other half, no guessing.
  const cf = FOODS.find((f) => normFood(f.name) === normFood(name));
  if (cf) {
    const h = want === "raw" ? cf.raw : cf.cooked;
    return NextResponse.json({ item: h ? halfItem(cf, want, h) : null });
  }
  const q = name.replace(/,/g, " ");
  try {
    const items = want === "raw"
      ? rank(await usdaSearch(`${q} raw`, 40, "raw"), `${q} raw`).items
      : rank(await usdaSearch(q, 40), q).items;
    // Among same-badge candidates prefer the plain fresh cut: "thigh, meat only, raw" over
    // "skin (drumsticks and thighs), raw"; "egg, whole, raw, fresh" over "frozen, pasteurized".
    const pref = (i: Item) => {
      const d = i.description;
      let p = 0;
      if (normalize(i.name) === normalize(name)) p -= 6;   // same food: "Egg, whole" not "Egg, turkey"
      if (/meat only|skinless|boneless|\bfresh\b|8[05]% lean|90% lean/i.test(d)) p -= 3;
      if (/\bskin\b(?! not eaten)|separable fat|giblets|gizzard|liver|heart|back\b|neck\b|frozen|pasteurized|dried|powder|liquid|grass-fed|organic|wagyu|bison|venison|duck|goose|quail|canned|salted|smoked|cured|70% lean|75% lean/i.test(d)) p += 5;
      return p;
    };
    const cands = items
      .map((i, idx) => ({ i, idx }))
      .filter(({ i }) => i.badge === want && (i.strict || normalize(i.name) === normalize(name)))
      .sort((x, y) => (pref(x.i) + x.idx * 0.1) - (pref(y.i) + y.idx * 0.1));
    return NextResponse.json({ item: cands[0]?.i ?? null });
  } catch (e) {
    console.error("food-search pair failed", name, want, e instanceof Error ? e.message : e);
    return NextResponse.json({ item: null }, { status: 502 });
  }
}

/** Per-food portions (e.g. "1 cup, chopped" → 140 g) from the FDC detail endpoint. */
async function portions(id: string) {
  const url = new URL(`https://api.nal.usda.gov/fdc/v1/food/${encodeURIComponent(id)}`);
  url.searchParams.set("api_key", process.env.USDA_API_KEY!);
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return NextResponse.json({ portions: [] }, { status: 502 });
  const data = await res.json();

  const out: { label: string; grams: number }[] = [];
  type Portion = { amount?: number; gramWeight?: number; modifier?: string; portionDescription?: string;
    measureUnit?: { name?: string } };
  for (const p of ((data.foodPortions ?? []) as Portion[])) {
    const grams = Number(p.gramWeight);
    if (!(grams > 0)) continue;
    const unitName = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? p.measureUnit.name : "";
    const desc = (p.portionDescription && p.portionDescription !== "Quantity not specified" ? p.portionDescription : "")
      || [p.amount && p.amount !== 1 ? p.amount : p.amount === 1 ? "1" : "", unitName, p.modifier].filter(Boolean).join(" ").trim();
    if (!desc) continue;
    out.push({ label: desc, grams });
  }
  // Branded foods: single household serving
  if (out.length === 0 && Number(data.servingSize) > 0 && String(data.servingSizeUnit ?? "").toLowerCase().startsWith("g")) {
    out.push({ label: data.householdServingFullText || "1 serving", grams: Number(data.servingSize) });
  }
  const seen = new Set<string>();
  const portionsOut = out.filter((p) => {
    const k = normalize(p.label);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
  return NextResponse.json({ portions: portionsOut });
}
