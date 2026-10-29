/** Rank foods you've logged before by how likely you are to log them right now. */
export type MealLike = {
  food_name: string; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number;
  fdc_id?: string | number | null; unit?: string | null; logged_at: string;
};
export type Per100 = { kcal: number; protein: number; carbs: number; fat: number };
export type RecentFood = {
  name: string; fdcId?: number; per100g: Per100;
  count: number; sameTimeCount: number; lastAt: string; score: number;
};
export type RankOpts = { windowDays?: number; bandMinutes?: number; limit?: number };

const MS_DAY = 86_400_000;
const numId = (v: unknown): number | undefined => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) ? n : undefined; };

/** Minutes since local midnight. */
function minuteOfDay(d: Date): number { return d.getHours() * 60 + d.getMinutes(); }
/** Circular distance between two minutes-of-day. */
function minuteGap(a: number, b: number): number { const d = Math.abs(a - b); return Math.min(d, 1440 - d); }

export function rankRecentFoods(meals: MealLike[], now: Date, opts: RankOpts = {}): RecentFood[] {
  const windowDays = opts.windowDays ?? 30, band = opts.bandMinutes ?? 90, limit = opts.limit ?? 10;
  const since = now.getTime() - windowDays * MS_DAY;
  const nowMin = minuteOfDay(now);
  const byName = new Map<string, RecentFood>();
  for (const m of meals) {
    if (m.unit === "serving" || !(Number(m.grams) > 0)) continue;
    const t = new Date(m.logged_at);
    if (Number.isNaN(t.getTime()) || t.getTime() < since || t.getTime() > now.getTime() + MS_DAY) continue;
    const key = m.food_name.trim().toLowerCase();
    const s = 100 / Number(m.grams);
    const cur = byName.get(key);
    const sameTime = minuteGap(minuteOfDay(t), nowMin) <= band ? 1 : 0;
    if (!cur) {
      byName.set(key, {
        name: m.food_name.trim(), fdcId: numId(m.fdc_id),
        per100g: { kcal: Number(m.calories) * s, protein: Number(m.protein_g) * s, carbs: Number(m.carbs_g) * s, fat: Number(m.fat_g) * s },
        count: 1, sameTimeCount: sameTime, lastAt: m.logged_at, score: 0,
      });
    } else {
      cur.count += 1; cur.sameTimeCount += sameTime;
      if (t.getTime() > new Date(cur.lastAt).getTime()) { // keep the most recent log's values and name casing
        cur.lastAt = m.logged_at; cur.name = m.food_name.trim();
        cur.fdcId = numId(m.fdc_id);
        cur.per100g = { kcal: Number(m.calories) * s, protein: Number(m.protein_g) * s, carbs: Number(m.carbs_g) * s, fat: Number(m.fat_g) * s };
      }
    }
  }
  const out = [...byName.values()];
  for (const f of out) {
    const recent = now.getTime() - new Date(f.lastAt).getTime() <= 2 * MS_DAY ? 2 : 0;
    f.score = f.sameTimeCount * 3 + f.count + recent;
  }
  return out.sort((a, b) => b.score - a.score || new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()).slice(0, limit);
}
