import { NextRequest, NextResponse } from "next/server";

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 } as const;

// FNDDS first: its names are the human ones ("Chicken breast, grilled") and it carries household portions.
const TYPE_RANK: Record<string, number> = { "Survey (FNDDS)": 0, Foundation: 1, "SR Legacy": 2, Branded: 3 };

const COOKED_RE = /\b(cooked|roasted|grilled|braised|boiled|baked|fried|broiled|stewed|steamed|saut[ée]ed|rotisserie)\b/i;
const RAW_RE = /\braw\b/i;

function badgeFor(description: string): "raw" | "cooked" | null {
  if (RAW_RE.test(description)) return "raw";
  if (COOKED_RE.test(description)) return "cooked";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** "Chicken breast, rotisserie, skin not eaten" → group "Chicken breast", variant "rotisserie, skin not eaten". */
function splitName(description: string): { group: string; variant: string } {
  const i = description.indexOf(",");
  if (i === -1) return { group: description.trim(), variant: "" };
  return { group: description.slice(0, i).trim(), variant: description.slice(i + 1).trim() };
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) return portions(id);

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ groups: [] });

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", process.env.USDA_API_KEY!);
  url.searchParams.set("query", q);
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");
  url.searchParams.set("pageSize", "40");

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ groups: [] }, { status: 502 });
  const data = await res.json();

  const nq = normalize(q);
  type Raw = { fdcId: number; description: string; dataType?: string; foodNutrients?: { nutrientId: number; value: number }[] };
  const scored = ((data.foods ?? []) as Raw[]).map((f) => {
    const nd = normalize(f.description ?? "");
    let score = (TYPE_RANK[f.dataType ?? ""] ?? 4) * 10;
    if (nd.startsWith(nq)) score -= 6;          // "chicken breast, ..." beats "soup, chicken breast"
    if (normalize(splitName(f.description ?? "").group) === nq) score -= 3;
    return { f, nd, score };
  }).sort((a, b) => a.score - b.score);

  type Item = { fdcId: number; description: string; variant: string; badge: "raw" | "cooked" | null; per100g: Record<string, number> };
  const groups: { name: string; items: Item[] }[] = [];
  const byGroup = new Map<string, Item[]>();
  const seenDesc = new Set<string>();

  for (const { f, nd } of scored) {
    if (seenDesc.has(nd)) continue;
    seenDesc.add(nd);
    const get = (nid: number) => f.foodNutrients?.find((n) => n.nutrientId === nid)?.value ?? 0;
    const kcal = get(NUTRIENTS.kcal);
    if (kcal <= 0) continue;
    const { group, variant } = splitName(f.description ?? "");
    const key = normalize(group);
    const item: Item = {
      fdcId: f.fdcId,
      description: f.description,
      variant: variant || "plain",
      badge: badgeFor(f.description ?? ""),
      per100g: { kcal, protein: get(NUTRIENTS.protein), carbs: get(NUTRIENTS.carbs), fat: get(NUTRIENTS.fat) },
    };
    let bucket = byGroup.get(key);
    if (!bucket) {
      if (groups.length >= 8) continue;   // cap distinct foods, keep collecting variants for existing ones
      bucket = [];
      byGroup.set(key, bucket);
      groups.push({ name: group, items: bucket });
    }
    if (bucket.length < 8) bucket.push(item);
  }
  return NextResponse.json({ groups });
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
