import { NextRequest, NextResponse } from "next/server";
import { aliasSuggestions } from "@/lib/foodAliases";

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 } as const;

// FNDDS first: its names are the human ones ("Chicken breast, grilled") and it carries household portions.
const TYPE_RANK: Record<string, number> = { "Survey (FNDDS)": 0, Foundation: 1, "SR Legacy": 2, Branded: 3 };

const COOKED_RE = /\b(cooked|roasted|grilled|braised|boiled|baked|fried|broiled|stewed|steamed|saut[ée]ed|rotisserie)\b/i;
const RAW_RE = /\braw\b/i;
// Things nobody means when they type a plain food word.
const ODD_RE = /meatless|imitation|substitute|powder|\broll\b|loaf|spread|baby food|soup|sandwich|casserole|frozen meal|\bdish\b|\bwith\b|\bin\b|stuffed|fast food|restaurant|school lunch|\bpuree|\bfeet\b|\bskin\b(?!\s*(not|eaten))|giblets|gizzard|liver|heart|\bneck\b|\bback\b|\btail\b|cornbread|curry|kiev|gravy|dumpling|pot pie|salad|cacciatore|parmigiana|marsala|tikka|teriyaki|a la king|fricassee|\band\b|\bor\b|orange chicken|general tso|kung pao|\bpaper\b|croquette|dressing|pilaf|milk\b(?!.*(cow|whole|2%|1%|skim|nonfat|lowfat))/i;
// USDA qualifier noise we hide from the display name.
const NOISE_RE = /^(NS as to|NFS|not further specified|as ingredient|from (fast food|restaurant)|Puerto Rican style)/i;

export type Item = {
  fdcId: number;
  name: string;         // clean display name: "Chicken breast, grilled"
  description: string;  // full USDA description
  group: string;        // first segment, used for raw↔cooked pairing
  badge: "raw" | "cooked" | null;
  strict: boolean;      // every word of the query appears in the USDA name
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
};

function badgeFor(description: string): "raw" | "cooked" | null {
  if (RAW_RE.test(description)) return "raw";
  if (COOKED_RE.test(description)) return "cooked";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "Chicken breast, grilled without sauce, NS as to skin eaten" → "Chicken breast, grilled without sauce". */
function prettyName(description: string): string {
  const parts = description.split(",").map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p, i) => i === 0 || !NOISE_RE.test(p)).slice(0, 3);
  let s = kept.join(", ");
  if (s === s.toUpperCase()) s = s.toLowerCase();   // branded names arrive ALL CAPS
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Raw = { fdcId: number; description: string; dataType?: string; foodNutrients?: { nutrientId: number; value: number }[] };

async function usdaSearch(q: string, pageSize: number, branded = false): Promise<Raw[]> {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(process.env.USDA_API_KEY!)}`;
  // POST: USDA's nginx edge rejects ~2/3 of GET searches with a bare 400 (verified 2026-09-01); POST is reliable.
  // Generic foods first; branded (ALL-CAPS package names) only as a fallback when the plain search is thin.
  const body = JSON.stringify({
    query: q, pageSize,
    dataType: branded ? ["Branded"] : ["Survey (FNDDS)", "Foundation", "SR Legacy"],
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
  const plain = rank(await usdaSearch(q, pageSize), q);
  // "skippy peanut butter": no generic food carries "skippy" → only then look at branded.
  if (plain.filter((i) => i.strict).length >= 3) return plain;
  const branded = await usdaSearch(q, 15, true).then((f) => rank(f, q)).catch(() => [] as Item[]);
  const seen = new Set(plain.map((i) => normalize(i.name)));
  return [...plain, ...branded.filter((i) => !seen.has(normalize(i.name)))]
    .sort((a, b) => Number(b.strict) - Number(a.strict));
}

/** Score + convert one search's hits. Lower score = better. */
function rank(foods: Raw[], q: string): Item[] {
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
    score += Math.min(desc.split(",").length, 6);   // shorter, plainer names first
    const get = (nid: number) => f.foodNutrients?.find((n) => n.nutrientId === nid)?.value ?? 0;
    const item: Item = {
      fdcId: f.fdcId, name: prettyName(desc), description: desc, group, badge, strict,
      per100g: { kcal: get(NUTRIENTS.kcal), protein: get(NUTRIENTS.protein), carbs: get(NUTRIENTS.carbs), fat: get(NUTRIENTS.fat) },
    };
    return { item, score, nd };
  }).filter((x) => x.item.per100g.kcal > 0).sort((a, b) => a.score - b.score);
  // One row per display name: FNDDS and SR Legacy both carry "Rice, white, cooked" — keep the better-ranked one.
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const { item } of scored) {
    const k = normalize(item.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) return portions(id);

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ items: [] });

  try {
    // Bare word like "chicken": pull the best hit for each thing a person means (breast, thigh, …)
    // so the list is real foods, one tap from macros — then fill with the generic search.
    const aliases = aliasSuggestions(q);
    const [aliasHits, generic] = await Promise.all([
      Promise.all(aliases.map((a) => searchRanked(a, 15).then((r) => r.filter((i) => i.strict).slice(0, 2)).catch(() => [] as Item[]))),
      searchRanked(q, 40),
    ]);
    const items: Item[] = [];
    const seen = new Set<string>();
    const push = (it: Item) => {
      const k = normalize(it.name);
      if (!seen.has(k) && items.length < 12) { seen.add(k); items.push(it); }
    };
    // First pick per alias, then second picks, then generic — so "chicken" reads breast, thigh, wing… not breast×2.
    for (const round of [0, 1]) for (const hits of aliasHits) if (hits[round]) push(hits[round]);
    for (const it of generic) push(it);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("food-search failed", q, e instanceof Error ? e.message : e);
    return NextResponse.json({ items: [] }, { status: 502 });
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
