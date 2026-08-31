import { supabase } from "@/lib/supabase";
import type { WeighIn } from "@/lib/trend";

export type WeighInRow = WeighIn & { id: string };

/** Local calendar date as YYYY-MM-DD — same convention as the dashboard's 7-day trend. */
export function localDateKey(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function listWeighIns(sinceDate?: string): Promise<WeighInRow[]> {
  let q = supabase.from("weigh_ins").select("id,date,weight_lb").order("date", { ascending: true });
  if (sinceDate) q = q.gte("date", sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, date: r.date, weight_lb: Number(r.weight_lb) }));
}

/** One row per day: re-saving the same date overwrites the weight. */
export async function upsertWeighIn(date: string, weight_lb: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("weigh_ins")
    .upsert({ user_id: user.id, date, weight_lb }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function deleteWeighIn(id: string): Promise<void> {
  const { error } = await supabase.from("weigh_ins").delete().eq("id", id);
  if (error) throw error;
}
