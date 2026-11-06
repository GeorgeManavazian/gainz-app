import { supabase } from "@/lib/supabase";

/** Morning sleep rating, 1 (awful) … 5 (great), keyed to the date you woke up. */
export type SleepRow = { id: string; date: string; quality: number };
export const SLEEP_LABELS = ["Awful", "Poor", "OK", "Good", "Great"] as const;

export const isQuality = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;

export async function listSleep(sinceDate?: string): Promise<SleepRow[]> {
  let q = supabase.from("sleep_logs").select("id,date,quality").order("date", { ascending: true });
  if (sinceDate) q = q.gte("date", sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: String(r.id), date: String(r.date), quality: Number(r.quality) })).filter((r) => isQuality(r.quality));
}

/** One rating per date; tapping again replaces it. */
export async function upsertSleep(date: string, quality: number): Promise<void> {
  if (!isQuality(quality)) throw new Error("quality must be 1–5");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("sleep_logs").upsert({ user_id: user.id, date, quality }, { onConflict: "user_id,date" });
  if (error) throw error;
}
