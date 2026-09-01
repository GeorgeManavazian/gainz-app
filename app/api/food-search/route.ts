import { NextRequest, NextResponse } from "next/server";

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 } as const;

// FNDDS first: its names are the human ones ("Chicken breast, grilled") and it carries household portions.
const TYPE_RANK: Record<string, number> = { "Survey (FNDDS)": 0, Foundation: 1, "SR Legacy": 2, Branded: 3 };

const COOKED_RE = /\b(cooked|roasted|grilled|braised|boiled|baked|fried|broiled|stewed|steamed|saut[ée]ed)\b/i;
const RAW_RE = /\braw\b/i;

function badgeFor(description: string): "raw" | "cooked" | null {
  if (RAW_RE.test(description)) return "raw";
  if (COOKED_RE.test(description)) return "cooked";
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) return portions(id);

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ foods: [] });

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", process.env.USDA_API_KEY!);
  url.searchParams.set("query", q);
  url.searchParams.set("dataType", "Foundation,SR Legacy,Survey (FNDDS),Branded");
  url.searchParams.set("pageSize", "25");

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ foods: [] }, { status: 502 });
  const data = await res.json();

  const nq = normalize(q);
  type Raw = { fdcId: number; description: string; dataType?: string; foodNutrients?: { nutrientId: number; value: number }[] };
  const scored = ((data.foods ?? []) as Raw[]).map((f) => {
    const nd = normalize(f.description ?? "");
    let score = (TYPE_RANK[f.dataType ?? ""] ?? 4) * 10;
    if (nd.startsWith(nq)) score -= 5;          // "chicken breast, ..." beats "soup, chicken breast"
    if (nd === nq) score -= 3;
    score += Math.min(4, Math.floor(nd.length / 40)); // shorter names read better
    return { f, nd, score };
  }).sort((a, b) => a.score - b.score);

  const seen = new Set<string>();
  const foods = [];
  for (const { f, nd } of scored) {
    if (seen.has(nd)) continue;
    seen.add(nd);
    const get = (nid: number) => f.foodNutrients?.find((n) => n.nutrientId === nid)?.value ?? 0;
    const kcal = get(NUTRIENTS.kcal);
    if (kcal <= 0) continue;
    foods.push({
      fdcId: f.fdcId,
      description: f.description,
      badge: badgeFor(f.description ?? ""),
      per100g: { kcal, protein: get(NUTRIENTS.protein), carbs: get(NUTRIENTS.carbs), fat: get(NUTRIENTS.fat) },
    });
    if (foods.length >= 6) break;
  }
  return NextResponse.json({ foods });
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
