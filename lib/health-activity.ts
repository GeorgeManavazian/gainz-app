import { supabase } from "@/lib/supabase";

export type HealthActivityRow = { date: string; active_kcal: number };

export async function listHealthActivity(sinceDate: string): Promise<HealthActivityRow[]> {
  const { data, error } = await supabase
    .from("health_activity")
    .select("date,active_kcal")
    .gte("date", sinceDate)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({ date: r.date, active_kcal: Number(r.active_kcal) }));
}
