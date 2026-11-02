/** Pull macros out of OCR text from a nutrition label. Pure; tolerant of common OCR noise. */
export type ParsedLabel = {
  servingG: number | null; servingText: string | null;
  kcal: number | null; fat: number | null; carbs: number | null; protein: number | null;
  /** How many of kcal / fat / carbs / protein were read. */
  found: number;
};

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;

function clean(text: string): string {
  return text
    .replace(/[|¦]/g, "l")
    .replace(/\bO(?=\s*g\b)/gi, "0")          // "Og" → "0g"
    .replace(/(\d)\s*[,.]\s*(\d)/g, "$1.$2")  // "3 , 5" → "3.5"
    .replace(/calor[il1]es/gi, "calories")
    .replace(/carbohydrat[e3]s?/gi, "carbohydrate")
    .replace(/prote[il1]n/gi, "protein")
    .replace(/[ \t]+/g, " ");
}

const toNum = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** First number (optionally followed by g/kcal) on the first line matching `key`, skipping lines that match `skip`. */
function grab(lines: string[], key: RegExp, skip?: RegExp, unit: "g" | "any" = "g"): number | null {
  for (const line of lines) {
    if (!key.test(line) || (skip && skip.test(line))) continue;
    const after = line.replace(key, "");
    const m = unit === "g"
      ? after.match(new RegExp(String.raw`${NUM}\s*(?:g|grams?)\b`, "i")) ?? after.match(new RegExp(NUM))
      : after.match(new RegExp(NUM));
    const n = toNum(m?.[1]);
    if (n !== null) return n;
  }
  return null;
}

export function parseNutritionLabel(raw: string): ParsedLabel {
  const text = clean(raw);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  // Serving size: "(55g)", "55 g", "per 100 g"
  let servingG: number | null = null, servingText: string | null = null;
  const sv = lines.find((l) => /serving size/i.test(l));
  if (sv) {
    servingText = sv.replace(/serving size:?/i, "").trim() || null;
    const g = sv.match(new RegExp(String.raw`\(?\s*${NUM}\s*(?:g|ml)\b`, "i"));
    servingG = toNum(g?.[1]);
  }
  if (servingG === null && /per\s*100\s*(?:g|ml)/i.test(lower)) servingG = 100;

  // Calories: "Calories 230" (FDA) or "250 kcal" (EU); "Calories from fat 72" is stripped first, never read
  let kcal = grab(lines.map((l) => l.replace(/calories\s+from\s+fat[^\d]*\d+/gi, "")), /calories/i, undefined, "any");
  if (kcal === null) {
    const m = lower.match(new RegExp(String.raw`${NUM}\s*kcal`));
    kcal = toNum(m?.[1]);
  }
  const fat = grab(lines, /total fat/i) ?? grab(lines, /\bfat\b/i, /saturated|trans|sat\b|calories/i);
  const carbs = grab(lines, /total carbohydrate/i) ?? grab(lines, /carbohydrate/i, /fibre|fiber|sugars?/i);
  const protein = grab(lines, /protein/i);

  const found = [kcal, fat, carbs, protein].filter((v) => v !== null).length;
  return { servingG, servingText, kcal, fat, carbs, protein, found };
}

/** Per-100 g values from per-serving values. */
export function per100g(v: { kcal: number; protein: number; carbs: number; fat: number }, servingG: number) {
  const s = 100 / servingG;
  const r = (x: number) => Math.round(x * s * 10) / 10;
  return { kcal: r(v.kcal), protein: r(v.protein), carbs: r(v.carbs), fat: r(v.fat) };
}
