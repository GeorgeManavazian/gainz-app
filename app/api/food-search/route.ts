import { NextRequest, NextResponse } from "next/server";

const NUTRIENTS = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004 } as const;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ foods: [] });

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", process.env.USDA_API_KEY!);
  url.searchParams.set("query", q);
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");
  url.searchParams.set("pageSize", "12");

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return NextResponse.json({ foods: [] }, { status: 502 });
  const data = await res.json();

  const foods = (data.foods ?? []).map((f: any) => {
    const get = (id: number) =>
      f.foodNutrients?.find((n: any) => n.nutrientId === id)?.value ?? 0;
    return {
      fdcId: f.fdcId,
      description: f.description,
      per100g: {
        kcal: get(NUTRIENTS.kcal),
        protein: get(NUTRIENTS.protein),
        carbs: get(NUTRIENTS.carbs),
        fat: get(NUTRIENTS.fat),
      },
    };
  });
  return NextResponse.json({ foods });
}
