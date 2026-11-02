import { supabase } from "@/lib/supabase";
import { enqueueOrSend, readQueue } from "@/lib/queue";
import { rowFromRecord, type CustomFoodRow } from "@/lib/custom-foods";

/** Server rows plus foods still waiting in the offline queue; offline, the queued ones only. */
export async function listCustomFoods(): Promise<CustomFoodRow[]> {
  const queued = (await readQueue())
    .filter((q) => q.table === "custom_foods" && q.op === "insert")
    .map((q) => rowFromRecord({ id: q.id, ...q.entry }));
  let server: CustomFoodRow[] = [];
  try {
    const { data, error } = await supabase.from("custom_foods")
      .select("id,name,serving_g,kcal,protein_g,carbs_g,fat_g").order("name");
    if (error) throw error;
    server = (data ?? []).map((r) => rowFromRecord(r as Record<string, unknown>));
  } catch (e) {
    console.warn("gainz custom foods: server read failed, showing queued ones only", e);
  }
  const byId = new Map<string, CustomFoodRow>();
  for (const r of queued) byId.set(r.id, r);
  for (const r of server) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Macros per 100 g. user_id is filled by the column default; the queue stamps id. */
export async function createCustomFood(f: Omit<CustomFoodRow, "id">): Promise<CustomFoodRow> {
  const id = crypto.randomUUID();
  const entry = { name: f.name.trim(), serving_g: f.serving_g, kcal: f.kcal, protein_g: f.protein_g,
    carbs_g: f.carbs_g, fat_g: f.fat_g, source: "label" };
  await enqueueOrSend("custom_foods", entry, { id });
  return { id, ...f, name: entry.name };
}
